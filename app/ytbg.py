#!/usr/bin/env python3
#
#
from ytBackgammon import ytBackgammon
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
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


class ytBackgammonServer:
    _log = get_logger(__name__, False)

    def __init__(self, svr_name, svr_ver, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('svr_name=%s, svr_ver=%s', svr_name, svr_ver)

        self._svr_name = svr_name
        self._svr_ver = svr_ver

        self._client_sid = []
        self._history = []
        self._fwd_hist = []

        self._bg = ytBackgammon(self._svr_ver, debug=self._dbg)

        self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self._log.debug('gameinfo=%s', gameinfo)

        if gameinfo:
            self._history.append(copy.deepcopy(gameinfo))
            self._log.debug('history=(%d)%s', len(self._history))

    def backward_hist(self, n=1, sleep_sec=0.1):
        """
        Parameters
        ----------
        n : int
            < 0: all
        sleep_sec : float
            sleep seconds
        """
        self._log.debug('n=%d, sleep_sec=%s', n, sleep_sec)

        count = 0

        while len(self._history) > 1:
            self._fwd_hist.append(self._history.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))
            emit('json', {'src': 'server', 'dst': 'all', 'type': 'gameinfo',
                          'data': self._bg._gameinfo}, broadcast=True)
            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        return

    def forward_hist(self, n=1, sleep_sec=0.1):
        self._log.debug('n=%s, sleep_sec=%s', n, sleep_sec)

        count = 0

        while len(self._fwd_hist) > 0:
            self._history.append(self._fwd_hist.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))
            emit('json', {'src': 'server', 'dst': 'all', 'type': 'gameinfo',
                          'data': self._bg._gameinfo}, broadcast=True)
            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        return

    def on_connect(self, request):
        self._log.info('request.sid=%a', request.sid)
        self._log.info('from %s:%s',
                       request.event['args'][0]['REMOTE_ADDR'],
                       request.event['args'][0]['REMOTE_PORT'])

        self._client_sid.append(copy.deepcopy(request.sid))

        emit('json', {'src': 'server', 'dst': '', 'type': 'gameinfo',
                      'data': self._bg._gameinfo})

    def on_disconnect(self, request):
        self._log.info('request.sid=%a', request.sid)
        self._client_sid.remove(request.sid)

    def on_error(self, request, e):
        self._log.error('e=%a:%a', type(e).__name__, e)
        self._log.error('event[message]=%a', request.event["message"])
        self._log.error('event[args]=%a', request.event["args"])

    def on_json(self, request, msg):
        _log.info('request.sid=%s', request.sid)
        _log.info('msg=%s', msg)

        append_history = msg['history']

        if msg['type'] == 'back':
            self.backward_hist()
            return

        if msg['type'] == 'back2':
            self.backward_hist(10, sleep_sec=0.5)
            return

        if msg['type'] == 'back_all':
            self.backward_hist(0)
            return

        if msg['type'] == 'forward':
            self.forward_hist()
            return

        if msg['type'] == 'fwd2':
            self.forward_hist(10, sleep_sec=0.5)
            return

        if msg['type'] == 'fwd_all':
            self.forward_hist(0)
            return

        if msg['type'] == 'put_checker':
            self._bg.put_checker(msg['data']['p1'], msg['data']['p2'])
            if msg['data']['p2'] >= 26:

                self._log.debug('hit')
                append_history = False

        if msg['type'] == 'cube':
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            self._bg.dice(msg['data'])

        if append_history:
            self._fwd_hist = []
            self.add_history(self._bg._gameinfo)

        emit('json', msg, broadcast=True)

    def app_top(self):
        self._log.debug('')
        return render_template('top.html',
                               name=self._svr_name, version=self._svr_ver)

    def app_index(self):
        self._log.debug('')
        return render_template('index.html',
                               name=self._svr_name, version=self._svr_ver)


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
