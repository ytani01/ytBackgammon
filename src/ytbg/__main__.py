#!/usr/bin/env python3
#
# (c) Yoichi Tanibayashi
#
"""
__main__.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

# gevent の WSGI サーバで動かすので、他を import する前に標準ライブラリを
# 置き換える (TODO-003)。履歴の連続再生が time.sleep() を使っており、
# 置き換えないと再生中にサーバ全体が止まる
from gevent import monkey

monkey.patch_all()

import json
from pathlib import Path

import click
from flask import Flask, request
from flask_socketio import SocketIO

from . import __prog_name__, __version__
from .my_logger import get_logger
from .yt_backgammon_server import ytBackgammonServer

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}

MY_NAME = __prog_name__
VERSION = __version__

# パッケージに同梱した webroot (templates/, static/)
WEBROOT = Path(__file__).absolute().parent / 'webroot'

_log = get_logger(__name__, True)

app = Flask(__name__,
            template_folder=str(WEBROOT / 'templates'),
            static_folder=str(WEBROOT / 'static'))
app.config['SECRET_KEY'] = 'secret!'
app.config['DEBUG'] = False

socketio = SocketIO(app, cors_allowed_origins='*',
                    async_mode='gevent')

svr_id = "0"
svr = None


@app.route('/')
def top():
    _log.debug('')
    return svr.app_index()


@app.route('/p1')
def index_p1():
    _log.debug('')
    return svr.app_index()


@app.route('/p2')
def index_p2():
    _log.debug('')
    return svr.app_index()


@socketio.on('connect')
def handle_connect():
    svr.on_connect(request)


@socketio.on('disconnect')
def handle_disconnect(reason=None):
    # python-socketio 5.x は切断理由を引数で渡してくる
    svr.on_disconnect(request)


@socketio.on_error_default
def default_error_handler(e):
    svr.on_error(request, e)


@socketio.on('json')
def handle_json(msg):
    _log.debug('msg=%s', json.dumps(msg, ensure_ascii=False))
    svr.on_json(request, msg)


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
    global svr_id, svr
    _log = get_logger(__name__, debug)
    _log.info('server_id=%s, port=%s, image_dir=%s',
              server_id, port, image_dir)

    svr_id = server_id
    svr = ytBackgammonServer(MY_NAME, VERSION, svr_id, image_dir, debug=True)

    try:
        # gevent の WSGI サーバで動かす (TODO-003)。Werkzeug の開発サーバは
        # websocket を扱えず、切断のたびにログへエラーが出ていた
        #
        # debug は渡さない。渡すと Flask の対話デバッガとリローダが
        # 効いてしまう (TODO-001)。--debug はログレベルと、
        # gevent のアクセスログ (log_output) だけに効く
        socketio.run(app, host='0.0.0.0', port=int(port),
                     log_output=debug)
    finally:
        _log.info('end')


if __name__ == "__main__":
    main()
