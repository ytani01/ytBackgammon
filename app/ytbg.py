#!/usr/bin/env python3
#
# (c) Yoichi Tanibayashi
#
"""
ytbg.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

from ytBackgammonServer import ytBackgammonServer
from flask import Flask, request
from flask_socketio import SocketIO
import json
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

MY_NAME = 'ytBackgammon Server'
VERSION = '0.76'

_log = get_logger(__name__, True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['DEBUG'] = False
app.config['JSON_AS_ASCII'] = False  # XXX 文字化け対策が効かない TBD

socketio = SocketIO(app)

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
def handle_disconnect():
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
        socketio.run(app, host='0.0.0.0', port=int(port), debug=debug)
    finally:
        _log.info('end')


if __name__ == "__main__":
    main()
