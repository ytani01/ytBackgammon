#
# (c) Yoichi Tanibayashi
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
__author__ = 'Yoichi Tanibayashi'
__date__ = '2026/09'

import copy
from dataclasses import asdict, dataclass, field
from typing import Any


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
        dict から作る。旧形式の board.clock は読み捨てる (TODO-024)。

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
    """

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

    def copy(self) -> GameInfo:
        """独立した複製を返す"""
        return copy.deepcopy(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any],
                  strict: bool = False) -> GameInfo:
        """
        dict から作る。

        **知らないキーは読み捨てる。** 旧形式 (TODO-024 より前) の
        clock_limit と board.clock は、これで落ちる。
        足りないキーは既定値になる。

        strict なら、to_dict() が出すキーが 1 つでも欠けていると
        KeyError になる。保存したファイル (.jsonl) を読むときに使う。
        綴り違いを黙って既定値にすると、壊れた履歴が初期配置の盤面として
        読まれてしまうため (TODO-024)。旧形式 (.json) は、余分なキーを
        読み捨てる必要があるので緩いまま。
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
