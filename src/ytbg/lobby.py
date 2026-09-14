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
from urllib.parse import urlsplit

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from . import WEBROOT
from .app import NoCacheStaticFiles, templates
from .mylog import getLogger

# SIGTERM を送ってから SIGKILL にするまでの秒数
STOP_TIMEOUT_SEC = 5.0
# listen しているかを確かめる接続の待ち時間
CONNECT_TIMEOUT_SEC = 0.5


class ConfigError(Exception):
    """設定ファイルの誤り。メッセージはそのまま利用者に見せる"""


@dataclass(frozen=True)
class BoardConfig:
    """設定ファイルのボード 1 面ぶん"""

    server_id: str
    port: int
    image_dir: str
    url: str | None = None


# server_id は整数も受け、文字列に直す
_REQUIRED: dict[str, type | tuple[type, ...]] = {
    'server_id': (str, int), 'port': int, 'image_dir': str}
_OPTIONAL: dict[str, type | tuple[type, ...]] = {'url': str}


def load_config(path: str | Path) -> list[BoardConfig]:
    """
    設定ファイルを読む。誤りがあれば ConfigError。

    形式::

        [[board]]
        server_id = 1        # 整数でも文字列でもよい。文字列に直す
        port = 5001
        image_dir = "images2"
        url = "https://ytbg1.example.net/"   # 省略可
    """
    try:
        with Path(path).open('rb') as f:
            data = tomllib.load(f)
    except OSError as e:
        raise ConfigError(f'{path}: {e.strerror}') from e
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f'{path}: {e}') from e

    entries = data.get('board')
    if not isinstance(entries, list) or not entries:
        raise ConfigError(f'{path}: no [[board]]')

    boards: list[BoardConfig] = []
    for i, ent in enumerate(entries, 1):
        where = f'{path}: [[board]] #{i}'
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

        # ボードの WebSocket は /ws なので、パスで分けた相対 URL では動かない
        url = ent.get('url')
        if url is not None:
            try:
                parts = urlsplit(url)
                _ = parts.port   # ポートが数でない・範囲外なら ValueError
            except ValueError as e:
                raise ConfigError(f'{where}: "url" is invalid: {e}') from e
            if parts.scheme not in ('http', 'https') or not parts.netloc:
                raise ConfigError(
                    f'{where}: "url" must start with http:// or https://')
            if any(c.isspace() for c in url):
                raise ConfigError(f'{where}: "url" must not contain spaces')

        boards.append(
            BoardConfig(server_id, ent['port'], ent['image_dir'], url))

    for key in ('server_id', 'port'):
        seen = set()
        for b in boards:
            val = getattr(b, key)
            if val in seen:
                raise ConfigError(f'{path}: duplicate {key}: {val}')
            seen.add(val)

    return boards


class BoardProcess:
    """
    ボード 1 面ぶんの子プロセス。

    子は ``python -m ytbg board`` で、stdout と stderr は lobby のものを
    そのまま使う (起動できない理由はそこに出る)。
    """

    __log = getLogger(__qualname__)

    def __init__(self, conf: BoardConfig, debug: bool = False):
        self.conf = conf
        self.debug = debug
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
            if self.debug:
                cmd.append('-d')
            # server_id が '-' で始まってもオプションと取られないように
            cmd += ['--', self.conf.server_id]

            self.__log.info('start: {}', cmd)
            proc = await asyncio.create_subprocess_exec(*cmd)
            self._proc = proc
            self._watch = asyncio.create_task(self._wait(proc))

    async def _wait(self, proc: asyncio.subprocess.Process) -> None:
        """子の終了を待ち、終了コードをログに出す"""
        code = await proc.wait()
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


def create_lobby_app(boards: list[BoardConfig],
                     debug: bool = False) -> Starlette:
    """一覧サーバの Starlette のアプリを作る"""
    procs = {b.server_id: BoardProcess(b, debug) for b in boards}

    @contextlib.asynccontextmanager
    async def lifespan(_app):
        for p in procs.values():
            await p.start()
        try:
            yield
        finally:
            await asyncio.gather(*(p.stop() for p in procs.values()))

    async def index(request):
        response = templates.TemplateResponse(request, 'lobby.html', {})
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

    return Starlette(
        routes=[
            Route('/', index),
            Route('/api/boards', list_boards),
            Route('/api/boards/{server_id}/start', action('start'),
                  methods=['POST']),
            Route('/api/boards/{server_id}/stop', action('stop'),
                  methods=['POST']),
            Mount('/static',
                  app=NoCacheStaticFiles(directory=str(WEBROOT / 'static')),
                  name='static'),
        ],
        lifespan=lifespan)
