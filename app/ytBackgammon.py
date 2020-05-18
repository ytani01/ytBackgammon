#
# (c) Yoichi Tanibayashi
#
"""
ytBackgammon.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import copy
from MyLogger import get_logger
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])


class ytBackgammon:
    _log = get_logger(__name__, False)

    def __init__(self, svr_ver='', debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('svr_ver=%a', svr_ver)

        self.svr_ver = svr_ver

        self._gameinfo = None
        self.init_gameinfo()

        self.player = None

    def init_gameinfo(self):
        self._gameinfo = {
            'sn': 0,
            'server_version': self.svr_ver,
            'game_num': 0,
            'match_score': 0,
            'score': [0, 0],
            'turn': 2,  # <=-1:all off, 0:player0, 1:player1, >=2:all on
            'resign': -1,  # < 0: none, 0|1: player
            'board': {
                'playername': [
                    '',
                    ''
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
                'roll': False,
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
        self._log.debug('_gameinfo=%s', self._gameinfo)
        
    def set_gameinfo(self, gameinfo):
        self._log.debug('gameinfo=%s', gameinfo)
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
        self._log.debug('ch_id=%d, p=%s, idx=%s', ch_id, p, idx)
        player = int(ch_id / 100)
        ch_i = ch_id % 100
        self._gameinfo['board']['checker'][player][ch_i] = [p, idx]
        self._log.debug('_gameinfo[board][point][%d][%d]=[%d,%d]',
                        player, ch_i, p, idx);

    def cube(self, data):
        self._log.debug('data=%s', data)

        self._gameinfo['board']['cube'] = data

        self._log.debug('_gameinfo[board][cube]=%a',
                        self._gameinfo['board']['cube'])

    def dice(self, data):
        """
        data = {
            'player': player,
            'dice': [d1, d2, d3, d4]
        }
        """
        self._log.debug('data=%s', data)
        self._gameinfo['board']['dice'][data['player']] = data['dice']

    def set_turn(self, data):
        """
        data = {'turn': int, resign: int}
        """
        self._log.debug('data=%s', data)
        self._gameinfo['turn'] = data['turn']
        self._gameinfo['resign'] = data['resign']

    def set_playername(self, data):
        """
        data = {'player': int, 'name': str}
        """
        self._log.debug('data=%s', data)
        self._gameinfo['board']['playername'][data['player']] = data['name']

    def resign(self, data):
        """
        resign game

        Parameters
        ----------
        data: {'player': int}
        """
        self._log.debug('data=%s', data)
        self._gameinfo['resign'] = data['player']
        self._log.debug('gameinfo.resign=%s', self._gameinfo['resign'])
###
