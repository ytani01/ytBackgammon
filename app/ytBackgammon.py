#
# (c) Yoichi Tanibayashi
#
"""
ytBackgammon.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

from MyLogger import get_logger
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])


class ytBackgammon:
    _log = get_logger(__name__, False)

    def __init__(self, svr_ver='', debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('svr_ver=%a', svr_ver)

        self.svr_ver = svr_ver

        self._gameinfo = {
            'server_version': self.svr_ver,
            'game_num': 0,
            'match_score': 0,
            'score': [0, 0],
            'turn': 2,  # <=-1:all off, 0:player0, 1:player1, >=2:all on
            'text': [
                '',
                ''
            ],
            'board': {
                'cube': {
                    'side': -1,
                    'value': 1,
                    'accepted': True
                },
                'dice': [
                    [0, 0, 0, 0],
                    [0, 0, 0, 0]
                ],
                'point': [
                    [],
                    [1, 1],
                    [],
                    [],
                    [],
                    [],
                    [0, 0, 0, 0, 0],
                    [],
                    [0, 0, 0],
                    [],
                    [],
                    [],
                    [1, 1, 1, 1, 1],
                    [0, 0, 0, 0, 0],
                    [],
                    [],
                    [],
                    [1, 1, 1],
                    [],
                    [1, 1, 1, 1, 1],
                    [],
                    [],
                    [],
                    [],
                    [0, 0],
                    [],
                    [],
                    []
                ],
            }
        }
        self._log.debug('_gameinfo=%s', self._gameinfo)

        self.player = None

    def put_checker(self, p1, p2):
        self._log.debug('p1=%s, p2=%s', p1, p2)
        self._log.debug('_gameinfo[board][point]=%a',
                        self._gameinfo['board']['point'])

        ch = self._gameinfo['board']['point'][p1].pop()
        self._gameinfo['board']['point'][p2].append(ch)

        self._log.debug('_gameinfo[board][point]=%a',
                        self._gameinfo['board']['point'])

    def cube(self, msg):
        self._log.debug('msg=%s', msg)

        self._gameinfo['board']['cube'] = msg

        self._log.debug('_gameinfo[board][cube]=%a',
                        self._gameinfo['board']['cube'])

    def dice(self, msg):
        self._log.debug('msg=%s', msg)
        self._gameinfo['board']['dice'][msg['player']] = msg['dice']
        self._gameinfo['turn'] = msg['turn']
###
