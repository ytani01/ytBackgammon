#
# (c) Yoichi Tanibayashi
#
"""
test_history.py
"""


def test_add_history_appends_with_incrementing_sn(bg_server):
    """add_history() は sn を 1 ずつ増やしながら履歴に積む"""
    hist_len0 = len(bg_server._history)

    gameinfo = bg_server._bg._gameinfo
    bg_server.add_history(gameinfo)

    assert len(bg_server._history) == hist_len0 + 1
    assert bg_server._history[-1]['sn'] == hist_len0 + 1
    assert bg_server._fwd_hist == []


def test_backward_and_forward_hist(bg_server):
    """backward_hist() / forward_hist() が履歴を行き来する"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)
    hist_len = len(bg_server._history)

    bg_server.backward_hist(1, sleep_sec=0)
    assert len(bg_server._history) == hist_len - 1
    assert len(bg_server._fwd_hist) == 1

    bg_server.forward_hist(1, sleep_sec=0)
    assert len(bg_server._history) == hist_len
    assert len(bg_server._fwd_hist) == 0


def test_backward_hist_all(bg_server):
    """n < 0 なら履歴の先頭 1 件を残して全部戻る"""
    bg_server.add_history(bg_server._bg._gameinfo)
    bg_server.add_history(bg_server._bg._gameinfo)

    bg_server.backward_hist(-1, sleep_sec=0)

    assert len(bg_server._history) == 1


def test_hist_ent2str_contains_sn(bg_server):
    """hist_ent2str() が sn を含む JSON 風の文字列を作る"""
    h = bg_server._history[-1]
    s = bg_server.hist_ent2str(h)

    assert f'"sn": {h["sn"]}' in s
    assert '"checker"' in s
