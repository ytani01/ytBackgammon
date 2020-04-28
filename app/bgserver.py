#!/usr/bin/env python3
#
#
from Backgammon import Backgammon
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import copy
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

MY_NAME = 'ytBackgammon Server'
VERSION = '0.10'

_log = get_logger(__name__, True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

client_sid = []
history = []
fwd_hist = []
bg = Backgammon(debug=True)

history.append(copy.deepcopy(bg._gameinfo))
_log.debug('history=(%d)%s', len(history), history)

@app.route('/')
def index():
    return render_template('top.html', name=MY_NAME, version=VERSION)


@app.route('/p1')
def index_p1():
    return render_template('index.html', name=MY_NAME, version=VERSION)


@app.route('/p2')
def index_p2():
    return render_template('index.html', name=MY_NAME, version=VERSION)


@socketio.on('connect')
def handle_connect():
    _log.info('from %s:%s',
              request.event['args'][0]['REMOTE_ADDR'],
              request.event['args'][0]['REMOTE_PORT'])
    _log.info('request.sid=%a', request.sid)

    client_sid.append(request.sid)
    _log.debug('client_sid=%s', client_sid)

    emit('json', {'src': 'server', 'dst': '', 'type': 'gameinfo',
                  'data': bg._gameinfo})


@socketio.on('disconnect')
def handle_disconnect():
    _log.info('request.sid=%s', request.sid)

    client_sid.remove(request.sid)
    _log.debug('client_sid=%s', client_sid)


@socketio.on_error_default
def default_error_handler(e):
    _log.error('e=%a:%a', type(e).__name__, e)
    _log.error('event[message]=%a', request.event["message"])
    _log.error('event[args]=%a', request.event["args"])


@socketio.on('json')
def handle_json(msg):
    global fwd_hist
    _log.info('request.sid=%s', request.sid)
    _log.info('msg=%s', msg)

    append_history = True
    
    if msg['type'] == 'back':
        _log.debug('history=(%d)%s', len(history), history)

        if len(history) == 1:
            bg._gameinfo = copy.deepcopy(history[0])
        else:
            fwd_hist.append(history.pop())
            bg._gameinfo = copy.deepcopy(history[-1])
            
        _log.debug('history=(%d)%s', len(history), history)

        emit('json', {'src': 'server', 'dst': '', 'type': 'gameinfo',
                      'data': bg._gameinfo})
        return

    if msg['type'] == 'forward':
        if len(fwd_hist) == 0:
            return

        history.append(fwd_hist.pop())

        bg._gameinfo = copy.deepcopy(history[-1])

        emit('json', {'src': 'server', 'dst': '', 'type': 'gameinfo',
                      'data': bg._gameinfo})
        return

    if msg['type'] == 'put_checker':
        bg.put_checker(msg['data']['p1'], msg['data']['p2'])
        if msg['data']['p2'] >= 26:
            _log.debug('hit')
            append_history = False
            

    if msg['type'] == 'cube':
        bg.cube(msg['data'])

    if msg['type'] == 'dice':
        bg.dice(msg['data'])

    fwd_hist = []
    if append_history:
        history.append(copy.deepcopy(bg._gameinfo))
        _log.debug('history=(%d)%s', len(history), history)

    emit('json', msg, broadcast=True)


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
