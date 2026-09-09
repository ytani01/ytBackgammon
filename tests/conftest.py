#
# (c) Yoichi Tanibayashi
#
"""
conftest.py

テストで共通に使うフィクスチャ。
"""
import pytest

from ytbg import yt_backgammon_server
from ytbg.mylog import loggerInit
from ytbg.yt_backgammon import ytBackgammon
from ytbg.yt_backgammon_server import ytBackgammonServer

# テストでも loggerInit() を 1 度だけ呼ぶ (TODO-005)。呼ばないと loguru の
# 既定ハンドラ (DEBUG) が残り、テスト中の DEBUG がすべて stderr に出る
loggerInit(False)


@pytest.fixture
def bg():
    """ytBackgammon のインスタンス"""
    return ytBackgammon(svr_ver='test')


@pytest.fixture
def emitted():
    """emit(event, data, **kwargs) の呼び出し引数を記録するリスト"""
    return []


@pytest.fixture
def bg_server(tmp_path, monkeypatch, emitted):
    """
    ytBackgammonServer のインスタンス。

    - DATAFILE_DIR を tmp_path に差し替え、利用者の
      ~/ytbg-*.json を読み書きしないようにする
    - emit をモジュール直下で差し替え、呼び出し引数を
      emitted へ積む
    """
    monkeypatch.setattr(
        ytBackgammonServer, 'DATAFILE_DIR', str(tmp_path))

    def fake_emit(event, data=None, **kwargs):
        emitted.append((event, data, kwargs))

    monkeypatch.setattr(yt_backgammon_server, 'emit', fake_emit)

    return ytBackgammonServer(
        svr_name='test', svr_ver='test', svr_id='test',
        image_dir='images1a')
