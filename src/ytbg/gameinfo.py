#
# (c) 2020 Yoichi Tanibayashi
#
"""
gameinfo.py

盤面の状態そのもの (TODO-024)。

生の dict をやめて dataclass にした。put_checker() などが書き換えるので
frozen にはしない。

**クロック (旧 clock_limit と board.clock) はここには入れない。**
クロックは履歴の対象外なので、clock.py の Clock が持つ
(TODO-016、TODO-024)。
"""

import copy
from dataclasses import asdict, dataclass, field
from typing import Any

from .message import (
    CubeData,
    DiceData,
    MoveData,
    OpeningData,
    PlayerData,
    PlayerNameData,
    ResignData,
    ScoreData,
    TurnData,
)
from .mylog import getLogger

# キューブの値と得点の上限 (TODO-050)
CUBE_MAX = 64
SCORE_MAX = 99


def init_checker() -> list[list[list[int]]]:
    """
    初期配置の checker。

    checker[player][i] = [point, idx] で、ID は player * 100 + i
    (例: 012, 101)。
    """
    return [
        [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
         [8, 0], [8, 1], [8, 2],
         [13, 0], [13, 1], [13, 2], [13, 3], [13, 4],
         [24, 0], [24, 1]],
        [[19, 0], [19, 1], [19, 2], [19, 3], [19, 4],
         [17, 0], [17, 1], [17, 2],
         [12, 0], [12, 1], [12, 2], [12, 3], [12, 4],
         [1, 0], [1, 1]],
    ]


def init_dice() -> list[list[int]]:
    """初期状態の dice"""
    return [[0, 0, 0, 0], [0, 0, 0, 0]]


def _get(data: dict[str, Any], key: str, default: Any, strict: bool) -> Any:
    """
    strict なら、キーの欠落を KeyError にする。

    保存したファイルを読むときは、キーの欠落を「壊れたファイル」として
    扱いたい。黙って既定値にすると、綴りを間違えた履歴が初期配置の
    盤面として読まれてしまう (TODO-024)。
    """
    if strict:
        return data[key]
    return data.get(key, default)


@dataclass
class CubeState:
    """キューブ"""

    side: int = -1        # -1: center, 0|1: player
    value: int = 1
    accepted: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any],
                  strict: bool = False) -> CubeState:
        base = cls()
        return cls(
            side=_get(data, 'side', base.side, strict),
            value=_get(data, 'value', base.value, strict),
            accepted=_get(data, 'accepted', base.accepted, strict),
        )


@dataclass
class BoardState:
    """盤面。playername / cube / dice / checker"""

    playername: list[str] = field(default_factory=lambda: ['', ''])
    cube: CubeState = field(default_factory=CubeState)
    dice: list[list[int]] = field(default_factory=init_dice)
    checker: list[list[list[int]]] = field(default_factory=init_checker)

    @classmethod
    def from_dict(cls, data: dict[str, Any],
                  strict: bool = False) -> BoardState:
        """
        dict から作る。知らないキーは読み捨てる。

        strict なら、キーが欠けていると KeyError になる。
        """
        base = cls()
        return cls(
            playername=list(
                _get(data, 'playername', base.playername, strict)),
            cube=CubeState.from_dict(
                _get(data, 'cube', None, strict) or {}, strict),
            dice=copy.deepcopy(_get(data, 'dice', base.dice, strict)),
            checker=copy.deepcopy(_get(data, 'checker', base.checker,
                                       strict)),
        )


