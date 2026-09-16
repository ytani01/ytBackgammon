#
# (c) 2026 Yoichi Tanibayashi
#
"""
lobby.py

複数のボードを子プロセスとして起動し、一覧ページを出すサーバ (TODO-063)。

- 設定 (TOML) の読み込み: load_config()
- ボード 1 面ぶんの子プロセス: BoardProcess
- Starlette の app: create_lobby_app()

子プロセスの面倒を見る範囲:

- lobby の起動時に、設定のボードを全部起動する。lobby が止まるとき
  (Ctrl+C・SIGTERM で uvicorn が lifespan を終える) に全部止める
- 落ちたボードは再起動しない。終了コードをログに出し、状態を停止中にする
- lobby を SIGKILL で殺したときに子が残るのは扱わない
- lobby の外で動いているボードは探さない
"""

import asyncio
import contextlib
import signal
import sys
import tomllib
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import IO

from starlette.applications import Starlette
from starlette.responses import JSONResponse, RedirectResponse
from starlette.routing import Mount, Route

from . import WEBROOT
from .app import NoCacheStaticFiles, normalize_prefix, templates, with_prefix
from .mylog import getLogger
from .paths import ConfigError, Paths

# SIGTERM を送ってから SIGKILL にするまでの秒数
STOP_TIMEOUT_SEC = 5.0
# listen しているかを確かめる接続の待ち時間
CONNECT_TIMEOUT_SEC = 0.5


@dataclass(frozen=True)
class BoardConfig:
    """設定ファイルのボード 1 面ぶん"""

    server_id: str
    port: int
    image_dir: str
    # normalize_prefix() で揃えた値 ('' か '/foo')
    prefix: str = ''


# server_id は整数も受け、文字列に直す
_REQUIRED: dict[str, type | tuple[type, ...]] = {
    'server_id': (str, int), 'port': int, 'image_dir': str}
_OPTIONAL: dict[str, type | tuple[type, ...]] = {'prefix': str}


def _entries(path: str | Path) -> list:
    """
    設定ファイルを読み、[[board]] のリストを返す。誤りがあれば ConfigError。

    [[board]] が 1 つも無いファイル ([path] だけを書いたものなど) は
    空のリスト。**ボードが 0 件でよいかは、呼ぶ側が決める** (TODO-076)。
    """
    try:
        with Path(path).open('rb') as f:
            data = tomllib.load(f)
    except OSError as e:
        raise ConfigError(f'{path}: {e.strerror}') from e
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f'{path}: {e}') from e

    entries = data.get('board', [])
    if not isinstance(entries, list):
        raise ConfigError(f'{path}: no [[board]]')

    return entries


def _parse_board(ent, where: str) -> BoardConfig:
    """[[board]] 1 つぶんを読む。誤りがあれば ConfigError"""
    if not isinstance(ent, dict):
        raise ConfigError(f'{where}: not a table')

    unknown = set(ent) - set(_REQUIRED) - set(_OPTIONAL)
    if unknown:
        raise ConfigError(f'{where}: unknown key {sorted(unknown)}')

    for key, typ in (_REQUIRED | _OPTIONAL).items():
        if key not in ent:
            if key in _REQUIRED:
                raise ConfigError(f'{where}: "{key}" is required')
            continue
        val = ent[key]
        # bool は int のサブクラスなので、port = true を弾く
        if not isinstance(val, typ) or isinstance(val, bool):
            names = ' or '.join(
                t.__name__ for t in
                (typ if isinstance(typ, tuple) else (typ,)))
            raise ConfigError(f'{where}: "{key}" must be {names}')

    if not 0 < ent['port'] < 65536:
        raise ConfigError(f'{where}: "port" is out of range')

    # API のパス /api/boards/{server_id}/... に当たる値に限る
    server_id = str(ent['server_id'])
    if not server_id or '/' in server_id:
        raise ConfigError(
            f'{where}: "server_id" must not be empty or contain "/"')

    try:
        prefix = normalize_prefix(ent.get('prefix', ''))
    except ValueError as e:
        raise ConfigError(f'{where}: "prefix": {e}') from e

    return BoardConfig(server_id, ent['port'], ent['image_dir'], prefix)


