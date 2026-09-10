#
# (c) Yoichi Tanibayashi
#
"""
test_clock.py

クロックの状態 (TODO-016) のテスト。

サーバは gameinfo とは別に「動作中かどうか」「clock_sw」「数え始めた
時刻」を持ち、送るときに経過分を差し引いた残り時間を clock_state として
添える。再接続したクライアントはそれを見て、動作中の表示に戻す。

残り時間は time.monotonic() の差で決まるので、実時間を待たずに済むよう
monotonic() を差し替えて進める。
"""
import time

import pytest


@pytest.fixture
def fake_time(monkeypatch):
    """
    time.monotonic() を差し替え、テストから好きなだけ進められるようにする。

    conftest の no_sleep と同じで、time は stdlib のモジュールそのもの
    なので差し替えはプロセス全体に効く。monkeypatch が元へ戻す。
    """
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


async def clock_on(bg_server, req):
    """clock_sw を on にする。クロックはこれが on の間だけ進む"""
    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': True},
              'history': False})


async def send(bg_server, req, msg_type, player):
    """クロックの動作そのものを表す 4 つの type を送る"""
    await bg_server.on_json(
        req, {'type': msg_type, 'data': {'player': player},
              'history': False})


# ---------------------------------------------------------------------
# 動作中フラグと残り時間
# ---------------------------------------------------------------------

async def test_start_clock_resets_delay_and_activates(
        fake_time, bg_server, req):
    """start_clock は猶予を clock_limit[1] に戻して動作中にする"""
    await clock_on(bg_server, req)
    bg_server._bg._gameinfo['board']['clock'][0] = [100, 0]

    await send(bg_server, req, 'start_clock', 0)

    assert bg_server._clock_active == [True, False]
    assert bg_server._cur_clock(0) == [100, 12]


async def test_running_clock_counts_down_the_delay(
        fake_time, bg_server, req):
    """動作中は経過した分だけ猶予が減る。持ち時間は減らない"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)

    fake_time.advance(5)

    assert bg_server._cur_clock(0) == [120, 7]


async def test_delay_overflow_reduces_main_clock(fake_time, bg_server, req):
    """猶予を使い切ると、はみ出した分が持ち時間から引かれる"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)

    fake_time.advance(20)

    # 猶予 12 秒を 8 秒超えた
    assert bg_server._cur_clock(0) == [112, 0]


async def test_stopped_clock_does_not_count_down(fake_time, bg_server, req):
    """止まっているクロックは進まない"""
    await clock_on(bg_server, req)

    fake_time.advance(30)

    assert bg_server._clock_active == [False, False]
    assert bg_server._cur_clock(0) == [120, 12]


async def test_stop_clock_freezes_elapsed(fake_time, bg_server, req):
    """stop_clock は、そこまで進んだ分を gameinfo に書き戻して止める"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)

    fake_time.advance(5)
    await send(bg_server, req, 'stop_clock', 0)
    fake_time.advance(60)

    assert bg_server._clock_active == [False, False]
    # 止めたあとは進まない
    assert bg_server._bg._gameinfo['board']['clock'][0] == [120, 7]
    assert bg_server._cur_clock(0) == [120, 7]


async def test_resume_clock_keeps_remaining_delay(fake_time, bg_server, req):
    """resume_clock は猶予を戻さず、残っているところから再開する"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)
    await send(bg_server, req, 'stop_clock', 0)

    await send(bg_server, req, 'resume_clock', 0)
    fake_time.advance(2)

    assert bg_server._clock_active == [True, False]
    assert bg_server._cur_clock(0) == [120, 5]


async def test_reset_clock_restores_limit_and_stops(
        fake_time, bg_server, req):
    """reset_clock は残り時間を clock_limit に戻して止める"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(30)

    await send(bg_server, req, 'reset_clock', 0)

    assert bg_server._clock_active == [False, False]
    assert bg_server._cur_clock(0) == [120, 12]


async def test_start_clock_affects_only_target_player(
        fake_time, bg_server, req):
    """相手のクロックは動かない"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 1)

    fake_time.advance(5)

    assert bg_server._clock_active == [False, True]
    assert bg_server._cur_clock(0) == [120, 12]
    assert bg_server._cur_clock(1) == [120, 7]


# ---------------------------------------------------------------------
# clock_sw
# ---------------------------------------------------------------------

async def test_clock_sw_starts_on(fake_time, bg_server):
    """
    clock_sw は on で始まる。

    index.html の Clock のチェックボックスが既定で checked なので、
    off で始めると、つないだ画面が clock_state を受けてチェックを外し、
    既定が反転する。
    """
    assert bg_server._clock_sw is True


