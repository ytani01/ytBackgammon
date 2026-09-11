#
# (c) 2020 Yoichi Tanibayashi
#
"""
conftest.py

テストで共通に使うフィクスチャ。
"""
import asyncio

import pytest

from ytbg.gameinfo import GameInfo
from ytbg.hub import ClientHub
from ytbg.mylog import loggerInit
from ytbg.server import BackgammonServer

# テストでも loggerInit() を 1 度だけ呼ぶ (TODO-005)。呼ばないと loguru の
# 既定ハンドラ (DEBUG) が残り、テスト中の DEBUG がすべて stderr に出る
loggerInit(False)


@pytest.fixture
def bg():
    """GameInfo のインスタンス (盤面そのもの)"""
    return GameInfo(server_version='test')


class EmittedMessages:
    """
    broadcast() の呼び出しを記録し、メッセージの列として見る。

    テストが確かめたいのは「どの msg が何通、どんな順で全員へ
    送られたか」。TODO-009 で通信層が Flask-SocketIO から
    Starlette + 素の WebSocket へ入れ替わり、
    emit('json', msg, broadcast=True) が broadcast(msg) になった。
    TODO-025 で broadcast() は ClientHub へ移ったので、差し替える
    対象もそちらになった。messages / types / last / clear の見方は
    変えていない。

    broadcast() は全員へ送るメソッドそのものなので、ここに積まれた
    msg は全員へ送られたもの。broadcast されたかどうかを
    emit() の kwargs で見分ける必要はなくなった。
    """

    def __init__(self):
        self.calls = []

    def append(self, msg):
        """broadcast() へ渡された msg を積む"""
        self.calls.append(msg)

    @property
    def messages(self):
        """全員へ送られた msg (メッセージ本体) の列"""
        return list(self.calls)

    @property
    def types(self):
        """messages の各要素の 'type' の列"""
        return [m['type'] for m in self.messages]

    @property
    def last(self):
        """messages の最後。無ければ None"""
        msgs = self.messages
        return msgs[-1] if msgs else None

    def clear(self):
        """積んだものを捨てる"""
        self.calls.clear()


@pytest.fixture
def emitted():
    """EmittedMessages のインスタンス"""
    return EmittedMessages()


class FakeClient:
    """
    WebSocket の代わり (TODO-009)。

    send_json() された msg を積む。fail=True なら送信で例外を投げる。
    _clients のキーにするのでハッシュ可能であること
    (types.SimpleNamespace はハッシュ不可で使えない)。
    """

    client = None

    def __init__(self, name='c', fail=False):
        self.name = name
        self.fail = fail
        self.sent = []

    async def send_json(self, msg):
        # 送信は即座に終わるとは限らないので、1 度は他へ制御を渡す
        await asyncio.sleep(0)
        if self.fail:
            raise RuntimeError(f'{self.name}: send failed')
        self.sent.append(msg)

    @property
    def types(self):
        """送られた msg の 'type' の列"""
        return [m['type'] for m in self.sent]


@pytest.fixture
def req():
    """
    on_json(ws, msg) の第 1 引数 (WebSocket) の代わり。

    on_json() は client_name(ws) をログに出すだけで、未登録の
    WebSocket なら '?' になるので、FakeClient をそのまま使う。
    名前を 'req' にしてあるのは、'request' が pytest の予約済み
    フィクスチャ名で上書きできないため
    (実測: "'request' is a reserved word for fixtures")。
    """
    return FakeClient('req')


@pytest.fixture
def make_client():
    """
    FakeClient を作る。

    テスト側が conftest を import しなくて済むように、フィクスチャで
    渡す (conftest の直接 import は tests/__init__.py を足すと壊れる)。
    """
    return FakeClient


@pytest.fixture
def no_sleep(monkeypatch):
    """
    asyncio.sleep の待ち時間を 0 にする。

    on_json() の back_all / back2 / fwd_all / fwd2 は backward_hist(0) /
    forward_hist(0, sleep_sec=.5) を呼ぶので、テスト側から sleep_sec を
    渡せない。

    何もしない関数にはしない。連続再生は Task として走っており、
    他の Task へ制御を渡す必要があるので、本物の asyncio.sleep(0) を
    呼ぶ (TODO-009)。

    asyncio は stdlib のモジュールそのものなので、この差し替えは
    テストの間プロセス全体の asyncio.sleep に効く。monkeypatch が
    テスト終了後に元へ戻す。
    """
    real_sleep = asyncio.sleep

    async def fake_sleep(*_args, **_kwargs):
        await real_sleep(0)

    monkeypatch.setattr(asyncio, 'sleep', fake_sleep)


@pytest.fixture
def make_bg_server(tmp_path, monkeypatch, emitted):
    """
    BackgammonServer を、呼んだときに作るフィクスチャ。

    - DATAFILE_DIR を tmp_path に差し替え、利用者の
      ~/ytbg-* を読み書きしないようにする
    - ClientHub.broadcast() を差し替え、全員へ送られた msg を
      emitted へ積む。**クラスごと差し替える**ので、同じテストで
      create_app() を使うと、TestClient 側の送信まで止まる

    保存したファイルを先に置いてから起動するテスト (TODO-024) は、
    作る時点を自分で決める必要があるので、bg_server ではなく
    こちらを使う。
    """
    monkeypatch.setattr(
        BackgammonServer, 'DATAFILE_DIR', str(tmp_path))

    async def fake_broadcast(_self, msg):
        emitted.append(msg)

    monkeypatch.setattr(ClientHub, 'broadcast', fake_broadcast)

    def make(svr_id='test'):
        return BackgammonServer(svr_ver='test', svr_id=svr_id)

    return make


@pytest.fixture
def bg_server(make_bg_server):
    """BackgammonServer のインスタンス"""
    return make_bg_server()


@pytest.fixture
def bg_server_raw(tmp_path, monkeypatch):
    """
    broadcast() を差し替えていない BackgammonServer。

    broadcast() の中身と、接続の出入り (on_connect / on_disconnect) を
    確かめるテスト用 (TODO-009)。送信先は FakeClient を _hub._clients
    へ直接入れて用意する。DATAFILE_DIR を tmp_path に差し替えるのは
    bg_server と同じ。
    """
    monkeypatch.setattr(
        BackgammonServer, 'DATAFILE_DIR', str(tmp_path))

    return BackgammonServer(svr_ver='test', svr_id='test')
