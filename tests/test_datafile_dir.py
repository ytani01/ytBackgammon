#
# (c) Yoichi Tanibayashi
#
"""
test_datafile_dir.py

保存先 (ytBackgammonServer.DATAFILE_DIR) の決まり方 (TODO-021)。

ブラウザでの動作確認 (tests/browser/) はサーバを実プロセスとして
起動するので、conftest.py のように DATAFILE_DIR を monkeypatch では
差し替えられない。環境変数 YTBG_DATA_DIR で逃がしているので、
それが効くことをここで見る。
"""
import importlib

import pytest

import ytbg.yt_backgammon_server as server_module


@pytest.fixture
def datafile_dir(monkeypatch):
    """
    環境変数を差し替えて yt_backgammon_server を読み直し、
    そのときの DATAFILE_DIR を返す。

    DATAFILE_DIR はクラス変数なので、import のときに 1 度だけ決まる。
    値を見るには読み直すしかない。

    読み直すと ytBackgammonServer クラスは別のオブジェクトになるが、
    conftest.py の bg_server / bg_server_raw は import した時点の
    クラスを掴んでいるので、そちらの monkeypatch とは食い違わない。
    それでも後始末で環境変数を戻して読み直し、モジュールを元の状態に
    しておく。
    """
    def reload_with(**env):
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)

        module = importlib.reload(server_module)
        return module.ytBackgammonServer.DATAFILE_DIR

    yield reload_with

    # 環境変数を戻してから読み直す (monkeypatch の後始末はこの後なので、
    # ここで自分で戻す)
    monkeypatch.undo()
    importlib.reload(server_module)


def test_ytbg_data_dir(datafile_dir, tmp_path):
    """YTBG_DATA_DIR があれば、そちらを使う"""
    assert datafile_dir(YTBG_DATA_DIR=str(tmp_path),
                        HOME='/home/dummy') == str(tmp_path)


def test_no_ytbg_data_dir(datafile_dir):
    """YTBG_DATA_DIR が無ければ HOME"""
    assert datafile_dir(YTBG_DATA_DIR=None, HOME='/home/dummy') \
        == '/home/dummy'


def test_empty_ytbg_data_dir(datafile_dir):
    """YTBG_DATA_DIR が空文字なら HOME (or でつないでいるため)"""
    assert datafile_dir(YTBG_DATA_DIR='', HOME='/home/dummy') \
        == '/home/dummy'


def test_datafile_path(datafile_dir, tmp_path):
    """保存先のパスが YTBG_DATA_DIR の下になる"""
    datafile_dir(YTBG_DATA_DIR=str(tmp_path))

    svr = server_module.ytBackgammonServer(
        svr_name='test', svr_ver='test', svr_id='test',
        image_dir='images1a')

    assert svr._datafile_path == f'{tmp_path}/ytbg-test.json'
