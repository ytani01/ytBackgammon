#!/usr/bin/env python3
#
#
from Backgammon import Backgammon
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
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


@app.route('/p1')
def index_p1():
    return render_template('index.html')


@app.route('/p2')
def index_p2():
    return render_template('index.html')


@socketio.on('connect')
def handle_connect():
    _log.info('from %s:%s',
              request.event['args'][0]['REMOTE_ADDR'],
              request.event['args'][0]['REMOTE_PORT'])
    _log.info('request.sid=%a', request.sid)
    _log.info('request.namespace=%a', request.namespace)
    """
    # for debug
    _log.debug('request.args=%a', request.args)
    _log.debug('request.event=%s', request.event)
    """

    emit('json', {
        'src': 'server',
        'dst': '',
        'type': 'gameinfo',
        'data': bg._gameinfo
    })


@socketio.on('disconnect')
def handle_disconnect():
    _log.info('request.sid=%s', request.sid)


@socketio.on_error_default
def default_error_handler(e):
    _log.error('e=%a', type(e))
    _log.error('event[message]=%a', request.event["message"])
    _log.error('event[args]=%a', request.event["args"])


@socketio.on('json')
def handle_json(msg):
    _log.info('request.sid=%s', request.sid)
    _log.info('msg=%s', msg)

    emit('json', msg, broadcast=True)

    if (msg['type'] == 'put_checker'):
        bg.put_checker(msg['data']['p1'], msg['data']['p2'])


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
