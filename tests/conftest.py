#
# (c) Yoichi Tanibayashi
#
"""
conftest.py

テストで共通に使うフィクスチャ。
"""
import types

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


class EmittedMessages:
    """
    emit() の呼び出しを記録し、'json' イベントのメッセージ列として見る。

    on_json() が見ているのは flask_socketio.emit() ではなく、それが
    送る 'json' イベントの中身 (msg) であり、テストが確かめたいのも
    「どの msg が何通、どんな順で送られたか」。TODO-009 で通信層が
    Starlette + 素の WebSocket へ入れ替わっても、送信の仕組みが変わる
    だけで「on_json がどの msg を送るべきか」は変わらないはずなので、
    このクラスの形はそのまま残し、fake_emit の差し替え方だけを
    直せばテスト側は書き換えずに済む、という意図で分けている。
    """

    def __init__(self):
        self.calls = []

    def append(self, event, data=None, **kwargs):
        self.calls.append((event, data, kwargs))

    @property
    def messages(self):
        """event == 'json' で送られた data (メッセージ本体) の列"""
        return [data for event, data, _kwargs in self.calls
                if event == 'json']

    @property
    def types(self):
        """messages の各要素の 'type' の列"""
        return [m['type'] for m in self.messages]

    @property
    def kwargs(self):
        """event == 'json' の呼び出しごとの kwargs の列 (messages と同じ並び)"""
        return [kwargs for event, _data, kwargs in self.calls
                if event == 'json']

    @property
    def last(self):
        """messages の最後。無ければ None"""
        msgs = self.messages
        return msgs[-1] if msgs else None

    @property
    def last_kwargs(self):
        """kwargs の最後。無ければ None"""
        kw = self.kwargs
        return kw[-1] if kw else None

    def clear(self):
        """積んだものを捨てる"""
        self.calls.clear()


@pytest.fixture
def emitted():
    """EmittedMessages のインスタンス"""
    return EmittedMessages()


@pytest.fixture
def req():
    """
    on_json(request, msg) の第 1 引数の代わり。

    on_json() は request.sid をログに出すだけなので、これで足りる。
    'request' は pytest の予約済みフィクスチャ名で上書きできないため
    (実測: "'request' is a reserved word for fixtures")、'req' にしている。
    """
    return types.SimpleNamespace(sid='test-sid')


@pytest.fixture
def no_sleep(monkeypatch):
    """
    yt_backgammon_server.time.sleep を何もしない関数に差し替える。

    on_json() の back_all / back2 / fwd_all / fwd2 は backward_hist(0) /
    forward_hist(0, sleep_sec=.5) を呼ぶので、テスト側から sleep_sec を
    渡せない。gevent.monkey.patch_all() は呼ばず、monkeypatch で
    テスト終了後に元へ戻す。

    yt_backgammon_server.time は stdlib の time モジュールそのものなので、
    この差し替えはテストの間プロセス全体の time.sleep に効く
    (yt_backgammon_server モジュールの中だけには閉じていない)。
    """
    def fake_sleep(*_args, **_kwargs):
        pass

    monkeypatch.setattr(yt_backgammon_server.time, 'sleep', fake_sleep)


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
        emitted.append(event, data, **kwargs)

    monkeypatch.setattr(yt_backgammon_server, 'emit', fake_emit)

    return ytBackgammonServer(
        svr_name='test', svr_ver='test', svr_id='test',
        image_dir='images1a')
