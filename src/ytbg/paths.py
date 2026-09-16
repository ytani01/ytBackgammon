#
# (c) 2026 Yoichi Tanibayashi
#
"""
paths.py

置き場所の解決 (TODO-076)。

基準のディレクトリを ``--dir`` > 環境変数 ``YTBG_DIR`` > ``~/.ytbg`` で
決め、その下の ``ytbg.toml`` の ``[path]`` を見て data / log / images の
場所を返す::

    [path]
    data = "/var/lib/ytbg"   # 絶対パス
    log = "log"              # 相対パスなら基準からの相対
    images = "images"

基準は設定ファイルでは変えられない (設定ファイル自身が基準の下にある)。
設定ファイルが無ければ、すべて基準の下の同じ名前のディレクトリ。

ここは場所を返すだけで、ディレクトリを作りもしない (書くときに作る。
``log`` は lobby がボードのログを開くときに作る。TODO-078)。
"""

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .mylog import getLogger

_log = getLogger('paths')

DEFAULT_BASE = '~/.ytbg'
CONFIG_NAME = 'ytbg.toml'

# [path] に書けるキー。省略すれば基準の下の同じ名前のディレクトリ
KEYS = ('data', 'log', 'images')


class ConfigError(Exception):
    """設定ファイルの誤り。メッセージはそのまま利用者に見せる"""


@dataclass(frozen=True)
class Paths:
    """解決した置き場所"""

    base: Path
    config: Path
    data: Path
    log: Path
    images: Path


def _path_table(config: Path) -> dict[str, str]:
    """
    設定ファイルの [path] を読む。無いファイルは {} (既定で動く)。

    壊れたファイルと [path] の誤りは ConfigError。
    """
    if not config.exists():
        return {}

    try:
        with config.open('rb') as f:
            data: dict[str, Any] = tomllib.load(f)
    except OSError as e:
        raise ConfigError(f'{config}: {e.strerror}') from e
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f'{config}: {e}') from e

    table = data.get('path', {})
    if not isinstance(table, dict):
        raise ConfigError(f'{config}: [path]: not a table')

    unknown = set(table) - set(KEYS)
    if unknown:
        raise ConfigError(f'{config}: [path]: unknown key {sorted(unknown)}')

    for key, val in table.items():
        if not isinstance(val, str):
            raise ConfigError(f'{config}: [path]: "{key}" must be str')

    return table


def resolve(cli_dir: str | None = None,
            cli_config: str | None = None) -> Paths:
    """
    置き場所を決める。

    Parameters
    ----------
    cli_dir: str | None
        CLI の --dir。無ければ環境変数 YTBG_DIR、それも無ければ ~/.ytbg
    cli_config: str | None
        CLI の -c。無ければ <基準>/ytbg.toml
    """
    base = Path(cli_dir or os.getenv('YTBG_DIR') or DEFAULT_BASE).expanduser()
    config = (Path(cli_config).expanduser() if cli_config
              else base / CONFIG_NAME)

    table = _path_table(config)
    # 絶対パスなら base / は右側そのものになるので、分けなくてよい
    sub = {key: base / Path(table.get(key, key)).expanduser()
           for key in KEYS}

    paths = Paths(base=base, config=config, **sub)
    _log.debug('paths={}', paths)
    return paths
