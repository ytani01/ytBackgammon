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
import os
import copy
import time
import json
from MyLogger import get_logger


class ytBackgammonServer:
    DATAFILE_DIR = os.getenv('HOME')
    DATAFILE_NAME = 'ytbg'
    SEC_CHECKER_MOVE = 0.2

    _log = get_logger(__name__, False)

    def __init__(self, svr_name, svr_ver, svr_id, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('svr_name=%s, svr_ver=%s, svr_id=%s',
                        svr_name, svr_ver, svr_id)

        self._svr_name = svr_name
        self._svr_ver = svr_ver
        self._svr_id = svr_id

        self._datafile_path = '%s/%s-%s.json' % (
            self.DATAFILE_DIR, self.DATAFILE_NAME, self._svr_id)
        self._log.debug('_datafile_path=%s', self._datafile_path)

        self._client_sid = []
        self._history = []
        self._fwd_hist = []
        self._cur_sn = 0

        self._bg = ytBackgammon(self._svr_ver, debug=self._dbg)
        self._repeat_flag = False

        [hist_len, fwd_hist_len] = self.load_data(self._datafile_path)
        if hist_len < 1:
            self._log.warning('load_data(%s): error', self._datafile_path)
            self.add_history(self._bg._gameinfo)

    def new_game(self):
        """
        New game
        """
        self._log.debug('')
        self._bg.init_gameinfo()
        self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self._log.debug('gameinfo=%s', gameinfo)

        if gameinfo is not None:
            self._fwd_hist = []
            if len(self._history) == 0:
                self._cur_sn = 1
            else:
                self._cur_sn = self._history[-1]['sn'] + 1

            gameinfo['sn'] = self._cur_sn
            self._history.append(copy.deepcopy(gameinfo))
            self.save_data(self._datafile_path)
            self._log.debug('history=(%d)', len(self._history))

    def emit_gameinfo(self, sec=0):
        """
        send game information to all clients

        Parameters
        ----------
        sec: int
            for animation
        """
        emit('json',
             {
                 'src': 'server', 'dst': 'all', 'type': 'gameinfo',
                 'data': {
                     'gameinfo': self._bg._gameinfo,
                     'sec': sec,
                     'hist_i': len(self._history),
                     'hist_n': len(self._history) + len(self._fwd_hist)
                 }
             }, broadcast=True)

    def backward_hist(self, n=1, sleep_sec=0.1):
        """
        backward history

        Parameters
        ----------
        n : int
            < 0: all
        sleep_sec : float
            sleep seconds
        """
        self._log.debug('n=%d, sleep_sec=%s', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0

        while self._repeat_flag:
            self._repeat_flag = False
            time.sleep(.5)

        self._repeat_flag = True
        while len(self._history) > 1 and self._repeat_flag:
            self._fwd_hist.append(self._history.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))

            self.emit_gameinfo(sec)

            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        self._repeat_flag = False
        self.save_data(self._datafile_path)
        return

    def forward_hist(self, n=1, sleep_sec=0.1):
        """
        forward history

        Parameters
        ----------
        n : int
            < 0: all
        sleep_sec : float
            sleep seconds
        """
        self._log.debug('n=%s, sleep_sec=%s', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0

        while self._repeat_flag:
            self._repeat_flag = False
            time.sleep(.5)

        self._repeat_flag = True
        while len(self._fwd_hist) > 0 and self._repeat_flag:
            self._history.append(self._fwd_hist.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))
            self.emit_gameinfo(sec)

            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        self._repeat_flag = False
        self.save_data(self._datafile_path)
        return

    def hist_ent2str(self, h):
        j_str = ''
        j_str += '    {\n'
        j_str += '      "sn": %d,\n' % h['sn']
        j_str += '      "server_version": "%s",\n' % h['server_version']
        j_str += '      "game_num": %d,\n' % h['game_num']
        j_str += '      "match_score": %d,\n' % h['match_score']
        j_str += '      "score": %s,\n' % h['score']
        j_str += '      "turn": %d,\n' % h['turn']
        j_str += '      "text": %s,\n' % json.dumps(h['text'])
        j_str += '      "board": {\n'
        j_str += '        "cube": { "side": %d, ' % h['board']['cube']['side']
        j_str += '"value": %d, ' % h['board']['cube']['value']
        j_str += '"accepted": %s },\n' % json.dumps(
            h['board']['cube']['accepted'])
        j_str += '        "dice": %s,\n' % h['board']['dice']
        j_str += '        "checker": [\n'
        j_str += '          %s,\n' % h['board']['checker'][0]
        j_str += '          %s \n' % h['board']['checker'][1]
        j_str += '        ],\n'
        j_str += '        "banner": [\n'
        j_str += '           "%s",\n' % h['board']['banner'][0]
        j_str += '           "%s"\n' % h['board']['banner'][1]
        j_str += '        ]\n'
        j_str += '      }\n'
        j_str += '    },\n'
        return j_str

    def save_data(self, path_name):
        """
        Parameters
        ----------
        path_name: str
            full path name of json data file
        """
        self._log.debug('path_name=%s', path_name)

        j_str = '{\n'
        j_str += '  "history": [\n'

        for h in self._history:
            j_str += self.hist_ent2str(h)

        j_str = j_str.rstrip(',\n') + '\n'
        j_str += '  ],\n'
        j_str += '  "fwd_hist": [\n'

        for h in self._fwd_hist:
            j_str += self.hist_ent2str(h)

        j_str = j_str.rstrip(',\n') + '\n'
        j_str += '  ]\n'
        j_str += '}\n'

        try:
            with open(path_name, "w") as f:
                f.write(j_str)
        except Exception as e:
            self._log.warning('%s:%s.', type(e).__name__, e)

    def load_data(self, path_name):
        """
        Parameters
        ----------
        path_name: str
            full path name of json data file

        Returns
        -------
        history_length: int
            len(self._history)
        fwd_hist_length: int
            len(self._fwd_hist)
        """
        self._log.debug('path_name=%s', path_name)

        try:
            with open(path_name) as f:
                data = json.load(f)
        except Exception as e:
            self._log.warning('%s:%s.', type(e).__name__, e)
            return 0, 0

        self._history = data['history']
        self._fwd_hist = data['fwd_hist']
        self._log.debug('_history=(%d), _fwd_hist=(%d)',
                        len(self._history), len(self._fwd_hist))
        if len(self._history) > 0:
            self._bg._gameinfo = copy.deepcopy(self._history[-1])
        return len(self._history), len(self._fwd_hist)

    def on_connect(self, request):
        self._log.info('request.sid=%a', request.sid)
        self._log.info('from %s:%s',
                       request.event['args'][0]['REMOTE_ADDR'],
                       request.event['args'][0]['REMOTE_PORT'])

        self._client_sid.append(copy.deepcopy(request.sid))

        self.emit_gameinfo(0)

    def on_disconnect(self, request):
        self._log.info('request.sid=%a', request.sid)
        self._client_sid.remove(request.sid)

    def on_error(self, request, e):
        self._log.error('e=%a:%a', type(e).__name__, e)
        self._log.error('event[message]=%a', request.event["message"])
        self._log.error('event[args]=%a', request.event["args"])

    def on_json(self, request, msg):
        """
        msg := {'type': str, 'data': object}
        """
        self._log.info('request.sid=%s', request.sid)
        self._log.info('msg=%s', msg)

        if msg['type'] == 'back':
            # data: {}
            self.backward_hist()
            return

        if msg['type'] == 'back2':
            # data: {}
            self.backward_hist(0, sleep_sec=.5)
            return

        if msg['type'] == 'back_all':
            # data: {}
            self.backward_hist(0)
            return

        if msg['type'] == 'fwd':
            # data: {}
            self.forward_hist()
            return

        if msg['type'] == 'fwd2':
            # data: {}
            self.forward_hist(0, sleep_sec=.5)
            return

        if msg['type'] == 'fwd_all':
            # data: {}
            self.forward_hist(0)
            return

        if msg['type'] == 'new':
            # data: {}
            self.new_game()
            self.emit_gameinfo(3)
            return

        if msg['type'] == 'set_gameinfo':
            # data: gameinfo
            self._bg.set_gameinfo(msg['data'])
            self.add_history(self._bg._gameinfo)
            self.emit_gameinfo(0)
            return

        #
        #
        #
        if msg['type'] == 'put_checker':
            # data: {'ch': int, 'p': int, 'idx': int}
            self._bg.put_checker(msg['data']['ch'],
                                 msg['data']['p'], msg['data']['idx'])
            if msg['data']['p'] >= 26:
                self._log.debug('hit')

        if msg['type'] == 'cube':
            # data: {'side': int, 'value': int, 'accepted': bool}
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            # data: {'turn': int, 'player': int, 'dice': [int, int, int, int]
            self._bg.dice(msg['data'])

        if msg['type'] == 'set_banner':
            # data: {'player': int, 'text': str}
            self._bg.set_banner(msg['data'])

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
