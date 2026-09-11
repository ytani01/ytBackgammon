#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_replay.py

履歴の連続再生の止め方のテスト (TODO-009)。

移行前は共有フラグ (_repeat_flag) で「走っている再生を全部止める」形
だった。移行後は asyncio.Task の cancel に置き換わっているので、
「走っている再生は常に 1 本」「新しい要求が来たら前が確実に止まる」
「同時に来た back が両方とも効く」を固定する。
"""

import asyncio

import pytest

BACK_ALL = {'type': 'back_all', 'data': {}, 'history': False}
FWD_ALL = {'type': 'fwd_all', 'data': {}, 'history': False}


def make_history(bg_server, n):
    """
    履歴を n 件増やす。

    直前と同じ盤面は積まなくなったので (TODO-032)、呼ぶたびに
    game_num を 1 増やしてから積む
    """
    for _ in range(n):
        bg_server._gameinfo.game_num += 1
        bg_server.add_history(bg_server._gameinfo)


def other_tasks(bg_server):
    """_replay_task 以外で走っている Task"""
    return [t for t in asyncio.all_tasks()
            if t is not asyncio.current_task()
            and t is not bg_server._replayer._task
            and not t.done()]


async def test_running_replay_is_stopped_by_next_request(bg_server, req):
    """
    走っている back_all に fwd をぶつけると、前が止まって後が走る。

    sleep を潰さずに動かし、途中で止まることを見る。
    """
    make_history(bg_server, 20)

    await bg_server.on_json(req, dict(BACK_ALL))
    task = bg_server._replayer._task
    await asyncio.sleep(0.25)
    assert not task.done(), '0.1 秒間隔なのでまだ走っているはず'

    hist_mid = len(bg_server._hist.entries)
    assert hist_mid > 1

    await bg_server.on_json(
        req, {'type': 'fwd', 'data': {'n': 1}, 'history': False})

    assert task.cancelled()
    # 止まった位置から 1 手進んだだけ (back_all は再開しない)
    assert len(bg_server._hist.entries) == hist_mid + 1

    await asyncio.sleep(0.25)
    assert len(bg_server._hist.entries) == hist_mid + 1


async def test_only_one_replay_runs(bg_server, req, no_sleep):
    """
    走っている back_all に back_all と fwd_all を同時にぶつけても、
    再生は 1 本だけになる (R1 の再現形)。

    直す前は _replay_task から辿れない Task が残り、逆方向の 2 本が
    打ち消し合って終わらなかった。

    _history と _fwd_hist の両方に中身がある状態で始める。片方が空だと、
    辿れない Task が残っても 1 手も進めずに終わってしまい、
    打ち消し合いが再現しない。
    """
    make_history(bg_server, 20)
    await bg_server.backward_hist(10, sleep_sec=0)
    assert len(bg_server._hist.entries) > 1
    assert len(bg_server._hist.fwd_entries) > 1

    await bg_server.on_json(req, dict(BACK_ALL))
    first = bg_server._replayer._task

    await asyncio.gather(
        bg_server.on_json(req, dict(BACK_ALL)),
        bg_server.on_json(req, dict(FWD_ALL)),
    )

    # 追跡できない Task が残っていない
    assert other_tasks(bg_server) == []
    assert first.done()

    # 打ち消し合って終わらない状態になっていない
    await asyncio.wait_for(bg_server._replayer._task, timeout=5)
    assert other_tasks(bg_server) == []


async def test_two_back_msgs_move_two_steps(bg_server, req, emitted,
                                            no_sleep):
    """
    back (n=1) が 2 通同時に来たら 2 手戻る (C1 の再現形)。

    移行前は backward_hist() が走り切ってから on_json() が返っていた
    ので、2 通なら 2 手ぶん動き、broadcast も 2 通だった。
    """
    make_history(bg_server, 10)
    hist_len0 = len(bg_server._hist.entries)
    fwd_len0 = len(bg_server._hist.fwd_entries)
    emitted.clear()

    msg = {'type': 'back', 'data': {'n': 1}, 'history': False}
    await asyncio.gather(
        bg_server.on_json(req, dict(msg)),
        bg_server.on_json(req, dict(msg)),
    )

    assert len(bg_server._hist.entries) == hist_len0 - 2
    assert len(bg_server._hist.fwd_entries) == fwd_len0 + 2
    assert len(emitted.messages) == 2
    assert emitted.types == ['gameinfo', 'gameinfo']


async def test_replay_error_goes_to_on_error(bg_server, req, no_sleep,
                                             monkeypatch):
    """
    再生 Task の中で起きた例外は on_error() へ届く (C2)。

    Task の外へ抜けて 'Task exception was never retrieved' になったり、
    誰にも知られずに消えたりしない。
    """
    errors = []

    def fake_on_error(ws, e, msg=None):
        errors.append((ws, e, msg))

    monkeypatch.setattr(bg_server, 'on_error', fake_on_error)

    async def boom(*_args, **_kwargs):
        raise ValueError('boom')

    monkeypatch.setattr(bg_server, 'backward_hist', boom)

    make_history(bg_server, 3)
    await bg_server.on_json(req, dict(BACK_ALL))
    await bg_server._replayer._task

    assert len(errors) == 1
    ws, e, _msg = errors[0]
    assert ws is None
    assert isinstance(e, ValueError)


async def test_cancel_is_not_reported_as_error(bg_server, req,
                                               monkeypatch):
    """cancel は正常な停止なので on_error() には渡さない (C2)"""
    errors = []

    def fake_on_error(ws, e, msg=None):
        errors.append((ws, e, msg))

    monkeypatch.setattr(bg_server, 'on_error', fake_on_error)

    make_history(bg_server, 20)

    await bg_server.on_json(req, dict(BACK_ALL))
    task = bg_server._replayer._task
    await asyncio.sleep(0.25)

    await bg_server.on_json(req, dict(FWD_ALL))

    assert task.cancelled()
    assert errors == []

    with pytest.raises(asyncio.CancelledError):
        await task

    # あとから始まった再生を走らせたままテストを終えない
    bg_server._replayer._task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await bg_server._replayer._task
