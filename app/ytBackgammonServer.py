#!/usr/bin/env python3
#
# (c) Yoichi Tanibayashi
#
"""
ytBackgammon.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

from ytBackgammon import ytBackgammon
from flask import render_template
from flask_socketio import emit
import copy
import time
import json
from MyLogger import get_logger


class ytBackgammonServer:
    DATAFILE_NAME = 'ytbg.json'

    _log = get_logger(__name__, False)

    def __init__(self, svr_name, svr_ver, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('svr_name=%s, svr_ver=%s',
                        svr_name, svr_ver)

        self._svr_name = svr_name
        self._svr_ver = svr_ver

        self._client_sid = []
        self._history = []
        self._fwd_hist = []

        self._bg = ytBackgammon(self._svr_ver, debug=self._dbg)
        self.repeat_flag = False

        if self.load_data() < 1:
            self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self._log.debug('gameinfo=%s', gameinfo)

        if gameinfo:
            self._fwd_hist = []
            self._history.append(copy.deepcopy(gameinfo))
            self.save_data()
            self._log.debug('history=(%d)', len(self._history))

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

        while self.repeat_flag:
            self.repeat_flag = False
            time.sleep(.5)

        self.repeat_flag = True
        while len(self._history) > 1 and self.repeat_flag:
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

        self.repeat_flag = False
        self.save_data()
        return

    def forward_hist(self, n=1, sleep_sec=0.1):
        self._log.debug('n=%s, sleep_sec=%s', n, sleep_sec)

        count = 0

        while self.repeat_flag:
            self.repeat_flag = False
            time.sleep(.5)

        self.repeat_flag = True
        while len(self._fwd_hist) > 0 and self.repeat_flag:
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

        self.repeat_flag = False
        self.save_data()
        return

    def save_data(self):
        self._log.debug('')

        data = {'history': self._history, 'fwd_hist': self._fwd_hist}

        with open(self.DATAFILE_NAME, "w") as f:
            json.dump(data, f)

    def load_data(self):
        self._log.debug('')

        try:
            with open(self.DATAFILE_NAME) as f:
                data = json.load(f)
        except Exception as e:
            self._log.warning('%s:%s.', type(e).__name__, e)
            return 0

        self._history = data['history']
        self._fwd_hist = data['fwd_hist']
        self._log.debug('_history=(%d), _fwd_hist=%d)',
                        len(self._history), len(self._fwd_hist))
        if len(self._history) > 0:
            self._bg._gameinfo = copy.deepcopy(self._history[-1])
        return len(self._history)

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
        self._log.info('request.sid=%s', request.sid)
        self._log.info('msg=%s', msg)

        if msg['type'] == 'back':
            self.backward_hist()
            return

        if msg['type'] == 'back2':
            self.backward_hist(10, sleep_sec=0.5)
            return

        if msg['type'] == 'back_all':
            self.backward_hist(0)
            return

        if msg['type'] == 'fwd':
            self.forward_hist()
            return

        if msg['type'] == 'fwd2':
            self.forward_hist(10, sleep_sec=0.5)
            return

        if msg['type'] == 'fwd_all':
            self.forward_hist(0)
            return

        if msg['type'] == 'set_gameinfo':
            self._bg.set_gameinfo(msg['data'])
            self.add_history(self._bg._gameinfo)
            emit('json',
                 {'type': 'gameinfo', 'data': self._bg._gameinfo},
                 broadcast=True)
            return

        #
        #
        #
        if msg['type'] == 'put_checker':
            self._bg.put_checker(msg['data']['p1'], msg['data']['p2'])
            if msg['data']['p2'] >= 26:
                self._log.debug('hit')

        if msg['type'] == 'cube':
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            self._bg.dice(msg['data'])

        #
        # append history or not
        #
        if msg['history']:
            self.add_history(self._bg._gameinfo)

        #
        # broadcast
        #
        emit('json', msg, broadcast=True)

    def app_top(self):
        self._log.debug('')
        return render_template('top.html',
                               name=self._svr_name,
                               version=self._svr_ver)

    def app_index(self):
        self._log.debug('')
        return render_template('index.html',
                               name=self._svr_name, version=self._svr_ver)
###
