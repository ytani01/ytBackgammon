#!/usr/bin/env python3
#
# (c) 2020 Yoichi Tanibayashi
#
"""
__main__.py

エントリポイント。click の group で、サブコマンドは 2 つ (TODO-063)。

- ``ytbg board SERVER_ID``: ボード 1 面のサーバ。ルーティングと
  WebSocket の受信ループは app.py の create_app()
- ``ytbg lobby -c ytbg.toml``: 設定のボードを子プロセスとして起動し、
  一覧ページを出すサーバ。中身は lobby.py
"""

import click
import uvicorn

from . import __prog_name__, __version__
from .app import create_app, normalize_prefix
from .lobby import board_config, create_lobby_app, load_config
from .mylog import getLogger, loggerInit
from .paths import ConfigError, resolve

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}

_log = getLogger('main')


def _run(app, port, debug):
    """
    uvicorn で動かす (TODO-009)。ping は uvicorn の既定
    (ws_ping_interval = 20 秒) に任せる。

    --debug はログレベルと、uvicorn のアクセスログ (access_log)
    だけに効く。uvicorn のログは loguru とは別系統で、
    uvicorn 自身の書式で stderr に出るので、--debug が無いときは
    log_level を上げて、起動や接続の INFO も出ないようにする
    """
    try:
        uvicorn.run(app, host='0.0.0.0', port=int(port),
                    log_level=('info' if debug else 'warning'),
                    access_log=debug)
    finally:
        _log.info('end')


def _prefix_option(_ctx, _param, value):
    """--prefix を normalize_prefix() で揃える。誤りは click のエラー"""
    try:
        return normalize_prefix(value)
    except ValueError as e:
        raise click.BadParameter(str(e)) from e


PREFIX_OPTION = click.option(
    '--prefix', 'prefix', type=str, default='', callback=_prefix_option,
    help="URL prefix (e.g. '/foo'). Default: none")

# 置き場所の基準と設定ファイル (TODO-076)
DIR_OPTION = click.option(
    '--dir', 'base_dir', type=click.Path(file_okay=False), default=None,
    help='base directory. Default: $YTBG_DIR or ~/.ytbg')

CONFIG_OPTION = click.option(
    '--config', '-c', 'config', type=click.Path(dir_okay=False),
    default=None, help='config file (TOML). Default: <dir>/ytbg.toml')

# 設定にも CLI にも無いときの最後の既定
DEFAULT_PORT = 5001
DEFAULT_IMAGE_DIR = 'images1a'


@click.group(context_settings=CONTEXT_SETTINGS)
def main():
    """ytBackgammon: network shared backgammon board"""


@main.command(context_settings=CONTEXT_SETTINGS)
@click.argument('server_id', type=str)
@click.option('--port', '-p', 'port', type=int, default=None,
              help=f'port number. Default: config or {DEFAULT_PORT}')
@click.option('--image_dir', '-i', 'image_dir', type=str, default=None,
              help="Images directory under '/static/'. "
                   f'Default: config or {DEFAULT_IMAGE_DIR}')
@PREFIX_OPTION
@DIR_OPTION
@CONFIG_OPTION
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def board(server_id, port, image_dir, prefix, base_dir, config, debug):
    """ボード 1 面のサーバを起動する"""
    loggerInit(debug)

    # 設定ファイルに同じ server_id の [[board]] があれば、その port と
    # image_dir を使う。CLI で指定されていれば CLI が勝つ (TODO-076)
    try:
        paths = resolve(base_dir, config)
        conf = board_config(paths.config, server_id)
    except ConfigError as e:
        raise click.ClickException(str(e)) from e

    if port is None:
        port = conf.port if conf else DEFAULT_PORT
    if image_dir is None:
        image_dir = conf.image_dir if conf else DEFAULT_IMAGE_DIR

    _log.info('server_id={}, port={}, image_dir={}, prefix={}, base={}',
              server_id, port, image_dir, prefix, paths.base)

    _run(create_app(__prog_name__, __version__, server_id, image_dir,
                    paths.data, prefix),
         port, debug)


@main.command(context_settings=CONTEXT_SETTINGS)
@CONFIG_OPTION
@click.option('--port', '-p', 'port', type=int, default=5000,
              show_default=True, help='port number')
@PREFIX_OPTION
@DIR_OPTION
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag (also passed to the boards)')
def lobby(config, port, prefix, base_dir, debug):
    """設定のボードを全部起動し、一覧ページを出す"""
    loggerInit(debug)

    try:
        paths = resolve(base_dir, config)
        boards = load_config(paths.config)
    except ConfigError as e:
        raise click.ClickException(str(e)) from e

    if not boards:
        raise click.ClickException(f'{paths.config}: no [[board]]')

    _log.info('config={}, port={}, prefix={}', paths.config, port, prefix)

    # 子のボードへも同じ置き場所を渡す (--dir と -c。TODO-076)
    _run(create_lobby_app(boards, debug, prefix, paths), port, debug)


if __name__ == "__main__":
    main()
