#
# (c) Yoichi Tanibayashi
#
"""
test_on_json.py

on_json() の type ごとのテスト。

TODO-009 で通信層を Flask-SocketIO から Starlette + 素の WebSocket へ
入れ替える予定で、そのときに壊れるとしたら on_json() の分岐。
「この type を投げたら gameinfo がこう変わり、こう送られる」を
先に固めておき、移行後は同じテストを通すだけで済むようにする。
網羅率を上げるのが目的ではない。
"""
import copy

import pytest

from ytbg.yt_backgammon import ytBackgammon

# ---------------------------------------------------------------------
# 末尾へ落ちる型 (put_checker / cube / dice / set_turn /
# set_playername / set_score / resign / set_clock_limit /
# set_player_clock)
#
# これらは return せず、末尾の add_history と broadcast まで落ちる。
# ---------------------------------------------------------------------

def test_put_checker_updates_only_target(bg_server, req):
    """put_checker は指定した checker だけを動かし、隣は変わらない"""
    before1 = copy.deepcopy(bg_server._bg._gameinfo['board']['checker'][1][0])

    msg = {'type': 'put_checker',
           'data': {'ch': 101, 'p': 5, 'idx': 2}, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['board']['checker'][1][1] == [5, 2]
    # 100 で割ったプレーヤー 1 の別の checker は変わらない
    assert bg_server._bg._gameinfo['board']['checker'][1][0] == before1
    # プレーヤー 0 側は変わらない
    assert bg_server._bg._gameinfo['board']['checker'][0][0] == [6, 0]


def test_put_checker_broadcasts_msg(bg_server, req, emitted):
    """put_checker は受け取った msg をそのまま broadcast する"""
    msg = {'type': 'put_checker',
           'data': {'ch': 12, 'p': 3, 'idx': 0}, 'history': False}
    expected = copy.deepcopy(msg)
    bg_server.on_json(req, msg)

    assert emitted.last == expected
    assert emitted.last_kwargs == {'broadcast': True}
    assert len(emitted.messages) == 1


def test_history_true_appends_one_entry(bg_server, req):
    """history: true のときだけ履歴が 1 件増える"""
    hist_len0 = len(bg_server._history)

    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': True}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == hist_len0 + 1


def test_history_false_does_not_append(bg_server, req):
    """history: false では履歴は増えない"""
    hist_len0 = len(bg_server._history)

    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == hist_len0


def test_cube_updates_gameinfo(bg_server, req):
    """cube は board.cube を丸ごと置き換える"""
    data = {'side': 1, 'value': 4, 'accepted': False}
    msg = {'type': 'cube', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['board']['cube'] == data


def test_dice_updates_only_target_player(bg_server, req):
    """
    dice は data.player で指定したプレーヤーの目だけを変え、
    もう片方は初期値のまま変わらない。player: 1 を渡して確かめる
    (player: 0 だと、実装が player を無視して 0 に固定しても
    区別が付かない)
    """
    data = {'player': 1, 'dice': [3, 4, 0, 0]}
    msg = {'type': 'dice', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['board']['dice'][1] == [3, 4, 0, 0]
    assert bg_server._bg._gameinfo['board']['dice'][0] == [0, 0, 0, 0]


def test_set_turn_updates_turn_and_resign(bg_server, req):
    """set_turn は turn と resign の両方を変える"""
    data = {'turn': 1, 'resign': 0}
    msg = {'type': 'set_turn', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['turn'] == 1
    assert bg_server._bg._gameinfo['resign'] == 0


def test_set_playername_updates_only_target_player(bg_server, req):
    """
    set_playername は data.player で指定したプレーヤーの名前だけを変える。
    player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'name': 'Alice'}
    msg = {'type': 'set_playername', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['board']['playername'][1] == 'Alice'
    assert bg_server._bg._gameinfo['board']['playername'][0] == ''


def test_set_score_updates_only_target_player(bg_server, req):
    """
    set_score は data.player で指定したプレーヤーの得点だけを変える。
    player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'score': 5}
    msg = {'type': 'set_score', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['score'][1] == 5
    assert bg_server._bg._gameinfo['score'][0] == 0


def test_resign_updates_resign(bg_server, req):
    """resign は resign にプレーヤー番号を入れる"""
    data = {'player': 1}
    msg = {'type': 'resign', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['resign'] == 1


def test_set_clock_limit_updates_only_target_index(bg_server, req):
    """
    set_clock_limit は data.index で指定した index だけを変える。
    index: 1 を渡して確かめる (index: 0 だと固定と区別が付かない)。
    初期値 [120, 12] は要素ごとに値が違うので、index 0 が変わっていない
    ことを初期値のべた書きで見られる
    """
    data = {'index': 1, 'clock_limit': 60}
    msg = {'type': 'set_clock_limit', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['clock_limit'][1] == 60
    assert bg_server._bg._gameinfo['clock_limit'][0] == 120


def test_set_player_clock_updates_only_target_player(bg_server, req):
    """
    set_player_clock は data.player で指定したプレーヤーの clock だけを
    変える。player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'clock': [90, 5]}
    msg = {'type': 'set_player_clock', 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    assert bg_server._bg._gameinfo['board']['clock'][1] == [90, 5]
    assert bg_server._bg._gameinfo['board']['clock'][0] == [120, 12]


@pytest.mark.parametrize(
    ('msg_type', 'data'),
    [
        ('put_checker', {'ch': 5, 'p': 10, 'idx': 0}),
        ('cube', {'side': 0, 'value': 2, 'accepted': True}),
        ('dice', {'player': 1, 'dice': [1, 2, 0, 0]}),
        ('set_turn', {'turn': 0, 'resign': -1}),
        ('set_playername', {'player': 1, 'name': 'Bob'}),
        ('set_score', {'player': 1, 'score': 2}),
        ('resign', {'player': 0}),
        ('set_clock_limit', {'index': 1, 'clock_limit': 30}),
        ('set_player_clock', {'player': 1, 'clock': [60, 3]}),
    ],
)
def test_fallthrough_types_broadcast_the_received_msg(
        bg_server, req, emitted, msg_type, data):
    """末尾へ落ちる 9 つの type それぞれで、受け取った msg がそのまま broadcast される"""
    msg = {'type': msg_type, 'data': data, 'history': False}
    expected = copy.deepcopy(msg)
    bg_server.on_json(req, msg)

    assert emitted.last == expected


# ---------------------------------------------------------------------
# return する型 (back / back2 / back_all / fwd / fwd2 / fwd_all /
# new / set_gameinfo)
#
# これらは末尾まで落ちず、元の msg は broadcast されない。
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    'msg_type',
    ['back', 'back2', 'back_all', 'fwd', 'fwd2', 'fwd_all',
     'new', 'set_gameinfo'],
)
def test_returning_types_do_not_broadcast_original_msg(
        bg_server, req, emitted, no_sleep, msg_type):
    """return する 8 つの type では、元の msg の type は broadcast されない"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    if msg_type in ('fwd', 'fwd2', 'fwd_all'):
        # fwd 系は _fwd_hist に積まれていないと forward_hist() の
        # while が回らず、emit が 1 通も起きないまま
        # 「broadcast されない」が空振りで成立してしまう
        bg_server.backward_hist(-1, sleep_sec=0)

    # 前準備 (backward_hist など) の emit は判定に混ぜない
    emitted.clear()

    data = {'n': 1} if msg_type in ('back', 'fwd') else \
        (bg_server._bg._gameinfo if msg_type == 'set_gameinfo' else {})
    msg = {'type': msg_type, 'data': data, 'history': False}
    bg_server.on_json(req, msg)

    # 何かは送られたことを確かめ、空振りで通らないようにする
    assert 'gameinfo' in emitted.types
    assert msg_type not in emitted.types


def test_back_moves_history_by_n(bg_server, req, no_sleep):
    """back は data.n の数だけ履歴を戻す"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    hist_len0 = len(bg_server._history)
    fwd_len0 = len(bg_server._fwd_hist)

    msg = {'type': 'back', 'data': {'n': 2}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == hist_len0 - 2
    assert len(bg_server._fwd_hist) == fwd_len0 + 2


def test_back_sends_sec_for_checker_move(bg_server, req, emitted, no_sleep):
    """back (n > 0) で送られる sec は SEC_CHECKER_MOVE の 0.2 (べた書き)"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    msg = {'type': 'back', 'data': {'n': 1}, 'history': False}
    bg_server.on_json(req, msg)

    assert emitted.last['data']['sec'] == 0.2
    assert emitted.last['data']['history_flag'] is True


def test_fwd_moves_history_by_n(bg_server, req, no_sleep):
    """fwd は data.n の数だけ履歴を進める"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.backward_hist(2, sleep_sec=0)
    hist_len0 = len(bg_server._history)
    fwd_len0 = len(bg_server._fwd_hist)

    msg = {'type': 'fwd', 'data': {'n': 2}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == hist_len0 + 2
    assert len(bg_server._fwd_hist) == fwd_len0 - 2


def test_fwd_sends_sec_for_checker_move(bg_server, req, emitted, no_sleep):
    """fwd (n > 0) で送られる sec は SEC_CHECKER_MOVE の 0.2 (べた書き)"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.backward_hist(2, sleep_sec=0)

    msg = {'type': 'fwd', 'data': {'n': 1}, 'history': False}
    bg_server.on_json(req, msg)

    assert emitted.last['data']['sec'] == 0.2
    assert emitted.last['data']['history_flag'] is True


def test_back_all_leaves_one_entry(bg_server, req, emitted, no_sleep):
    """back_all は履歴の先頭 1 件を残して全部戻り、sec は 0.1 で history_flag は真"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    msg = {'type': 'back_all', 'data': {}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == 1
    assert emitted.last['data']['sec'] == 0.1
    assert emitted.last['data']['history_flag'] is True


def test_fwd_all_moves_history_to_the_end(bg_server, req, emitted, no_sleep):
    """fwd_all は履歴の末尾まで全部進め、sec は 0.1 で history_flag は真"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.backward_hist(-1, sleep_sec=0)

    msg = {'type': 'fwd_all', 'data': {}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._fwd_hist) == 0
    assert len(bg_server._history) == 3
    assert emitted.last['data']['sec'] == 0.1
    assert emitted.last['data']['history_flag'] is True


def test_back2_behaves_like_back_all(bg_server, req, no_sleep):
    """back2 は back_all と同じ動きになる (違いは sleep_sec だけ)"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    msg = {'type': 'back2', 'data': {}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._history) == 1


def test_fwd2_behaves_like_fwd_all(bg_server, req, no_sleep):
    """fwd2 は fwd_all と同じ動きになる (違いは sleep_sec だけ)"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.backward_hist(-1, sleep_sec=0)

    msg = {'type': 'fwd2', 'data': {}, 'history': False}
    bg_server.on_json(req, msg)

    assert len(bg_server._fwd_hist) == 0
    assert len(bg_server._history) == 3


def test_new_keeps_score_playername_clock_limit_and_resets_board(
        bg_server, req, emitted):
    """new は score / playername / clock_limit を引き継ぎ、盤面を初期配置に戻す"""
    bg_server._bg._gameinfo['score'] = [3, 5]
    bg_server._bg._gameinfo['board']['playername'] = ['Alice', 'Bob']
    bg_server._bg._gameinfo['clock_limit'] = [60, 6]
    bg_server._bg.put_checker(0, 1, 0)
    hist_len0 = len(bg_server._history)

    msg = {'type': 'new', 'data': {}, 'history': False}
    bg_server.on_json(req, msg)

    gameinfo = bg_server._bg._gameinfo
    assert gameinfo['score'] == [3, 5]
    assert gameinfo['board']['playername'] == ['Alice', 'Bob']
    assert gameinfo['clock_limit'] == [60, 6]

    fresh = ytBackgammon(svr_ver='test')
    assert gameinfo['board']['checker'] == fresh._gameinfo['board']['checker']
    assert gameinfo['board']['dice'] == fresh._gameinfo['board']['dice']
    assert gameinfo['board']['cube'] == fresh._gameinfo['board']['cube']
    assert gameinfo['turn'] == fresh._gameinfo['turn']

    assert len(bg_server._history) == hist_len0 + 1

    assert emitted.last['type'] == 'gameinfo'
    assert emitted.last['data']['sec'] == 3
    assert emitted.last['data']['history_flag'] is False
    assert emitted.last_kwargs == {'broadcast': True}


def test_set_gameinfo_replaces_gameinfo(bg_server, req, emitted):
    """
    set_gameinfo は gameinfo (board 以下を含む) を渡したもので丸ごと
    置き換え、履歴に積む。渡した dict とは縁を切る (copy.deepcopy) ので、
    渡した後に元の dict を書き換えても gameinfo は変わらない。
    """
    hist_len0 = len(bg_server._history)

    new_gameinfo = copy.deepcopy(bg_server._bg._gameinfo)
    new_gameinfo['score'] = [9, 9]
    new_gameinfo['board']['playername'] = ['Alice', 'Bob']

    msg = {'type': 'set_gameinfo', 'data': new_gameinfo, 'history': False}
    bg_server.on_json(req, msg)

    # 渡した dict を after で書き換えても gameinfo は変わらないこと
    new_gameinfo['score'] = [0, 0]
    new_gameinfo['board']['playername'] = ['changed', 'changed']

    assert bg_server._bg._gameinfo['score'] == [9, 9]
    assert bg_server._bg._gameinfo['board']['playername'] == ['Alice', 'Bob']
    assert len(bg_server._history) == hist_len0 + 1
    assert emitted.last['type'] == 'gameinfo'


# ---------------------------------------------------------------------
# 履歴系で送られるもの
# ---------------------------------------------------------------------

def test_emit_gameinfo_message_shape(bg_server, req, emitted):
    """emit_gameinfo() が送る msg の形 (src/dst/type/data の各キー)"""
    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': True}
    bg_server.on_json(req, msg)

    # set_score は末尾で emit('json', msg) するだけで emit_gameinfo() は
    # 呼ばない。emit_gameinfo() が送る形は直接呼んで確かめる。
    bg_server.emit_gameinfo()

    sent = emitted.last
    assert sent['src'] == 'server'
    assert sent['dst'] == 'all'
    assert sent['type'] == 'gameinfo'
    data = sent['data']
    assert set(data.keys()) == {
        'gameinfo', 'sec', 'hist_i', 'hist_n', 'history_flag'}


def test_back_moves_hist_i_by_n(bg_server, req, emitted, no_sleep):
    """
    hist_i / hist_n をべた書きの絶対値で固定する。

    bg_server フィクスチャは初期化時に履歴を 1 件積んでいるので、
    add_history() を 2 回呼ぶと履歴は 3 件になる。back を 1 回したら
    hist_i は 3 から 2 に減り、hist_n は 3 のまま変わらない。
    """
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    bg_server.emit_gameinfo()
    sent = emitted.last
    assert sent['data']['hist_i'] == 3
    assert sent['data']['hist_n'] == 3
    emitted.clear()

    msg = {'type': 'back', 'data': {'n': 1}, 'history': False}
    bg_server.on_json(req, msg)

    sent = emitted.last
    assert sent['type'] == 'gameinfo'
    assert sent['data']['hist_i'] == 2
    assert sent['data']['hist_n'] == 3
