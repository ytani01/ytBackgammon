#!/usr/bin/env python3
#
#
from Backgammon import Backgammon
from flask import Flask, render_template, request
from flask_socketio import SocketIO, send, emit
import time
import json
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

_log = get_logger(__name__, True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

bg = Backgammon(debug=True)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect', namespace='/test')
def test_connect():
    _log.info('request.sid=%s', request.sid)

    emit('s', {
        'event': 'gameinfo',
        'data': bg._gameinfo
    })

@socketio.on('disconnect', namespace='/test')
def test_disconnect():
    _log.info('request.sid=%s', request.sid)

@socketio.on('p1', namespace='/test')
def test_p1(msg):
    _log.info('request.sid=%s', request.sid)
    _log.info('msg=%s', msg)

    emit('s', msg, broadcast=True)

@socketio.on('p2', namespace='/test')
def test_s(msg):
    _log.info('request.sid=%s', request.sid)
    _log.info('msg=%s', msg)

    emit('s', msg, broadcast=True)


@click.command(context_settings=CONTEXT_SETTINGS)
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(debug):
    _log = get_logger(__name__, debug)

    try:
        socketio.run(app, host='0.0.0.0', debug=debug)
    finally:
        _log.info('end')

if __name__ == "__main__":
    main()
