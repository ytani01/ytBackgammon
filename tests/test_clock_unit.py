#
# (c) Yoichi Tanibayashi
#
"""
test_clock_unit.py

Clock 単体のテスト (TODO-024)。

サーバを通さずに、残り時間の計算そのもの (cur() / freeze() / reset())
と、保存の形 (to_dict() / from_dict()) を見る。

残り時間は time.monotonic() の差で決まるので、実時間を待たずに済むよう
monotonic() を差し替えて進める。
"""
import time

import pytest

from ytbg.clock import Clock


@pytest.fixture
def fake_time(monkeypatch):
    """time.monotonic() を差し替え、好きなだけ進められるようにする"""
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


def test_default_clock(fake_time):
    """既定は limit [120, 12]、sw は on、両方止まっている"""
    clock = Clock()

    assert clock.limit == [120, 12]
    assert clock.sw is True
    assert clock.active == [False, False]
    assert clock.clock == [[120, 12], [120, 12]]
    assert clock.cur(0) == [120, 12]


def test_cur_counts_down_the_delay(fake_time):
    """動作中は経過分だけ猶予が減り、持ち時間は減らない"""
    clock = Clock()
    clock.start(0)

    fake_time.advance(5)

    assert clock.cur(0) == [120, 7]
    # 相手は動かない
    assert clock.cur(1) == [120, 12]


def test_cur_overflow_reduces_main_clock(fake_time):
    """猶予を使い切ると、はみ出した分が持ち時間から引かれる"""
    clock = Clock()
    clock.start(0)

    fake_time.advance(20)

    assert clock.cur(0) == [112, 0]


def test_cur_allows_negative_main_clock(fake_time):
    """持ち時間はマイナスも許す (ui/clock.js の PlayerClock と同じ)"""
    clock = Clock(limit=[10, 2])
    clock.start(0)

    fake_time.advance(20)

    assert clock.cur(0) == [-8, 0]


def test_cur_does_not_count_while_switch_off(fake_time):
    """sw が off の間は、動作中でも進まない"""
    clock = Clock()
    clock.start(0)
    fake_time.advance(5)
    clock.set_switch(False)

    fake_time.advance(60)

    assert clock.cur(0) == [120, 7]

    clock.set_switch(True)
    fake_time.advance(2)

    assert clock.cur(0) == [120, 5]


def test_freeze_writes_back_and_restarts(fake_time):
    """freeze() は進んだ分を書き戻し、基準の時刻を打ち直す"""
    clock = Clock()
    clock.start(1)
    fake_time.advance(5)

    clock.freeze(1)

    assert clock.clock[1] == [120, 7]
    # 動作中のままなので、そこから続けて進む
    fake_time.advance(3)
    assert clock.cur(1) == [120, 4]


def test_stop_freezes_and_deactivates(fake_time):
    """stop() は進んだ分を確定させて止める"""
    clock = Clock()
    clock.start(0)
    fake_time.advance(5)

    clock.stop(0)
    fake_time.advance(60)

    assert clock.active == [False, False]
    assert clock.cur(0) == [120, 7]


def test_resume_keeps_remaining_delay(fake_time):
    """resume() は猶予を戻さず、残っているところから再開する"""
    clock = Clock()
    clock.start(0)
    fake_time.advance(5)
    clock.stop(0)

    clock.resume(0)
    fake_time.advance(2)

    assert clock.cur(0) == [120, 5]


def test_start_restores_the_delay(fake_time):
    """start() は猶予を limit[1] に戻してから動かす"""
    clock = Clock(clock=[[100, 0], [100, 0]])

    clock.start(0)

    assert clock.active == [True, False]
    assert clock.cur(0) == [100, 12]


def test_reset_restores_limit_and_stops(fake_time):
    """reset() は残り時間を limit に戻して止める"""
    clock = Clock(limit=[60, 6])
    clock.start(0)
    fake_time.advance(30)

    clock.reset(0)
    fake_time.advance(30)

    assert clock.active == [False, False]
    assert clock.cur(0) == [60, 6]


def test_reset_uses_the_current_limit(fake_time):
    """limit を変えたあとの reset() は、新しい limit に戻す"""
    clock = Clock()
    clock.set_limit(0, 60)

    clock.reset(0)

    assert clock.cur(0) == [60, 12]
    # もう片方は触らない
    assert clock.cur(1) == [120, 12]


def test_set_clock_restarts_counting(fake_time):
    """set_clock() で入れ替えた値から数え直す"""
    clock = Clock()
    clock.start(0)
    fake_time.advance(5)

    clock.set_clock(0, [90, 10])
    fake_time.advance(3)

    assert clock.cur(0) == [90, 7]


def test_stop_all_keeps_remaining(fake_time):
    """stop_all() は止めるだけで、残り時間は変えない"""
    clock = Clock()
    clock.set_clock(1, [80, 5])
    clock.start(0)

    clock.stop_all()
    fake_time.advance(30)

    assert clock.active == [False, False]
    assert clock.clock[1] == [80, 5]


def test_state_carries_limit_and_current_clock(fake_time):
    """state() は sw / active / clock / limit の 4 つ"""
    clock = Clock(limit=[60, 6])
    clock.start(1)
    fake_time.advance(2)

    state = clock.state()

    assert set(state.keys()) == {'sw', 'active', 'clock', 'limit'}
    assert state['sw'] is True
    assert state['active'] == [False, True]
    assert state['clock'] == [[60, 6], [60, 4]]
    assert state['limit'] == [60, 6]


def test_to_dict_has_no_active(fake_time):
    """
    to_dict() に active は入れない。clock は保存した時点の残り時間で、
    求めるだけ (基準の時刻は打ち直さない)
    """
    clock = Clock()
    clock.start(0)
    fake_time.advance(5)

    data = clock.to_dict()

    assert set(data.keys()) == {'limit', 'sw', 'clock'}
    assert data['clock'][0] == [120, 7]
    # 副作用が無いので、そのまま数え続ける
    fake_time.advance(3)
    assert clock.cur(0) == [120, 4]


def test_from_dict_starts_stopped(fake_time):
    """from_dict() で作ったクロックは、必ず止まった状態"""
    clock = Clock.from_dict(
        {'limit': [90, 9], 'sw': False, 'clock': [[50, 3], [40, 2]]})

    assert clock.limit == [90, 9]
    assert clock.sw is False
    assert clock.clock == [[50, 3], [40, 2]]
    assert clock.active == [False, False]

    fake_time.advance(30)
    assert clock.cur(0) == [50, 3]


def test_from_dict_uses_defaults(fake_time):
    """足りないキーは既定値になる"""
    clock = Clock.from_dict({})

    assert clock.limit == [120, 12]
    assert clock.sw is True
    assert clock.clock == [[120, 12], [120, 12]]
##
