#
# (c) 2026 Yoichi Tanibayashi
#
"""
test_lobby.py

lobby (TODO-063) の設定の読み込みと、子プロセスの起動・停止。

子プロセスのテストは lobby を実プロセスで起動し、HTTP の API で操作する。
保存先は YTBG_DIR で tmp_path へ逃がし、ポートは OS に選ばせる。
"""
import asyncio
import contextlib
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

import pytest
from click.testing import CliRunner
from starlette.testclient import TestClient

from ytbg.__main__ import main
from ytbg.app import normalize_prefix
from ytbg.lobby import (
    BoardConfig,
    BoardProcess,
    ConfigError,
    board_config,
    create_lobby_app,
    load_config,
)
from ytbg.paths import resolve

VALID = '''
[[board]]
server_id = "1"
port = 5001
image_dir = "images2"

[[board]]
server_id = "2"
port = 5002
image_dir = "images0a"
prefix = "/board2"
'''


def write(tmp_path, text):
    path = tmp_path / 'ytbg.toml'
    path.write_text(text, encoding='utf-8')
    return path


def test_load_config(tmp_path):
    assert load_config(write(tmp_path, VALID)) == [
        BoardConfig('1', 5001, 'images2'),
        BoardConfig('2', 5002, 'images0a', '/board2'),
    ]


def test_load_config_int_server_id(tmp_path):
    """server_id は整数も受け、文字列に直す"""
    boards = load_config(write(tmp_path, BOARD.replace('"1"', '1')))
    assert boards == [BoardConfig('1', 5001, 'images2')]


def test_repo_config():
    """リポジトリのトップの ytbg.toml も読める"""
    boards = load_config('ytbg.toml')
    assert [(b.server_id, b.port, b.image_dir) for b in boards] == [
        ('1', 5001, 'images2'), ('2', 5002, 'images0a'),
        ('3', 5003, 'images1a'), ('4', 5004, 'images3'),
    ]


BOARD = '[[board]]\nserver_id = "1"\nport = 5001\nimage_dir = "images2"\n'


@pytest.mark.parametrize(('text', 'msg'), [
    ('board = 1', 'no [[board]]'),
    ('[[board]]\nport = 5001\nimage_dir = "x"', '"server_id" is required'),
    ('[[board]]\nserver_id = "1"\nimage_dir = "x"', '"port" is required'),
    ('[[board]]\nserver_id = "1"\nport = 5001', '"image_dir" is required'),
    ('[[board]]\nserver_id = true\nport = 5001\nimage_dir = "x"',
     '"server_id" must be str or int'),
    ('[[board]]\nserver_id = 1.5\nport = 5001\nimage_dir = "x"',
     '"server_id" must be str or int'),
    ('[[board]]\nserver_id = ""\nport = 5001\nimage_dir = "x"',
     '"server_id" must not be empty'),
    ('[[board]]\nserver_id = "a/b"\nport = 5001\nimage_dir = "x"',
     'contain "/"'),
    (BOARD + 'prefix = "a//b"', '"prefix": invalid prefix'),
    (BOARD + 'prefix = "/a/../b"', '"prefix": invalid prefix'),
    (BOARD + 'prefix = 1', '"prefix" must be str'),
    ('[[board]]\nserver_id = "1"\nport = "5001"\nimage_dir = "x"',
     '"port" must be int'),
    ('[[board]]\nserver_id = "1"\nport = true\nimage_dir = "x"',
     '"port" must be int'),
    ('[[board]]\nserver_id = "1"\nport = 70000\nimage_dir = "x"',
     '"port" is out of range'),
    (BOARD + 'imagedir = "x"', "unknown key ['imagedir']"),
    (BOARD + 'url = "https://example.net/"', "unknown key ['url']"),
    (BOARD + BOARD.replace('5001', '5002'), 'duplicate server_id: 1'),
    (BOARD + BOARD.replace('5001', '5002').replace('"1"', '1'),
     'duplicate server_id: 1'),
    (BOARD + BOARD.replace('"1"', '"2"'), 'duplicate port: 5001'),
    ('[[board]\n', 'ytbg.toml: '),
])
def test_load_config_error(tmp_path, text, msg):
    with pytest.raises(ConfigError) as e:
        load_config(write(tmp_path, text))
    assert msg in str(e.value)


def test_load_config_prefix(tmp_path):
    """prefix は揃えて持つ (TODO-064)"""
    boards = load_config(write(
        tmp_path, BOARD + 'prefix = "board1/"\n'))
    assert boards == [BoardConfig('1', 5001, 'images2', '/board1')]
    # 書かなければ prefix 無し
    assert load_config(write(tmp_path, BOARD))[0].prefix == ''


