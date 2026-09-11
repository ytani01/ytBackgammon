#
# (c) Yoichi Tanibayashi
#
"""
yt_backgammon_server.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import asyncio
import os

from starlette.templating import Jinja2Templates
from starlette.websockets import WebSocket

from . import WEBROOT
from .clock import Clock
from .mylog import getLogger
from .storage import Storage
from .yt_backgammon import ytBackgammon

templates = Jinja2Templates(directory=str(WEBROOT / 'templates'))


class ytBackgammonServer:
    # 保存先。ブラウザでの動作確認は実プロセスを起動するので、
    # 環境変数で一時ディレクトリへ逃がせるようにしてある (TODO-021)
    DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
    DATAFILE_NAME = 'ytbg'
    SEC_CHECKER_MOVE = 0.2

    __log = getLogger(__qualname__)

    def __init__(self, svr_name, svr_ver, svr_id, image_dir):
        self.__log.debug(
            'svr_name={}, svr_ver={}, svr_id={}, image_dir={}',
            svr_name, svr_ver, svr_id, image_dir)

        self._svr_name = svr_name
        self._svr_ver = svr_ver
        self._svr_id = svr_id
        self._image_dir = image_dir

        # 保存は JSON Lines (TODO-024)。旧形式 (.json) は、これが
        # 無いときだけ Storage が読む
        self._datafile_path = (
            f'{self.DATAFILE_DIR}/{self.DATAFILE_NAME}-{self._svr_id}.jsonl')
        self.__log.debug('_datafile_path={}', self._datafile_path)
        self._storage = Storage(self._datafile_path)

        # 接続中の WebSocket と、ログ用の識別名 (TODO-009)。
        # socket.io の sid に当たるものは無いので、自前の連番を振る
        self._clients: dict[WebSocket, str] = {}
        self._client_sn = 0

        self._history = []
        self._fwd_hist = []
        self._cur_sn = 0

        self._bg = ytBackgammon(self._svr_ver)

        # 履歴の連続再生の Task (TODO-009)。走っていなければ None。
        # 差し替えと cancel は必ず _replay_lock の中で行う
        self._replay_task: asyncio.Task | None = None
        self._replay_lock = asyncio.Lock()

        # クロック (TODO-016、TODO-024)。gameinfo には入れない。
        # 入れると履歴に載り、back / fwd でクロックの発着まで戻ってしまう。
        # 保存したものがあれば load_data() が差し替える
        self._clock = Clock()

        [hist_len, _fwd_hist_len] = self.load_data()
        if hist_len < 1:
            self.__log.warning('load_data({}): error', self._datafile_path)
            self.add_history(self._bg._gameinfo)

    def new_game(self):
        """
        New game
        """
        self.__log.debug('')

        # board を作り直し、turn と resign を戻すだけ (TODO-024)。
        # score / playername / game_num / match_score は残る
        self._bg.new_game()

        # クロックは limit に戻し、止まった状態で始める (TODO-016)
        self._clock.reset(0)
        self._clock.reset(1)

        self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self.__log.debug('gameinfo={}', gameinfo)

        if gameinfo is not None:
            self._fwd_hist = []
            if len(self._history) == 0:
                self._cur_sn = 1
            else:
                self._cur_sn = self._history[-1].sn + 1

            gameinfo.sn = self._cur_sn
            self._history.append(gameinfo.copy())
            self.save_data()
            self.__log.debug('history=({})', len(self._history))

    async def clear_history(self):
        """
        履歴を消し、今の盤面 1 件だけにする (TODO-019)。

        盤面そのものは変えないので、消したあとも表示は同じまま。
        _fwd_hist も捨てるので、戻すことも進めることもできなくなる。

        連続再生の Task が _history を pop している最中に差し替えると
        壊れるので、**_run_replay() 経由で呼ぶこと。** 待つところが
        無いので async にする必要は無いが、_run_replay() に渡すために
        async def にしてある。
        """
        self.__log.debug('')

        self._fwd_hist = []
        self._cur_sn = 1
        self._bg._gameinfo.sn = self._cur_sn
        self._history = [self._bg._gameinfo.copy()]
        self.save_data()

        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))

    async def broadcast(self, msg):
        """
        send a message to all connected clients

        Parameters
        ----------
        msg: dict
            {'src': str, 'type': str, 'data': object, ...}
        """
        clients = list(self._clients)
        if not clients:
            return

        # 詰まったクライアントが 1 つあっても、他の送信が始まるのを
        # 待たせないように並行に送る (TODO-009)。1 つが失敗しても
        # 残りへは届く。送信に失敗する理由は切断だけとは限らないので、
        # 例外の種類は絞らずに握る
        results = await asyncio.gather(
            *[ws.send_json(msg) for ws in clients],
            return_exceptions=True)

        for ws, result in zip(clients, results, strict=True):
            if isinstance(result, BaseException):
                self.__log.warning('{}: {}:{}', self.client_name(ws),
                                   type(result).__name__, result)

    def _load_hist_ent(self, hist_ent):
        """
        履歴のエントリを、いまの gameinfo にする。

        クロックは gameinfo の外に出したので (TODO-024)、
        「残り時間だけは引き継ぐ」という例外は要らなくなった。
        """
        self._bg._gameinfo = hist_ent.copy()

    async def emit_gameinfo(self, sec=0, history_flag=False, last_op=None):
        """
        send game information to all clients

        Parameters
        ----------
        sec: int
            for animation
        last_op: dict | None
            直前の操作 (クライアントから届いた msg そのまま) (TODO-015)。
            盤面は gameinfo だけで復元できるが、音と dice の回転は
            「何が起きたか」が分からないと出せないので添える。
            履歴の再生や接続時のように、操作に紐づかない送信では None
        """
        await self.broadcast(
            {
                'src': 'server', 'dst': 'all', 'type': 'gameinfo',
                'data': {
                    'gameinfo': self._bg._gameinfo.to_dict(),
                    'sec': sec,
                    'hist_i': len(self._history),
                    'hist_n': len(self._history) + len(self._fwd_hist),
                    'history_flag': history_flag,
                    'last_op': last_op,
                    # クロックは gameinfo の外にあるので、
                    # clock_state として添えて送る (TODO-016、TODO-024)。
                    # クライアントはクロック関連をすべてここから読む
                    'clock_state': self._clock.state(),
                }
            })

    async def backward_hist(self, n=1, sleep_sec=0.1):
        """
        backward history

        Parameters
        ----------
        n : int
            < 0: all
        sleep_sec : float
            sleep seconds
        """
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0.1

        try:
            while len(self._history) > 1:
                self._fwd_hist.append(self._history.pop())
                self._load_hist_ent(self._history[-1])

                self.__log.debug('_history=({}), _fwd_hist=({})',
                                 len(self._history), len(self._fwd_hist))

                await self.emit_gameinfo(sec, history_flag=True)

                count += 1
                if n > 0 and count >= n:
                    break

                await asyncio.sleep(sleep_sec)
        finally:
            # 途中で cancel されても、そこまでの結果は保存する
            self.save_data()

    async def forward_hist(self, n=1, sleep_sec=0.1):
        """
        forward history

        Parameters
        ----------
        n : int
            < 0: all
        sleep_sec : float
            sleep seconds
        """
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0.1

        try:
            while len(self._fwd_hist) > 0:
                self._history.append(self._fwd_hist.pop())
                self._load_hist_ent(self._history[-1])

                self.__log.debug('_history=({}), _fwd_hist=({})',
                                 len(self._history), len(self._fwd_hist))

                await self.emit_gameinfo(sec, history_flag=True)

                count += 1
                if n > 0 and count >= n:
                    break

                await asyncio.sleep(sleep_sec)
        finally:
            # 途中で cancel されても、そこまでの結果は保存する
            self.save_data()

    def save_data(self):
        """
        履歴とクロックを JSON Lines へ保存する (TODO-024)。

        書式は storage.py の Storage が持つ。
        """
        self.__log.debug('path={}', self._datafile_path)

        self._storage.save(self._history, self._fwd_hist, self._clock)

    def load_data(self):
        """
        保存したものを読む (TODO-024)。

        .jsonl が無ければ旧形式 (.json) を読む。読めなければ何も
        書き換えずに (0, 0) を返す。初回起動もそこを通る。

        Returns
        -------
        history_length: int
            len(self._history)
        fwd_hist_length: int
            len(self._fwd_hist)
        """
        self.__log.debug('path={}', self._datafile_path)

        history, fwd_hist, clock = self._storage.load()
        if clock is None:
            # 読めない・壊れている・ファイルが無い。空の履歴として始める
            return 0, 0

        self._history = history
        self._fwd_hist = fwd_hist
        # 保存に active は入れていないので、読み込んだ直後は止まっている
        self._clock = clock
        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))
        if len(self._history) > 0:
            self._bg._gameinfo = self._history[-1].copy()
        return len(self._history), len(self._fwd_hist)

    def client_name(self, ws):
        """
        ログに出す、クライアントを見分けるための名前。

        socket.io の sid に当たるものは WebSocket には無いので、接続順の
        連番と接続元を組み合わせた文字列を on_connect() で振っている
        (TODO-009)。まだ登録されていない WebSocket なら '?' を返す。
        """
        return self._clients.get(ws, '?')

    async def on_connect(self, ws):
        self._client_sn += 1
        client = ws.client
        if client is None:
            name = f'c{self._client_sn}'
        else:
            name = f'c{self._client_sn}@{client.host}:{client.port}'

        self._clients[ws] = name
        self.__log.info('connect: {} (clients={})',
                        name, len(self._clients))

        await self.emit_gameinfo(0)

    async def on_disconnect(self, ws):
        name = self._clients.pop(ws, None)
        if name is None:
            # accept() の前に切れた場合など、登録されていないことがある
            self.__log.debug('unknown client')
            return

        self.__log.info('disconnect: {} (clients={})',
                        name, len(self._clients))

    def on_error(self, ws, e, msg=None):
        """
        ws: WebSocket | None
            どのクライアントで起きたか。連続再生の Task のように
            特定のクライアントに紐づかない場合は None
        """
        self.__log.error('{}: e={!a}:{!a}',
                         self.client_name(ws), type(e).__name__, e)
        self.__log.error('msg={!a}', msg)

    async def _cancel_replay(self):
        """
        走っている連続再生の Task を止め、終わるまで待つ (TODO-009)。

        **_replay_lock を持った状態で呼ぶこと。** ロックの外で呼ぶと、
        待っている間に別の要求が新しい Task を作り、_replay_task から
        辿れない再生が残る。
        """
        task = self._replay_task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                self.__log.debug('replay canceled')

        self._replay_task = None

    async def _replay(self, func, *args, **kwargs):
        """
        連続再生の本体。Task にして走らせる。

        Task の中で起きた例外は誰も受け取らないので、ここで
        on_error() へ渡す (TODO-009)。
        """
        try:
            await func(*args, **kwargs)
        except asyncio.CancelledError:
            # CancelledError は BaseException 側なので、下の
            # except Exception には元々捕まらない。cancel を
            # エラー扱いしないことを読んで分かるように書いてある
            raise
        except Exception as e:  # noqa: BLE001
            self.on_error(None, e)

    async def _start_replay(self, func, *args, **kwargs):
        """
        前の連続再生を止めてから、新しい再生を Task として始める。

        Task は待たずに返る。再生中も他のメッセージを処理できるように
        するため (TODO-009)。止めるところから作るところまでを
        _replay_lock で囲むので、再生は常に 1 本だけになる。
        """
        async with self._replay_lock:
            await self._cancel_replay()
            self._replay_task = asyncio.create_task(
                self._replay(func, *args, **kwargs))

    async def _run_replay(self, func, *args, **kwargs):
        """
        前の連続再生を止めてから、その場で最後まで走らせる。

        n > 0 の back / fwd と clear_hist 用 (TODO-009、TODO-019)。
        移行前は backward_hist() が同期に走り切ってから on_json() が
        返っていたので、同時に 2 通来たら 2 手ぶん動いた。_replay_lock を握ったまま走らせることで、
        その順序に戻している。例外は呼び出し元 (on_json) へ抜けて、
        受信ループの受け皿から on_error() へ届く。
        """
        async with self._replay_lock:
            await self._cancel_replay()
            await func(*args, **kwargs)

    async def on_json(self, ws, msg):
        """
        msg := {'type': str, 'data': object}
        """
        self.__log.info('client={}', self.client_name(ws))
        self.__log.info('msg={}', msg)

        if msg['type'] == 'back':
            # data: {n: n}
            await self._run_replay(
                self.backward_hist, msg['data']['n'])
            return

        if msg['type'] == 'back2':
            # data: {}
            await self._start_replay(
                self.backward_hist, 0, sleep_sec=.5)
            return

        if msg['type'] == 'back_all':
            # data: {}
            await self._start_replay(self.backward_hist, 0)
            return

        if msg['type'] == 'fwd':
            # data: {n: n}
            await self._run_replay(
                self.forward_hist, msg['data']['n'])
            return

        if msg['type'] == 'fwd2':
            # data: {}
            await self._start_replay(
                self.forward_hist, 0, sleep_sec=.5)
            return

        if msg['type'] == 'fwd_all':
            # data: {}
            await self._start_replay(self.forward_hist, 0)
            return

        if msg['type'] == 'clear_hist':
            # data: {}
            # back と同じく、走っている連続再生を止めてから消す
            await self._run_replay(self.clear_history)
            await self.emit_gameinfo(0)
            return

        if msg['type'] == 'new':
            # data: {}
            self.new_game()
            await self.emit_gameinfo(3, False)
            return

        if msg['type'] == 'set_gameinfo':
            # data: gameinfo
            self._bg.set_gameinfo(msg['data'])
            # 盤面ごと入れ替わるので、クロックは止まった状態にする (TODO-016)
            self._clock.stop_all()
            self.add_history(self._bg._gameinfo)
            await self.emit_gameinfo(0)
            return

        # ここから下は return せず、末尾の add_history と
        # emit_gameinfo まで落ちる (TODO-015)
        if msg['type'] == 'put_checker':
            # data: {'ch': int, 'p': int, 'idx': int}
            self._bg.put_checker(msg['data']['ch'],
                                 msg['data']['p'], msg['data']['idx'])
            if msg['data']['p'] >= 26:
                self.__log.debug('hit')

        if msg['type'] == 'cube':
            # data: {'side': int, 'value': int, 'accepted': bool}
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            # data: {'player': int, 'dice': [int, int, int, int]
            self._bg.dice(msg['data'])

        if msg['type'] == 'set_turn':
            # data: {'turn': int, resign: int}
            self._bg.set_turn(msg['data'])

        if msg['type'] == 'set_playername':
            # data: {'player': int, 'name': str}
            self._bg.set_playername(msg['data'])

        if msg['type'] == 'set_score':
            # data: {'player': int, 'score': int}
            self._bg.set_score(msg['data'])

        if msg['type'] == 'resign':
            # data: {'player': int}
            self._bg.resign(msg['data'])

        if msg['type'] == 'set_clock_limit':
            # data: {'index': int, 'clock_limit': int}
            self._clock.set_limit(msg['data']['index'],
                                  msg['data']['clock_limit'])
            # 両方のクロックを limit に戻して止める。TODO-015 より前は
            # ytbg.js の受信側がこうしていた。今はクライアントが
            # clock_state に従うので、ここが唯一の決め手になる
            self._clock.reset(0)
            self._clock.reset(1)

        if msg['type'] == 'set_player_clock':
            # data: {'player': int, 'clock': [int(sec), int(sec)]}
            self._clock.set_clock(msg['data']['player'], msg['data']['clock'])

        # ここから 5 つはクロックの動作そのもの (TODO-016)。TODO-012 で
        # いったん消した分岐だが、再接続したクライアントへ動作中かどうかを
        # 返せるように戻した。TODO-015 で転送をやめたので、すでに開いて
        # いる画面も、ここで作った状態を clock_state で受け取って合わせる
        if msg['type'] == 'set_clock_switch':
            # data: {'switch': bool}
            self._clock.set_switch(msg['data']['switch'])
            # ytbg.js の apply_clock_sw() は history: false で送るので、
            # ここで保存しないと sw が残らない (TODO-024)。
            # start/stop/resume/reset_clock はターンのたびに走るので
            # 保存しない (I/O が増えすぎる)
            self.save_data()

        if msg['type'] == 'start_clock':
            # data: {'player': int}
            # ytbg.js の PlayerClock.start() に合わせ、猶予を戻してから動かす
            self._clock.start(msg['data']['player'])

        if msg['type'] == 'resume_clock':
            # data: {'player': int}
            self._clock.resume(msg['data']['player'])

        if msg['type'] == 'stop_clock':
            # data: {'player': int}
            self._clock.stop(msg['data']['player'])

        if msg['type'] == 'reset_clock':
            # data: {'player': int}
            self._clock.reset(msg['data']['player'])

        # append history or not
        if msg['history']:
            self.add_history(self._bg._gameinfo)

        # 受け取った msg をそのまま転送するのではなく、gameinfo に
        # 直前の操作を添えて返す (TODO-015)。クライアントは gameinfo で
        # 盤面を作り直し、音と dice の回転だけを last_op から出す。
        # チェッカーが動くときだけアニメーションの時間を渡す
        sec = self.SEC_CHECKER_MOVE if msg['type'] == 'put_checker' else 0
        await self.emit_gameinfo(sec, history_flag=False, last_op=msg)

    def app_index(self, request):
        self.__log.debug('')
        return templates.TemplateResponse(
            request, 'index.html',
            {
                'name': self._svr_name,
                'version': self._svr_ver,
                'server_id': self._svr_id,
                'image_dir': self._image_dir,
            })
##
