#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_named_ops.py

名前付きの 8 つの操作 (roll / opening / move / end_turn / double /
take / cancel_double / resign) と、登録表 (MESSAGE_TYPES) で決める
履歴、勝負がついたときのクロックのテスト (TODO-050)。
"""
import copy
import time

import pytest

from ytbg.gameinfo import CubeState
from ytbg.server import MESSAGE_TYPES


@pytest.fixture
def fake_time(monkeypatch):
    """time.monotonic() を差し替える (tests/test_clock.py と同じ)"""
    class FakeTime:
        def __init__(self):
            self.now = 1000.0

        def monotonic(self):
            return self.now

        def advance(self, sec):
            self.now += sec

    fake = FakeTime()
    monkeypatch.setattr(time, 'monotonic', fake.monotonic)
    return fake


async def send(bg_server, req, msg_type, data):
    await bg_server.on_json(req, {'type': msg_type, 'data': data})


# ---------------------------------------------------------------------
# 盤面
# ---------------------------------------------------------------------

async def test_roll_sets_dice_of_player(bg_server, req, emitted):
    """roll はそのプレーヤーのダイスを入れ、last_op を添えて返す"""
    await send(bg_server, req, 'roll', {'player': 1, 'dice': [3, 13, 0, 0]})

    assert bg_server._gameinfo.board.dice == [[0, 0, 0, 0], [3, 13, 0, 0]]
    assert emitted.last['data']['last_op']['type'] == 'roll'
    assert emitted.last['data']['sec'] == 0


async def test_opening_puts_winner_dice_first(fake_time, bg_server, req):
    """
    opening は勝者のダイスを [勝者の目, 0, 0, 敗者の目] にし、
    敗者を空にして手番を勝者へ。目は位置を決め打ちせず拾う。
    クロックは動かさない
    """
    bg_server._gameinfo.board.dice = [[0, 0, 4, 0], [0, 6, 0, 0]]

    await send(bg_server, req, 'opening', {'winner': 1})

    assert bg_server._gameinfo.board.dice == [[0, 0, 0, 0], [6, 0, 0, 4]]
    assert bg_server._gameinfo.turn == 1
    assert bg_server._clock.active == [False, False]


async def test_opening_winner_0(bg_server, req):
    """勝者が 0 のときも [勝者の目, 0, 0, 敗者の目]"""
    bg_server._gameinfo.board.dice = [[0, 5, 0, 0], [0, 0, 0, 2]]

    await send(bg_server, req, 'opening', {'winner': 0})

    assert bg_server._gameinfo.board.dice == [[5, 0, 0, 2], [0, 0, 0, 0]]
    assert bg_server._gameinfo.turn == 0


async def test_opening_without_dice_uses_zero(bg_server, req):
    """ダイスが置かれていなくても手番は決まり、目は 0 になる"""
    await send(bg_server, req, 'opening', {'winner': 0})

    assert bg_server._gameinfo.board.dice == [[0, 0, 0, 0], [0, 0, 0, 0]]
    assert bg_server._gameinfo.turn == 0


async def test_opening_draw_clears_dice_and_turn_2(bg_server, req):
    """同じ目 (winner -1) なら両方を空にして turn を 2 に戻す"""
    bg_server._gameinfo.board.dice = [[3, 0, 0, 0], [0, 0, 3, 0]]

    await send(bg_server, req, 'opening', {'winner': -1})

    assert bg_server._gameinfo.board.dice == [[0, 0, 0, 0], [0, 0, 0, 0]]
    assert bg_server._gameinfo.turn == 2


async def test_move_puts_checkers_and_dice(bg_server, req, emitted):
    """move は moves のとおりに置き、ダイスを入れ替える。勝負はつかない"""
    bg_server._gameinfo.turn = 1
    await send(bg_server, req, 'move', {
        'player': 1,
        'moves': [{'ch': 5, 'p': 27, 'idx': 0},
                  {'ch': 113, 'p': 5, 'idx': 0}],
        'dice': [0, 14, 0, 0], 'score': 0})

    gameinfo = bg_server._gameinfo
    assert gameinfo.board.checker[0][5] == [27, 0]
    assert gameinfo.board.checker[1][13] == [5, 0]
    assert gameinfo.board.dice[1] == [0, 14, 0, 0]
    assert gameinfo.turn == 1
    assert gameinfo.score == [0, 0]
    assert emitted.last['data']['sec'] == 0.2


async def test_move_with_score_ends_game(bg_server, req):
    """score が 1 以上なら turn を -1 にし、player の得点に足す"""
    bg_server._gameinfo.turn = 0
    bg_server._gameinfo.score = [3, 1]

    await send(bg_server, req, 'move', {
        'player': 0, 'moves': [{'ch': 0, 'p': 0, 'idx': 0}],
        'dice': [0, 0, 0, 0], 'score': 2})

    assert bg_server._gameinfo.turn == -1
    assert bg_server._gameinfo.score == [5, 1]


async def test_move_score_is_capped_at_99(bg_server, req):
    """得点の上限は 99"""
    bg_server._gameinfo.score = [0, 98]

    await send(bg_server, req, 'move', {
        'player': 1, 'moves': [], 'dice': [0, 0, 0, 0], 'score': 3})

    assert bg_server._gameinfo.score == [0, 99]


async def test_end_turn_passes_turn_and_switches_clock(
        fake_time, bg_server, req):
    """
    end_turn は自分のダイスを空にして手番を渡す。自分のクロックを
    経過分を反映して止め、相手のクロックを猶予を戻して動かす
    """
    g = bg_server._gameinfo
    g.turn = 0
    g.board.dice = [[3, 5, 0, 0], [0, 0, 0, 0]]
    bg_server._clock.clock[1] = [120, 2]
    bg_server._clock.start(0)
    fake_time.advance(5)

    await send(bg_server, req, 'end_turn', {'player': 0})

    assert g.board.dice == [[0, 0, 0, 0], [0, 0, 0, 0]]
    assert g.turn == 1
    assert bg_server._clock.active == [False, True]
    assert bg_server._clock.clock[0] == [120, 7]
    assert bg_server._clock.cur(1) == [120, 12]


def cube(side, value, accepted):
    return CubeState(side=side, value=value, accepted=accepted)


# double / take / cancel_double の (turn, キューブ, player, 送ったあとの
# キューブ, 止まる側)。いずれも turn は 0 (player 0 の手番)。
#
# 通常の場面とビーバーの場面 (player 1 が掛けられたキューブをさらに倍に
# した。player が逆になる) の 2 通りで、止める側を player から決めて
# いるか、turn から決めているかを取り違えると、どちらかで落ちる
CUBE_CASES = {
    'double': [
        # player 0 が中央のキューブで掛ける。player 0 が止まる
        pytest.param(0, cube(-1, 1, True), 0, cube(1, 2, False), 0,
                     id='normal'),
        # 掛けられた player 1 がビーバー。player 1 が止まる
        pytest.param(0, cube(1, 2, False), 1, cube(0, 4, False), 1,
                     id='beaver'),
    ],
    'take': [
        # player 0 のダブルを player 1 がテイク。手番の player 0 が動く
        pytest.param(0, cube(1, 2, False), 1, cube(1, 2, True), 1,
                     id='normal'),
        # player 1 のビーバーを player 0 がテイク。手番の player 0 が動く
        pytest.param(0, cube(0, 4, False), 0, cube(0, 4, True), 1,
                     id='beaver'),
    ],
    'cancel_double': [
        # player 0 がダブルを取り消す。手番の player 0 が動く
        pytest.param(0, cube(1, 4, False), 0, cube(0, 2, True), 1,
                     id='normal'),
        # player 1 がビーバーを取り消す。手番の player 0 が動く
        pytest.param(0, cube(0, 4, False), 1, cube(1, 2, True), 1,
                     id='beaver'),
    ],
}


def cube_params(msg_type):
    return pytest.mark.parametrize(
        ('turn', 'cube0', 'player', 'cube1', 'stopped'),
        CUBE_CASES[msg_type])


async def check_cube_op(fake_time, bg_server, req, msg_type,
                        turn, cube0, player, cube1, stopped):
    """
    キューブを変え、stopped のクロックを経過分を反映して止め、
    もう片方を猶予を戻して動かすこと
    """
    g = bg_server._gameinfo
    g.turn = turn
    g.board.cube = copy.deepcopy(cube0)
    bg_server._clock.clock[1 - stopped] = [120, 2]
    bg_server._clock.start(stopped)
    fake_time.advance(4)

    await send(bg_server, req, msg_type, {'player': player})

    assert g.board.cube == cube1
    active = [False, False]
    active[1 - stopped] = True
    assert bg_server._clock.active == active
    assert bg_server._clock.clock[stopped] == [120, 8]
    assert bg_server._clock.cur(1 - stopped) == [120, 12]


@cube_params('double')
async def test_double(fake_time, bg_server, req,
                      turn, cube0, player, cube1, stopped):
    """double は倍にして相手側に未テイクで置き、掛けた側のクロックを止める"""
    await check_cube_op(fake_time, bg_server, req, 'double',
                        turn, cube0, player, cube1, stopped)


@cube_params('take')
async def test_take(fake_time, bg_server, req,
                    turn, cube0, player, cube1, stopped):
    """take はテイク済みにし、1 - turn を止めて手番のクロックを動かす"""
    await check_cube_op(fake_time, bg_server, req, 'take',
                        turn, cube0, player, cube1, stopped)


@cube_params('cancel_double')
async def test_cancel_double(fake_time, bg_server, req,
                             turn, cube0, player, cube1, stopped):
    """
    cancel_double は値を半分にし、掛けた側にテイク済みで置く。
    1 - turn を止めて手番のクロックを動かす
    """
    await check_cube_op(fake_time, bg_server, req, 'cancel_double',
                        turn, cube0, player, cube1, stopped)


async def test_double_is_capped_at_64(bg_server, req):
    """キューブの上限は 64"""
    bg_server._gameinfo.turn = 0
    bg_server._gameinfo.board.cube = cube(0, 64, True)

    await send(bg_server, req, 'double', {'player': 0})

    assert bg_server._gameinfo.board.cube == cube(1, 64, False)


async def test_cancel_double_to_1_goes_center(bg_server, req):
    """1 に戻ったら中央 (side -1)"""
    bg_server._gameinfo.turn = 0
    bg_server._gameinfo.board.cube = cube(1, 2, False)

    await send(bg_server, req, 'cancel_double', {'player': 0})

    assert bg_server._gameinfo.board.cube == cube(-1, 1, True)


@pytest.mark.parametrize('turn', [2, -1])
async def test_take_outside_turn_does_not_touch_clock(
        fake_time, bg_server, req, turn):
    """turn が 0 / 1 でなければクロックを切り替えない (キューブは変える)"""
    bg_server._gameinfo.turn = turn
    bg_server._gameinfo.board.cube = cube(0, 2, False)
    bg_server._clock.start(1)

    await send(bg_server, req, 'take', {'player': 0})

    assert bg_server._gameinfo.board.cube == cube(0, 2, True)
    assert bg_server._clock.active == [False, True]


async def test_resign_ends_game_and_adds_score(fake_time, bg_server, req):
    """resign は turn -1、resign を player にし、相手の得点に足す (上限 99)"""
    g = bg_server._gameinfo
    g.turn = 1
    g.score = [97, 0]

    await send(bg_server, req, 'resign', {'player': 1, 'score': 3})

    assert g.turn == -1
    assert g.resign == 1
    assert g.score == [99, 0]


# ---------------------------------------------------------------------
# 勝負がついたときのクロック
# ---------------------------------------------------------------------

@pytest.mark.parametrize(('msg_type', 'data'), [
    ('resign', {'player': 0, 'score': 1}),
    ('move', {'player': 0, 'moves': [], 'dice': [0, 0, 0, 0], 'score': 1}),
])
async def test_turn_to_minus1_stops_both_clocks(
        fake_time, bg_server, req, emitted, msg_type, data):
    """turn が -1 に変わったら、経過分を反映して両方のクロックを止める"""
    bg_server._gameinfo.turn = 0
    bg_server._clock.start(0)
    bg_server._clock.start(1)
    fake_time.advance(5)

    await send(bg_server, req, msg_type, data)

    assert bg_server._clock.active == [False, False]
    assert bg_server._clock.clock == [[120, 7], [120, 7]]
    assert emitted.last['data']['clock_state']['active'] == [False, False]


async def test_turn_already_minus1_does_not_stop_clock(
        fake_time, bg_server, req):
    """処理の前から -1 なら止めない (勝負がついたあとも再開できる)"""
    bg_server._gameinfo.turn = -1
    bg_server._clock.start(0)

    # 勝負がついたあとの move は捨てずに処理する (turn は -1 のまま)
    await send(bg_server, req, 'move',
               {'player': 0, 'moves': [], 'dice': [0, 0, 0, 0], 'score': 1})
    await send(bg_server, req, 'set_score', {'player': 0, 'score': 1})

    assert bg_server._clock.active == [True, False]


async def test_set_clock_switch_stops_both_clocks(
        fake_time, bg_server, req):
    """set_clock_switch は経過分を反映して両方のクロックを止める"""
    bg_server._clock.start(0)
    bg_server._clock.start(1)
    fake_time.advance(5)

    await send(bg_server, req, 'set_clock_switch', {'switch': True})

    assert bg_server._clock.active == [False, False]
    assert bg_server._clock.clock == [[120, 7], [120, 7]]


# ---------------------------------------------------------------------
# 履歴に積むかどうか
# ---------------------------------------------------------------------

# 名前付きの操作ごとの (data, turn, キューブ)。どれも盤面が変わり、
# 捨てられない状態にしてある
NAMED = {
    'roll': ({'player': 0, 'dice': [1, 2, 0, 0]}, 2, cube(-1, 1, True)),
    'opening': ({'winner': 0}, 2, cube(-1, 1, True)),
    'move': ({'player': 0, 'moves': [{'ch': 0, 'p': 5, 'idx': 0}],
              'dice': [0, 0, 0, 0], 'score': 0}, 0, cube(-1, 1, True)),
    'end_turn': ({'player': 0}, 0, cube(-1, 1, True)),
    'double': ({'player': 0}, 0, cube(-1, 1, True)),
    'take': ({'player': 1}, 0, cube(1, 2, False)),
    'cancel_double': ({'player': 0}, 0, cube(1, 2, False)),
    'resign': ({'player': 0, 'score': 1}, 0, cube(-1, 1, True)),
}


def test_table_history_values():
    """表の history は docs/design.md の「履歴に積むかどうか」の値"""
    stacked = {t for t, e in MESSAGE_TYPES.items() if e.history}

    assert stacked == set(NAMED) | {
        'put_checker', 'dice', 'set_playername', 'set_score'}


@pytest.mark.parametrize('msg_type', list(NAMED))
async def test_named_ops_append_history(bg_server, req, msg_type):
    """名前付きの操作は 1 通で 1 手積む"""
    data, turn, cube0 = NAMED[msg_type]
    bg_server._gameinfo.turn = turn
    bg_server._gameinfo.board.cube = copy.deepcopy(cube0)
    bg_server._gameinfo.game_num += 1
    bg_server.add_history(bg_server._gameinfo)
    hist_len0 = len(bg_server._hist.entries)

    await send(bg_server, req, msg_type, data)

    assert len(bg_server._hist.entries) == hist_len0 + 1


@pytest.mark.parametrize(('msg_type', 'data'), [
    ('stop_clock', {'player': 0}),
    ('set_clock_switch', {'switch': True}),
])
async def test_table_false_types_do_not_append(
        bg_server, req, monkeypatch, msg_type, data):
    """表で積まない type は add_history() を呼ばない"""
    called = []
    monkeypatch.setattr(bg_server, 'add_history', called.append)

    await send(bg_server, req, msg_type, data)

    assert called == []


# ---------------------------------------------------------------------
# 盤面と合わない操作を捨てる (同じ操作が 2 回届いたとき)
# ---------------------------------------------------------------------

async def assert_second_is_ignored(bg_server, req, emitted, msg_type, data):
    """1 回目は効き、2 回目は盤面も履歴も変わらず、何も送らない"""
    before = bg_server._gameinfo.copy()
    await send(bg_server, req, msg_type, data)
    assert bg_server._gameinfo != before, '1 回目が効いていない'

    after1 = bg_server._gameinfo.copy()
    hist_len = len(bg_server._hist.entries)
    active = list(bg_server._clock.active)
    emitted.clear()

    await send(bg_server, req, msg_type, data)

    assert bg_server._gameinfo == after1
    assert len(bg_server._hist.entries) == hist_len
    assert bg_server._clock.active == active
    assert emitted.messages == []


@pytest.mark.parametrize('msg_type', [
    'opening', 'end_turn', 'double', 'take', 'cancel_double', 'resign'])
async def test_named_op_twice(bg_server, req, emitted, msg_type):
    """
    同じ操作を 2 回送ると、2 回目は捨てる。roll は値そのものを入れるので
    条件を付けていない。move は下の別のテスト
    """
    data, turn, cube0 = NAMED[msg_type]
    bg_server._gameinfo.turn = turn
    bg_server._gameinfo.board.cube = copy.deepcopy(cube0)

    await assert_second_is_ignored(bg_server, req, emitted, msg_type, data)


async def test_move_twice_sends_but_does_not_add_score(
        bg_server, req, emitted):
    """
    turn が既に -1 の move は、駒とダイスは置くが得点も turn も
    変えない。盤面を送るのは今までどおり
    """
    bg_server._gameinfo.turn = -1
    bg_server._gameinfo.score = [3, 0]

    await send(bg_server, req, 'move', {
        'player': 0, 'moves': [{'ch': 0, 'p': 0, 'idx': 0}],
        'dice': [0, 0, 0, 0], 'score': 2})

    assert bg_server._gameinfo.board.checker[0][0] == [0, 0]
    assert bg_server._gameinfo.score == [3, 0]
    assert bg_server._gameinfo.turn == -1
    assert emitted.types == ['gameinfo']


@pytest.mark.parametrize(('msg_type', 'turn', 'cube0', 'data'), [
    # テイク済みで、キューブが相手の側
    ('double', 0, cube(1, 2, True), {'player': 0}),
    # 未テイクで、キューブが相手の側 (自分が掛けたダブルを重ねて掛ける)
    ('double', 0, cube(1, 2, False), {'player': 0}),
    # 未テイクで中央 (ふつうは起きない盤面)
    ('double', 0, cube(-1, 1, False), {'player': 0}),
    # テイク済み
    ('take', 0, cube(1, 2, True), {'player': 1}),
    # 未テイクだが、キューブが相手の側 (掛けた側がテイク)
    ('take', 0, cube(1, 2, False), {'player': 0}),
    # テイク済み
    ('cancel_double', 0, cube(0, 2, True), {'player': 1}),
    # 未テイクだが、キューブが自分の側 (掛けられた側が取り消す)
    ('cancel_double', 0, cube(1, 2, False), {'player': 1}),
    ('resign', -1, cube(-1, 1, True), {'player': 0, 'score': 1}),
    ('end_turn', 1, cube(-1, 1, True), {'player': 0}),
    ('end_turn', 2, cube(-1, 1, True), {'player': 0}),
    ('opening', 0, cube(-1, 1, True), {'winner': 1}),
    ('opening', -1, cube(-1, 1, True), {'winner': -1}),
])
async def test_named_op_not_matching_board_is_ignored(
        bg_server, req, emitted, msg_type, turn, cube0, data):
    """
    盤面と合わない操作は捨てる。盤面・履歴・クロックは変わらず、
    何も送らない
    """
    g = bg_server._gameinfo
    g.turn = turn
    g.board.cube = copy.deepcopy(cube0)
    g.board.dice = [[3, 0, 0, 0], [0, 5, 0, 0]]
    bg_server._clock.start(0)
    before = g.copy()
    hist_len = len(bg_server._hist.entries)

    await send(bg_server, req, msg_type, data)

    assert bg_server._gameinfo == before
    assert len(bg_server._hist.entries) == hist_len
    assert bg_server._clock.active == [True, False]
    assert emitted.messages == []


async def test_redouble_is_accepted(bg_server, req, emitted):
    """
    リダブル (掛けられた未テイクのキューブを、受ける側がさらに倍にする) は
    今のクライアントが送る正しい操作なので捨てない
    """
    g = bg_server._gameinfo
    g.turn = 0
    await send(bg_server, req, 'double', {'player': 0})
    assert g.board.cube == cube(1, 2, False)

    await send(bg_server, req, 'double', {'player': 1})

    assert g.board.cube == cube(0, 4, False)
    assert emitted.types == ['gameinfo', 'gameinfo']


# ---------------------------------------------------------------------
# data の値の型が合わないとき (TODO-050)
# ---------------------------------------------------------------------

@pytest.mark.parametrize(('msg_type', 'data'), [
    ('take', {'player': '1'}),
    ('double', {'player': True}),
    ('roll', {'player': 0, 'dice': '1234'}),
    ('move', {'player': 0, 'moves': [{'ch': '0', 'p': 5, 'idx': 0}],
              'dice': [0, 0, 0, 0], 'score': 1}),
    ('resign', {'player': '0', 'score': 1}),
])
async def test_bad_value_type_changes_nothing(
        bg_server, req, emitted, msg_type, data):
    """
    型が合わなければ、盤面を書き換える前に例外になる。盤面・履歴・
    クロックは変わらず、何も送らない (例外は app.py の受信ループが拾う)
    """
    g = bg_server._gameinfo
    g.turn = 0
    g.board.cube = cube(1, 2, False)
    before = g.copy()
    hist_len = len(bg_server._hist.entries)
    bg_server._clock.start(0)

    with pytest.raises(TypeError):
        await send(bg_server, req, msg_type, data)

    assert bg_server._gameinfo == before
    assert len(bg_server._hist.entries) == hist_len
    assert bg_server._clock.active == [True, False]
    assert emitted.messages == []
