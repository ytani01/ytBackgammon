import json
from MyLogger import get_logger
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])


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
                    [],
                    [1, 2],
                    [],
                    [],
                    [],
                    [],
                    [0, 5],
                    [],
                    [0, 3],
                    [],
                    [],
                    [],
                    [1, 5],
                    [0, 5],
                    [],
                    [],
                    [],
                    [1, 3],
                    [],
                    [1, 5],
                    [],
                    [],
                    [],
                    [],
                    [0, 2],
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

    def put_checker(self, p1, p2):
        self._log.debug('p1=%s, p2=%s', p1, p2)
        self._log.debug('_gameinfo=%a', self._gameinfo)

        p1data = self._gameinfo['board']['point'][p1]
        p2data = self._gameinfo['board']['point'][p2]
        self._log.debug('%s, %s', p1data, p2data)

        [player, n] = p1data
        n -= 1
        if n == 0:
            self._gameinfo['board']['point'][p1] = []
        else:
            self._gameinfo['board']['point'][p1] = [player, n]

        if p2data == []:
            self._gameinfo['board']['point'][p2] = [player, 1]
        else:
            self._gameinfo['board']['point'][p2][1] += 1

        self._log.debug('_gameinfo=%a', self._gameinfo)
