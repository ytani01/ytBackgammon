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
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, fields, is_dataclass
from typing import Any, get_args, get_origin, get_type_hints

from .clock import Clock
from .gameinfo import GameInfo
from .history import History
from .hub import ClientHub
from .message import (
    ClockLimitData,
    ClockSwitchData,
    DiceData,
    HistStepData,
    Message,
    MoveData,
    NoData,
    OpeningData,
    PlayerData,
    PlayerNameData,
    PutCheckerData,
    ResignData,
    ScoreData,
    UnknownMessageType,
)
from .mylog import getLogger
from .replay import Replayer
from .storage import Storage


class BackgammonServer:
    DATAFILE_NAME = 'ytbg'
    SEC_CHECKER_MOVE = 0.2

    __log = getLogger(__qualname__)

    def __init__(self, svr_ver, svr_id):
        self.__log.debug('svr_ver={}, svr_id={}', svr_ver, svr_id)

        self._svr_ver = svr_ver
        self._svr_id = svr_id

        # 保存は JSON Lines (TODO-024)。旧形式 (.json) は
        # もう読まない (TODO-031)
        # 保存先。ブラウザでの動作確認は実プロセスを起動するので、
        # 環境変数で一時ディレクトリへ逃がせるようにしてある (TODO-021)。
        # import のときではなく作るときに読む (TODO-055)
        datafile_dir = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
        self._datafile_path = (
            f'{datafile_dir}/{self.DATAFILE_NAME}-{self._svr_id}.jsonl')
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

        if not self.load_data():
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
        # 盤面が既に初期配置のときは add_history() が積まないことがあり、
        # そのときは save_data() が呼ばれない。クロックのリセットを
        # 取りこぼさないよう、New Game はまれな操作と割り切って
        # add_history() と二重になっても必ず保存する (TODO-032)
        self.save_data()

    def add_history(self, gameinfo: GameInfo):
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

    async def emit_gameinfo(
            self, sec: float = 0, last_op=None):
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
                    'last_op': last_op,
                    # クロックは gameinfo の外にあるので、
                    # clock_state として添えて送る (TODO-016、TODO-024)。
                    # クライアントはクロック関連をすべてここから読む
                    'clock_state': self._clock.state(),
                }
            })

    async def _replay_hist(self, pop, n, sleep_sec):
        """
        履歴を 1 手ずつたどって配信する (TODO-038)。

        backward_hist() と forward_hist() の中身。違うのは
        どちらのスタックから取り出すか (pop) だけ。

        Parameters
        ----------
        pop : Callable[[], GameInfo | None]
            History.back か History.forward。もう無ければ None を返す
        n : int
            <= 0: 最後まで
        sleep_sec : float
            1 手ごとに待つ秒数
        """
        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0.1

        try:
            while True:
                hist_ent = pop()
                if hist_ent is None:
                    break

                self._gameinfo = hist_ent.copy()

                await self.emit_gameinfo(sec)

                count += 1
                if n > 0 and count >= n:
                    break

                await asyncio.sleep(sleep_sec)
        finally:
            # 途中で cancel されても、そこまでの結果は保存する
            self.save_data()

    async def backward_hist(self, n=1, sleep_sec=0.1):
        """
        backward history

        Parameters
        ----------
        n : int
            <= 0: 最後まで
        sleep_sec : float
            sleep seconds
        """
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)
        await self._replay_hist(self._hist.back, n, sleep_sec)

    async def forward_hist(self, n=1, sleep_sec=0.1):
        """
        forward history

        Parameters
        ----------
        n : int
            <= 0: 最後まで
        sleep_sec : float
            sleep seconds
        """
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)
        await self._replay_hist(self._hist.forward, n, sleep_sec)

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

        読めないか、履歴が 1 件も無ければ False を返す。初回起動も
        そこを通る。読めて履歴が 0 件のときは、クロックだけは読んだ
        ものに差し替わる。

        Returns
        -------
        bool
            読めて、履歴が 1 件以上あったか (TODO-055)。False なら
            呼ぶ側が今の盤面を 1 件目として積む
        """
        self.__log.debug('path={}', self._datafile_path)

        history, fwd_hist, clock = self._storage.load()
        if clock is None:
            # 読めない・壊れている・ファイルが無い。空の履歴として始める
            return False

        self._hist.load(history, fwd_hist)
        # 保存に active は入れていないので、読み込んだ直後は止まっている
        self._clock = clock
        if len(self._hist) > 0:
            self._gameinfo = self._hist.entries[-1].copy()
        return len(self._hist) > 0

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
    #   None  : 自分で送信済みか、盤面と合わないので捨てた (TODO-050)。
    #           後処理をしない
    #   float : アニメーションの秒数。on_json() が、勝負がついたら
    #           クロックを止め、履歴へ積むかを決めて emit_gameinfo() する
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
        await self.emit_gameinfo(3)
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

    async def _on_dice(self, m: Message) -> float | None:
        """dice"""
        data: DiceData = m.data
        self._gameinfo.dice(data)
        return 0

    async def _on_set_playername(self, m: Message) -> float | None:
        """プレーヤー名"""
        data: PlayerNameData = m.data
        self._gameinfo.set_playername(data)
        return 0

    async def _on_set_score(self, m: Message) -> float | None:
        """得点"""
        data: ScoreData = m.data
        self._gameinfo.set_score(data)
        return 0

    # 名前付きの操作 (TODO-050)。1 つの操作を 1 通で受け、盤面と
    # クロックをサーバの持つ値から変える。
    #
    # 今の盤面と合わないもの (GameInfo のメソッドが False を返したもの) は
    # _ignore() で捨てる。同じ操作がほぼ同時に 2 回届いても、2 回ぶん
    # 効かないようにするため

    def _ignore(self, m: Message) -> None:
        """
        盤面と合わない操作を捨てる。警告をログに出し、None を返して
        履歴にも積まず、盤面も送らない
        """
        self.__log.warning('ignored: type={}, data={}, turn={}, cube={}',
                           m.type, m.data, self._gameinfo.turn,
                           self._gameinfo.board.cube)

    def _switch_clock(self, player: int) -> None:
        """player のクロックを止め、相手のクロックを猶予を戻して動かす"""
        self._clock.stop(player)
        self._clock.start(1 - player)

    async def _on_opening(self, m: Message) -> float | None:
        """オープニングロールの結果。クロックは動かさない"""
        data: OpeningData = m.data
        if not self._gameinfo.opening(data):
            self._ignore(m)
            return None
        return 0

    async def _on_move(self, m: Message) -> float | None:
        """駒を動かした。チェッカーが動くので SEC_CHECKER_MOVE を返す"""
        data: MoveData = m.data
        self._gameinfo.move(data)
        return self.SEC_CHECKER_MOVE

    async def _on_end_turn(self, m: Message) -> float | None:
        """手番を相手に渡す"""
        data: PlayerData = m.data
        if not self._gameinfo.end_turn(data):
            self._ignore(m)
            return None
        self._switch_clock(data.player)
        return 0

    async def _on_double(self, m: Message) -> float | None:
        """ダブル。掛けた側 (player) のクロックを止める"""
        data: PlayerData = m.data
        if not self._gameinfo.double(data):
            self._ignore(m)
            return None
        self._switch_clock(data.player)
        return 0

    async def _on_take(self, m: Message) -> float | None:
        """テイク。手番のクロックを動かす"""
        data: PlayerData = m.data
        if not self._gameinfo.take(data):
            self._ignore(m)
            return None
        self._switch_to_turn()
        return 0

    async def _on_cancel_double(self, m: Message) -> float | None:
        """
        ダブルの取り消し。ダブルの前 (手番の人が振る番) に戻す扱いで、
        手番のクロックを動かす
        """
        data: PlayerData = m.data
        if not self._gameinfo.cancel_double(data):
            self._ignore(m)
            return None
        self._switch_to_turn()
        return 0

    def _switch_to_turn(self) -> None:
        """
        手番でない側 (1 - turn) のクロックを止め、手番のクロックを動かす。

        turn が 0 か 1 のときだけ。2 や -1 で 1 - turn を添字にすると、
        負の添字で別のプレーヤーを指してしまう
        """
        turn = self._gameinfo.turn
        if turn in (0, 1):
            self._switch_clock(1 - turn)

    async def _on_resign(self, m: Message) -> float | None:
        """投了。turn は -1 になるので、on_json() がクロックを止める"""
        data: ResignData = m.data
        if not self._gameinfo.resign_game(data):
            self._ignore(m)
            return None
        return 0

    async def _on_set_clock_limit(self, m: Message) -> float | None:
        """
        持ち時間・猶予の限度を変える。

        両方のクロックを limit に戻して止める。TODO-015 より前は
        ytbg.js の受信側がこうしていた。今はクライアントが
        clock_state に従うので、ここが唯一の決め手になる。

        set_clock_limit は履歴に積まない (TODO-032) ので、
        ここで保存しないと limit が残らない。_on_set_clock_switch() と
        同じ理由
        """
        data: ClockLimitData = m.data
        self._clock.set_limit(data.index, data.clock_limit)
        self._clock.reset(0)
        self._clock.reset(1)
        self.save_data()
        return 0

    # ここから 3 つはクロックの動作そのもの (TODO-016)。TODO-012 で
    # いったん消した分岐だが、再接続したクライアントへ動作中かどうかを
    # 返せるように戻した。TODO-015 で転送をやめたので、すでに開いて
    # いる画面も、ここで作った状態を clock_state で受け取って合わせる

    async def _on_set_clock_switch(self, m: Message) -> float | None:
        """
        クロック機能そのものの ON/OFF。

        履歴に積まないので、ここで保存しないと sw が残らない (TODO-024)。
        stop/resume_clock と、手番の受け渡しでのクロックの切り替えは
        保存しない (I/O が増えすぎる)。
        """
        data: ClockSwitchData = m.data
        # 切り替えたら両方を止める (TODO-050)。stop() で経過分を
        # 残り時間に反映してから sw を変える
        self._clock.stop(0)
        self._clock.stop(1)
        self._clock.set_switch(data.switch)
        self.save_data()
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

    async def on_json(self, ws, msg):
        """
        msg := {'type': str, 'data': object}

        parse() で型を付けてから、登録表 (MESSAGE_TYPES) のハンドラへ
        渡す (TODO-026、TODO-050)。data のキーが足りなければ parse() で
        例外になり、受信ループの受け皿 (app.py) が拾う。
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

        msg_type = MESSAGE_TYPES[m.type]
        turn0 = self._gameinfo.turn

        sec = await msg_type.handler(self, m)
        if sec is None:
            # ハンドラが自分で送信済みか、盤面と合わないので捨てた
            return

        # 勝負がついたら、両方のクロックを止める (TODO-050)。
        # 処理の前から -1 のときは止めない (勝負がついたあとでも、
        # クロックを押せば再開できるように)。stop() は経過分を
        # 残り時間に反映してから止める
        if turn0 != -1 and self._gameinfo.turn == -1:
            self._clock.stop(0)
            self._clock.stop(1)

        # 履歴に積むかは表で決める (TODO-050、TODO-051)。
        # メッセージに history は無い
        if msg_type.history:
            self.add_history(self._gameinfo)

        # 受け取った msg をそのまま転送するのではなく、gameinfo に
        # 直前の操作を添えて返す (TODO-015)。クライアントは gameinfo で
        # 盤面を作り直し、音と dice の回転だけを last_op から出す。
        # チェッカーが動くときだけアニメーションの時間を渡す
        await self.emit_gameinfo(sec, last_op=m.raw)


