#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_datafile_dir.py

保存先の決まり方 (TODO-021、TODO-055)。

ブラウザでの動作確認 (tests/browser/) はサーバを実プロセスとして
起動するので、環境変数 YTBG_DATA_DIR で保存先を逃がしている。
それが効くことをここで見る。保存先は BackgammonServer を作るときに
読むので、環境変数を差し替えてから作ればよい。
"""
import pytest

from ytbg.server import BackgammonServer


@pytest.fixture
def datafile_path(monkeypatch):
    """環境変数を差し替えてサーバを作り、そのときの保存先を返す"""
    def make(**env):
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        return BackgammonServer(svr_ver='test', svr_id='test')._datafile_path
    return make


def test_ytbg_data_dir(datafile_path, tmp_path):
    """YTBG_DATA_DIR があれば、そちらを使う (JSON Lines)"""
    assert datafile_path(YTBG_DATA_DIR=str(tmp_path), HOME='/home/dummy') \
        == f'{tmp_path}/ytbg-test.jsonl'


def test_no_ytbg_data_dir(datafile_path, tmp_path):
    """YTBG_DATA_DIR が無ければ HOME"""
    assert datafile_path(YTBG_DATA_DIR=None, HOME=str(tmp_path)) \
        == f'{tmp_path}/ytbg-test.jsonl'


def test_empty_ytbg_data_dir(datafile_path, tmp_path):
    """YTBG_DATA_DIR が空文字なら HOME (or でつないでいるため)"""
    assert datafile_path(YTBG_DATA_DIR='', HOME=str(tmp_path)) \
        == f'{tmp_path}/ytbg-test.jsonl'


def test_read_when_created(monkeypatch, tmp_path):
    """
    import したあとで環境変数を変えても効く (TODO-055)。

    前はクラス変数で、import のときに 1 度だけ決まっていた。
    """
    first = tmp_path / 'first'
    second = tmp_path / 'second'
    first.mkdir()
    second.mkdir()

    monkeypatch.setenv('YTBG_DATA_DIR', str(first))
    BackgammonServer(svr_ver='test', svr_id='test')
    monkeypatch.setenv('YTBG_DATA_DIR', str(second))
    svr = BackgammonServer(svr_ver='test', svr_id='test')

    assert svr._datafile_path == f'{second}/ytbg-test.jsonl'