@pytest.mark.parametrize(('value', 'expected'), [
    ('', ''), ('/', ''), ('foo', '/foo'), ('/foo', '/foo'),
    ('/foo/', '/foo'), ('a/b.c/d_e~-1', '/a/b.c/d_e~-1'), ('..a', '/..a'),
])
def test_normalize_prefix(value, expected):
    assert normalize_prefix(value) == expected


@pytest.mark.parametrize('value', [
    'a//b', '/./', '/foo/..', 'a b', 'a"b', '<x>', 'a?b', 'a%20b', 'あ',
])
def test_normalize_prefix_error(value):
    with pytest.raises(ValueError):
        normalize_prefix(value)


@pytest.mark.parametrize('cmd', [['board', 'x'], ['lobby']])
def test_cli_bad_prefix(cmd):
    """--prefix の誤りは click のエラー (起動する前に止まる)"""
    res = CliRunner().invoke(main, [*cmd, '--prefix', 'a//b'])
    assert res.exit_code == 2
    assert 'invalid prefix' in res.output


@pytest.mark.parametrize(('prefix', 'expected'), [
    ('/board1', ['--prefix', '/board1']), ('', []),
])
async def test_start_passes_prefix(monkeypatch, prefix, expected):
    """lobby は子プロセスへ --prefix を渡す (prefix が無ければ渡さない)"""
    cmds = []
    kws = []

    async def fake_exec(*cmd, **kw):
        cmds.append(list(cmd))
        kws.append(kw)
        return FakeProc()

    class FakeProc:
        pid = 1
        returncode = None

        async def wait(self):
            await asyncio.Event().wait()

    monkeypatch.setattr(asyncio, 'create_subprocess_exec', fake_exec)
    p = BoardProcess(BoardConfig('1', 5001, 'images2', prefix))
    await p.start()
    assert p._watch is not None
    p._watch.cancel()

    args = cmds[0][cmds[0].index('board') + 1:]
    assert args == ['-p', '5001', '-i', 'images2', *expected, '--', '1']
    # paths が無ければ lobby の stdout と stderr をそのまま使う (TODO-078)
    assert kws[0] == {'stdout': None, 'stderr': None}


async def test_start_passes_paths(monkeypatch, tmp_path):
    """
    置き場所を渡されたら、子プロセスへ --dir と -c で渡す (TODO-076)。

    基準の外のファイルを lobby の -c で指したときも、その [path] が
    ボードに効くようにするため。**環境変数ではなく引数で渡す。**
    """
    cmds = []
    kws = []

    async def fake_exec(*cmd, **kw):
        cmds.append(list(cmd))
        kws.append(kw)
        return FakeProc()

    class FakeProc:
        pid = 1
        returncode = None

        async def wait(self):
            await asyncio.Event().wait()

    monkeypatch.setattr(asyncio, 'create_subprocess_exec', fake_exec)
    paths = resolve(str(tmp_path), str(tmp_path / 'my.toml'))
    p = BoardProcess(BoardConfig('1', 5001, 'images2'), paths=paths)
    await p.start()
    assert p._watch is not None
    p._watch.cancel()

    args = cmds[0][cmds[0].index('board') + 1:]
    assert args == ['-p', '5001', '-i', 'images2',
                    '--dir', str(tmp_path), '-c', str(tmp_path / 'my.toml'),
                    '--', '1']

    # stdout と stderr は log/board-<server_id>.log へ (TODO-078)
    out = kws[0]['stdout']
    assert out.name == str(tmp_path / 'log' / 'board-1.log')
    assert kws[0]['stderr'] == asyncio.subprocess.STDOUT
    # _wait() を cancel したので、閉じるのはテスト側 (二重に閉じても無害)
    out.close()


def test_lobby_prefix_routes():
    """lobby 自身の prefix の下に一覧ページ・API・static を置く"""
    # with を使わないので lifespan は走らず、子プロセスは起動しない
    client = TestClient(create_lobby_app(
        [BoardConfig('1', 5001, 'images2', '/board1')], prefix='/lb'))
    page = client.get('/lb/')
    assert page.status_code == 200
    assert 'src="/lb/static/js/lobby.js"' in page.text
    assert 'url(/lb/static/images1a/bg.png)' in page.text
    assert '"/static/' not in page.text
    assert client.get('/lb/static/js/lobby.js').status_code == 200
    boards = client.get('/lb/api/boards').json()
    assert boards[0]['prefix'] == '/board1'
    for path in ('/', '/api/boards', '/static/js/lobby.js'):
        assert client.get(path).status_code == 404, path