async def test_set_clock_switch_updates_flag(fake_time, bg_server, req):
    """set_clock_switch は clock_sw を持ち替える"""
    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': False},
              'history': False})
    assert bg_server._clock_sw is False

    await clock_on(bg_server, req)
    assert bg_server._clock_sw is True

    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': False},
              'history': False})
    assert bg_server._clock_sw is False


async def test_clock_does_not_advance_while_switch_off(
        fake_time, bg_server, req):
    """clock_sw が off の間は、動作中でも進まない (ytbg.js と同じ)"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)

    # off にした時点までは進み、そこからは止まる
    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': False},
              'history': False})
    fake_time.advance(60)

    assert bg_server._cur_clock(0) == [120, 7]

    # on に戻すと、off だった 60 秒は数えずに続きから進む
    await clock_on(bg_server, req)
    fake_time.advance(2)

    assert bg_server._cur_clock(0) == [120, 5]


# ---------------------------------------------------------------------
# 他の type との組み合わせ
# ---------------------------------------------------------------------

async def test_set_player_clock_restarts_counting_from_new_value(
        fake_time, bg_server, req):
    """set_player_clock で入れ替えた値から数え直す"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)

    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [90, 10]}, 'history': False})
    fake_time.advance(3)

    assert bg_server._cur_clock(0) == [90, 7]


async def test_set_clock_limit_resets_both_clocks(fake_time, bg_server, req):
    """
    set_clock_limit は両方のクロックを clock_limit に戻して止める。

    TODO-015 より前は ytbg.js の受信側が player_clock[0] / [1] を
    reset() していた。今はクライアントが clock_state に従うので、
    サーバのこの動きがそのまま画面に出る。
    """
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)

    await bg_server.on_json(
        req, {'type': 'set_clock_limit',
              'data': {'index': 0, 'clock_limit': 60}, 'history': False})

    assert bg_server._clock_active == [False, False]
    assert bg_server._cur_clock(0) == [60, 12]
    assert bg_server._cur_clock(1) == [60, 12]


async def test_new_stops_the_clock(fake_time, bg_server, req):
    """new は止まった状態で始める"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)

    await bg_server.on_json(req, {'type': 'new', 'data': {},
                                  'history': False})
    fake_time.advance(30)

    assert bg_server._clock_active == [False, False]
    assert bg_server._cur_clock(0) == [120, 12]


async def test_set_gameinfo_stops_the_clock(fake_time, bg_server, req):
    """set_gameinfo は盤面ごと入れ替わるので、クロックも止める"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)

    gameinfo = bg_server._bg._gameinfo
    await bg_server.on_json(req, {'type': 'set_gameinfo', 'data': gameinfo,
                                  'history': False})
    fake_time.advance(30)

    assert bg_server._clock_active == [False, False]


async def test_clock_state_is_not_in_history(fake_time, bg_server, req):
    """
    クロックの状態は gameinfo に入れないので、履歴にも載らない。

    載せると back / fwd でクロックの発着まで巻き戻る (TODO-010 で相談した)。
    """
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    bg_server.add_history(bg_server._bg._gameinfo)

    hist_ent = bg_server._history[-1]
    assert 'clock_sw' not in hist_ent
    assert 'clock_active' not in hist_ent
    assert 'clock_active' not in hist_ent['board']


# ---------------------------------------------------------------------
# 送られる形
# ---------------------------------------------------------------------

async def test_clock_state_carries_current_clock(
        fake_time, bg_server, req, emitted):
    """clock_state には、経過分を引いたいまの残り時間が入る"""
    await clock_on(bg_server, req)
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)

    await bg_server.emit_gameinfo()

    clock_state = emitted.last['data']['clock_state']
    assert clock_state['sw'] is True
    assert clock_state['active'] == [True, False]
    assert clock_state['clock'] == [[120, 7], [120, 12]]
    # gameinfo の側は止まった時点の値のまま
    assert emitted.last['data']['gameinfo']['board']['clock'][0] == [120, 12]
    # 直接呼んだので、直前の操作は付かない (TODO-015)
    assert emitted.last['data']['last_op'] is None


