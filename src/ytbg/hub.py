#
# (c) Yoichi Tanibayashi
#
"""
hub.py

接続中の WebSocket と、全員への送信 (TODO-025)。

分割前のサーバが抱えていた接続管理と broadcast を、そのまま
ここへ移した。BackgammonServer には素通しのメソッドを残さないので、
全員へ送るのは ClientHub.broadcast() だけになる。
"""
__author__ = 'Yoichi Tanibayashi'
__date__ = '2026/09'

import asyncio

from starlette.websockets import WebSocket

from .mylog import getLogger


class ClientHub:
    """接続中の WebSocket をまとめて持ち、全員へ送る"""

    __log = getLogger(__qualname__)

    def __init__(self):
        # 接続中の WebSocket と、ログ用の識別名 (TODO-009)。
        # socket.io の sid に当たるものは無いので、自前の連番を振る
        self._clients: dict[WebSocket, str] = {}
        self._client_sn = 0

    def add(self, ws) -> str:
        """
        WebSocket を登録し、ログに出す名前を返す。

        名前は接続順の連番と接続元を組み合わせた文字列 (TODO-009)。
        """
        self._client_sn += 1
        client = ws.client
        if client is None:
            name = f'c{self._client_sn}'
        else:
            name = f'c{self._client_sn}@{client.host}:{client.port}'

        self._clients[ws] = name
        return name

    def remove(self, ws) -> str | None:
        """
        登録を外し、その名前を返す。

        登録されていなければ None (accept() の前に切れた場合など)。
        """
        return self._clients.pop(ws, None)

    def name(self, ws) -> str:
        """
        ログに出す、クライアントを見分けるための名前。

        まだ登録されていない WebSocket なら '?' を返す。
        """
        return self._clients.get(ws, '?')

    def count(self) -> int:
        """接続中のクライアント数"""
        return len(self._clients)

    async def broadcast(self, msg):
        """
        send a message to all connected clients

        Parameters
        ----------
        msg: dict
            {'src': str, 'type': str, 'data': object, ...}
        """
        clients = list(self._clients)
        if not clients:
            return

        # 詰まったクライアントが 1 つあっても、他の送信が始まるのを
        # 待たせないように並行に送る (TODO-009)。1 つが失敗しても
        # 残りへは届く。送信に失敗する理由は切断だけとは限らないので、
        # 例外の種類は絞らずに握る
        results = await asyncio.gather(
            *[ws.send_json(msg) for ws in clients],
            return_exceptions=True)

        for ws, result in zip(clients, results, strict=True):
            if isinstance(result, BaseException):
                self.__log.warning('{}: {}:{}', self.name(ws),
                                   type(result).__name__, result)
##
