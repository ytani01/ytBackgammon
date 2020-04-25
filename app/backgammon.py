#!/usr/bin/env python3
#
#
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


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/action', methods=['POST'])
def action():
    _log.info('')
    global x

    if request.method != 'POST':
        return

    x += 10
    return render_template('index.html', title="ABC", x=x, y=100)

@socketio.on('connect', namespace='/test')
def test_connect():
    _log.info('')
    emit('s', {'data': "hi!"})
    
@socketio.on('disconnect', namespace='/test')
def test_disconnect():
    _log.info('')

@socketio.on('c', namespace='/test')
def test_c(msg):
    _log.info('msg=%s', msg)

    if msg['event'] == 'up':
        x = msg['x']
        y = msg['y']
        
    emit('s', msg, broadcast=True)

@socketio.on('s', namespace='/test')
def test_s(msg):
    _log.info('msg=%s', msg)


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
