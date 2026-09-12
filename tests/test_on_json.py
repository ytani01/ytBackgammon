#
# (c) 2020 Yoichi Tanibayashi
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
import asyncio
import copy

import pytest

from ytbg.gameinfo import CubeState, GameInfo

# ---------------------------------------------------------------------
# 末尾へ落ちる型 (put_checker / cube / dice / set_turn /
# set_playername / set_score / resign / set_clock_limit /
# set_player_clock と、クロックの動作そのものの 5 つ)
#
# これらは return せず、末尾の add_history と emit_gameinfo まで落ちる。
# 返るのは gameinfo で、受け取った msg は last_op として添えられる
# (TODO-015)。
# ---------------------------------------------------------------------

async def test_put_checker_updates_only_target(bg_server, req):
    """put_checker は指定した checker だけを動かし、隣は変わらない"""
    before1 = copy.deepcopy(bg_server._gameinfo.board.checker[1][0])

    msg = {'type': 'put_checker',
           'data': {'ch': 101, 'p': 5, 'idx': 2}, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.board.checker[1][1] == [5, 2]
    # 100 で割ったプレーヤー 1 の別の checker は変わらない
    assert bg_server._gameinfo.board.checker[1][0] == before1
    # プレーヤー 0 側は変わらない
    assert bg_server._gameinfo.board.checker[0][0] == [6, 0]


async def test_put_checker_sends_gameinfo_with_last_op(
        bg_server, req, emitted):
    """
    put_checker で送られるのは gameinfo で、直前の操作が last_op に入る
    (TODO-015)。

    チェッカーが動くので、アニメーションの時間 SEC_CHECKER_MOVE (0.2) も
    添える (べた書き)。
    """
    msg = {'type': 'put_checker',
           'data': {'ch': 12, 'p': 3, 'idx': 0}, 'history': False}
    expected = copy.deepcopy(msg)
    await bg_server.on_json(req, msg)

    # emitted には broadcast() (全員へ送るメソッド) へ渡った msg だけが
    # 積まれる。送信元だけへ送る実装に変えたら emitted は空になる
    sent = emitted.last
    assert len(emitted.messages) == 1
    assert sent['type'] == 'gameinfo'
    assert sent['data']['last_op'] == expected
    assert sent['data']['sec'] == 0.2
    assert sent['data']['history_flag'] is False
    # 盤面も、その操作を反映したものが送られる
    assert sent['data']['gameinfo']['board']['checker'][0][12] == [3, 0]


async def test_history_true_appends_one_entry(bg_server, req):
    """history: true のときだけ履歴が 1 件増える"""
    hist_len0 = len(bg_server._hist.entries)

    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': True}
    await bg_server.on_json(req, msg)

    assert len(bg_server._hist.entries) == hist_len0 + 1


async def test_history_false_does_not_append(bg_server, req):
    """history: false では履歴は増えない"""
    hist_len0 = len(bg_server._hist.entries)

    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': False}
    await bg_server.on_json(req, msg)

    assert len(bg_server._hist.entries) == hist_len0


async def test_cube_updates_gameinfo(bg_server, req):
    """cube は board.cube を丸ごと置き換える"""
    data = {'side': 1, 'value': 4, 'accepted': False}
    msg = {'type': 'cube', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.board.cube == CubeState(**data)


async def test_dice_updates_only_target_player(bg_server, req):
    """
    dice は data.player で指定したプレーヤーの目だけを変え、
    もう片方は初期値のまま変わらない。player: 1 を渡して確かめる
    (player: 0 だと、実装が player を無視して 0 に固定しても
    区別が付かない)
    """
    data = {'player': 1, 'dice': [3, 4, 0, 0]}
    msg = {'type': 'dice', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.board.dice[1] == [3, 4, 0, 0]
    assert bg_server._gameinfo.board.dice[0] == [0, 0, 0, 0]


async def test_set_turn_updates_turn_and_resign(bg_server, req):
    """set_turn は turn と resign の両方を変える"""
    data = {'turn': 1, 'resign': 0}
    msg = {'type': 'set_turn', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.turn == 1
    assert bg_server._gameinfo.resign == 0


async def test_set_playername_updates_only_target_player(bg_server, req):
    """
    set_playername は data.player で指定したプレーヤーの名前だけを変える。
    player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'name': 'Alice'}
    msg = {'type': 'set_playername', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.board.playername[1] == 'Alice'
    assert bg_server._gameinfo.board.playername[0] == ''


async def test_set_score_updates_only_target_player(bg_server, req):
    """
    set_score は data.player で指定したプレーヤーの得点だけを変える。
    player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'score': 5}
    msg = {'type': 'set_score', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.score[1] == 5
    assert bg_server._gameinfo.score[0] == 0


async def test_resign_updates_resign(bg_server, req):
    """resign は resign にプレーヤー番号を入れる"""
    data = {'player': 1}
    msg = {'type': 'resign', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.resign == 1


async def test_set_clock_limit_updates_only_target_index(bg_server, req):
    """
    set_clock_limit は data.index で指定した index だけを変える。
    index: 1 を渡して確かめる (index: 0 だと固定と区別が付かない)。
    初期値 [120, 12] は要素ごとに値が違うので、index 0 が変わっていない
    ことを初期値のべた書きで見られる。

    限度は gameinfo ではなく Clock が持つ (TODO-024)。
    """
    data = {'index': 1, 'clock_limit': 60}
    msg = {'type': 'set_clock_limit', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._clock.limit[1] == 60
    assert bg_server._clock.limit[0] == 120


async def test_set_player_clock_updates_only_target_player(bg_server, req):
    """
    set_player_clock は data.player で指定したプレーヤーの残り時間だけを
    変える。player: 1 を渡して確かめる (player: 0 だと固定と区別が付かない)
    """
    data = {'player': 1, 'clock': [90, 5]}
    msg = {'type': 'set_player_clock', 'data': data, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._clock.clock[1] == [90, 5]
    assert bg_server._clock.clock[0] == [120, 12]


def no_clock_keys(gameinfo):
    """gameinfo にクロックのキーが無いこと (TODO-024)"""
    return ('clock_limit' not in gameinfo
            and 'clock' not in gameinfo['board'])


@pytest.mark.parametrize(
    ('msg_type', 'data', 'get_value', 'value'),
    [
        ('put_checker', {'ch': 5, 'p': 10, 'idx': 0},
         lambda g: g['board']['checker'][0][5], [10, 0]),
        ('cube', {'side': 0, 'value': 2, 'accepted': True},
         lambda g: g['board']['cube'],
         {'side': 0, 'value': 2, 'accepted': True}),
        ('dice', {'player': 1, 'dice': [1, 2, 0, 0]},
         lambda g: g['board']['dice'][1], [1, 2, 0, 0]),
        ('set_turn', {'turn': 0, 'resign': -1},
         lambda g: g['turn'], 0),
        ('set_playername', {'player': 1, 'name': 'Bob'},
         lambda g: g['board']['playername'][1], 'Bob'),
        ('set_score', {'player': 1, 'score': 2},
         lambda g: g['score'][1], 2),
        ('resign', {'player': 0},
         lambda g: g['resign'], 0),
        # クロック系の 4 つ。クロックは gameinfo の外に出した
        # (TODO-024) ので、gameinfo にクロックのキーは戻ってこない。
        # それを見る (状態は clock_state で送られる。
        # そちらは tests/test_clock.py)
        ('set_clock_limit', {'index': 1, 'clock_limit': 30},
         no_clock_keys, True),
        ('set_player_clock', {'player': 1, 'clock': [60, 3]},
         no_clock_keys, True),
        ('set_clock_switch', {'switch': False},
         no_clock_keys, True),
        ('resume_clock', {'player': 1},
         no_clock_keys, True),
    ],
)
async def test_fallthrough_types_send_gameinfo_with_last_op(
        bg_server, req, emitted, msg_type, data, get_value, value):
    """
    末尾へ落ちる type それぞれで、gameinfo が 1 通だけ送られ、
    その last_op が受け取った msg で、gameinfo にはその操作が
    反映されている (TODO-015)。

    受け取った msg をそのまま転送していた形の置き換え。転送をやめても
    「何が起きたか」がクライアントに届くことを、last_op で確かめる。
    """
    msg = {'type': msg_type, 'data': data, 'history': False}
    expected = copy.deepcopy(msg)
    await bg_server.on_json(req, msg)

    sent = emitted.last
    assert len(emitted.messages) == 1
    assert sent['type'] == 'gameinfo'
    assert sent['data']['last_op'] == expected
    assert get_value(sent['data']['gameinfo']) == value
    # sec が付くのはチェッカーが動くときだけ
    assert sent['data']['sec'] == (0.2 if msg_type == 'put_checker' else 0)


# ---------------------------------------------------------------------
# return する型 (back / back2 / back_all / fwd / fwd2 / fwd_all /
# new / set_gameinfo)
#
# これらは末尾まで落ちず、元の msg は last_op として返らない。
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    'msg_type',
    ['back', 'back2', 'back_all', 'fwd', 'fwd2', 'fwd_all',
     'new', 'set_gameinfo'],
)
async def test_returning_types_do_not_broadcast_original_msg(
        bg_server, req, emitted, no_sleep, msg_type, add_history):
    """return する 8 つの type では、元の msg の type は送られない"""
    add_history(bg_server)
    add_history(bg_server)

    if msg_type in ('fwd', 'fwd2', 'fwd_all'):
        # fwd 系は _fwd_hist に積まれていないと forward_hist() の
        # while が回らず、emit が 1 通も起きないまま
        # 「broadcast されない」が空振りで成立してしまう
        await bg_server.backward_hist(-1, sleep_sec=0)

    # 前準備 (backward_hist など) の emit は判定に混ぜない
    emitted.clear()

    data = {'n': 1} if msg_type in ('back', 'fwd') else \
        (bg_server._gameinfo.to_dict()
         if msg_type == 'set_gameinfo' else {})
    msg = {'type': msg_type, 'data': data, 'history': False}
    await bg_server.on_json(req, msg)
    # 連続再生 (n == 0) だけは Task として走るので、あれば完了を待つ
    # (TODO-009)
    if bg_server._replayer._task is not None:
        await bg_server._replayer._task

    # 何かは送られたことを確かめ、空振りで通らないようにする
    assert 'gameinfo' in emitted.types
    assert msg_type not in emitted.types
    # 操作に紐づかない送信なので last_op は付かない (TODO-015)
    assert all(m['data']['last_op'] is None for m in emitted.messages)


async def test_back_moves_history_by_n(bg_server, req, no_sleep, add_history):
    """back は data.n の数だけ履歴を戻す"""
    add_history(bg_server)
    add_history(bg_server)
    hist_len0 = len(bg_server._hist.entries)
    fwd_len0 = len(bg_server._hist.fwd_entries)

    msg = {'type': 'back', 'data': {'n': 2}, 'history': False}
    await bg_server.on_json(req, msg)

    assert len(bg_server._hist.entries) == hist_len0 - 2
    assert len(bg_server._hist.fwd_entries) == fwd_len0 + 2


async def test_back_sends_sec_for_checker_move(bg_server, req, emitted, no_sleep, add_history):
    """back (n > 0) で送られる sec は SEC_CHECKER_MOVE の 0.2 (べた書き)"""
    add_history(bg_server)
    add_history(bg_server)

    msg = {'type': 'back', 'data': {'n': 1}, 'history': False}
    await bg_server.on_json(req, msg)

    assert emitted.last['data']['sec'] == 0.2
    assert emitted.last['data']['history_flag'] is True


async def test_fwd_moves_history_by_n(bg_server, req, no_sleep, add_history):
    """fwd は data.n の数だけ履歴を進める"""
    add_history(bg_server)
    add_history(bg_server)
    await bg_server.backward_hist(2, sleep_sec=0)
    hist_len0 = len(bg_server._hist.entries)
    fwd_len0 = len(bg_server._hist.fwd_entries)

    msg = {'type': 'fwd', 'data': {'n': 2}, 'history': False}
    await bg_server.on_json(req, msg)

    assert len(bg_server._hist.entries) == hist_len0 + 2
    assert len(bg_server._hist.fwd_entries) == fwd_len0 - 2


async def test_fwd_sends_sec_for_checker_move(bg_server, req, emitted, no_sleep, add_history):
    """fwd (n > 0) で送られる sec は SEC_CHECKER_MOVE の 0.2 (べた書き)"""
    add_history(bg_server)
    add_history(bg_server)
    await bg_server.backward_hist(2, sleep_sec=0)

    msg = {'type': 'fwd', 'data': {'n': 1}, 'history': False}
    await bg_server.on_json(req, msg)

    assert emitted.last['data']['sec'] == 0.2
    assert emitted.last['data']['history_flag'] is True


async def test_back_all_leaves_one_entry(
        bg_server, req, emitted, no_sleep, add_history):
    """back_all は履歴の先頭 1 件を残して全部戻り、sec は 0.1 で history_flag は真"""
    add_history(bg_server)
    add_history(bg_server)

    msg = {'type': 'back_all', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)
    # 連続再生 (n == 0) は Task として走るので、完了を待つ
    # (TODO-009)
    await bg_server._replayer._task

    assert len(bg_server._hist.entries) == 1
    assert emitted.last['data']['sec'] == 0.1
    assert emitted.last['data']['history_flag'] is True


async def test_fwd_all_moves_history_to_the_end(bg_server, req, emitted, no_sleep, add_history):
    """fwd_all は履歴の末尾まで全部進め、sec は 0.1 で history_flag は真"""
    add_history(bg_server)
    add_history(bg_server)
    await bg_server.backward_hist(-1, sleep_sec=0)

    msg = {'type': 'fwd_all', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)
    # 連続再生 (n == 0) は Task として走るので、完了を待つ
    # (TODO-009)
    await bg_server._replayer._task

    assert len(bg_server._hist.fwd_entries) == 0
    assert len(bg_server._hist.entries) == 3
    assert emitted.last['data']['sec'] == 0.1
    assert emitted.last['data']['history_flag'] is True


async def test_back2_behaves_like_back_all(
        bg_server, req, no_sleep, add_history):
    """back2 は back_all と同じ動きになる (違いは sleep_sec だけ)"""
    add_history(bg_server)
    add_history(bg_server)

    msg = {'type': 'back2', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)
    # 連続再生 (n == 0) は Task として走るので、完了を待つ
    # (TODO-009)
    await bg_server._replayer._task

    assert len(bg_server._hist.entries) == 1


async def test_fwd2_behaves_like_fwd_all(
        bg_server, req, no_sleep, add_history):
    """fwd2 は fwd_all と同じ動きになる (違いは sleep_sec だけ)"""
    add_history(bg_server)
    add_history(bg_server)
    await bg_server.backward_hist(-1, sleep_sec=0)

    msg = {'type': 'fwd2', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)
    # 連続再生 (n == 0) は Task として走るので、完了を待つ
    # (TODO-009)
    await bg_server._replayer._task

    assert len(bg_server._hist.fwd_entries) == 0
    assert len(bg_server._hist.entries) == 3


async def test_clear_hist_leaves_one_entry(
        bg_server, req, emitted, no_sleep, add_history):
    """clear_hist は履歴を 1 件だけにし、hist_i / hist_n を 1 / 1 で返す"""
    add_history(bg_server)
    add_history(bg_server)
    await bg_server.backward_hist(1, sleep_sec=0)
    emitted.clear()

    msg = {'type': 'clear_hist', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)

    assert len(bg_server._hist.entries) == 1
    assert bg_server._hist.fwd_entries == []

    sent = emitted.last
    assert sent['type'] == 'gameinfo'
    assert sent['data']['hist_i'] == 1
    assert sent['data']['hist_n'] == 1
    # 盤面が動くわけではないので、アニメーションの時間は 0
    assert sent['data']['sec'] == 0
    assert sent['data']['history_flag'] is False
    assert sent['data']['last_op'] is None


async def test_clear_hist_keeps_board(bg_server, req):
    """clear_hist は盤面を変えない"""
    await bg_server.on_json(
        req, {'type': 'put_checker',
              'data': {'ch': 101, 'p': 5, 'idx': 2}, 'history': True})
    before = copy.deepcopy(bg_server._gameinfo.board)

    msg = {'type': 'clear_hist', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.board == before


async def test_clear_hist_stops_running_replay(bg_server, req, add_history):
    """
    走っている連続再生を止めてから消す。

    止めずに消すと、再生の Task が差し替わったあとの _history を
    pop し続ける (TODO-019)。sleep を潰さずに動かし、途中で
    clear_hist を割り込ませる。
    """
    for _ in range(20):
        add_history(bg_server)

    await bg_server.on_json(
        req, {'type': 'back_all', 'data': {}, 'history': False})
    task = bg_server._replayer._task
    await asyncio.sleep(0.25)
    assert not task.done(), '0.1 秒間隔なのでまだ走っているはず'

    await bg_server.on_json(
        req, {'type': 'clear_hist', 'data': {}, 'history': False})

    assert task.cancelled()
    assert len(bg_server._hist.entries) == 1
    assert bg_server._hist.fwd_entries == []

    # 止まった再生が後から動き出して、消した履歴を戻さない
    await asyncio.sleep(0.25)
    assert len(bg_server._hist.entries) == 1


async def test_new_keeps_score_playername_limit_and_resets_board(
        bg_server, req, emitted):
    """
    new は score / playername / game_num / match_score を引き継ぎ、
    盤面を初期配置に戻す。クロックの limit も残る (TODO-024)
    """
    bg_server._gameinfo.score = [3, 5]
    bg_server._gameinfo.board.playername = ['Alice', 'Bob']
    bg_server._gameinfo.game_num = 2
    bg_server._gameinfo.match_score = 7
    bg_server._clock.limit = [60, 6]
    bg_server._gameinfo.put_checker(0, 1, 0)
    hist_len0 = len(bg_server._hist.entries)

    msg = {'type': 'new', 'data': {}, 'history': False}
    await bg_server.on_json(req, msg)

    gameinfo = bg_server._gameinfo
    assert gameinfo.score == [3, 5]
    assert gameinfo.board.playername == ['Alice', 'Bob']
    assert gameinfo.game_num == 2
    assert gameinfo.match_score == 7
    assert bg_server._clock.limit == [60, 6]

    fresh = GameInfo(server_version='test')
    assert gameinfo.board.checker == fresh.board.checker
    assert gameinfo.board.dice == fresh.board.dice
    assert gameinfo.board.cube == fresh.board.cube
    assert gameinfo.turn == fresh.turn
    assert gameinfo.resign == fresh.resign
    # new_game() に svr_ver を渡し忘れると '' になる (TODO-025)
    assert gameinfo.server_version == 'test'

    assert len(bg_server._hist.entries) == hist_len0 + 1

    assert emitted.last['type'] == 'gameinfo'
    assert emitted.last['data']['sec'] == 3
    assert emitted.last['data']['history_flag'] is False
    # emitted に積まれている = broadcast() で全員へ送られた
    assert len(emitted.messages) == 1


async def test_new_after_back_all_clears_fwd_hist(
        bg_server, req, add_history, no_sleep):
    """
    盤面が既に初期配置のときに New Game を送っても、進む側は必ず
    捨てる (TODO-032 のレビューで見つかった不具合)。

    new_game() は score / playername / game_num / match_score を残す
    ので、盤面がすでに初期配置なら New Game 後の gameinfo は直前の
    エントリと sn 以外すべて同じになり、History.add() は積まない。
    それでも _fwd_hist は必ず捨てないと、New Game のあとに
    「進む」を押すと捨てたはずの前のゲームの手が復活してしまう。
    """
    bg_server._gameinfo.put_checker(101, 5, 2)
    add_history(bg_server)

    await bg_server.on_json(
        req, {'type': 'back_all', 'data': {}, 'history': False})
    await bg_server._replayer._task
    assert len(bg_server._hist.fwd_entries) > 0

    await bg_server.on_json(req, {'type': 'new', 'data': {}, 'history': False})

    # 積まれていないこと。ここが 1 件でなくなったら、この筋書きは
    # 「積まないのに進む側を捨てる」分岐を見ていない
    assert len(bg_server._hist.entries) == 1
    assert bg_server._hist.fwd_entries == []

    await bg_server.on_json(
        req, {'type': 'fwd_all', 'data': {}, 'history': False})
    if bg_server._replayer._task is not None:
        await bg_server._replayer._task

    fresh = GameInfo(server_version='test')
    assert bg_server._hist.fwd_entries == []
    assert bg_server._gameinfo.board.checker == fresh.board.checker


async def test_set_gameinfo_replaces_gameinfo(bg_server, req, emitted):
    """
    set_gameinfo は gameinfo (board 以下を含む) を渡した dict で丸ごと
    置き換え、履歴に積む。GameInfo.from_dict() が作り直すので渡した
    dict とは縁が切れ、渡した後に元の dict を書き換えても
    gameinfo は変わらない。
    """
    hist_len0 = len(bg_server._hist.entries)

    new_gameinfo = bg_server._gameinfo.to_dict()
    new_gameinfo['score'] = [9, 9]
    new_gameinfo['board']['playername'] = ['Alice', 'Bob']

    msg = {'type': 'set_gameinfo', 'data': new_gameinfo, 'history': False}
    await bg_server.on_json(req, msg)

    # 渡した dict を after で書き換えても gameinfo は変わらないこと
    new_gameinfo['score'] = [0, 0]
    new_gameinfo['board']['playername'] = ['changed', 'changed']

    assert bg_server._gameinfo.score == [9, 9]
    assert bg_server._gameinfo.board.playername == ['Alice', 'Bob']
    assert len(bg_server._hist.entries) == hist_len0 + 1
    assert emitted.last['type'] == 'gameinfo'


async def test_set_gameinfo_accepts_partial_dict(bg_server, req, emitted):
    """
    set_gameinfo は、キーが欠けた dict でも受ける (TODO-031)。

    GameInfo.from_dict() の既定が strict=False なのは、この経路の
    ため。**ファイルを読むときの strict=True と取り違えて、ここまで
    strict にしないこと。** 欠けたキーは既定値になる。
    """
    msg = {'type': 'set_gameinfo', 'data': {'score': [3, 4]},
           'history': False}
    await bg_server.on_json(req, msg)

    assert bg_server._gameinfo.score == [3, 4]
    # 欠けたキーは既定値
    assert bg_server._gameinfo.turn == 2
    assert bg_server._gameinfo.board.playername == ['', '']
    assert len(bg_server._gameinfo.board.checker[0]) == 15
    assert emitted.last['type'] == 'gameinfo'


# ---------------------------------------------------------------------
# 履歴系で送られるもの
# ---------------------------------------------------------------------

async def test_emit_gameinfo_message_shape(bg_server, req, emitted):
    """emit_gameinfo() が送る msg の形 (src/dst/type/data の各キー)"""
    msg = {'type': 'set_score',
           'data': {'player': 0, 'score': 1}, 'history': True}
    await bg_server.on_json(req, msg)

    # 引数なしで呼んだときの形を確かめる (TODO-015 で last_op が増えた)
    await bg_server.emit_gameinfo()

    sent = emitted.last
    assert sent['src'] == 'server'
    assert sent['dst'] == 'all'
    assert sent['type'] == 'gameinfo'
    data = sent['data']
    assert set(data.keys()) == {
        'gameinfo', 'sec', 'hist_i', 'hist_n', 'history_flag', 'clock_state',
        'last_op'}
    assert set(data['clock_state'].keys()) == {
        'sw', 'active', 'clock', 'limit'}
    # 操作に紐づかない送信では last_op は None (TODO-015)
    assert data['last_op'] is None


async def test_back_moves_hist_i_by_n(
        bg_server, req, emitted, no_sleep, add_history):
    """
    hist_i / hist_n をべた書きの絶対値で固定する。

    bg_server フィクスチャは初期化時に履歴を 1 件積んでいるので、
    add_history() を 2 回呼ぶと履歴は 3 件になる。back を 1 回したら
    hist_i は 3 から 2 に減り、hist_n は 3 のまま変わらない。
    """
    add_history(bg_server)
    add_history(bg_server)

    await bg_server.emit_gameinfo()
    sent = emitted.last
    assert sent['data']['hist_i'] == 3
    assert sent['data']['hist_n'] == 3
    emitted.clear()

    msg = {'type': 'back', 'data': {'n': 1}, 'history': False}
    await bg_server.on_json(req, msg)

    sent = emitted.last
    assert sent['type'] == 'gameinfo'
    assert sent['data']['hist_i'] == 2
    assert sent['data']['hist_n'] == 3


# ---------------------------------------------------------------------
# 登録表に無い type (TODO-026)
# ---------------------------------------------------------------------

async def test_unknown_type_is_ignored(bg_server, req, emitted):
    """
    登録表に無い type は無視する (TODO-026)。

    履歴に積まず、gameinfo も送り返さず、例外も投げない
    (投げないので、受信ループは接続を保ったまま次のメッセージへ進む)。
    TODO-026 より前は、どの if にも当たらないまま末尾へ落ち、
    history フラグ次第で履歴に積まれて gameinfo が返っていた。
    """
    hist_len0 = len(bg_server._hist.entries)
    before = copy.deepcopy(bg_server._gameinfo)

    msg = {'type': 'no_such_type', 'data': {}, 'history': True}
    await bg_server.on_json(req, msg)

    assert emitted.messages == []
    assert len(bg_server._hist.entries) == hist_len0
    assert bg_server._gameinfo == before


async def test_unknown_type_does_not_block_next_msg(
        bg_server, req, emitted):
    """無視したあとも、次のメッセージは普通に処理される"""
    await bg_server.on_json(
        req, {'type': 'no_such_type', 'data': {}, 'history': False})

    await bg_server.on_json(
        req, {'type': 'set_score', 'data': {'player': 1, 'score': 3},
              'history': False})

    assert bg_server._gameinfo.score[1] == 3
    assert emitted.types == ['gameinfo']