def load_config(path: str | Path) -> list[BoardConfig]:
    """
    設定ファイルの [[board]] を全部読む (lobby 用)。誤りがあれば ConfigError。

    形式::

        [[board]]
        server_id = 1        # 整数でも文字列でもよい。文字列に直す
        port = 5001
        image_dir = "images2"
        prefix = "/board1"   # 省略可。子プロセスへ --prefix で渡す
    """
    boards = [_parse_board(ent, f'{path}: [[board]] #{i}')
              for i, ent in enumerate(_entries(path), 1)]

    for key in ('server_id', 'port'):
        seen = set()
        for b in boards:
            val = getattr(b, key)
            if val in seen:
                raise ConfigError(f'{path}: duplicate {key}: {val}')
            seen.add(val)

    return boards


def board_config(path: str | Path, server_id: str) -> BoardConfig | None:
    """
    設定ファイルから server_id が合う [[board]] だけを読む (board 用)。

    **見るのは自分の項目だけ**なので、他の項目が壊れていても止まらない
    (ytbg.toml は lobby のためにボードが並ぶファイルで、その 1 件の誤りで
    全部のボードが起動しなくなるのを避ける。TODO-076)。自分の項目が
    壊れていれば ConfigError。設定ファイルが無ければ None。
    """
    if not Path(path).exists():
        return None

    for i, ent in enumerate(_entries(path), 1):
        if isinstance(ent, dict) and str(ent.get('server_id')) == server_id:
            return _parse_board(ent, f'{path}: [[board]] #{i}')

    return None


class BoardProcess:
    """
    ボード 1 面ぶんの子プロセス。

    子は ``python -m ytbg board``。stdout と stderr は
    ``<log>/board-<server_id>.log`` にまとめて追記する (TODO-078)。
    ローテーションはしない。paths が無ければ lobby の stdout と stderr を
    そのまま使う (起動できない理由はそこに出る)。

    paths は lobby が解決した置き場所。子へ ``--dir`` と ``-c`` で渡すので、
    基準の外の設定ファイルを ``-c`` で指したときも、その ``[path]`` が
    ボードに効く (TODO-076)。
    """

    __log = getLogger(__qualname__)

    def __init__(self, conf: BoardConfig, debug: bool = False,
                 paths: Paths | None = None):
        self.conf = conf
        self.debug = debug
        self.paths = paths
        self._proc: asyncio.subprocess.Process | None = None
        self._watch: asyncio.Task | None = None
        # 起動と停止が同時に押されたときに、順に処理する
        self._lock = asyncio.Lock()

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self.running and self._proc else None

    async def listening(self) -> bool:
        """子が動いていて、そのポートに接続できるか"""
        if not self.running:
            return False
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection('127.0.0.1', self.conf.port),
                CONNECT_TIMEOUT_SEC)
        except (OSError, TimeoutError):
            return False
        writer.close()
        with contextlib.suppress(OSError):
            await writer.wait_closed()
        return True

    async def status(self) -> dict:
        """
        running: プロセスがある。listening: そのうえ listen している
        (一覧ページは、両方偽を停止中、running だけを起動中と出す)
        """
        return asdict(self.conf) | {'running': self.running,
                                    'listening': await self.listening(),
                                    'pid': self.pid}

    async def start(self) -> None:
        async with self._lock:
            if self.running:
                return

            cmd = [sys.executable, '-m', 'ytbg', 'board',
                   '-p', str(self.conf.port), '-i', self.conf.image_dir]
            if self.paths:
                cmd += ['--dir', str(self.paths.base),
                        '-c', str(self.paths.config)]
            if self.conf.prefix:
                cmd += ['--prefix', self.conf.prefix]
            if self.debug:
                cmd.append('-d')
            # server_id が '-' で始まってもオプションと取られないように
            cmd += ['--', self.conf.server_id]

            self.__log.info('start: {}', cmd)
            out = self._open_log()
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=out,
                    stderr=asyncio.subprocess.STDOUT if out else None)
            except BaseException:
                # 起動できなければ _wait() が走らないので、ここで閉じる
                if out:
                    out.close()
                raise
            self._proc = proc
            self._watch = asyncio.create_task(self._wait(proc, out))

    def _open_log(self) -> IO[bytes] | None:
        """
        子の stdout と stderr を書くファイルを開く (TODO-078)。

        paths が無ければ None で、lobby のものをそのまま使う。
        """
        if self.paths is None:
            return None

        path = self.paths.log / f'board-{self.conf.server_id}.log'
        path.parent.mkdir(parents=True, exist_ok=True)
        return path.open('ab')

    async def _wait(self, proc: asyncio.subprocess.Process,
                    out: IO[bytes] | None) -> None:
        """子の終了を待ち、終了コードをログに出す"""
        try:
            code = await proc.wait()
        finally:
            if out:
                out.close()
        log = self.__log.info if code in (0, -signal.SIGTERM) else \
            self.__log.warning
        log('server_id={}: exited (pid={}, returncode={})',
            self.conf.server_id, proc.pid, code)

    async def stop(self) -> None:
        async with self._lock:
            proc, watch = self._proc, self._watch
            if proc is None or watch is None or not self.running:
                return

            self.__log.info('stop: server_id={}, pid={}',
                            self.conf.server_id, proc.pid)
            with contextlib.suppress(ProcessLookupError):
                proc.terminate()
            try:
                await asyncio.wait_for(asyncio.shield(watch),
                                       STOP_TIMEOUT_SEC)
            except TimeoutError:
                self.__log.warning('server_id={}: SIGKILL (pid={})',
                                   self.conf.server_id, proc.pid)
                with contextlib.suppress(ProcessLookupError):
                    proc.kill()
                await watch


