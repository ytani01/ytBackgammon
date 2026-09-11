#
# (c) 2020 Yoichi Tanibayashi
#
"""
server.py

サーバ側の中心 (TODO-025)。

クライアントから届いたメッセージの分岐と、盤面・履歴・クロック・
保存・配信のとりまとめ。接続管理と配信は ClientHub、履歴のスタックは
History、連続再生の Task は Replayer、保存は Storage が持つ。

HTTP の応答 (index.html) はここには無い。app.py の担当。
"""

import asyncio
import os
from dataclasses import asdict

from .clock import Clock
from .gameinfo import GameInfo
from .history import History
from .hub import ClientHub
from .message import (
    ClockLimitData,
    ClockSwitchData,
    CubeData,
    DiceData,
    GameInfoData,
    HistStepData,
    Message,
    PlayerClockData,
    PlayerData,
    PlayerNameData,
    PutCheckerData,
    ScoreData,
    TurnData,
    UnknownMessageType,
    parse,
)
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

        # type → ハンドラの登録表 (TODO-026)。message.py の
        # DATA_TYPES と、キーの集合が一致すること
        self._handlers = {
            # 履歴 (自分で送信するもの)
            'back': self._on_back,
            'back2': self._on_back2,
            'back_all': self._on_back_all,
            'fwd': self._on_fwd,
            'fwd2': self._on_fwd2,
            'fwd_all': self._on_fwd_all,
            'clear_hist': self._on_clear_hist,
            'new': self._on_new,
            'set_gameinfo': self._on_set_gameinfo,
            # 盤面
            'put_checker': self._on_put_checker,
            'cube': self._on_cube,
            'dice': self._on_dice,
            'set_turn': self._on_set_turn,
            'set_playername': self._on_set_playername,
            'set_score': self._on_set_score,
            'resign': self._on_resign,
            # クロック
            'set_clock_limit': self._on_set_clock_limit,
            'set_player_clock': self._on_set_player_clock,
            'set_clock_switch': self._on_set_clock_switch,
            'start_clock': self._on_start_clock,
            'resume_clock': self._on_resume_clock,
            'stop_clock': self._on_stop_clock,
            'reset_clock': self._on_reset_clock,
        }

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

    async def emit_gameinfo(
            self, sec: float = 0, history_flag=False, last_op=None):
        """
        send game information to all clients

        Parameters
        ----------
        sec: float
            for animation。SEC_CHECKER_MOVE は float なので int にしない
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

    # -----------------------------------------------------------------
    # type ごとのハンドラ (TODO-026)
    #
    # 戻り値で共通の後処理を分ける。
    #   None  : 自分で送信済み。後処理をしない
    #   float : アニメーションの秒数。history フラグを見て履歴へ積み、
    #           emit_gameinfo() する
    # -----------------------------------------------------------------

    async def _on_back(self, m: Message) -> float | None:
        """n 手ぶん戻す。Task にせず、その場で走り切る (TODO-009)"""
        data: HistStepData = m.data
        await self._replayer.run(self.backward_hist, data.n)
        return None

    async def _on_back2(self, m: Message) -> float | None:
        """ゆっくり最初まで戻す (連続再生)"""
        await self._replayer.start(self.backward_hist, 0, sleep_sec=.5)
        return None

    async def _on_back_all(self, m: Message) -> float | None:
        """最初まで戻す (連続再生)"""
        await self._replayer.start(self.backward_hist, 0)
        return None

    async def _on_fwd(self, m: Message) -> float | None:
        """n 手ぶん進める。Task にせず、その場で走り切る (TODO-009)"""
        data: HistStepData = m.data
        await self._replayer.run(self.forward_hist, data.n)
        return None

    async def _on_fwd2(self, m: Message) -> float | None:
        """ゆっくり最後まで進める (連続再生)"""
        await self._replayer.start(self.forward_hist, 0, sleep_sec=.5)
        return None

    async def _on_fwd_all(self, m: Message) -> float | None:
        """最後まで進める (連続再生)"""
        await self._replayer.start(self.forward_hist, 0)
        return None

    async def _on_clear_hist(self, m: Message) -> float | None:
        """
        履歴を消す (TODO-019)。

        back と同じく、走っている連続再生を止めてから消す。
        """
        await self._replayer.run(self.clear_history)
        await self.emit_gameinfo(0)
        return None

    async def _on_new(self, m: Message) -> float | None:
        """New game"""
        self.new_game()
        await self.emit_gameinfo(3, False)
        return None

    async def _on_set_gameinfo(self, m: Message) -> float | None:
        """gameinfo を丸ごと入れ替える"""
        data: GameInfoData = m.data
        self._gameinfo = GameInfo.from_dict(data.gameinfo)
        # 盤面ごと入れ替わるので、クロックは止まった状態にする (TODO-016)
        self._clock.stop_all()
        self.add_history(self._gameinfo)
        await self.emit_gameinfo(0)
        return None

    async def _on_put_checker(self, m: Message) -> float | None:
        """
        checker を動かす。

        唯一、アニメーションの秒数 (SEC_CHECKER_MOVE) を返す
        (TODO-015)。
        """
        data: PutCheckerData = m.data
        self._gameinfo.put_checker(data.ch, data.p, data.idx)
        if data.p >= 26:
            self.__log.debug('hit')
        return self.SEC_CHECKER_MOVE

    async def _on_cube(self, m: Message) -> float | None:
        """cube"""
        data: CubeData = m.data
        self._gameinfo.cube(asdict(data))
        return 0

    async def _on_dice(self, m: Message) -> float | None:
        """dice"""
        data: DiceData = m.data
        self._gameinfo.dice(asdict(data))
        return 0

    async def _on_set_turn(self, m: Message) -> float | None:
        """turn と resign"""
        data: TurnData = m.data
        self._gameinfo.set_turn(asdict(data))
        return 0

    async def _on_set_playername(self, m: Message) -> float | None:
        """プレーヤー名"""
        data: PlayerNameData = m.data
        self._gameinfo.set_playername(asdict(data))
        return 0

    async def _on_set_score(self, m: Message) -> float | None:
        """得点"""
        data: ScoreData = m.data
        self._gameinfo.set_score(asdict(data))
        return 0

    async def _on_resign(self, m: Message) -> float | None:
        """降参"""
        data: PlayerData = m.data
        self._gameinfo.resign_game(asdict(data))
        return 0

    async def _on_set_clock_limit(self, m: Message) -> float | None:
        """
        持ち時間・猶予の限度を変える。

        両方のクロックを limit に戻して止める。TODO-015 より前は
        ytbg.js の受信側がこうしていた。今はクライアントが
        clock_state に従うので、ここが唯一の決め手になる。
        """
        data: ClockLimitData = m.data
        self._clock.set_limit(data.index, data.clock_limit)
        self._clock.reset(0)
        self._clock.reset(1)
        return 0

    async def _on_set_player_clock(self, m: Message) -> float | None:
        """残り時間を入れ替える"""
        data: PlayerClockData = m.data
        self._clock.set_clock(data.player, data.clock)
        return 0

    # ここから 5 つはクロックの動作そのもの (TODO-016)。TODO-012 で
    # いったん消した分岐だが、再接続したクライアントへ動作中かどうかを
    # 返せるように戻した。TODO-015 で転送をやめたので、すでに開いて
    # いる画面も、ここで作った状態を clock_state で受け取って合わせる

    async def _on_set_clock_switch(self, m: Message) -> float | None:
        """
        クロック機能そのものの ON/OFF。

        board.js の Board.apply_clock_sw() は history: false で送るので、
        ここで保存しないと sw が残らない (TODO-024)。
        start/stop/resume/reset_clock はターンのたびに走るので
        保存しない (I/O が増えすぎる)。
        """
        data: ClockSwitchData = m.data
        self._clock.set_switch(data.switch)
        self.save_data()
        return 0

    async def _on_start_clock(self, m: Message) -> float | None:
        """
        ui/clock.js の PlayerClock.start() に合わせ、猶予を戻してから動かす
        """
        data: PlayerData = m.data
        self._clock.start(data.player)
        return 0

    async def _on_resume_clock(self, m: Message) -> float | None:
        """猶予を戻さずに再開する"""
        data: PlayerData = m.data
        self._clock.resume(data.player)
        return 0

    async def _on_stop_clock(self, m: Message) -> float | None:
        """止める"""
        data: PlayerData = m.data
        self._clock.stop(data.player)
        return 0

    async def _on_reset_clock(self, m: Message) -> float | None:
        """limit に戻して止める"""
        data: PlayerData = m.data
        self._clock.reset(data.player)
        return 0

    async def on_json(self, ws, msg):
        """
        msg := {'type': str, 'data': object, 'history': bool}

        parse() で型を付けてから、登録表のハンドラへ渡す (TODO-026)。
        data のキーが足りなければ parse() で例外になり、受信ループの
        受け皿 (app.py) が拾う。
        """
        self.__log.info('client={}', self._hub.name(ws))
        self.__log.info('msg={}', msg)

        try:
            m = parse(msg)
        except UnknownMessageType as e:
            # 登録表に無い type は、警告を出して無視する (TODO-026)。
            # 履歴にも積まず、gameinfo も送り返さない。接続は保つ
            self.__log.warning('{}: ignored', e)
            return

        sec = await self._handlers[m.type](m)
        if sec is None:
            # ハンドラが自分で送信済み
            return

        # append history or not
        if m.history:
            self.add_history(self._gameinfo)

        # 受け取った msg をそのまま転送するのではなく、gameinfo に
        # 直前の操作を添えて返す (TODO-015)。クライアントは gameinfo で
        # 盤面を作り直し、音と dice の回転だけを last_op から出す。
        # チェッカーが動くときだけアニメーションの時間を渡す
        await self.emit_gameinfo(sec, history_flag=False, last_op=m.raw)
##
