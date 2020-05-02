#!/usr/bin/env python3
#
#
from ytBackgammonServer import ytBackgammonServer
from flask import Flask, request
from flask_socketio import SocketIO
import copy
import time
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

MY_NAME = 'ytBackgammon Server'
VERSION = '0.20'

_log = get_logger(__name__, True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)
svr = ytBackgammonServer(MY_NAME, VERSION, True)


@app.route('/')
def top():
    return svr.app_top()


@app.route('/p1')
def index_p1():
    return svr.app_index()


@app.route('/p2')
def index_p2():
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
    svr.on_json(request, msg)


@click.command(context_settings=CONTEXT_SETTINGS)
@click.option('--port', '-p', 'port', type=int, default=5001,
              help='port number')
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(port, debug):
    _log = get_logger(__name__, debug)
    _log.info('port=%s', port)

    try:
        socketio.run(app, host='0.0.0.0', port=int(port), debug=debug)
    finally:
        _log.info('end')


if __name__ == "__main__":
    main()