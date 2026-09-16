#
# (c) 2026 Yoichi Tanibayashi
#
"""
test_paths.py

置き場所の解決 (TODO-076)。

優先順位は、基準が CLI の --dir > 環境変数 YTBG_DIR > ~/.ytbg で、
data / log / images は設定ファイルの [path] > 基準の下の同じ名前。
"""
import pytest

from ytbg.paths import ConfigError, resolve


@pytest.fixture(autouse=True)
def _no_env(monkeypatch, tmp_path):
    """利用者の ~/.ytbg を見ないように、既定の環境を消しておく"""
    monkeypatch.delenv('YTBG_DIR', raising=False)
    monkeypatch.setenv('HOME', str(tmp_path / 'home'))


def write_config(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return path


def test_default(tmp_path):
    """何も無ければ ~/.ytbg の下"""
    paths = resolve()
    home = tmp_path / 'home' / '.ytbg'

    assert paths.base == home
    assert paths.config == home / 'ytbg.toml'
    assert (paths.data, paths.log, paths.images) == (
        home / 'data', home / 'log', home / 'images')


def test_env(monkeypatch, tmp_path):
    """環境変数 YTBG_DIR は既定より強い"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path / 'env'))

    assert resolve().data == tmp_path / 'env' / 'data'


def test_cli_dir_beats_env(monkeypatch, tmp_path):
    """CLI の --dir は環境変数より強い"""
    monkeypatch.setenv('YTBG_DIR', str(tmp_path / 'env'))

    paths = resolve(str(tmp_path / 'cli'))

    assert paths.base == tmp_path / 'cli'
    assert paths.config == tmp_path / 'cli' / 'ytbg.toml'


def test_tilde(monkeypatch, tmp_path):
    """~ は展開する"""
    monkeypatch.setenv('YTBG_DIR', '~/env')

    assert resolve().base == tmp_path / 'home' / 'env'


def test_config_path(tmp_path):
    """設定ファイルは CLI の -c > <基準>/ytbg.toml"""
    assert resolve(str(tmp_path), str(tmp_path / 'other.toml')).config \
        == tmp_path / 'other.toml'


def test_config_paths(tmp_path):
    """[path] は基準の下の既定より強い。相対パスは基準からの相対"""
    write_config(tmp_path / 'ytbg.toml', '''
[path]
data = "/var/lib/ytbg"
log = "logs/board"
''')

    paths = resolve(str(tmp_path))

    assert paths.data.as_posix() == '/var/lib/ytbg'
    assert paths.log == tmp_path / 'logs' / 'board'
    # 書かなかったものは既定のまま
    assert paths.images == tmp_path / 'images'


def test_config_path_tilde(tmp_path):
    """[path] の ~ も展開する"""
    write_config(tmp_path / 'ytbg.toml', '[path]\ndata = "~/d"\n')

    assert resolve(str(tmp_path)).data == tmp_path / 'home' / 'd'


def test_cli_config_is_read(tmp_path):
    """-c で渡した設定ファイルの [path] を読む"""
    cfg = write_config(tmp_path / 'sub' / 'my.toml',
                       '[path]\ndata = "d"\n')

    assert resolve(str(tmp_path), str(cfg)).data == tmp_path / 'd'


def test_board_config_only(tmp_path):
    """[[board]] しか無い設定ファイルでも、既定で動く"""
    write_config(tmp_path / 'ytbg.toml',
                 '[[board]]\nserver_id = "1"\nport = 5001\n'
                 'image_dir = "images1"\n')

    assert resolve(str(tmp_path)).data == tmp_path / 'data'


@pytest.mark.parametrize(('text', 'msg'), [
    ('[path\n', 'ytbg.toml: '),
    ('path = 1', '[path]: not a table'),
    ('[path]\ndate = "d"', "[path]: unknown key ['date']"),
    ('[path]\ndata = 1', '[path]: "data" must be str'),
])
def test_config_error(tmp_path, text, msg):
    write_config(tmp_path / 'ytbg.toml', text)

    with pytest.raises(ConfigError) as e:
        resolve(str(tmp_path))

    assert msg in str(e.value)