def test_board_redirect():
    """prefix のあるボードへのパスは、ボード自身のポートへ 302 で飛ぶ
    (lobby 自身の --prefix の外でも受ける)"""
    client = TestClient(create_lobby_app(
        [BoardConfig('1', 5001, 'images2', '/board1')], prefix='/lb'),
        follow_redirects=False)
    res = client.get('/board1/index.html?sound=off')
    assert res.status_code == 302
    assert res.headers['location'] == \
        'http://testserver:5001/board1/index.html?sound=off'

    res = client.get('/board1/')
    assert res.status_code == 302
    assert res.headers['location'] == 'http://testserver:5001/board1/'


@pytest.mark.parametrize('text', ['[path]\ndata = "d"\n', 'board = []\n'])
def test_load_config_no_board_table(tmp_path, text):
    """
    [[board]] が 1 つも無い設定ファイルは空のリスト (TODO-076)。

    [path] だけを書いた設定ファイルを board が読むため。**書かなくても
    空のリストを書いても同じ**で、ボードが要るかどうかは呼ぶ側
    (lobby のコマンド) が決める。
    """
    assert load_config(write(tmp_path, text)) == []


# --- board_config(): 自分の項目だけを見る (TODO-076) ---------------------

BROKEN = BOARD.replace('"1"', '"2"').replace('port = 5001\n', '')


def test_board_config(tmp_path):
    """server_id が合う [[board]] を返す"""
    assert board_config(write(tmp_path, BOARD), '1') \
        == BoardConfig('1', 5001, 'images2')


def test_board_config_not_found(tmp_path):
    """合うものが無ければ None"""
    assert board_config(write(tmp_path, BOARD), '9') is None


def test_board_config_no_file(tmp_path):
    """設定ファイルが無ければ None"""
    assert board_config(tmp_path / 'none.toml', '1') is None


@pytest.mark.parametrize('text', [BOARD + BROKEN, BROKEN + BOARD])
def test_board_config_ignores_other_entries(tmp_path, text):
    """
    他の項目が壊れていても、自分の項目が読めれば止まらない。

    ytbg.toml は lobby のためにボードが並ぶファイルなので、他のボードの
    誤りで起動できなくなるのを避ける。壊れた項目が自分より前にあっても同じ。
    """
    assert board_config(write(tmp_path, text), '1') \
        == BoardConfig('1', 5001, 'images2')


def test_board_config_own_entry_error(tmp_path):
    """自分の項目が壊れていれば、これまでどおりエラー"""
    with pytest.raises(ConfigError) as e:
        board_config(write(tmp_path, BOARD + BROKEN), '2')

    assert '"port" is required' in str(e.value)


def test_load_config_sees_every_entry(tmp_path):
    """lobby (load_config) は全部の項目を見る"""
    with pytest.raises(ConfigError):
        load_config(write(tmp_path, BOARD + BROKEN))


def test_load_config_no_file(tmp_path):
    with pytest.raises(ConfigError):
        load_config(tmp_path / 'none.toml')


# --- 実プロセス ---------------------------------------------------------

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def wait_for(get, ok, timeout=20.0):
    limit = time.monotonic() + timeout
    while True:
        with contextlib.suppress(OSError):
            val = get()
            if ok(val):
                return val
        if time.monotonic() > limit:
            raise AssertionError('timeout')
        time.sleep(0.2)


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


class Lobby:
    def __init__(self, tmp_path, ports):
        conf = ''.join(
            f'[[board]]\nserver_id = "b{i}"\nport = {p}\n'
            f'image_dir = "images1a"\n'
            for i, p in enumerate(ports))
        cfg = write(tmp_path, conf)
        self.port = free_port()
        self.stderr = tmp_path / 'lobby.log'
        with self.stderr.open('wb') as err:
            self.proc = subprocess.Popen(
                [sys.executable, '-m', 'ytbg', 'lobby',
                 '-c', str(cfg), '-p', str(self.port)],
                env=os.environ | {'YTBG_DIR': str(tmp_path)},
                stdout=err, stderr=err, start_new_session=True)

    def request(self, path, method='GET'):
        req = urllib.request.Request(
            f'http://127.0.0.1:{self.port}{path}', method=method)
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.load(res)

    def boards(self):
        return {b['server_id']: b for b in self.request('/api/boards')}

    def close(self):
        """テストが止め損ねたときの後始末。グループごと止める"""
        with contextlib.suppress(ProcessLookupError):
            os.killpg(self.proc.pid, signal.SIGKILL)
        self.proc.wait()


