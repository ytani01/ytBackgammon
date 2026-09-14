#
# (c) 2026 Yoichi Tanibayashi
#
"""
test_lobby.py

lobby (TODO-063) の設定の読み込みと、子プロセスの起動・停止。

子プロセスのテストは lobby を実プロセスで起動し、HTTP の API で操作する。
保存先は YTBG_DATA_DIR で tmp_path へ逃がし、ポートは OS に選ばせる。
"""
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

from ytbg.lobby import BoardConfig, ConfigError, load_config

VALID = '''
[[board]]
server_id = "1"
port = 5001
image_dir = "images2"

[[board]]
server_id = "2"
port = 5002
image_dir = "images0a"
url = "https://ytbg2.example.net/"
'''


def write(tmp_path, text):
    path = tmp_path / 'ytbg.toml'
    path.write_text(text, encoding='utf-8')
    return path


def test_load_config(tmp_path):
    assert load_config(write(tmp_path, VALID)) == [
        BoardConfig('1', 5001, 'images2'),
        BoardConfig('2', 5002, 'images0a', 'https://ytbg2.example.net/'),
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
    ('', 'no [[board]]'),
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
    (BOARD + 'url = "/board1/"', '"url" must start with http'),
    (BOARD + 'url = "ytbg1.example.net/"', '"url" must start with http'),
    (BOARD + 'url = "ftp://ytbg1.example.net/"', '"url" must start with'),
    (BOARD + 'url = "http://"', '"url" must start with http'),
    (BOARD + 'url = "http://[::1"', '"url" is invalid'),
    (BOARD + 'url = "http://h:99999/"', '"url" is invalid'),
    (BOARD + 'url = "http://h:abc/"', '"url" is invalid'),
    (BOARD + 'url = "http://exa mple/"', '"url" must not contain spaces'),
    ('[[board]]\nserver_id = "1"\nport = "5001"\nimage_dir = "x"',
     '"port" must be int'),
    ('[[board]]\nserver_id = "1"\nport = true\nimage_dir = "x"',
     '"port" must be int'),
    ('[[board]]\nserver_id = "1"\nport = 70000\nimage_dir = "x"',
     '"port" is out of range'),
    (BOARD + 'url = 1', '"url" must be str'),
    (BOARD + 'imagedir = "x"', "unknown key ['imagedir']"),
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
                env=os.environ | {'YTBG_DATA_DIR': str(tmp_path)},
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
