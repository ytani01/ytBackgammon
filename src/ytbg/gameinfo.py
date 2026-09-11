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

from .mylog import getLogger


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

    def cube(self, data: dict[str, Any]) -> None:
        """
        data = {'side': int, 'value': int, 'accepted': bool}
        """
        self.__log.debug('data={}', data)

        self.board.cube = CubeState.from_dict(data)

        self.__log.debug('board.cube={}', self.board.cube)

    def dice(self, data: dict[str, Any]) -> None:
        """
        data = {
            'player': player,
            'dice': [d1, d2, d3, d4]
        }
        """
        self.__log.debug('data={}', data)
        self.board.dice[data['player']] = list(data['dice'])

    def set_turn(self, data: dict[str, Any]) -> None:
        """
        data = {'turn': int, resign: int}
        """
        self.__log.debug('data={}', data)
        self.turn = data['turn']
        self.resign = data['resign']

    def set_playername(self, data: dict[str, Any]) -> None:
        """
        data = {'player': int, 'name': str}
        """
        self.__log.debug('data={}', data)
        self.board.playername[data['player']] = data['name']

    def set_score(self, data: dict[str, Any]) -> None:
        """
        data = {'player': int, 'score': int}
        """
        self.__log.debug('data={}', data)
        self.score[data['player']] = data['score']

    def resign_game(self, data: dict[str, Any]) -> None:
        """
        resign game

        resign という名前は dataclass のフィールドが使っているので、
        メソッド名は resign_game にしてある (TODO-025)。

        Parameters
        ----------
        data: {'player': int}
        """
        self.__log.debug('data={}', data)
        self.resign = data['player']
        self.__log.debug('resign={}', self.resign)

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
