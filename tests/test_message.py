#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_message.py

parse() のテスト (TODO-026)。

見ているのは 3 つ。
- type ごとに、data が型付きの dataclass になること
- data のキーが足りなければ parse() で例外になること
  (奥の msg['data']['n'] で KeyError にしない、が眼目)
- 登録表に無い type は UnknownMessageType になること

parse() と登録表 (MESSAGE_TYPES) は server.py にある (TODO-050)。
"""
import dataclasses

import pytest

from ytbg.message import (
    ClockLimitData,
    ClockSwitchData,
    CubeData,
    DiceData,
    GameInfoData,
    HistStepData,
    MoveData,
    NoData,
    OpeningData,
    PlayerClockData,
    PlayerData,
    PlayerNameData,
    PutCheckerData,
    ResignData,
    ScoreData,
    TurnData,
    UnknownMessageType,
)
from ytbg.server import MESSAGE_TYPES, parse


def make_msg(msg_type, data, history=False):
    """クライアントが送る形の msg"""
    return {'src': 'client', 'type': msg_type,
            'data': data, 'history': history}


# type ごとの (data, 期待する dataclass)
SAMPLES = [
    ('back', {'n': 2}, HistStepData(n=2)),
    ('back2', {}, NoData()),
    ('back_all', {}, NoData()),
    ('fwd', {'n': 3}, HistStepData(n=3)),
    ('fwd2', {}, NoData()),
    ('fwd_all', {}, NoData()),
    ('clear_hist', {}, NoData()),
    ('new', {}, NoData()),
    ('set_gameinfo', {'sn': 5}, GameInfoData(gameinfo={'sn': 5})),
    ('put_checker', {'ch': 101, 'p': 5, 'idx': 2},
     PutCheckerData(ch=101, p=5, idx=2)),
    ('cube', {'side': 1, 'value': 4, 'accepted': False},
     CubeData(side=1, value=4, accepted=False)),
    ('dice', {'player': 1, 'dice': [3, 4, 0, 0]},
     DiceData(player=1, dice=[3, 4, 0, 0])),
    ('set_turn', {'turn': 1, 'resign': 0},
     TurnData(turn=1, resign=0)),
    ('set_playername', {'player': 1, 'name': 'Alice'},
     PlayerNameData(player=1, name='Alice')),
    ('set_score', {'player': 1, 'score': 5},
     ScoreData(player=1, score=5)),
    ('resign', {'player': 1, 'score': 2},
     ResignData(player=1, score=2)),
    ('roll', {'player': 0, 'dice': [3, 5, 0, 0]},
     DiceData(player=0, dice=[3, 5, 0, 0])),
    ('opening', {'winner': -1}, OpeningData(winner=-1)),
    ('move', {'player': 1,
              'moves': [{'ch': 101, 'p': 5, 'idx': 0},
                        {'ch': 3, 'p': 26, 'idx': 0}],
              'dice': [13, 0, 0, 0], 'score': 0},
     MoveData(player=1,
              moves=[PutCheckerData(ch=101, p=5, idx=0),
                     PutCheckerData(ch=3, p=26, idx=0)],
              dice=[13, 0, 0, 0], score=0)),
    ('end_turn', {'player': 1}, PlayerData(player=1)),
    ('double', {'player': 0}, PlayerData(player=0)),
    ('take', {'player': 1}, PlayerData(player=1)),
    ('cancel_double', {'player': 0}, PlayerData(player=0)),
    ('set_clock_limit', {'index': 1, 'clock_limit': 60},
     ClockLimitData(index=1, clock_limit=60)),
    ('set_player_clock', {'player': 1, 'clock': [90, 5]},
     PlayerClockData(player=1, clock=[90, 5])),
    ('set_clock_switch', {'switch': False},
     ClockSwitchData(switch=False)),
    ('start_clock', {'player': 1}, PlayerData(player=1)),
    ('resume_clock', {'player': 0}, PlayerData(player=0)),
    ('stop_clock', {'player': 1}, PlayerData(player=1)),
]


@pytest.mark.parametrize(('msg_type', 'data', 'expected'), SAMPLES)
def test_parse_makes_typed_data(msg_type, data, expected):
    """type ごとに、data が型付きの dataclass になる"""
    m = parse(make_msg(msg_type, data))

    assert m.type == msg_type
    assert m.data == expected
    assert type(m.data) is type(expected)


def test_samples_cover_all_types():
    """
    上の SAMPLES が全 type を網羅していること。

    これが無いと、登録表に足しただけで parse() のテストが素通りする。
    """
    assert {s[0] for s in SAMPLES} == set(MESSAGE_TYPES)


def test_parse_keeps_history_and_raw():
    """history と、last_op に使う raw (受け取った msg そのまま)"""
    msg = make_msg('new', {}, history=True)
    m = parse(msg)

    assert m.history is True
    assert m.raw is msg


def test_parse_data_is_frozen():
    """data は frozen (受け取ったあとに書き換えられない)"""
    m = parse(make_msg('back', {'n': 1}))

    with pytest.raises(dataclasses.FrozenInstanceError):
        m.data.n = 2


@pytest.mark.parametrize(
    ('msg_type', 'data', 'missing'),
    [
        ('back', {}, 'n'),
        ('fwd', {}, 'n'),
        ('put_checker', {'p': 5, 'idx': 2}, 'ch'),
        ('put_checker', {'ch': 101, 'idx': 2}, 'p'),
        ('put_checker', {'ch': 101, 'p': 5}, 'idx'),
        ('cube', {'side': 1, 'value': 4}, 'accepted'),
        ('dice', {'player': 1}, 'dice'),
        ('set_turn', {'turn': 1}, 'resign'),
        ('set_playername', {'player': 1}, 'name'),
        ('set_score', {'player': 1}, 'score'),
        ('resign', {'player': 1}, 'score'),
        ('opening', {}, 'winner'),
        ('move', {'player': 0, 'moves': [], 'dice': [0, 0, 0, 0]},
         'score'),
        ('move', {'player': 0, 'moves': [{'ch': 1, 'p': 5}],
                  'dice': [0, 0, 0, 0], 'score': 0}, 'idx'),
        ('end_turn', {}, 'player'),
        ('set_clock_limit', {'index': 1}, 'clock_limit'),
        ('set_player_clock', {'player': 1}, 'clock'),
        ('set_clock_switch', {}, 'switch'),
        ('start_clock', {}, 'player'),
    ],
)
def test_parse_raises_on_missing_key(msg_type, data, missing):
    """data のキーが足りなければ parse() の中で KeyError になる"""
    with pytest.raises(KeyError) as e:
        parse(make_msg(msg_type, data))

    assert e.value.args[0] == missing


@pytest.mark.parametrize('key', ['type', 'data', 'history'])
def test_parse_raises_on_missing_msg_key(key):
    """msg そのもののキーが足りないときも KeyError"""
    msg = make_msg('put_checker', {'ch': 101, 'p': 5, 'idx': 2})
    del msg[key]

    with pytest.raises(KeyError):
        parse(msg)


def test_parse_raises_on_unknown_type():
    """登録表に無い type は UnknownMessageType"""
    with pytest.raises(UnknownMessageType) as e:
        parse(make_msg('no_such_type', {}))

    assert e.value.msg_type == 'no_such_type'


@pytest.mark.parametrize('msg_type', [
    ['back'], {'type': 'back'}, 1, None, True,
])
def test_parse_raises_on_non_str_type(msg_type):
    """
    文字列でない type も UnknownMessageType (TODO-026)。

    list / dict は dict のキーにできないので、素直に
    MESSAGE_TYPES を引くと TypeError になる。
    """
    with pytest.raises(UnknownMessageType) as e:
        parse(make_msg(msg_type, {}))

    assert e.value.msg_type == msg_type


def test_parse_ignores_extra_data_keys():
    """余分なキーは読み捨てる (クライアントが古くても落ちない)"""
    m = parse(make_msg('resign', {'player': 1, 'score': 1, 'extra': 'x'}))

    assert m.data == ResignData(player=1, score=1)


# ---------------------------------------------------------------------
# data の値の型 (TODO-050)
# ---------------------------------------------------------------------

@pytest.mark.parametrize(('msg_type', 'data'), [
    # int に文字列
    ('take', {'player': '1'}),
    ('put_checker', {'ch': 1, 'p': '5', 'idx': 0}),
    # int に bool (bool は int のサブクラス)
    ('double', {'player': True}),
    ('set_score', {'player': 0, 'score': False}),
    # int に float
    ('put_checker', {'ch': 1, 'p': 5.0, 'idx': 0}),
    # bool に 0 / 1
    ('set_clock_switch', {'switch': 1}),
    # list でない
    ('roll', {'player': 0, 'dice': 5}),
    ('roll', {'player': 0, 'dice': '1234'}),
    ('roll', {'player': 0, 'dice': ''}),
    ('move', {'player': 0, 'moves': '', 'dice': [0, 0, 0, 0], 'score': 0}),
    ('move', {'player': 0, 'moves': {}, 'dice': [0, 0, 0, 0], 'score': 0}),
    # list の中身
    ('roll', {'player': 0, 'dice': [1, '2', 0, 0]}),
    ('roll', {'player': 0, 'dice': [1, True, 0, 0]}),
    ('move', {'player': 0, 'moves': [{'ch': '0', 'p': 5, 'idx': 0}],
              'dice': [0, 0, 0, 0], 'score': 0}),
    ('set_player_clock', {'player': 0, 'clock': [90, 'x']}),
    # float に bool
    ('set_clock_limit', {'index': 0, 'clock_limit': True}),
    # str に数
    ('set_playername', {'player': 0, 'name': 1}),
])
def test_parse_raises_on_bad_value_type(msg_type, data):
    """data の値の型が注釈と合わなければ TypeError"""
    with pytest.raises(TypeError):
        parse(make_msg(msg_type, data))


@pytest.mark.parametrize('limit', [90, 90.5])
def test_parse_clock_limit_accepts_int_and_float(limit):
    """clock_limit は parseFloat の値を送るので、int も float も受ける"""
    m = parse(make_msg('set_clock_limit', {'index': 0, 'clock_limit': limit}))

    assert m.data == ClockLimitData(index=0, clock_limit=limit)
