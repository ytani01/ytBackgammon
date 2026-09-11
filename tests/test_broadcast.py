#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_broadcast.py

broadcast() の中身と、接続の出入り (on_connect / on_disconnect) の
テスト (TODO-009)。

他のテストは bg_server フィクスチャが broadcast() を丸ごと差し替えて
いるので、送信ループそのものは動いていない。ここでは差し替えていない
bg_server_raw を使い、_clients へ FakeClient を直接入れて確かめる。
"""


async def test_broadcast_reaches_all_clients_even_if_one_fails(
        bg_server_raw, make_client):
    """真ん中のクライアントが例外を投げても、残り 2 つには届く"""
    c0 = make_client('c0')
    c1 = make_client('c1', fail=True)
    c2 = make_client('c2')
    for i, c in enumerate([c0, c1, c2]):
        bg_server_raw._hub._clients[c] = f'c{i}'

    msg = {'src': 'server', 'type': 'gameinfo', 'data': {}}
    await bg_server_raw._hub.broadcast(msg)

    assert c0.sent == [msg]
    assert c2.sent == [msg]
    assert c1.sent == []


async def test_broadcast_keeps_failed_client(bg_server_raw, make_client):
    """
    送信に失敗したクライアントは _clients に残る。

    _clients から外すのは受信ループの finally (on_disconnect) の担当、
    という判断をここで固定する (TODO-009)。
    """
    c0 = make_client('c0')
    c1 = make_client('c1', fail=True)
    bg_server_raw._hub._clients[c0] = 'c0'
    bg_server_raw._hub._clients[c1] = 'c1'

    msg = {'type': 'gameinfo', 'data': {}}
    await bg_server_raw._hub.broadcast(msg)

    # 送信が試みられて、片方だけが失敗したこと
    assert c0.sent == [msg]
    assert c1.sent == []
    assert set(bg_server_raw._hub._clients) == {c0, c1}


async def test_broadcast_keeps_order_per_client(bg_server_raw, make_client):
    """
    broadcast() を順に (前のを await してから次を) 呼べば、各
    クライアントにはその順で届く。

    broadcast() は 1 回の中では並行に送るが、全員への送信が終わるまで
    返らないため (TODO-009)。**同時に 2 箇所から broadcast() を
    呼んだ場合は、この限りではない**(再生 Task と受信ループが同時に
    呼ぶ場面がある)。
    """
    c0 = make_client('c0')
    c1 = make_client('c1')
    bg_server_raw._hub._clients[c0] = 'c0'
    bg_server_raw._hub._clients[c1] = 'c1'

    for i in range(5):
        await bg_server_raw._hub.broadcast({'type': f'msg{i}', 'data': {}})

    expected = [f'msg{i}' for i in range(5)]
    assert c0.types == expected
    assert c1.types == expected


async def test_on_connect_registers_and_sends_gameinfo_to_all(
        bg_server_raw, make_client):
    """
    on_connect() は _clients に足し、gameinfo を **全員へ** 送る。

    送信元だけに送る実装に変えると、先にいた c0 に届かず落ちる。
    """
    c0 = make_client('c0')
    bg_server_raw._hub._clients[c0] = 'c0'

    newcomer = make_client('new')
    await bg_server_raw.on_connect(newcomer)

    assert newcomer in bg_server_raw._hub._clients
    assert newcomer.types == ['gameinfo']
    # 先につないでいたクライアントにも届く
    assert c0.types == ['gameinfo']


async def test_on_disconnect_removes_client(bg_server_raw, make_client):
    """on_disconnect() は _clients から外し、以後は送らない"""
    c0 = make_client('c0')
    c1 = make_client('c1')
    await bg_server_raw.on_connect(c0)
    await bg_server_raw.on_connect(c1)
    assert len(bg_server_raw._hub._clients) == 2

    await bg_server_raw.on_disconnect(c0)

    assert c0 not in bg_server_raw._hub._clients
    assert set(bg_server_raw._hub._clients) == {c1}

    n0 = len(c0.sent)
    await bg_server_raw._hub.broadcast({'type': 'gameinfo', 'data': {}})
    assert len(c0.sent) == n0


async def test_on_disconnect_unknown_client_is_ignored(bg_server_raw, make_client):
    """登録されていない WebSocket を渡しても壊れない"""
    c0 = make_client('c0')
    await bg_server_raw.on_connect(c0)

    await bg_server_raw.on_disconnect(make_client('other'))

    assert set(bg_server_raw._hub._clients) == {c0}
