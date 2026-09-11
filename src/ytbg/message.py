#
# (c) Yoichi Tanibayashi
#
"""
message.py

クライアントから届くメッセージの型付け (TODO-026)。

`parse()` が `type` を見て、`data` の中身を type ごとの frozen
dataclass に組み立てる。**キーが足りなければここで例外になる**ので、
奥の `msg['data']['n']` が `KeyError` を出すことがなくなる。

`type` → dataclass の登録表は `DATA_TYPES`。server.py が持つ
`type` → ハンドラの表と、**キーの集合が一致していること**
(tests/test_message.py が見ている)。
"""
__author__ = 'Yoichi Tanibayashi'
__date__ = '2026/09'

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


class UnknownMessageType(Exception):
    """登録表に無い type (TODO-026)"""

    def __init__(self, msg_type: Any) -> None:
        super().__init__(f'unknown message type: {msg_type!a}')
        self.msg_type = msg_type


@dataclass(frozen=True)
class NoData:
    """data が空の type 用"""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> NoData:
        return cls()


@dataclass(frozen=True)
class HistStepData:
    """back / fwd の手数"""

    n: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> HistStepData:
        return cls(n=data['n'])


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
class PutCheckerData:
    """put_checker。ch は checker の ID (player * 100 + i)"""

    ch: int
    p: int
    idx: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PutCheckerData:
        return cls(ch=data['ch'], p=data['p'], idx=data['idx'])


@dataclass(frozen=True)
class CubeData:
    """cube"""

    side: int
    value: int
    accepted: bool

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CubeData:
        return cls(side=data['side'], value=data['value'],
                   accepted=data['accepted'])


@dataclass(frozen=True)
class DiceData:
    """dice"""

    player: int
    dice: list[int]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DiceData:
        return cls(player=data['player'], dice=list(data['dice']))


@dataclass(frozen=True)
class TurnData:
    """set_turn"""

    turn: int
    resign: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TurnData:
        return cls(turn=data['turn'], resign=data['resign'])


@dataclass(frozen=True)
class PlayerNameData:
    """set_playername"""

    player: int
    name: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PlayerNameData:
        return cls(player=data['player'], name=data['name'])


@dataclass(frozen=True)
class ScoreData:
    """set_score"""

    player: int
    score: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ScoreData:
        return cls(player=data['player'], score=data['score'])


@dataclass(frozen=True)
class PlayerData:
    """
    プレーヤーを指すだけの type 用。

    resign と、クロックの start / resume / stop / reset。
    """

    player: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PlayerData:
        return cls(player=data['player'])


@dataclass(frozen=True)
class ClockLimitData:
    """set_clock_limit。index は 0:持ち時間、1:猶予"""

    index: int
    clock_limit: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ClockLimitData:
        return cls(index=data['index'],
                   clock_limit=data['clock_limit'])


@dataclass(frozen=True)
class PlayerClockData:
    """set_player_clock。clock は [持ち時間(秒), 猶予(秒)]"""

    player: int
    clock: list[float]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PlayerClockData:
        return cls(player=data['player'], clock=list(data['clock']))


@dataclass(frozen=True)
class ClockSwitchData:
    """set_clock_switch。クロック機能そのものの ON/OFF"""

    switch: bool

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ClockSwitchData:
        return cls(switch=data['switch'])


# type → data の dataclass。server.py のハンドラの表と
# キーの集合が一致すること (TODO-026)
DATA_TYPES: dict[str, Callable[[dict[str, Any]], Any]] = {
    # 履歴 (自分で送信するもの)
    'back': HistStepData.from_dict,
    'back2': NoData.from_dict,
    'back_all': NoData.from_dict,
    'fwd': HistStepData.from_dict,
    'fwd2': NoData.from_dict,
    'fwd_all': NoData.from_dict,
    'clear_hist': NoData.from_dict,
    'new': NoData.from_dict,
    'set_gameinfo': GameInfoData.from_dict,
    # 盤面
    'put_checker': PutCheckerData.from_dict,
    'cube': CubeData.from_dict,
    'dice': DiceData.from_dict,
    'set_turn': TurnData.from_dict,
    'set_playername': PlayerNameData.from_dict,
    'set_score': ScoreData.from_dict,
    'resign': PlayerData.from_dict,
    # クロック
    'set_clock_limit': ClockLimitData.from_dict,
    'set_player_clock': PlayerClockData.from_dict,
    'set_clock_switch': ClockSwitchData.from_dict,
    'start_clock': PlayerData.from_dict,
    'resume_clock': PlayerData.from_dict,
    'stop_clock': PlayerData.from_dict,
    'reset_clock': PlayerData.from_dict,
}


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


def parse(msg: dict[str, Any]) -> Message:
    """
    受け取った msg を Message にする。

    Raises
    ------
    UnknownMessageType
        DATA_TYPES に無い type。文字列でない type もこれで扱う
        (list / dict は dict のキーにできず、そのままでは
        TypeError になるため)
    KeyError
        'type' / 'data' / 'history' か、data の中のキーが足りない
    """
    msg_type = msg['type']

    if not isinstance(msg_type, str):
        raise UnknownMessageType(msg_type)

    make_data = DATA_TYPES.get(msg_type)
    if make_data is None:
        raise UnknownMessageType(msg_type)

    return Message(
        type=msg_type,
        data=make_data(msg['data']),
        history=bool(msg['history']),
        raw=msg,
    )
##
