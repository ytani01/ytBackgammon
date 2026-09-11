#
# (c) Yoichi Tanibayashi
#
"""
yt_backgammon.py

gameinfo (盤面の状態そのもの) を持ち、更新するだけのクラス。
ルール判定は持たない。

gameinfo の中身は dataclass の GameInfo (TODO-024)。クロックは
gameinfo の外に出したので、set_clock_limit() と set_player_clock() は
ここには無い (clock.py の Clock が持つ)。
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

from typing import Any

from .gameinfo import BoardState, CubeState, GameInfo
from .mylog import getLogger

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}


class ytBackgammon:
    __log = getLogger(__qualname__)

    def __init__(self, svr_ver=''):
        self.__log.debug('svr_ver={!a}', svr_ver)

        self.svr_ver = svr_ver

        self._gameinfo = GameInfo(server_version=svr_ver)

        self.player = None

    def init_gameinfo(self):
        """gameinfo を初期状態にする"""
        self._gameinfo = GameInfo(server_version=self.svr_ver)
        self.__log.debug('_gameinfo={}', self._gameinfo)

    def new_game(self):
        """
        board を作り直し、turn と resign を戻す (TODO-024)。

        score / playername / game_num / match_score は残す。
        server_version は入れ直す (TODO-024 より前の new_game() が
        init_gameinfo() 経由でそうしていた。古いファイルから読んだ値が
        New Game のあとも残らないように)。
        クロックは gameinfo の外なので、ここでは触らない。
        """
        self.__log.debug('')

        playername = list(self._gameinfo.board.playername)
        self._gameinfo.board = BoardState(playername=playername)
        self._gameinfo.turn = 2
        self._gameinfo.resign = -1
        self._gameinfo.server_version = self.svr_ver

    def set_gameinfo(self, data: dict[str, Any]):
        """
        クライアントから届いた dict で gameinfo を丸ごと置き換える。

        GameInfo.from_dict() が作り直すので、渡された dict とは縁が切れる。
        """
        self.__log.debug('data={}', data)
        self._gameinfo = GameInfo.from_dict(data)

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
        self._gameinfo.board.checker[player][ch_i] = [p, idx]
        self.__log.debug('_gameinfo.board.checker[{}][{}]=[{},{}]',
                         player, ch_i, p, idx)

    def cube(self, data):
        """
        data = {'side': int, 'value': int, 'accepted': bool}
        """
        self.__log.debug('data={}', data)

        self._gameinfo.board.cube = CubeState.from_dict(data)

        self.__log.debug('_gameinfo.board.cube={}', self._gameinfo.board.cube)

    def dice(self, data):
        """
        data = {
            'player': player,
            'dice': [d1, d2, d3, d4]
        }
        """
        self.__log.debug('data={}', data)
        self._gameinfo.board.dice[data['player']] = list(data['dice'])

    def set_turn(self, data):
        """
        data = {'turn': int, resign: int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo.turn = data['turn']
        self._gameinfo.resign = data['resign']

    def set_playername(self, data):
        """
        data = {'player': int, 'name': str}
        """
        self.__log.debug('data={}', data)
        self._gameinfo.board.playername[data['player']] = data['name']

    def set_score(self, data):
        """
        data = {'player': int, 'score': int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo.score[data['player']] = data['score']

    def resign(self, data):
        """
        resign game

        Parameters
        ----------
        data: {'player': int}
        """
        self.__log.debug('data={}', data)
        self._gameinfo.resign = data['player']
        self.__log.debug('gameinfo.resign={}', self._gameinfo.resign)
##
