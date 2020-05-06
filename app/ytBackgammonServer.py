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
    SEC_CHECKER_MOVE = 0.2

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
        self._cur_sn = 0;

        self._bg = ytBackgammon(self._svr_ver, debug=self._dbg)
        self.repeat_flag = False

        if self.load_data() < 1:
            self.add_history(self._bg._gameinfo)

    def new_game(self):
        """
        """
        self._log.debug('')
        self._bg.init_gameinfo()
        self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self._log.debug('gameinfo=%s', gameinfo)

        if gameinfo:
            self._fwd_hist = []
            self._cur_sn += 1
            gameinfo['sn'] = self._cur_sn
            self._history.append(copy.deepcopy(gameinfo))
            self.save_data()
            self._log.debug('history=(%d)', len(self._history))

    def emit_gameinfo(self, sec=0):
        """
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
            
        while self.repeat_flag:
            self.repeat_flag = False
            time.sleep(.5)

        self.repeat_flag = True
        while len(self._history) > 1 and self.repeat_flag:
            self._fwd_hist.append(self._history.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))

            self.emit_gameinfo(sec)

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
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0
            
        while self.repeat_flag:
            self.repeat_flag = False
            time.sleep(.5)

        self.repeat_flag = True
        while len(self._fwd_hist) > 0 and self.repeat_flag:
            self._history.append(self._fwd_hist.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self._log.debug('_history=(%d), _fwd_hist=(%d)',
                            len(self._history), len(self._fwd_hist))
            self.emit_gameinfo(sec)

            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        self.repeat_flag = False
        self.save_data()
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
        j_str += '        "cube": {\n'
        j_str += '          "side": %d,\n' % h['board']['cube']['side']
        j_str += '          "value": %d,\n' % h['board']['cube']['value']
        j_str += '          "accepted": %d\n' % h['board']['cube']['accepted']
        j_str += '        },\n'
        j_str += '        "dice": %s,\n' % h['board']['dice']
        j_str += '        "checker": [\n'
        j_str += '          %s,\n' % h['board']['checker'][0]
        j_str += '          %s \n' % h['board']['checker'][1]
        j_str += '        ],\n'
        j_str += '        "banner": [\n'
        j_str += '           "%s"\n' % h['board']['banner'][0]
        j_str += '           "%s"\n' % h['board']['banner'][1]
        j_str += '        ]\n'
        j_str += '      }\n'
        j_str += '    },\n'
        return j_str

    def save_data(self):
        self._log.debug('')

        data = {'history': self._history, 'fwd_hist': self._fwd_hist}

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
  
        with open(self.DATAFILE_NAME, "w") as f:
            f.write(j_str)

    def load_data(self):
        """
        Returns
        -------
        len(self._history)
        """
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
            """
            data: {}
            """
            self.backward_hist()
            return

        if msg['type'] == 'back2':
            """
            data: {}
            """
            self.backward_hist(0, sleep_sec=.5)
            return

        if msg['type'] == 'back_all':
            """
            data: {}
            """
            self.backward_hist(0)
            return

        if msg['type'] == 'fwd':
            """
            data: {}
            """
            self.forward_hist()
            return

        if msg['type'] == 'fwd2':
            """
            data: {}
            """
            self.forward_hist(0, sleep_sec=.5)
            return

        if msg['type'] == 'fwd_all':
            """
            data: {}
            """
            self.forward_hist(0)
            return

        if msg['type'] == 'new':
            """
            data: {}
            """
            self.new_game()
            self.emit_gameinfo(3)
            return

        if msg['type'] == 'set_gameinfo':
            """
            data: gameinfo
            """
            self._bg.set_gameinfo(msg['data'])
            self.add_history(self._bg._gameinfo)
            self.emit_gameinfo(0)
            return

        #
        #
        #
        if msg['type'] == 'put_checker':
            """
            data: {'ch': int, 'p': int, 'idx': int}
            """
            self._bg.put_checker(msg['data']['ch'],
                                 msg['data']['p'], msg['data']['idx'])
            if msg['data']['p'] >= 26:
                self._log.debug('hit')

        if msg['type'] == 'cube':
            """
            data: {'side': int, 'value': int, 'accepted': bool}
            """
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            """
            data: {'turn': int, 'player': int, 'dice': [int, int, int, int]
            """
            self._bg.dice(msg['data'])

        if msg['type'] == 'set_banner':
            """
            data: {'player': int, 'text': str}
            """
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
