#
# (c) 2020 Yoichi Tanibayashi
#
"""
history.py

履歴のスタック (TODO-025)。

戻す側 (_history) と進む側 (_fwd_hist) の 2 つのスタックと、
通し番号 (_cur_sn) を持つ。

**保存は持たない。** 保存には Storage とクロックが要るので、
保存するのは BackgammonServer。1 手ごとに全員へ送る backward_hist() /
forward_hist() も、履歴だけでは閉じないので BackgammonServer に残す。
"""

from .gameinfo import GameInfo
from .mylog import getLogger


class History:
    """履歴の 2 つのスタック"""

    __log = getLogger(__qualname__)

    def __init__(self):
        self._history: list[GameInfo] = []
        self._fwd_hist: list[GameInfo] = []
        self._cur_sn = 0

    @property
    def entries(self) -> list[GameInfo]:
        """戻す側のスタック。末尾がいまの盤面"""
        return self._history

    @property
    def fwd_entries(self) -> list[GameInfo]:
        """進む側のスタック"""
        return self._fwd_hist

    def __len__(self) -> int:
        return len(self._history)

    def total(self) -> int:
        """戻す側と進む側を合わせた手数"""
        return len(self._history) + len(self._fwd_hist)

    def add(self, gameinfo) -> bool:
        """
        gameinfo を履歴に積む。

        進む側は捨て、sn を振り直してから複製を積む。

        Returns
        -------
        bool
            積んだかどうか (gameinfo が None なら False)
        """
        self.__log.debug('gameinfo={}', gameinfo)

        if gameinfo is None:
            return False

        self._fwd_hist = []
        if len(self._history) == 0:
            self._cur_sn = 1
        else:
            self._cur_sn = self._history[-1].sn + 1

        gameinfo.sn = self._cur_sn
        self._history.append(gameinfo.copy())
        self.__log.debug('history=({})', len(self._history))
        return True

    def clear(self, gameinfo):
        """
        履歴を消し、いまの盤面 1 件だけにする (TODO-019)。

        sn は 1 に振り直す。盤面そのものは変えない。
        """
        self.__log.debug('')

        self._fwd_hist = []
        self._cur_sn = 1
        gameinfo.sn = self._cur_sn
        self._history = [gameinfo.copy()]

        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))

    def back(self) -> GameInfo | None:
        """
        1 手戻し、戻ったあとの履歴のエントリを返す。

        戻せなければ (履歴が 1 件以下なら) None。
        """
        if len(self._history) <= 1:
            return None

        self._fwd_hist.append(self._history.pop())

        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))
        return self._history[-1]

    def forward(self) -> GameInfo | None:
        """
        1 手進め、進んだあとの履歴のエントリを返す。

        進めなければ (進む側が空なら) None。
        """
        if len(self._fwd_hist) == 0:
            return None

        self._history.append(self._fwd_hist.pop())

        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))
        return self._history[-1]

    def load(self, history, fwd_hist):
        """読み込んだスタックで丸ごと置き換える"""
        self._history = history
        self._fwd_hist = fwd_hist
        self.__log.debug('_history=({}), _fwd_hist=({})',
                         len(self._history), len(self._fwd_hist))
##
