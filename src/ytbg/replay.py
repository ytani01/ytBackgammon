#
# (c) 2020 Yoichi Tanibayashi
#
"""
replay.py

履歴の連続再生の Task 管理 (TODO-025)。

再生は常に 1 本だけ。**cancel と Task の差し替えは、必ず
ロックの中でまとめて行う** (TODO-009)。ロックの外で cancel を
待つと、待っている間に別の要求が新しい Task を作り、_task から
辿れない再生が残る (逆方向の 2 本が打ち消し合って止まらなくなる)。
"""

import asyncio

from .mylog import getLogger


class Replayer:
    """連続再生の Task を 1 本だけ持つ"""

    __log = getLogger(__qualname__)

    def __init__(self, on_error):
        """
        Parameters
        ----------
        on_error: Callable[[Exception], None]
            Task の中で起きた例外の行き先。Task の例外は誰も
            受け取らないので、コールバックで渡す (TODO-009)
        """
        # 走っていなければ None。差し替えと cancel は必ず _lock の中で
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._on_error = on_error

    async def _cancel(self):
        """
        走っている連続再生の Task を止め、終わるまで待つ (TODO-009)。

        **_lock を持った状態で呼ぶこと。** ロックの外で呼ぶと、
        cancel を待っている間に別の要求が新しい Task を作り、
        _task から辿れない再生が残る。

        外から止めるための口は持たない。start() と run() が先頭で
        必ず呼ぶので、それ以外に止めたい場面が無い (TODO-025)。
        """
        task = self._task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                self.__log.debug('replay canceled')

        self._task = None

    async def _replay(self, func, *args, **kwargs):
        """
        連続再生の本体。Task にして走らせる。

        Task の中で起きた例外は誰も受け取らないので、ここで
        on_error() へ渡す (TODO-009)。
        """
        try:
            await func(*args, **kwargs)
        except asyncio.CancelledError:
            # CancelledError は BaseException 側なので、下の
            # except Exception には元々捕まらない。cancel を
            # エラー扱いしないことを読んで分かるように書いてある
            raise
        except Exception as e:  # noqa: BLE001
            self._on_error(e)

    async def start(self, func, *args, **kwargs):
        """
        前の連続再生を止めてから、新しい再生を Task として始める。

        Task は待たずに返る。再生中も他のメッセージを処理できるように
        するため (TODO-009)。止めるところから作るところまでを
        _lock で囲むので、再生は常に 1 本だけになる。
        """
        async with self._lock:
            await self._cancel()
            self._task = asyncio.create_task(
                self._replay(func, *args, **kwargs))

    async def run(self, func, *args, **kwargs):
        """
        前の連続再生を止めてから、その場で最後まで走らせる。

        n > 0 の back / fwd と clear_hist 用 (TODO-009、TODO-019)。
        移行前は backward_hist() が同期に走り切ってから on_json() が
        返っていたので、同時に 2 通来たら 2 手ぶん動いた。ロックを
        握ったまま走らせることで、その順序に戻している。例外は
        呼び出し元 (on_json) へ抜けて、受信ループの受け皿から
        on_error() へ届く。
        """
        async with self._lock:
            await self._cancel()
            await func(*args, **kwargs)
##
