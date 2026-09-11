#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_history.py
"""
import copy

from ytbg.gameinfo import GameInfo


def test_add_history_appends_with_incrementing_sn(bg_server):
    """add_history() は sn を 1 ずつ増やしながら履歴に積む"""
    hist_len0 = len(bg_server._hist.entries)

    gameinfo = bg_server._gameinfo
    bg_server.add_history(gameinfo)

    assert len(bg_server._hist.entries) == hist_len0 + 1
    assert bg_server._hist.entries[-1].sn == hist_len0 + 1
    assert bg_server._hist.fwd_entries == []


async def test_backward_and_forward_hist(bg_server):
    """backward_hist() / forward_hist() が履歴を行き来する"""
    bg_server.add_history(bg_server._gameinfo)
    bg_server.add_history(bg_server._gameinfo)
    hist_len = len(bg_server._hist.entries)

    await bg_server.backward_hist(1, sleep_sec=0)
    assert len(bg_server._hist.entries) == hist_len - 1
    assert len(bg_server._hist.fwd_entries) == 1

    await bg_server.forward_hist(1, sleep_sec=0)
    assert len(bg_server._hist.entries) == hist_len
    assert len(bg_server._hist.fwd_entries) == 0


async def test_backward_hist_all(bg_server):
    """n < 0 なら履歴の先頭 1 件を残して全部戻る"""
    bg_server.add_history(bg_server._gameinfo)
    bg_server.add_history(bg_server._gameinfo)

    await bg_server.backward_hist(-1, sleep_sec=0)

    assert len(bg_server._hist.entries) == 1


def test_history_entry_is_gameinfo(bg_server):
    """履歴に積まれるのは GameInfo (TODO-024)"""
    h = bg_server._hist.entries[-1]

    assert isinstance(h, GameInfo)
    assert h.sn == 1
    assert len(h.board.checker[0]) == 15


async def test_clear_history_leaves_only_current(bg_server):
    """clear_history() は今の盤面 1 件だけを残し、sn を 1 に振り直す"""
    bg_server.add_history(bg_server._gameinfo)
    bg_server.add_history(bg_server._gameinfo)
    await bg_server.backward_hist(1, sleep_sec=0)
    assert len(bg_server._hist.fwd_entries) == 1

    await bg_server.clear_history()

    assert len(bg_server._hist.entries) == 1
    assert bg_server._hist.entries[0].sn == 1
    assert bg_server._hist.fwd_entries == []


async def test_clear_history_keeps_board(bg_server):
    """clear_history() は盤面を変えない"""
    bg_server._gameinfo.put_checker(101, 5, 2)
    bg_server.add_history(bg_server._gameinfo)
    before = copy.deepcopy(bg_server._gameinfo.board)

    await bg_server.clear_history()

    assert bg_server._gameinfo.board == before
    # 残った 1 件も今の盤面
    assert bg_server._hist.entries[0].board == before


async def test_clear_history_saves_data(bg_server):
    """clear_history() のあとは、保存したファイルからも 1 件しか読めない"""
    bg_server.add_history(bg_server._gameinfo)
    bg_server.add_history(bg_server._gameinfo)

    await bg_server.clear_history()
    [hist_len, fwd_len] = bg_server.load_data()

    assert hist_len == 1
    assert fwd_len == 0


async def test_add_history_after_clear_restarts_sn(bg_server):
    """clear_history() のあとに積むと、sn は 2 から続く"""
    bg_server.add_history(bg_server._gameinfo)
    await bg_server.clear_history()

    bg_server.add_history(bg_server._gameinfo)

    assert [h.sn for h in bg_server._hist.entries] == [1, 2]
