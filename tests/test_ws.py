#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_ws.py

create_app() で作ったアプリのテスト (TODO-025)。

HTTP のルート ('/', '/p1', '/p2', '/static') と、WebSocket の経路
そのものを見る。Starlette の TestClient で直接つなぐ。
プロセスを起こさないので、受信ループの受け皿 (JSON として読めない、
on_json() の中の例外) まで見られる。

TestClient は同期なので、ここのテストだけ async def ではない。
"""
import queue
import threading

import pytest
from starlette.testclient import TestClient

from ytbg.app import create_app
from ytbg.server import BackgammonServer


@pytest.fixture
def client(tmp_path, monkeypatch):
    """
    create_app() で作ったアプリの TestClient。

    DATAFILE_DIR を tmp_path へ逃がすのは他のテストと同じ。
    BackgammonServer は create_app() の中で作られるので、差し替えは
    その前に済ませる。
    """
    monkeypatch.setattr(
        BackgammonServer, 'DATAFILE_DIR', str(tmp_path))

    app = create_app('test', 'test', 'test', 'images1a')
    return TestClient(app)


# 受信を待つ上限 (秒)。接続が切れていると receive_json() は永久に
# 待つので、別スレッドで呼んで打ち切る。**壊して確かめるときに
# テストがハングしないため** (TODO-025)
RECV_TIMEOUT = 5.0


def recv_json(ws, timeout=RECV_TIMEOUT):
    """
    ws.receive_json() を、待ちすぎたら失敗にする。

    TestClient の receive_json() には待ち時間の上限が無い。受信を
    daemon のスレッドに投げ、返ってこなければテストを落とす。
    ThreadPoolExecutor だと、待たせたままのスレッドを終了時に
    待ってしまうので使わない。
    """
    result: queue.Queue = queue.Queue(maxsize=1)

    def recv():
        try:
            result.put(('ok', ws.receive_json()))
        except BaseException as e:  # noqa: BLE001
            result.put(('ng', e))

    threading.Thread(target=recv, daemon=True).start()
    try:
        status, value = result.get(timeout=timeout)
    except queue.Empty:
        pytest.fail(f'receive_json(): {timeout} 秒待っても届かない')

    if status == 'ng':
        raise value
    return value


def put_checker_msg(ch=0, p=5, idx=0):
    """チェッカーを動かすメッセージ"""
    return {'src': 'test', 'type': 'put_checker',
            'data': {'ch': ch, 'p': p, 'idx': idx}, 'history': False}


def test_index_routes(client):
    """'/', '/p1', '/p2' がいずれも同じ index.html を返す"""
    bodies = []
    for path in ('/', '/p1', '/p2'):
        res = client.get(path)
        assert res.status_code == 200, path
        bodies.append(res.text)

    assert bodies[0] == bodies[1] == bodies[2]


def test_index_has_image_dir(client):
    """create_app() に渡した画像ディレクトリが埋め込まれる

    要素は js/dom.js が作るようになったので (TODO-029)、index.html に
    出てくるのは <body> の data-image-dir と背景画像だけ。
    """
    res = client.get('/')

    assert res.status_code == 200
    assert 'data-image-dir="images1a"' in res.text
    assert '/static/images1a/bg.png' in res.text


def test_static_files(client):
    """/static/ の下のファイルが返る"""
    res = client.get('/static/images1a/board-base.png')

    assert res.status_code == 200
    assert len(res.content) > 0


def test_static_no_cache(client):
    """/static/ の下には Cache-Control: no-cache が付く (TODO-028)"""
    res = client.get('/static/js/main.js')

    assert res.status_code == 200
    assert res.headers['cache-control'] == 'no-cache'


def test_connect_sends_gameinfo(client):
    """つないだ直後に gameinfo が 1 通届く"""
    with client.websocket_connect('/ws') as ws:
        msg = recv_json(ws)

    assert msg['type'] == 'gameinfo'
    assert msg['data']['gameinfo']['turn'] == 2


def test_operation_reaches_all_clients(client):
    """操作を送ると、送った本人にも他のクライアントにも gameinfo が返る"""
    with client.websocket_connect('/ws') as ws1:
        recv_json(ws1)          # 自分の接続ぶん

        with client.websocket_connect('/ws') as ws2:
            # 2 本目の接続でも全員へ送られる
            recv_json(ws1)
            recv_json(ws2)

            ws1.send_json(put_checker_msg(ch=0, p=5, idx=0))

            for ws in (ws1, ws2):
                msg = recv_json(ws)
                assert msg['type'] == 'gameinfo'
                checker = msg['data']['gameinfo']['board']['checker']
                assert checker[0][0] == [5, 0]
                assert msg['data']['last_op']['type'] == 'put_checker'


def test_broken_json_keeps_connection(client):
    """JSON として読めないものを送っても、接続は切れない"""
    with client.websocket_connect('/ws') as ws:
        recv_json(ws)

        ws.send_text('this is not json')

        # 捨てられるだけで、次のメッセージは普通に処理される
        ws.send_json(put_checker_msg(ch=1, p=4, idx=0))
        msg = recv_json(ws)

        assert msg['type'] == 'gameinfo'
        checker = msg['data']['gameinfo']['board']['checker']
        assert checker[0][1] == [4, 0]


def test_error_in_on_json_keeps_connection(client):
    """on_json() の中で例外が起きても、接続は切れない"""
    with client.websocket_connect('/ws') as ws:
        recv_json(ws)

        # data に 'ch' が無いので、on_json() の中で KeyError になる
        ws.send_json({'src': 'test', 'type': 'put_checker',
                      'data': {}, 'history': False})

        ws.send_json(put_checker_msg(ch=2, p=3, idx=0))
        msg = recv_json(ws)

        assert msg['type'] == 'gameinfo'
        checker = msg['data']['gameinfo']['board']['checker']
        assert checker[0][2] == [3, 0]


def test_disconnect_removes_client(client):
    """切断すると、接続中のクライアントから外れる"""
    svr = client.app.state.svr

    with client.websocket_connect('/ws') as ws:
        recv_json(ws)
        assert svr._hub.count() == 1

    # with を抜けると切れる。受信ループの finally が on_disconnect() を
    # 呼ぶまで待つため、もう 1 本つないでから数える
    with client.websocket_connect('/ws') as ws2:
        recv_json(ws2)
        assert svr._hub.count() == 1


def test_unknown_type_keeps_connection(client):
    """
    登録表に無い type を送っても、無視されるだけで接続は切れない
    (TODO-026)。

    無視されたメッセージには何も返らないので、そのあとに送った
    put_checker の gameinfo が最初に届く。
    """
    with client.websocket_connect('/ws') as ws:
        recv_json(ws)

        ws.send_json({'src': 'test', 'type': 'no_such_type',
                      'data': {}, 'history': True})

        ws.send_json(put_checker_msg(ch=3, p=7, idx=0))
        msg = recv_json(ws)

        assert msg['type'] == 'gameinfo'
        assert msg['data']['last_op']['type'] == 'put_checker'
        checker = msg['data']['gameinfo']['board']['checker']
        assert checker[0][3] == [7, 0]
##
