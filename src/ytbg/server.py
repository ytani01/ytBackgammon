#
# (c) Yoichi Tanibayashi
#
"""
server.py

サーバ側の中心 (TODO-025)。

クライアントから届いたメッセージの分岐と、盤面・履歴・クロック・
保存・配信のとりまとめ。接続管理と配信は ClientHub、履歴のスタックは
History、連続再生の Task は Replayer、保存は Storage が持つ。

HTTP の応答 (index.html) はここには無い。app.py の担当。
"""
__author__ = 'Yoichi Tanibayashi'
__date__ = '2020/05'

import asyncio
import os

from .clock import Clock
from .gameinfo import GameInfo
from .history import History
from .hub import ClientHub
from .mylog import getLogger
from .replay import Replayer
from .storage import Storage


class BackgammonServer:
    # 保存先。ブラウザでの動作確認は実プロセスを起動するので、
    # 環境変数で一時ディレクトリへ逃がせるようにしてある (TODO-021)
    DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
    DATAFILE_NAME = 'ytbg'
    SEC_CHECKER_MOVE = 0.2

    __log = getLogger(__qualname__)

    def __init__(self, svr_ver, svr_id):
        self.__log.debug('svr_ver={}, svr_id={}', svr_ver, svr_id)

        self._svr_ver = svr_ver
        self._svr_id = svr_id

        # 保存は JSON Lines (TODO-024)。旧形式 (.json) は、これが
        # 無いときだけ Storage が読む
        self._datafile_path = (
            f'{self.DATAFILE_DIR}/{self.DATAFILE_NAME}-{self._svr_id}.jsonl')
        self.__log.debug('_datafile_path={}', self._datafile_path)
        self._storage = Storage(self._datafile_path)

        self._hub = ClientHub()
        self._hist = History()

        self._gameinfo = GameInfo(server_version=svr_ver)

        # 履歴の連続再生 (TODO-009)。Task の中で起きた例外は
        # on_error() へ渡す。差し替え可能なように、その場で
        # self.on_error を引く (テストが差し替える)
        self._replayer = Replayer(lambda e: self.on_error(None, e))

        # クロック (TODO-016、TODO-024)。gameinfo には入れない。
        # 入れると履歴に載り、back / fwd でクロックの発着まで戻ってしまう。
        # 保存したものがあれば load_data() が差し替える
        self._clock = Clock()

        [hist_len, _fwd_hist_len] = self.load_data()
        if hist_len < 1:
            self.__log.warning('load_data({}): error', self._datafile_path)
            self.add_history(self._gameinfo)

    def new_game(self):
        """
        New game
        """
        self.__log.debug('')

        # board を作り直し、turn と resign を戻すだけ (TODO-024)。
        # score / playername / game_num / match_score は残る
        self._gameinfo.new_game(self._svr_ver)

        # クロックは limit に戻し、止まった状態で始める (TODO-016)
        self._clock.reset(0)
        self._clock.reset(1)

        self.add_history(self._gameinfo)

    def add_history(self, gameinfo=None):
        # gameinfo のログは History.add() 側で出す (TODO-025)
        if self._hist.add(gameinfo):
            self.save_data()

    async def clear_history(self):
        """
        履歴を消し、今の盤面 1 件だけにする (TODO-019)。

        盤面そのものは変えないので、消したあとも表示は同じまま。
        _fwd_hist も捨てるので、戻すことも進めることもできなくなる。

        連続再生の Task が履歴を pop している最中に差し替えると
        壊れるので、**_replayer.run() 経由で呼ぶこと。** 待つところが
        無いので async にする必要は無いが、run() に渡すために
        async def にしてある。
        """
        self.__log.debug('')

        self._hist.clear(self._gameinfo)
        self.save_data()

    def _load_hist_ent(self, hist_ent):
        """
        履歴のエントリを、いまの gameinfo にする。

        クロックは gameinfo の外に出したので (TODO-024)、
        「残り時間だけは引き継ぐ」という例外は要らなくなった。
        """
        self._gameinfo = hist_ent.copy()

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
        await self._hub.broadcast(
            {
                'src': 'server', 'dst': 'all', 'type': 'gameinfo',
                'data': {
                    'gameinfo': self._gameinfo.to_dict(),
                    'sec': sec,
                    'hist_i': len(self._hist),
                    'hist_n': self._hist.total(),
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
            while True:
                hist_ent = self._hist.back()
                if hist_ent is None:
                    break

                self._load_hist_ent(hist_ent)

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
            while True:
                hist_ent = self._hist.forward()
                if hist_ent is None:
                    break

                self._load_hist_ent(hist_ent)

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

        self._storage.save(self._hist.entries, self._hist.fwd_entries,
                           self._clock)

    def load_data(self):
        """
        保存したものを読む (TODO-024)。

        .jsonl が無ければ旧形式 (.json) を読む。読めなければ何も
        書き換えずに (0, 0) を返す。初回起動もそこを通る。

        Returns
        -------
        history_length: int
            履歴の件数
        fwd_hist_length: int
            進む側の履歴の件数
        """
        self.__log.debug('path={}', self._datafile_path)

        history, fwd_hist, clock = self._storage.load()
        if clock is None:
            # 読めない・壊れている・ファイルが無い。空の履歴として始める
            return 0, 0

        self._hist.load(history, fwd_hist)
        # 保存に active は入れていないので、読み込んだ直後は止まっている
        self._clock = clock
        if len(self._hist) > 0:
            self._gameinfo = self._hist.entries[-1].copy()
        return len(self._hist), len(self._hist.fwd_entries)

    async def on_connect(self, ws):
        name = self._hub.add(ws)
        self.__log.info('connect: {} (clients={})', name, self._hub.count())

        await self.emit_gameinfo(0)

    async def on_disconnect(self, ws):
        name = self._hub.remove(ws)
        if name is None:
            # accept() の前に切れた場合など、登録されていないことがある
            self.__log.debug('unknown client')
            return

        self.__log.info('disconnect: {} (clients={})',
                        name, self._hub.count())

    def on_error(self, ws, e, msg=None):
        """
        ws: WebSocket | None
            どのクライアントで起きたか。連続再生の Task のように
            特定のクライアントに紐づかない場合は None
        """
        self.__log.error('{}: e={!a}:{!a}',
                         self._hub.name(ws), type(e).__name__, e)
        self.__log.error('msg={!a}', msg)

    async def on_json(self, ws, msg):
        """
        msg := {'type': str, 'data': object}
        """
        self.__log.info('client={}', self._hub.name(ws))
        self.__log.info('msg={}', msg)

        if msg['type'] == 'back':
            # data: {n: n}
            await self._replayer.run(
                self.backward_hist, msg['data']['n'])
            return

        if msg['type'] == 'back2':
            # data: {}
            await self._replayer.start(
                self.backward_hist, 0, sleep_sec=.5)
            return

        if msg['type'] == 'back_all':
            # data: {}
            await self._replayer.start(self.backward_hist, 0)
            return

        if msg['type'] == 'fwd':
            # data: {n: n}
            await self._replayer.run(
                self.forward_hist, msg['data']['n'])
            return

        if msg['type'] == 'fwd2':
            # data: {}
            await self._replayer.start(
                self.forward_hist, 0, sleep_sec=.5)
            return

        if msg['type'] == 'fwd_all':
            # data: {}
            await self._replayer.start(self.forward_hist, 0)
            return

        if msg['type'] == 'clear_hist':
            # data: {}
            # back と同じく、走っている連続再生を止めてから消す
            await self._replayer.run(self.clear_history)
            await self.emit_gameinfo(0)
            return

        if msg['type'] == 'new':
            # data: {}
            self.new_game()
            await self.emit_gameinfo(3, False)
            return

        if msg['type'] == 'set_gameinfo':
            # data: gameinfo
            self._gameinfo = GameInfo.from_dict(msg['data'])
            # 盤面ごと入れ替わるので、クロックは止まった状態にする (TODO-016)
            self._clock.stop_all()
            self.add_history(self._gameinfo)
            await self.emit_gameinfo(0)
            return

        # ここから下は return せず、末尾の add_history と
        # emit_gameinfo まで落ちる (TODO-015)
        if msg['type'] == 'put_checker':
            # data: {'ch': int, 'p': int, 'idx': int}
            self._gameinfo.put_checker(msg['data']['ch'],
                                       msg['data']['p'], msg['data']['idx'])
            if msg['data']['p'] >= 26:
                self.__log.debug('hit')

        if msg['type'] == 'cube':
            # data: {'side': int, 'value': int, 'accepted': bool}
            self._gameinfo.cube(msg['data'])

        if msg['type'] == 'dice':
            # data: {'player': int, 'dice': [int, int, int, int]
            self._gameinfo.dice(msg['data'])

        if msg['type'] == 'set_turn':
            # data: {'turn': int, resign: int}
            self._gameinfo.set_turn(msg['data'])

        if msg['type'] == 'set_playername':
            # data: {'player': int, 'name': str}
            self._gameinfo.set_playername(msg['data'])

        if msg['type'] == 'set_score':
            # data: {'player': int, 'score': int}
            self._gameinfo.set_score(msg['data'])

        if msg['type'] == 'resign':
            # data: {'player': int}
            self._gameinfo.resign_game(msg['data'])

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
            self.add_history(self._gameinfo)

        # 受け取った msg をそのまま転送するのではなく、gameinfo に
        # 直前の操作を添えて返す (TODO-015)。クライアントは gameinfo で
        # 盤面を作り直し、音と dice の回転だけを last_op から出す。
        # チェッカーが動くときだけアニメーションの時間を渡す
        sec = self.SEC_CHECKER_MOVE if msg['type'] == 'put_checker' else 0
        await self.emit_gameinfo(sec, history_flag=False, last_op=msg)
##