@dataclass
class GameInfo:
    """
    盤面の状態そのもの。履歴に積まれるのもこれ。

    turn は <=-1:操作不可、0|1:各プレーヤー、>=2:両方可。
    resign は <0:なし、0|1:プレーヤー。

    盤面を更新するメソッド (put_checker() など) もここが持つ
    (TODO-025)。
    """

    # 注釈を付けないので dataclass のフィールドにはならない
    __log = getLogger(__qualname__)

    sn: int = 0
    server_version: str = ''
    game_num: int = 0
    match_score: int = 0
    score: list[int] = field(default_factory=lambda: [0, 0])
    turn: int = 2
    resign: int = -1
    board: BoardState = field(default_factory=BoardState)

    def to_dict(self) -> dict[str, Any]:
        """JSON にできる dict にする"""
        return asdict(self)

    def new_game(self, server_version: str) -> None:
        """
        board を作り直し、turn と resign を戻す (TODO-024)。

        score / playername / game_num / match_score は残す。
        server_version は入れ直す (TODO-024 より前の new_game() が
        init_gameinfo() 経由でそうしていた。古いファイルから読んだ値が
        New Game のあとも残らないように)。省くと黙って '' に
        なってしまうので、既定値は持たせない (TODO-025)。
        クロックは gameinfo の外なので、ここでは触らない。
        """
        self.__log.debug('server_version={!a}', server_version)

        playername = list(self.board.playername)
        self.board = BoardState(playername=playername)
        self.turn = 2
        self.resign = -1
        self.server_version = server_version

    def put_checker(self, ch_id: int, p: int, idx: int) -> None:
        """
        Parameters
        ----------
        ch_id: int
            checker ID number (ex. 012, 101 ..)
        p: int
            point index
        idx: int
            position index
        """
        self.__log.debug('ch_id={}, p={}, idx={}', ch_id, p, idx)
        player = int(ch_id / 100)
        ch_i = ch_id % 100
        self.board.checker[player][ch_i] = [p, idx]
        self.__log.debug('board.checker[{}][{}]=[{},{}]',
                         player, ch_i, p, idx)

    def cube(self, data: CubeData) -> None:
        """キューブ (TODO-038 で dataclass 受け取りにした)"""
        self.__log.debug('data={}', data)

        self.board.cube = CubeState(side=data.side, value=data.value,
                                    accepted=data.accepted)

        self.__log.debug('board.cube={}', self.board.cube)

    def dice(self, data: DiceData) -> None:
        """指定したプレーヤーの目だけを変える"""
        self.__log.debug('data={}', data)
        self.board.dice[data.player] = list(data.dice)

    def set_turn(self, data: TurnData) -> None:
        """turn と resign"""
        self.__log.debug('data={}', data)
        self.turn = data.turn
        self.resign = data.resign

    def set_playername(self, data: PlayerNameData) -> None:
        """指定したプレーヤーの名前だけを変える"""
        self.__log.debug('data={}', data)
        self.board.playername[data.player] = data.name

    def set_score(self, data: ScoreData) -> None:
        """指定したプレーヤーの得点だけを変える"""
        self.__log.debug('data={}', data)
        self.score[data.player] = data.score

    def resign_game(self, data: ResignData) -> bool:
        """
        resign game。勝負をつけ、相手の得点に score を足す (TODO-050)。

        resign という名前は dataclass のフィールドが使っているので、
        メソッド名は resign_game にしてある (TODO-025)。

        turn が既に -1 なら何もせず False を返す (2 回届いても
        2 回ぶん足さない)
        """
        self.__log.debug('data={}', data)
        if self.turn == -1:
            return False
        self.turn = -1
        self.resign = data.player
        self._add_score(1 - data.player, data.score)
        self.__log.debug('resign={}', self.resign)
        return True

    def _add_score(self, player: int, score: int) -> None:
        """得点を足す。上限は SCORE_MAX"""
        self.score[player] = min(self.score[player] + score, SCORE_MAX)

    # ここから名前付きの操作 (TODO-050)。roll は dice() をそのまま使う。
    # クロックは gameinfo の外なので、切り替えは server.py が行う。
    #
    # 戻り値が bool のものは、今の盤面と合わないとき何もせず False を
    # 返す。ルールの判定はクライアントが行うので、ここで防ぐのは
    # 同じ操作がほぼ同時に 2 回届いたときの重複だけ

    def opening(self, data: OpeningData) -> bool:
        """
        オープニングロールの結果。

        勝者のダイスを [勝者の目, 0, 0, 敗者の目]、敗者のダイスを空にし、
        手番を勝者に渡す。同じ目 (winner が -1) なら両方を空にして
        turn を 2 に戻す。振った目は 4 つのうちランダムな位置に入って
        いるので、0 でない値を拾う。無ければ 0。

        turn が 2 以上 (オープニングの前) でなければ False
        """
        self.__log.debug('data={}', data)
        if self.turn < 2:
            return False
        if data.winner < 0:
            self.board.dice = init_dice()
            self.turn = 2
            return True

        winner = data.winner
        loser = 1 - winner
        [w, lo] = [next((d for d in self.board.dice[p] if d != 0), 0)
                   for p in (winner, loser)]
        self.board.dice[winner] = [w, 0, 0, lo]
        self.board.dice[loser] = [0, 0, 0, 0]
        self.turn = winner
        return True

    def move(self, data: MoveData) -> None:
        """
        駒を moves のとおりに置き、ダイスを入れ替える。

        score が 1 以上なら勝負がついたので、turn を -1 にして
        player の得点に足す。turn が既に -1 なら、駒とダイスは置くが
        得点も turn も変えない (2 回届いても 2 回ぶん足さない)
        """
        self.__log.debug('data={}', data)
        for mv in data.moves:
            self.put_checker(mv.ch, mv.p, mv.idx)
        self.board.dice[data.player] = list(data.dice)
        if data.score >= 1 and self.turn != -1:
            self.turn = -1
            self._add_score(data.player, data.score)

    def end_turn(self, data: PlayerData) -> bool:
        """
        自分のダイスを空にして、手番を相手に渡す。

        turn が player でなければ False
        """
        self.__log.debug('data={}', data)
        if self.turn != data.player:
            return False
        self.board.dice[data.player] = [0, 0, 0, 0]
        self.turn = 1 - data.player
        return True

    def double(self, data: PlayerData) -> bool:
        """
        キューブを倍にし (上限 CUBE_MAX)、相手側に未テイクで置く。

        受け付けるのは、テイク済みでキューブが中央か player の側のときと、
        未テイクでキューブが player の側 (掛けられた側がさらに倍にする
        リダブル) のときだけ。それ以外は False
        """
        self.__log.debug('data={}', data)
        cube = self.board.cube
        p = data.player
        if not (cube.side == p
                or (cube.accepted and cube.side == -1)):
            return False
        cube.value = min(cube.value * 2, CUBE_MAX)
        cube.side = 1 - p
        cube.accepted = False
        return True

    def take(self, data: PlayerData) -> bool:
        """
        テイク済みにする。

        未テイクでキューブが player の側のときだけ。それ以外は False
        """
        self.__log.debug('data={}', data)
        cube = self.board.cube
        if cube.accepted or cube.side != data.player:
            return False
        cube.accepted = True
        return True

    def cancel_double(self, data: PlayerData) -> bool:
        """
        ダブルを取り消す。値を半分に戻し、掛けた側にテイク済みで置く。
        1 に戻ったら中央。

        未テイクでキューブが相手 (1 - player) の側のときだけ。
        それ以外は False
        """
        self.__log.debug('data={}', data)
        cube = self.board.cube
        if cube.accepted or cube.side != 1 - data.player:
            return False
        cube.value = max(cube.value // 2, 1)
        cube.side = data.player if cube.value > 1 else -1
        cube.accepted = True
        return True

    def copy(self) -> GameInfo:
        """独立した複製を返す"""
        return copy.deepcopy(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any],
                  strict: bool = False) -> GameInfo:
        """
        dict から作る。

        **知らないキーは読み捨て、足りないキーは既定値になる。**

        strict なら、to_dict() が出すキーが 1 つでも欠けていると
        KeyError になる。保存したファイル (.jsonl) を読むときに使う。
        綴り違いを黙って既定値にすると、壊れた履歴が初期配置の盤面として
        読まれてしまうため (TODO-024)。

        **既定が strict=False なのは、クライアントから届く
        set_gameinfo のため** (TODO-031)。こちらは部分的な dict でも
        受ける (`tests/test_on_json.py` が見ている)。
        """
        base = cls()
        return cls(
            sn=_get(data, 'sn', base.sn, strict),
            server_version=_get(data, 'server_version',
                                base.server_version, strict),
            game_num=_get(data, 'game_num', base.game_num, strict),
            match_score=_get(data, 'match_score', base.match_score, strict),
            score=list(_get(data, 'score', base.score, strict)),
            turn=_get(data, 'turn', base.turn, strict),
            resign=_get(data, 'resign', base.resign, strict),
            board=BoardState.from_dict(
                _get(data, 'board', None, strict) or {}, strict),
        )
##