@dataclass(frozen=True)
class MessageType:
    """
    登録表 (MESSAGE_TYPES) の 1 行 (TODO-050)。

    make_data: data を dataclass にする関数
    handler: 処理する関数。BackgammonServer のメソッドを、クラスから
        引いたまま持つ (呼ぶときに self を渡す)
    history: 履歴に積むか。ハンドラが自分で送信する type (戻り値が
        None) では見ないので False にしてある
    """

    make_data: Callable[[dict[str, Any]], Any]
    handler: Callable[[BackgammonServer, Message], Awaitable[float | None]]
    history: bool


_S = BackgammonServer

# type ごとの「data の型・ハンドラ・履歴に積むか」(TODO-050)。
# type を足すときに直すのはここだけ。
MESSAGE_TYPES: dict[str, MessageType] = {
    # 履歴の操作 (自分で送信するもの)
    'back': MessageType(HistStepData.from_dict, _S._on_back, False),
    'back2': MessageType(NoData.from_dict, _S._on_back2, False),
    'back_all': MessageType(NoData.from_dict, _S._on_back_all, False),
    'fwd': MessageType(HistStepData.from_dict, _S._on_fwd, False),
    'fwd2': MessageType(NoData.from_dict, _S._on_fwd2, False),
    'fwd_all': MessageType(NoData.from_dict, _S._on_fwd_all, False),
    'clear_hist': MessageType(NoData.from_dict, _S._on_clear_hist, False),
    'new': MessageType(NoData.from_dict, _S._on_new, False),
    # 名前付きの操作
    'roll': MessageType(DiceData.from_dict, _S._on_dice, True),
    'opening': MessageType(OpeningData.from_dict, _S._on_opening, True),
    'move': MessageType(MoveData.from_dict, _S._on_move, True),
    'end_turn': MessageType(PlayerData.from_dict, _S._on_end_turn, True),
    'double': MessageType(PlayerData.from_dict, _S._on_double, True),
    'take': MessageType(PlayerData.from_dict, _S._on_take, True),
    'cancel_double': MessageType(
        PlayerData.from_dict, _S._on_cancel_double, True),
    'resign': MessageType(ResignData.from_dict, _S._on_resign, True),
    # 盤面
    'put_checker': MessageType(
        PutCheckerData.from_dict, _S._on_put_checker, True),
    'dice': MessageType(DiceData.from_dict, _S._on_dice, True),
    'set_playername': MessageType(
        PlayerNameData.from_dict, _S._on_set_playername, True),
    'set_score': MessageType(ScoreData.from_dict, _S._on_set_score, True),
    # クロック。gameinfo を書き換えないので積まない (TODO-032)。
    # 積むと sn 以外すべて 1 つ前と同じエントリになる
    'set_clock_limit': MessageType(
        ClockLimitData.from_dict, _S._on_set_clock_limit, False),
    'set_clock_switch': MessageType(
        ClockSwitchData.from_dict, _S._on_set_clock_switch, False),
    'resume_clock': MessageType(
        PlayerData.from_dict, _S._on_resume_clock, False),
    'stop_clock': MessageType(
        PlayerData.from_dict, _S._on_stop_clock, False),
}


