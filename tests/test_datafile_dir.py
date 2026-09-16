#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_datafile_dir.py

保存先の決まり方 (TODO-021、TODO-055、TODO-076)。

置き場所を決めるのは __main__.py の paths.resolve() だけで
(優先順位は tests/test_paths.py が見る)、BackgammonServer は
渡された保存先にファイル名を付けるだけ。
"""

from ytbg.server import BackgammonServer


def test_datafile_path(tmp_path):
    """保存先 + ytbg-{server_id}.jsonl (JSON Lines)"""
    svr = BackgammonServer(svr_ver='test', svr_id='test', data_dir=tmp_path)

    assert svr._datafile_path == tmp_path / 'ytbg-test.jsonl'


def test_data_dir_is_made_when_saving(tmp_path):
    """
    保存先のディレクトリは、書くときに無ければ作る (TODO-076)。

    無い所を渡して起動すると、初回の保存がそこを作る。
    """
    data_dir = tmp_path / 'base' / 'data'

    svr = BackgammonServer(svr_ver='test', svr_id='test', data_dir=data_dir)

    assert svr._datafile_path == data_dir / 'ytbg-test.jsonl'
    assert svr._datafile_path.exists()