@pytest.fixture
def lobby_factory(tmp_path):
    made = []

    def make(ports):
        lb = Lobby(tmp_path, ports)
        made.append(lb)
        return lb

    yield make
    for lb in made:
        lb.close()


def all_listening(bs):
    return all(b['listening'] for b in bs.values())


def test_start_stop(lobby_factory):
    lb = lobby_factory([free_port(), free_port()])
    boards = wait_for(lb.boards, all_listening)
    pid0 = boards['b0']['pid']
    assert alive(pid0)

    # 動作中のボードに start を送っても、起動し直さない
    res = lb.request('/api/boards/b0/start', 'POST')
    assert res['pid'] == pid0
    assert res['listening'] is True

    res = lb.request('/api/boards/b0/stop', 'POST')
    assert res['running'] is False
    assert res['listening'] is False
    assert res['pid'] is None
    assert not alive(pid0)
    assert lb.boards()['b1']['listening'] is True

    res = lb.request('/api/boards/b0/start', 'POST')
    assert res['running'] is True
    # 起動した直後は、まだ listen していない (起動中)
    assert res['listening'] is False
    assert res['pid'] != pid0
    assert alive(res['pid'])
    wait_for(lb.boards, all_listening)


@pytest.mark.parametrize('action', ['start', 'stop'])
def test_unknown_server_id(lobby_factory, action):
    lb = lobby_factory([free_port()])
    wait_for(lb.boards, all_listening)
    with pytest.raises(urllib.error.HTTPError) as e:
        lb.request(f'/api/boards/nothing/{action}', 'POST')
    assert e.value.code == 404


@pytest.mark.parametrize('sig', [signal.SIGTERM, signal.SIGINT])
def test_lobby_stops_boards(lobby_factory, sig):
    """lobby を止めると、ボードの子プロセスも止まる"""
    lb = lobby_factory([free_port(), free_port()])
    # ボードが listen するまで待つ (起動の途中で止めるのを避ける)
    boards = wait_for(lb.boards, all_listening)
    pids = [b['pid'] for b in boards.values()]
    assert all(alive(p) for p in pids)

    # lobby だけに送る (端末の Ctrl+C のようにグループへは送らない)
    lb.proc.send_signal(sig)
    lb.proc.wait(timeout=20)

    wait_for(lambda: pids, lambda ps: not any(alive(p) for p in ps),
             timeout=10)


def test_board_cannot_start(lobby_factory):
    """ポートが塞がっていると停止中になり、終了コードがログに出る"""
    with socket.socket() as busy:
        busy.bind(('0.0.0.0', 0))
        busy.listen()
        lb = lobby_factory([busy.getsockname()[1]])
        boards = wait_for(lb.boards, lambda bs: bs['b0']['running'] is False)
        assert boards['b0']['listening'] is False

    wait_for(lambda: lb.stderr.read_text(encoding='utf-8'),
             lambda s: re.search(r'server_id=b0: exited .*returncode=[1-9]', s))


def test_board_log_file(lobby_factory, tmp_path):
    """
    lobby が起動したボードの出力は log/board-<server_id>.log に残る
    (TODO-078)。起動し直しても消さずに追記する
    """
    lb = lobby_factory([free_port()])
    wait_for(lb.boards, all_listening)

    log = tmp_path / 'log' / 'board-b0.log'
    first = wait_for(lambda: log.read_text(encoding='utf-8'), bool)

    lb.request('/api/boards/b0/stop', 'POST')
    lb.request('/api/boards/b0/start', 'POST')
    wait_for(lb.boards, all_listening)
    wait_for(lambda: log.read_text(encoding='utf-8'),
             lambda s: s.startswith(first) and len(s) > len(first))



async def test_start_closes_log_on_error(monkeypatch, tmp_path):
    """
    起動そのものが失敗したら、開いたログファイルを閉じる (TODO-078)。

    この経路は _wait() が走らないので、閉じるのは start() の側。
    """
    opened = []

    async def fake_exec(*_cmd, stdout=None, **_kw):
        opened.append(stdout)
        raise OSError('boom')

    monkeypatch.setattr(asyncio, 'create_subprocess_exec', fake_exec)
    p = BoardProcess(BoardConfig('1', 5001, 'images2'),
                     paths=resolve(str(tmp_path)))
    with pytest.raises(OSError):
        await p.start()

    assert opened[0].closed