def parse(msg: dict[str, Any]) -> Message:
    """
    受け取った msg を Message にする (TODO-026)。

    type を見て、data の中身を type ごとの frozen dataclass に
    組み立てる。**キーが足りなければここで例外になる**ので、
    奥の msg['data']['n'] が KeyError を出すことがなくなる。

    Raises
    ------
    UnknownMessageType
        MESSAGE_TYPES に無い type。文字列でない type もこれで扱う
        (list / dict は dict のキーにできず、そのままでは
        TypeError になるため)
    KeyError
        'type' / 'data' か、data の中のキーが足りない
    TypeError
        data の値の型が dataclass の注釈と合わない (TODO-050)。
        盤面を書き換える前に弾く
    """
    msg_type = msg['type']

    if not isinstance(msg_type, str) or msg_type not in MESSAGE_TYPES:
        raise UnknownMessageType(msg_type)

    data = MESSAGE_TYPES[msg_type].make_data(msg['data'])
    if not _type_ok(type(data), data):
        raise TypeError(f'{msg_type}: bad data: {msg["data"]!a}')

    return Message(
        type=msg_type,
        data=data,
        raw=msg,
    )


def _type_ok(tp: Any, value: Any) -> bool:
    """
    value が注釈 tp に合うか (TODO-050)。

    dataclass はフィールドごとに、list[X] は中身ごとに見る。
    **bool は int のサブクラスなので、int と float に bool を通さず、
    bool に 0 / 1 を通さない** (isinstance だけでは区別できない)。
    float には int も通す。dict などは入れ物の型だけを見る。
    Optional や Any は扱わない (今の注釈に無いため)
    """
    if isinstance(tp, type) and is_dataclass(tp):
        hints = get_type_hints(tp)
        return isinstance(value, tp) and all(
            _type_ok(hints[f.name], getattr(value, f.name))
            for f in fields(tp))
    if get_origin(tp) is list:
        return isinstance(value, list) and all(
            _type_ok(get_args(tp)[0], v) for v in value)
    if isinstance(value, bool):
        return tp is bool
    if tp is float:
        return isinstance(value, (int, float))
    return isinstance(value, get_origin(tp) or tp)
##
