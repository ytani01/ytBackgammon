#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_history.py
"""
import copy

from ytbg.gameinfo import GameInfo
from ytbg.history import History


def test_add_history_appends_with_incrementing_sn(bg_server):
    """add_history() は sn を 1 ずつ増やしながら履歴に積む"""
    hist_len0 = len(bg_server._hist.entries)

    gameinfo = bg_server._gameinfo
    # 直前と同じ盤面は積まないので (TODO-032)、1 手ぶん変えてから積む
    gameinfo.game_num += 1
    bg_server.add_history(gameinfo)

    assert len(bg_server._hist.entries) == hist_len0 + 1
    assert bg_server._hist.entries[-1].sn == hist_len0 + 1
    assert bg_server._hist.fwd_entries == []


async def test_backward_and_forward_hist(bg_server, add_history):
    """backward_hist() / forward_hist() が履歴を行き来する"""
    add_history(bg_server)
    add_history(bg_server)
    hist_len = len(bg_server._hist.entries)

    await bg_server.backward_hist(1, sleep_sec=0)
    assert len(bg_server._hist.entries) == hist_len - 1
    assert len(bg_server._hist.fwd_entries) == 1

    await bg_server.forward_hist(1, sleep_sec=0)
    assert len(bg_server._hist.entries) == hist_len
    assert len(bg_server._hist.fwd_entries) == 0


async def test_backward_hist_all(bg_server, add_history):
    """n < 0 なら履歴の先頭 1 件を残して全部戻る"""
    add_history(bg_server)
    add_history(bg_server)

    await bg_server.backward_hist(-1, sleep_sec=0)

    assert len(bg_server._hist.entries) == 1


def test_history_entry_is_gameinfo(bg_server):
    """履歴に積まれるのは GameInfo (TODO-024)"""
    h = bg_server._hist.entries[-1]

    assert isinstance(h, GameInfo)
    assert h.sn == 1
    assert len(h.board.checker[0]) == 15


async def test_clear_history_leaves_only_current(bg_server, add_history):
    """clear_history() は今の盤面 1 件だけを残し、sn を 1 に振り直す"""
    add_history(bg_server)
    add_history(bg_server)
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


async def test_clear_history_saves_data(bg_server, add_history):
    """clear_history() のあとは、保存したファイルからも 1 件しか読めない"""
    add_history(bg_server)
    add_history(bg_server)

    await bg_server.clear_history()
    [hist_len, fwd_len] = bg_server.load_data()

    assert hist_len == 1
    assert fwd_len == 0


async def test_add_history_after_clear_restarts_sn(bg_server, add_history):
    """clear_history() のあとに積むと、sn は 2 から続く"""
    add_history(bg_server)
    await bg_server.clear_history()

    add_history(bg_server)

    assert [h.sn for h in bg_server._hist.entries] == [1, 2]


def test_history_add_skips_same_entry():
    """
    1 つ前のエントリと sn 以外が同じなら積まない (TODO-032)。

    set_clock_limit のように gameinfo を書き換えない type が
    history: true で届いても、無駄なエントリが増えないようにするため。
    _fwd_hist がもともと空なら、戻り値 (履歴が変わったか) も False。
    """
    hist = History()
    gameinfo = GameInfo(server_version='test')
    assert hist.add(gameinfo) is True

    added = hist.add(gameinfo)

    assert added is False
    assert len(hist.entries) == 1


def test_history_add_skips_same_entry_but_clears_fwd_hist():
    """
    同じエントリを積もうとしても、_fwd_hist は必ず捨てる (TODO-032)。

    New Game のように、いまの盤面がたまたま直前のエントリと sn 以外
    同じになる操作でも、利用者の意図は「進む側を捨てる」こと
    (レビューで見つかった不具合)。_fwd_hist を実際に捨てたので、
    戻り値 (履歴が変わったか) は True になる。
    """
    hist = History()
    gameinfo = GameInfo(server_version='test')
    hist.add(gameinfo)

    gameinfo2 = gameinfo.copy()
    gameinfo2.game_num += 1
    hist.add(gameinfo2)

    hist.back()
    assert len(hist.fwd_entries) == 1

    # いまの entries[-1] と同じ内容 (sn 以外) のものを積もうとする
    same_as_top = hist.entries[-1].copy()
    added = hist.add(same_as_top)

    assert added is True
    assert hist.fwd_entries == []


def test_history_add_adds_when_board_changes():
    """
    直前と sn 以外にも違いがあれば積む (game_num を目印に変える)。
    """
    hist = History()
    gameinfo = GameInfo(server_version='test')
    hist.add(gameinfo)

    gameinfo.game_num += 1
    added = hist.add(gameinfo)

    assert added is True
    assert len(hist.entries) == 2


def test_history_add_when_board_changes_clears_fwd_hist():
    """盤面が違えば積み、進む側は捨てる (対になるテスト)"""
    hist = History()
    gameinfo = GameInfo(server_version='test')
    hist.add(gameinfo)

    gameinfo.game_num += 1
    hist.add(gameinfo)

    hist.back()
    assert len(hist.fwd_entries) == 1

    gameinfo.game_num += 1
    added = hist.add(gameinfo)

    assert added is True
    assert len(hist.entries) == 2
    assert hist.fwd_entries == []