def _board_redirect(conf: BoardConfig):
    """
    conf の prefix の下のどんなパスも、ボード自身のポートへ 302 で返す。

    conf.prefix が '/static' や lobby 自身の --prefix と同じだと、
    create_lobby_app() でこのルートより先に並ぶ既存のルートに一致してしまい、
    このリダイレクトは効かない (prefix の重複チェックは無い。TODO-069)
    """
    async def endpoint(request):
        sub = request.path_params.get('path', '')
        url = f'{request.url.scheme}://{request.url.hostname}:' \
              f'{conf.port}{conf.prefix}/{sub}'
        if request.url.query:
            url += f'?{request.url.query}'
        return RedirectResponse(url, status_code=302)
    return endpoint


def create_lobby_app(boards: list[BoardConfig], debug: bool = False,
                     prefix: str = '',
                     paths: Paths | None = None) -> Starlette:
    """
    一覧サーバの Starlette のアプリを作る。prefix は lobby 自身の
    URL のプレフィクス (normalize_prefix() で揃えた値)。
    paths は子のボードへ --dir と -c で渡す置き場所 (TODO-076)
    """
    procs = {b.server_id: BoardProcess(b, debug, paths) for b in boards}

    @contextlib.asynccontextmanager
    async def lifespan(_app):
        for p in procs.values():
            await p.start()
        try:
            yield
        finally:
            await asyncio.gather(*(p.stop() for p in procs.values()))

    async def index(request):
        response = templates.TemplateResponse(
            request, 'lobby.html', {'prefix': prefix})
        response.headers['Cache-Control'] = 'no-cache'
        return response

    async def list_boards(_request):
        return JSONResponse(
            await asyncio.gather(*(p.status() for p in procs.values())))

    def action(name):
        async def endpoint(request):
            p = procs.get(request.path_params['server_id'])
            if p is None:
                return JSONResponse({'error': 'unknown server_id'},
                                    status_code=404)
            await getattr(p, name)()
            return JSONResponse(await p.status())
        return endpoint

    board_routes = [
        Mount(b.prefix, routes=[Route('/{path:path}', _board_redirect(b))])
        for b in boards if b.prefix]

    return Starlette(
        routes=with_prefix([
            Route('/', index),
            Route('/api/boards', list_boards),
            Route('/api/boards/{server_id}/start', action('start'),
                  methods=['POST']),
            Route('/api/boards/{server_id}/stop', action('stop'),
                  methods=['POST']),
            Mount('/static',
                  app=NoCacheStaticFiles(directory=str(WEBROOT / 'static')),
                  name='static'),
        ], prefix) + board_routes,
        lifespan=lifespan)
