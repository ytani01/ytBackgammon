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
from .lobby import ConfigError, create_lobby_app, load_config
from .mylog import getLogger, loggerInit

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}

MY_NAME = __prog_name__
VERSION = __version__

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


@click.group(context_settings=CONTEXT_SETTINGS)
def main():
    """ytBackgammon: network shared backgammon board"""


@main.command(context_settings=CONTEXT_SETTINGS)
@click.argument('server_id', type=str)
@click.option('--port', '-p', 'port', type=int, default=5001,
              help='port number')
@click.option('--image_dir', '-i', 'image_dir', type=str,
              default="images1a",
              help="Images directory under '/static/'")
@PREFIX_OPTION
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def board(server_id, port, image_dir, prefix, debug):
    """ボード 1 面のサーバを起動する"""
    loggerInit(debug)
    _log.info('server_id={}, port={}, image_dir={}, prefix={}',
              server_id, port, image_dir, prefix)

    _run(create_app(MY_NAME, VERSION, server_id, image_dir, prefix),
         port, debug)


@main.command(context_settings=CONTEXT_SETTINGS)
@click.option('--config', '-c', 'config', type=click.Path(dir_okay=False),
              default='ytbg.toml', show_default=True,
              help='config file (TOML)')
@click.option('--port', '-p', 'port', type=int, default=5000,
              show_default=True, help='port number')
@PREFIX_OPTION
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag (also passed to the boards)')
def lobby(config, port, prefix, debug):
    """設定のボードを全部起動し、一覧ページを出す"""
    loggerInit(debug)
    _log.info('config={}, port={}, prefix={}', config, port, prefix)

    try:
        boards = load_config(config)
    except ConfigError as e:
        raise click.ClickException(str(e)) from e

    _run(create_lobby_app(boards, debug, prefix), port, debug)


if __name__ == "__main__":
    main()
