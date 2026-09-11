#
# (c) Yoichi Tanibayashi
#
"""
clock.py

クロック (TODO-016、TODO-024)。

**gameinfo には入れない。** 入れると履歴に載り、back / fwd で
クロックの発着まで巻き戻ってしまう (TODO-010 で対象外と決めた)。

残り時間は「最後に止まった時点の値 (clock)」から「数え始めた時刻
(_start) からの経過分」を引いて求める (cur())。動き方が変わる直前に
freeze() でそこまでの分を clock へ書き戻し、時刻を打ち直す。
計算は ytbg.js の PlayerClock.update() と同じで、持ち時間は
マイナスも許す。
"""
__author__ = 'Yoichi Tanibayashi'
__date__ = '2026/09'

import time
from typing import Any, ClassVar

from .mylog import getLogger


class Clock:
    """
    クロックの状態。

    limit: [持ち時間(秒), 猶予(秒)]
    sw: クロック機能そのものの ON/OFF
    active: プレーヤーごとの動作中かどうか
    clock: プレーヤーごとの、最後に止まった時点の残り時間
    _start: プレーヤーごとの、数え始めた時刻 (time.monotonic())
    """

    # 既定の持ち時間と猶予
    DEF_LIMIT: ClassVar[list[int]] = [120, 12]

    __log = getLogger(__qualname__)

    def __init__(self, limit=None, sw=True, clock=None):
        """
        Parameters
        ----------
        limit: list[int] | None
        sw: bool
            初期値は True。index.html の Clock のチェックボックスが
            既定で checked なので、False にすると、つないだ画面が
            clock_state を受けてチェックを外し、既定が反転する
        clock: list[list[float]] | None
            残り時間。無ければ limit の値で始める
        """
        self.limit = (list(limit) if limit is not None
                      else list(self.DEF_LIMIT))
        self.sw = sw
        self.active = [False, False]

        if clock is None:
            self.clock = [list(self.limit), list(self.limit)]
        else:
            self.clock = [list(clock[0]), list(clock[1])]

        now = time.monotonic()
        self._start = [now, now]

        self.__log.debug('limit={}, sw={}, clock={}',
                         self.limit, self.sw, self.clock)

    def cur(self, player):
        """
        いま表示されているはずの残り時間 [持ち時間, 猶予] を返す。

        動作中なら、_start からの経過分を猶予から引き、猶予で足りない
        分を持ち時間から引く。止まっているときと sw が off のときは
        進めない。
        """
        [sec0, sec1] = self.clock[player]

        if not self.sw or not self.active[player]:
            return [sec0, sec1]

        sec1 -= time.monotonic() - self._start[player]
        if sec1 < 0:
            sec0 += sec1
            sec1 = 0

        return [round(sec0, 1), round(sec1, 1)]

    def freeze(self, player):
        """
        進んだ分を clock に書き戻し、基準の時刻を打ち直す。

        クロックの動き方が変わる直前に呼ぶ。
        """
        self.clock[player] = self.cur(player)
        self._start[player] = time.monotonic()

    def reset(self, player):
        """
        残り時間を limit に戻して止める (ytbg.js の PlayerClock.reset())
        """
        self.clock[player] = list(self.limit)
        self.active[player] = False
        self._start[player] = time.monotonic()

    def start(self, player):
        """
        猶予を limit[1] に戻してから動かす (ytbg.js の PlayerClock.start())
        """
        self.freeze(player)
        self.clock[player][1] = self.limit[1]
        self.active[player] = True

    def resume(self, player):
        """猶予を戻さず、残っているところから再開する"""
        self.freeze(player)
        self.active[player] = True

    def stop(self, player):
        """そこまで進んだ分を確定させて止める"""
        self.freeze(player)
        self.active[player] = False

    def stop_all(self):
        """
        両方を止める。残り時間は変えない。

        盤面ごと入れ替わる set_gameinfo で使う (TODO-016、TODO-024)。
        """
        now = time.monotonic()
        self.active = [False, False]
        self._start = [now, now]

    def set_switch(self, sw):
        """
        クロック機能の ON/OFF を切り替える。

        off の間は進まないので、切り替える前に進んだ分を確定させる。
        """
        self.freeze(0)
        self.freeze(1)
        self.sw = sw

    def set_limit(self, index, limit):
        """limit の片側だけを変える"""
        self.limit[index] = limit

    def set_clock(self, player, clock):
        """
        残り時間を入れ替える。数え直しの基準も打ち直す。
        """
        self.clock[player] = list(clock)
        self._start[player] = time.monotonic()

    def state(self) -> dict[str, Any]:
        """
        クライアントへ送る形 (clock_state)。

        clock はいまの残り時間 (cur())。あとからつないだ
        クライアントも動作中の表示に戻せる (TODO-016)。
        """
        return {
            'sw': self.sw,
            'active': list(self.active),
            'clock': [self.cur(0), self.cur(1)],
            'limit': list(self.limit),
        }

    def to_dict(self) -> dict[str, Any]:
        """
        保存する形 (TODO-024)。

        **active は保存しない。** サーバが落ちている間の時間は
        数えられないので、動作中のまま復元すると残り時間がずれる。
        clock に書くのは保存した時点の残り時間で、求めるだけ
        (_start は打ち直さない)。
        """
        return {
            'limit': list(self.limit),
            'sw': self.sw,
            'clock': [self.cur(0), self.cur(1)],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Clock:
        """
        保存したものから作る。読み込んだ直後は必ず止まった状態。
        """
        return cls(
            limit=data.get('limit'),
            sw=data.get('sw', True),
            clock=data.get('clock'),
        )
##
