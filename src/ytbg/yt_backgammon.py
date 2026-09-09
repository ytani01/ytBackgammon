#
# (c) Yoichi Tanibayashi
#
"""
yt_backgammon.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import copy
from typing import Any

from .mylog import getLogger

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}


class ytBackgammon:
    __log = getLogger(__qualname__)

    def __init__(self, svr_ver=''):
        self.__log.debug('svr_ver={!a}', svr_ver)

        self.svr_ver = svr_ver

        self._gameinfo: dict[str, Any] = {}
        self.init_gameinfo()

        self.player = None

    def init_gameinfo(self):
        self._gameinfo = {
            'sn': 0,
            'server_version': self.svr_ver,
            'game_num': 0,
            'match_score': 0,
            'score': [0, 0],
            'turn': 2,       # <=-1:all off, 0:player0, 1:player1, >=2:all on
            'resign': -1,    # < 0: none, 0|1: player
            'clock_limit': [120, 12],
            'board': {
                'playername': [
                    '',
                    ''
                ],
                'clock': [
                    [120, 12],
                    [120, 12]
                ],
                'cube': {
                    'side': -1,  # -1: center, 0|1: player
                    'value': 1,
                    'accepted': True
                },
                'dice': [
                    [0, 0, 0, 0],
                    [0, 0, 0, 0]
                ],
                'checker': [
                    [ [ 6, 0], [ 6, 1], [ 6, 2], [ 6, 3], [ 6, 4],
                      [ 8, 0], [ 8, 1], [ 8, 2],
                      [13, 0], [13, 1], [13, 2], [13, 3], [13, 4],
                      [24, 0], [24, 1] ],
                    [ [19, 0], [19, 1], [19, 2], [19, 3], [19, 4],
                      [17, 0], [17, 1], [17, 2],
                      [12, 0], [12, 1], [12, 2], [12, 3], [12, 4],
                      [ 1, 0], [ 1, 1] ]
                ],
            }
        }
        self.__log.debug('_gameinfo={}', self._gameinfo)
        
    def set_gameinfo(self, gameinfo):
        self.__log.debug('gameinfo={}', gameinfo)
        self._gameinfo = copy.deepcopy(gameinfo)

    def put_checker(self, ch_id, p, idx):
        """
        Parameters
        ----------
        ch_id: int
            checker ID number (ex. 012, 101 ..)
        p: int
            point index
        idx: int
            position index
        """
        self.__log.debug('ch_id={}, p={}, idx={}', ch_id, p, idx)
        player = int(ch_id / 100)
        ch_i = ch_id % 100
        self._gameinfo['board']['checker'][player][ch_i] = [p, idx]
        self.__log.debug('_gameinfo[board][point][{}][{}]=[{},{}]',
                         player, ch_i, p, idx)

    def cube(self, data):
        self.__log.debug('data={}', data)

        self._gameinfo['board']['cube'] = data

        self.__log.debug('_gameinfo[board][cube]={!a}',
                         self._gameinfo['board']['cube'])

    def dice(self, data):
        """
        data = {
            'player': player,
            'dice': [d1, d2, d3, d4]
        }
        """
        self.__log.debug('data={}', data)
        self._gameinfo['board']['dice'][data['player']] = data['dice']

    def set_turn(self, data):
        """
        data = {'turn': int, resign: int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['turn'] = data['turn']
        self._gameinfo['resign'] = data['resign']

    def set_playername(self, data):
        """
        data = {'player': int, 'name': str}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['board']['playername'][data['player']] = data['name']

    def set_score(self, data):
        """
        data = {'player': int, 'score': int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['score'][data['player']] = data['score']

    def resign(self, data):
        """
        resign game

        Parameters
        ----------
        data: {'player': int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['resign'] = data['player']
        self.__log.debug('gameinfo.resign={}', self._gameinfo['resign'])

    def set_clock_limit(self, data):
        """
        data = {'index': int, 'clock_limit': int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['clock_limit'][data['index']] = data['clock_limit']

    def set_player_clock(self, data):
        """
        data = {'player': int, 'clock': [int(sec), int(sec)]}
        """
        self.__log.debug('data={}', data)
        self._gameinfo['board']['clock'][data['player']] = data['clock']
###
