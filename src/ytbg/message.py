#
# (c) 2020 Yoichi Tanibayashi
#
"""
message.py

クライアントから届くメッセージの型付け (TODO-026)。

ここにあるのは data の型 (type ごとの frozen dataclass) と例外だけ。
type ごとに「data の型・ハンドラ・履歴に積むか」を持つ登録表と、
それを引く `parse()` は server.py にある (TODO-050)。
"""

from dataclasses import dataclass, fields
from typing import Any, cast


class UnknownMessageType(Exception):
    """登録表に無い type (TODO-026)"""

    def __init__(self, msg_type: Any) -> None:
        super().__init__(f'unknown message type: {msg_type!a}')
        self.msg_type = msg_type


class _FromDict:
    """
    data のキーを、同じ名前のフィールドへそのまま写す from_dict (TODO-047)。

    **dataclass にしない。** fields(cls) はサブクラスに対して呼べばよく、
    基底を dataclass にすると継承の規則を気にすることになる。
    キーが足りなければ KeyError になる (parse() の約束どおり)。
    """

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Any:
        # 型の上では dataclass か分からないので cast する
        # (呼ばれるのは dataclass のサブクラスだけ)
        return cls(**{f.name: data[f.name]
                      for f in fields(cast(Any, cls))})


@dataclass(frozen=True)
class NoData(_FromDict):
    """data が空の type 用"""

@dataclass(frozen=True)
class HistStepData(_FromDict):
    """back / fwd の手数"""

    n: int

@dataclass(frozen=True)
class GameInfoData:
    """
    set_gameinfo。data は gameinfo の dict そのもの。

    GameInfo.from_dict() が足りないキーを既定値で補うので、ここでは
    中身を見ない (TODO-024 と同じ扱い)。
    """

    gameinfo: dict[str, Any]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GameInfoData:
        return cls(gameinfo=data)


@dataclass(frozen=True)
class PutCheckerData(_FromDict):
    """put_checker。ch は checker の ID (player * 100 + i)"""

    ch: int
    p: int
    idx: int

@dataclass(frozen=True)
class CubeData(_FromDict):
    """cube"""

    side: int
    value: int
    accepted: bool

@dataclass(frozen=True)
class DiceData(_FromDict):
    """
    dice と roll (TODO-050)。

    dice は届いた list をそのまま持つ。list() で写すと、文字列や dict も
    list になってしまい、server.py の型の確かめで弾けない。
    書き換える側 (GameInfo) が写す
    """

    player: int
    dice: list[int]

@dataclass(frozen=True)
class TurnData(_FromDict):
    """set_turn"""

    turn: int
    resign: int

@dataclass(frozen=True)
class PlayerNameData(_FromDict):
    """set_playername"""

    player: int
    name: str

@dataclass(frozen=True)
class ScoreData(_FromDict):
    """set_score"""

    player: int
    score: int

@dataclass(frozen=True)
class PlayerData(_FromDict):
    """
    プレーヤーを指すだけの type 用。

    end_turn / double / take / cancel_double と、
    クロックの start / resume / stop。
    """

    player: int

@dataclass(frozen=True)
class ResignData(_FromDict):
    """resign。score は相手の得点に足す点数 (TODO-050)"""

    player: int
    score: int

@dataclass(frozen=True)
class OpeningData(_FromDict):
    """opening。winner は先手のプレーヤー。同じ目なら -1 (TODO-050)"""

    winner: int

@dataclass(frozen=True)
class MoveData:
    """
    move (TODO-050)。

    moves は put_checker と同じ {ch, p, idx} の列。dice は動かしたあとの
    そのプレーヤーのダイス。score が 1 以上なら勝負がついた。
    """

    player: int
    moves: list[PutCheckerData]
    dice: list[int]
    score: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MoveData:
        # list でない moves はそのまま入れ、server.py の型の確かめで弾く
        moves = data['moves']
        if isinstance(moves, list):
            moves = [PutCheckerData.from_dict(mv) for mv in moves]
        return cls(player=data['player'], moves=moves, dice=data['dice'],
                   score=data['score'])


@dataclass(frozen=True)
class ClockLimitData(_FromDict):
    """set_clock_limit。index は 0:持ち時間、1:猶予"""

    index: int
    # 入力欄の値を parseFloat して送るので、小数も受ける (TODO-050)
    clock_limit: float

@dataclass(frozen=True)
class PlayerClockData(_FromDict):
    """
    set_player_clock。clock は [持ち時間(秒), 猶予(秒)]。
    DiceData と同じ理由で、届いた list をそのまま持つ
    """

    player: int
    clock: list[float]

@dataclass(frozen=True)
class ClockSwitchData(_FromDict):
    """set_clock_switch。クロック機能そのものの ON/OFF"""

    switch: bool


@dataclass(frozen=True)
class Message:
    """
    クライアントから届いた 1 通。

    data は type ごとの dataclass。注釈が Any なのは、type ごとに
    別のクラスになるため。ハンドラの側で
    `data: PutCheckerData = m.data` と受け直せば、そこから先は
    mypy が見てくれる。

    raw は受け取った msg そのままで、last_op として返すのに要る
    (TODO-015)。
    """

    type: str
    data: Any
    history: bool
    raw: dict[str, Any]
##
