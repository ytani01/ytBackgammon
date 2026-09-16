#
# (c) 2026 Yoichi Tanibayashi
#
"""
test_cli.py

CLI の置き場所と、board が設定ファイルから取る値 (TODO-076)。

サーバは起動しないので、_run() を差し替えて渡された引数を見る。
"""
import pytest
from click.testing import CliRunner

import ytbg.__main__ as cli
from ytbg.__main__ import main

BOARD = '''
[[board]]
server_id = "1"
port = 5011
image_dir = "images2"
'''


@pytest.fixture
def run(monkeypatch, tmp_path):
    """
    _run() を差し替えて board を起動し、渡された引数を返す。
    """
    called = {}
    real_create_app = cli.create_app

    def fake_create_app(name, ver, svr_id, image_dir, data_dir, prefix=''):
        called['image_dir'] = image_dir
        return real_create_app(name, ver, svr_id, image_dir, data_dir, prefix)

    def fake_run(app, port, debug):
        called['port'] = port
        called['app'] = app

    monkeypatch.setattr(cli, 'create_app', fake_create_app)
    monkeypatch.setattr(cli, '_run', fake_run)
    monkeypatch.setenv('YTBG_DIR', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))

    def go(*args):
        res = CliRunner().invoke(main, ['board', *args])
        assert res.exit_code == 0, res.output
        return called

    return go


def write_config(tmp_path, text):
    path = tmp_path / 'ytbg.toml'
    path.write_text(text, encoding='utf-8')
    return path


def test_defaults(run):
    """設定ファイルが無ければ、これまでの既定"""
    called = run('1')

    assert called['port'] == cli.DEFAULT_PORT
    assert called['image_dir'] == cli.DEFAULT_IMAGE_DIR
    assert called['app'].state.svr._svr_id == '1'


def test_config_board(run, tmp_path):
    """設定に同じ server_id があれば、その port と image_dir を使う"""
    write_config(tmp_path, BOARD)

    called = run('1')

    assert (called['port'], called['image_dir']) == (5011, 'images2')


def test_cli_beats_config(run, tmp_path):
    """CLI で指定されていれば CLI が勝つ"""
    write_config(tmp_path, BOARD)

    called = run('1', '-p', '5099', '-i', 'images0a')

    assert (called['port'], called['image_dir']) == (5099, 'images0a')


def test_other_server_id(run, tmp_path):
    """設定に無い server_id は、これまでの既定"""
    write_config(tmp_path, BOARD)

    called = run('9')

    assert (called['port'], called['image_dir']) == (
        cli.DEFAULT_PORT, cli.DEFAULT_IMAGE_DIR)


def test_data_dir_follows_dir_option(monkeypatch, tmp_path):
    """--dir はデータの保存先まで効く (環境変数より強い)"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path / 'env'))
    monkeypatch.setenv('HOME', str(tmp_path))
    called = {}

    monkeypatch.setattr(
        cli, '_run', lambda app, port, debug: called.update(app=app))

    res = CliRunner().invoke(
        main, ['board', '--dir', str(tmp_path / 'cli'), '1'])

    assert res.exit_code == 0, res.output
    assert called['app'].state.svr._datafile_path == \
        tmp_path / 'cli' / 'data' / 'ytbg-1.jsonl'


def test_config_option(run, tmp_path):
    """board の -c で指した設定ファイルの [[board]] と [path] が効く"""
    cfg = tmp_path / 'other' / 'my.toml'
    cfg.parent.mkdir()
    cfg.write_text(BOARD + '[path]\ndata = "d"\n', encoding='utf-8')

    called = run('1', '-c', str(cfg))

    assert called['port'] == 5011
    assert called['app'].state.svr._datafile_path == \
        tmp_path / 'd' / 'ytbg-1.jsonl'


def test_other_entry_error(run, tmp_path):
    """他の項目が壊れていても、自分の項目が読めれば起動する (TODO-076)"""
    write_config(tmp_path, BOARD + '''
[[board]]
server_id = "2"
image_dir = "images0a"
''')

    assert run('1')['port'] == 5011


def test_own_entry_error(run, tmp_path):
    """自分の項目が壊れていれば、起動する前に止まる"""
    write_config(tmp_path, BOARD.replace('port = 5011\n', ''))

    res = CliRunner().invoke(main, ['board', '1'])

    assert res.exit_code != 0
    assert '"port" is required' in res.output


def test_broken_config(run, tmp_path):
    """設定ファイルが壊れていれば、起動する前に止まる"""
    write_config(tmp_path, '[path\n')

    res = CliRunner().invoke(main, ['board', '1'])

    assert res.exit_code != 0
    assert 'ytbg.toml' in res.output


def test_lobby_no_board(monkeypatch, tmp_path):
    """lobby は [[board]] が 1 つも無ければ止まる"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    write_config(tmp_path, '[path]\ndata = "d"\n')

    res = CliRunner().invoke(main, ['lobby'])

    assert res.exit_code != 0
    assert 'no [[board]]' in res.output


def test_lobby_default_config(monkeypatch, tmp_path):
    """lobby の -c の既定は <基準>/ytbg.toml"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    write_config(tmp_path, BOARD)
    boards = {}

    monkeypatch.setattr(
        cli, 'create_lobby_app',
        lambda bs, debug, prefix, paths: boards.update(bs=bs, paths=paths))
    monkeypatch.setattr(cli, '_run', lambda app, port, debug: None)

    res = CliRunner().invoke(main, ['lobby'])

    assert res.exit_code == 0, res.output
    assert [b.port for b in boards['bs']] == [5011]
    assert boards['paths'].config == tmp_path / 'ytbg.toml'


def test_lobby_passes_config_to_boards(monkeypatch, tmp_path):
    """lobby は -c で読んだ設定ファイルを、子のボードへも渡す"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    cfg = tmp_path / 'other.toml'
    cfg.write_text(BOARD, encoding='utf-8')
    boards = {}

    monkeypatch.setattr(
        cli, 'create_lobby_app',
        lambda bs, debug, prefix, paths: boards.update(paths=paths))
    monkeypatch.setattr(cli, '_run', lambda app, port, debug: None)

    res = CliRunner().invoke(main, ['lobby', '-c', str(cfg)])

    assert res.exit_code == 0, res.output
    assert boards['paths'].config == cfg