async def test_clock_ops_send_gameinfo_with_clock_state(
        fake_time, bg_server, req, emitted):
    """
    クロックの 5 つの type も gameinfo で返り、動作中かどうかは
    clock_state に入る (TODO-015)。

    受け取った msg をそのまま転送するのをやめたので、クライアントは
    この clock_state だけを見てクロックを合わせる。
    """
    await clock_on(bg_server, req)
    emitted.clear()

    await send(bg_server, req, 'start_clock', 1)

    sent = emitted.last
    assert len(emitted.messages) == 1
    assert sent['type'] == 'gameinfo'
    assert sent['data']['last_op']['type'] == 'start_clock'
    assert sent['data']['clock_state']['active'] == [False, True]

    fake_time.advance(5)
    await send(bg_server, req, 'stop_clock', 1)

    sent = emitted.last
    assert sent['type'] == 'gameinfo'
    assert sent['data']['last_op']['type'] == 'stop_clock'
    assert sent['data']['clock_state']['active'] == [False, False]
    assert sent['data']['clock_state']['clock'][1] == [120, 7]

    await send(bg_server, req, 'resume_clock', 1)

    sent = emitted.last
    assert sent['data']['last_op']['type'] == 'resume_clock'
    assert sent['data']['clock_state']['active'] == [False, True]
    # 猶予は戻らず、止めたところから続く
    assert sent['data']['clock_state']['clock'][1] == [120, 7]

    await send(bg_server, req, 'reset_clock', 1)

    sent = emitted.last
    assert sent['data']['last_op']['type'] == 'reset_clock'
    assert sent['data']['clock_state']['active'] == [False, False]
    assert sent['data']['clock_state']['clock'][1] == [120, 12]

    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': False},
              'history': False})

    sent = emitted.last
    assert sent['data']['last_op']['type'] == 'set_clock_switch'
    assert sent['data']['clock_state']['sw'] is False


async def test_on_connect_sends_running_clock(
        fake_time, bg_server_raw, req, make_client):
    """
    あとから入ったクライアントにも、動作中であることと残り時間が届く。

    これが TODO-016 で直したかったこと。
    """
    await clock_on(bg_server_raw, req)
    await send(bg_server_raw, req, 'start_clock', 1)
    fake_time.advance(5)

    ws = make_client('late')
    await bg_server_raw.on_connect(ws)

    assert ws.types == ['gameinfo']
    clock_state = ws.sent[-1]['data']['clock_state']
    assert clock_state['sw'] is True
    assert clock_state['active'] == [False, True]
    assert clock_state['clock'][1] == [120, 7]


async def test_back_does_not_rewind_running_clock(
        fake_time, bg_server, req, no_sleep):
    """
    履歴を戻しても、動いているクロックは巻き戻らない (TODO-016)。

    back / fwd は gameinfo を履歴のもので丸ごと置き換える。そのとき
    board.clock まで昔の値に戻すと、動作中のクロックが昔の残り時間から
    数え直しになり、その値が clock_state として全員へ配られる。
    """
    await clock_on(bg_server, req)

    # 履歴に昔の残り時間 [50, 12] を残す
    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [50, 12]}, 'history': True})
    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [100, 12]}, 'history': True})

    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)
    assert bg_server._cur_clock(0) == [100, 7]

    await bg_server.on_json(req, {'type': 'back', 'data': {'n': 1},
                                  'history': False})

    # 盤面は 1 手戻るが、クロックは戻らずそのまま進み続ける
    assert bg_server._cur_clock(0) == [100, 7]
    fake_time.advance(3)
    assert bg_server._cur_clock(0) == [100, 4]


async def test_fwd_does_not_rewind_running_clock(
        fake_time, bg_server, req, no_sleep):
    """fwd で進めるときも同じ (TODO-016)"""
    await clock_on(bg_server, req)

    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [50, 12]}, 'history': True})
    await bg_server.on_json(req, {'type': 'back', 'data': {'n': 1},
                                  'history': False})

    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [100, 12]}, 'history': False})
    await send(bg_server, req, 'start_clock', 0)
    fake_time.advance(5)

    await bg_server.on_json(req, {'type': 'fwd', 'data': {'n': 1},
                                  'history': False})

    assert bg_server._cur_clock(0) == [100, 7]


async def test_new_resets_clock_to_limit(fake_time, bg_server, req):
    """
    new は clock_limit の値でクロックを作り直す。

    init_gameinfo() が入れるのは固定値 [120, 12] なので、clock_limit を
    変えてあると、そのままでは食い違う。
    """
    await bg_server.on_json(
        req, {'type': 'set_clock_limit',
              'data': {'index': 0, 'clock_limit': 60}, 'history': False})
    await bg_server.on_json(
        req, {'type': 'set_clock_limit',
              'data': {'index': 1, 'clock_limit': 6}, 'history': False})

    await bg_server.on_json(req, {'type': 'new', 'data': {},
                                  'history': False})

    assert bg_server._bg._gameinfo['board']['clock'] == [[60, 6], [60, 6]]
    assert bg_server._clock_active == [False, False]
