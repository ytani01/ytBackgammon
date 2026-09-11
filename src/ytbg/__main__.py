#!/usr/bin/env python3
#
# (c) Yoichi Tanibayashi
#
"""
__main__.py

エントリポイント (click の main() だけ)。
ルーティングと WebSocket の受信ループは app.py の create_app()。
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import click
import uvicorn

from . import __prog_name__, __version__
from .app import create_app
from .mylog import getLogger, loggerInit

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}

MY_NAME = __prog_name__
VERSION = __version__

_log = getLogger('main')


@click.command(context_settings=CONTEXT_SETTINGS)
@click.argument('server_id', type=str)
@click.option('--port', '-p', 'port', type=int, default=5001,
              help='port number')
@click.option('--image_dir', '-i', 'image_dir', type=str,
              default="images1",
              help="Images directory under '/static/'")
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(server_id, port, image_dir, debug):
    loggerInit(debug)
    _log.info('server_id={}, port={}, image_dir={}',
              server_id, port, image_dir)

    app = create_app(MY_NAME, VERSION, server_id, image_dir)

    try:
        # uvicorn で動かす (TODO-009)。ping は uvicorn の既定
        # (ws_ping_interval = 20 秒) に任せる。
        #
        # --debug はログレベルと、uvicorn のアクセスログ (access_log)
        # だけに効く。uvicorn のログは loguru とは別系統で、
        # uvicorn 自身の書式で stderr に出るので、--debug が無いときは
        # log_level を上げて、起動や接続の INFO も出ないようにする
        uvicorn.run(app, host='0.0.0.0', port=int(port),
                    log_level=('info' if debug else 'warning'),
                    access_log=debug)
    finally:
        _log.info('end')


if __name__ == "__main__":
    main()
