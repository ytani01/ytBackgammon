#
# (c) Yoichi Tanibayashi
#
"""
yt_backgammon_server.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import copy
import json
import os
import time
from pathlib import Path

from flask import render_template
from flask_socketio import emit

from .mylog import getLogger
from .yt_backgammon import ytBackgammon


class ytBackgammonServer:
    DATAFILE_DIR = os.getenv('HOME')
    DATAFILE_NAME = 'ytbg'
    SEC_CHECKER_MOVE = 0.2

    __log = getLogger(__qualname__)

    def __init__(self, svr_name, svr_ver, svr_id, image_dir):
        self.__log.debug(
            'svr_name={}, svr_ver={}, svr_id={}, image_dir={}',
            svr_name, svr_ver, svr_id, image_dir)

        self._svr_name = svr_name
        self._svr_ver = svr_ver
        self._svr_id = svr_id
        self._image_dir = image_dir

        self._datafile_path = (
            f'{self.DATAFILE_DIR}/{self.DATAFILE_NAME}-{self._svr_id}.json')
        self.__log.debug('_datafile_path={}', self._datafile_path)

        self._client_sid = []
        self._history = []
        self._fwd_hist = []
        self._cur_sn = 0

        self._bg = ytBackgammon(self._svr_ver)
        self._repeat_flag = False

        [hist_len, _fwd_hist_len] = self.load_data(self._datafile_path)
        if hist_len < 1:
            self.__log.warning('load_data({}): error', self._datafile_path)
            self.add_history(self._bg._gameinfo)

    def new_game(self):
        """
        New game
        """
        self.__log.debug('')

        score0 = self._bg._gameinfo['score'][0]
        score1 = self._bg._gameinfo['score'][1]
        player0_name = self._bg._gameinfo['board']['playername'][0]
        player1_name = self._bg._gameinfo['board']['playername'][1]
        clock_limit0 = self._bg._gameinfo['clock_limit'][0]
        clock_limit1 = self._bg._gameinfo['clock_limit'][1]

        self._bg.init_gameinfo()

        self._bg._gameinfo['score'][0] = score0;
        self._bg._gameinfo['score'][1] = score1;
        self._bg._gameinfo['clock_limit'][0] = clock_limit0
        self._bg._gameinfo['clock_limit'][1] = clock_limit1
        self._bg._gameinfo['board']['playername'][0] = player0_name
        self._bg._gameinfo['board']['playername'][1] = player1_name
        
        self.add_history(self._bg._gameinfo)

    def add_history(self, gameinfo=None):
        self.__log.debug('gameinfo={}', gameinfo)

        if gameinfo is not None:
            self._fwd_hist = []
            if len(self._history) == 0:
                self._cur_sn = 1
            else:
                self._cur_sn = self._history[-1]['sn'] + 1

            gameinfo['sn'] = self._cur_sn
            self._history.append(copy.deepcopy(gameinfo))
            self.save_data(self._datafile_path)
            self.__log.debug('history=({})', len(self._history))

    def emit_gameinfo(self, sec=0, history_flag=False):
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
                     'hist_n': len(self._history) + len(self._fwd_hist),
                     'history_flag': history_flag
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
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0.1

        while self._repeat_flag:
            self._repeat_flag = False
            time.sleep(.5)

        self._repeat_flag = True
        while len(self._history) > 1 and self._repeat_flag:
            self._fwd_hist.append(self._history.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self.__log.debug('_history=({}), _fwd_hist=({})',
                             len(self._history), len(self._fwd_hist))

            self.emit_gameinfo(sec, history_flag=True)

            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        self._repeat_flag = False
        self.save_data(self._datafile_path)

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
        self.__log.debug('n={}, sleep_sec={}', n, sleep_sec)

        count = 0
        sec = self.SEC_CHECKER_MOVE
        if n == 0:
            sec = 0.1

        while self._repeat_flag:
            self._repeat_flag = False
            time.sleep(.5)

        self._repeat_flag = True
        while len(self._fwd_hist) > 0 and self._repeat_flag:
            self._history.append(self._fwd_hist.pop())
            self._bg._gameinfo = copy.deepcopy(self._history[-1])

            self.__log.debug('_history=({}), _fwd_hist=({})',
                             len(self._history), len(self._fwd_hist))

            self.emit_gameinfo(sec, history_flag=True)

            count += 1
            if n > 0 and count >= n:
                break

            time.sleep(sleep_sec)

        self._repeat_flag = False
        self.save_data(self._datafile_path)

    def hist_ent2str(self, h):
        board = h['board']
        cube = board['cube']
        name0 = json.dumps(board['playername'][0])
        name1 = json.dumps(board['playername'][1])
        accepted = json.dumps(cube['accepted'])

        j_str = ''
        j_str += '    {\n'
        j_str += f'      "sn": {h["sn"]:d},\n'
        j_str += f'      "server_version": "{h["server_version"]}",\n'
        j_str += f'      "game_num": {h["game_num"]:d},\n'
        j_str += f'      "match_score": {h["match_score"]:d},\n'
        j_str += f'      "score": {h["score"]},\n'
        j_str += f'      "turn": {h["turn"]:d},\n'
        j_str += f'      "resign": {h["resign"]},\n'
        j_str += f'      "clock_limit": {h["clock_limit"]},\n'
        j_str += '      "board": {\n'
        j_str += '        "playername": [\n'
        j_str += f'          {name0},\n'
        j_str += f'          {name1}\n'
        j_str += '        ],\n'
        j_str += f'        "clock": {board["clock"]},\n'
        j_str += f'        "cube": {{ "side": {cube["side"]:d}, '
        j_str += f'"value": {cube["value"]:d}, '
        j_str += f'"accepted": {accepted} }},\n'
        j_str += f'        "dice": {board["dice"]},\n'
        j_str += '        "checker": [\n'
        j_str += f'          {board["checker"][0]},\n'
        j_str += f'          {board["checker"][1]} \n'
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
        self.__log.debug('path_name={}', path_name)

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
            with Path(path_name).open("w") as f:
                f.write(j_str)
        except OSError as e:
            # 書き込みの失敗だけを拾う (TODO-011)。hist_ent2str() は try の
            # 外で呼んでいるので、その例外はここには来ない
            self.__log.warning('{}:{}.', type(e).__name__, e)

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
        self.__log.debug('path_name={}', path_name)

        try:
            with Path(path_name).open() as f:
                data = json.load(f)
            history = data['history']
            fwd_hist = data['fwd_hist']
        except (OSError, UnicodeDecodeError,
                json.JSONDecodeError, KeyError) as e:
            # 読めない・壊れている・キーが足りないファイルは、空の履歴として
            # 始める (TODO-011)。初回起動もここを通る (FileNotFoundError)。
            # 局所変数へ受けてから代入するので、途中で失敗しても
            # _history だけ書き換わった状態にはならない
            self.__log.warning('{}:{}.', type(e).__name__, e)
            return 0, 0

        self._history = history
        self._fwd_hist = fwd_hist
        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))
        if len(self._history) > 0:
            self._bg._gameinfo = copy.deepcopy(self._history[-1])
        return len(self._history), len(self._fwd_hist)

    def on_connect(self, request):
        self.__log.info('request.sid={!a}', request.sid)
        self.__log.info('from {}:{}',
                        request.event['args'][0]['REMOTE_ADDR'],
                        request.event['args'][0]['REMOTE_PORT'])

        self._client_sid.append(copy.deepcopy(request.sid))

        self.emit_gameinfo(0)

    def on_disconnect(self, request):
        self.__log.info('request.sid={!a}', request.sid)
        self._client_sid.remove(request.sid)

    def on_error(self, request, e):
        self.__log.error('e={!a}:{!a}', type(e).__name__, e)
        self.__log.error('event[message]={!a}', request.event["message"])
        self.__log.error('event[args]={!a}', request.event["args"])

    def on_json(self, request, msg):
        """
        msg := {'type': str, 'data': object}
        """
        self.__log.info('request.sid={}', request.sid)
        self.__log.info('msg={}', msg)

        if msg['type'] == 'back':
            # data: {n: n}
            self.backward_hist(msg['data']['n'])
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
            # data: {n: n}
            self.forward_hist(msg['data']['n'])
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
            self.emit_gameinfo(3, False)
            return

        if msg['type'] == 'set_gameinfo':
            # data: gameinfo
            self._bg.set_gameinfo(msg['data'])
            self.add_history(self._bg._gameinfo)
            self.emit_gameinfo(0)
            return

        # ここから下は return せず、末尾の add_history と broadcast まで落ちる
        if msg['type'] == 'put_checker':
            # data: {'ch': int, 'p': int, 'idx': int}
            self._bg.put_checker(msg['data']['ch'],
                                 msg['data']['p'], msg['data']['idx'])
            if msg['data']['p'] >= 26:
                self.__log.debug('hit')

        if msg['type'] == 'cube':
            # data: {'side': int, 'value': int, 'accepted': bool}
            self._bg.cube(msg['data'])

        if msg['type'] == 'dice':
            # data: {'player': int, 'dice': [int, int, int, int]
            self._bg.dice(msg['data'])

        if msg['type'] == 'set_turn':
            # data: {'turn': int, resign: int}
            self._bg.set_turn(msg['data'])

        if msg['type'] == 'set_playername':
            # data: {'player': int, 'name': str}
            self._bg.set_playername(msg['data'])

        if msg['type'] == 'set_score':
            # data: {'player': int, 'score': int}
            self._bg.set_score(msg['data'])

        if msg['type'] == 'resign':
            # data: {'player': int}
            self._bg.resign(msg['data'])

        if msg['type'] == 'set_clock_limit':
            # data: {'index': int, 'clock_limit': int}
            self._bg.set_clock_limit(msg['data'])

        if msg['type'] == 'set_player_clock':
            # data: {'player': int, 'clock': [int(sec), int(sec)]}
            self._bg.set_player_clock(msg['data'])

        # append history or not
        if msg['history']:
            self.add_history(self._bg._gameinfo)

        # broadcast
        emit('json', msg, broadcast=True)

    def app_index(self):
        self.__log.debug('')
        return render_template('index.html',
                               name=self._svr_name,
                               version=self._svr_ver,
                               server_id=self._svr_id,
                               image_dir=self._image_dir)
##
