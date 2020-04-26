import json
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])


class Checker:
    _log = get_logger(__name__, False)

    def __init__(self, player, num, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('player=%s, num=%s', player, num)

        self._player = player
        self._num = num

    def toString(self):
        self._log.debug('')
        return 'Checker(%d,%02d)' % (self._player, self._num)
        

class Board:
    _log = get_logger(__name__, False)

    def __init__(self, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('')

        self.point = [[]]*28
        self._log.debug('point=%s', self.point)

        self.checker = [[],[]]
        for p in [0, 1]:
            for ch in range(15):
                self.checker[p].append(Checker(p, ch))

    def put_checker(self, player, num, point):
        self._log.debug('[%s,%s]->%s', player, num, point)
        

class Backgammon:
    _log = get_logger(__name__, False)
    
    def __init__(self, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('')

        self._gameinfo = {
            'game': 0,
            'match': 0,
            'score': [0, 0],
            'turn': -1,
            'dice': [
                [0, 0, 0, 0],
                [0, 0, 0, 0]
            ],
            'board': {
                'cube': {
                    'side': -1,
                    'value': 1,
                    'accepted': True
                },
                'point': [
                    [0, 1],
                    [0, 1],
                    [],
                    [],
                    [],
                    [],
                    [1, 5],
                    [],
                    [1, 3],
                    [],
                    [],
                    [],
                    [0, 5],
                    [1, 5],
                    [],
                    [],
                    [],
                    [0, 3],
                    [],
                    [0, 5],
                    [],
                    [],
                    [],
                    [],
                    [1, 2],
                    [],
                    [],
                    []
                ],
            }
        }
        self._log.debug('_gameinfo=%s', self._gameinfo)

        json_data = json.dumps(self._gameinfo)
        self._log.debug('json_data=%a', json_data)
        

        self.player = None

        self.board = Board(debug=self._dbg)


#Backgammon(debug=True)
