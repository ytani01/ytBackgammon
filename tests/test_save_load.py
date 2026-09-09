#
# (c) Yoichi Tanibayashi
#
"""
test_save_load.py
"""
import copy


def test_save_and_load_roundtrip(bg_server, tmp_path):
    """
    save_data() で書いた内容を load_data() で読み戻せる。

    hist_ent2str() は 'board.roll' を出力しないので、
    保存前後でそのキーだけは失われる（既知の差異。報告済み）。
    それ以外のキーが一致することを見る。
    """
    bg_server.add_history(bg_server._bg._gameinfo)
    path = str(tmp_path / 'roundtrip.json')
    bg_server.save_data(path)

    saved_history = copy.deepcopy(bg_server._history)
    for h in saved_history:
        h['board'].pop('roll', None)

    bg_server._history = []
    bg_server._fwd_hist = []
    bg_server._bg._gameinfo = {}

    hist_len, fwd_len = bg_server.load_data(path)

    assert hist_len == len(saved_history)
    assert fwd_len == 0
    assert bg_server._history == saved_history
    assert bg_server._bg._gameinfo == saved_history[-1]


def test_load_data_missing_file_returns_zero(bg_server, tmp_path):
    """存在しないファイルを読ませると (0, 0) を返す"""
    path = str(tmp_path / 'not-exist.json')

    hist_len, fwd_len = bg_server.load_data(path)

    assert (hist_len, fwd_len) == (0, 0)
