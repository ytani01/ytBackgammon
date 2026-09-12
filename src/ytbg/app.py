#
# (c) 2020 Yoichi Tanibayashi
#
"""
app.py

Starlette のルーティングと、WebSocket の受信ループ (TODO-025)。

create_app() が BackgammonServer を作り、ルートはそれを閉じ込めた
関数にする。**モジュールのグローバルだった svr と app は無い。**
テストから触れるように、作った BackgammonServer は app.state.svr に
入れてある。
"""

import json

from starlette.applications import Starlette
from starlette.routing import Mount, Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates
from starlette.websockets import WebSocketDisconnect

from . import WEBROOT
from .mylog import getLogger
from .server import BackgammonServer

_log = getLogger('app')

templates = Jinja2Templates(directory=str(WEBROOT / 'templates'))


class NoCacheStaticFiles(StaticFiles):
    """
    Cache-Control: no-cache を付けて返す StaticFiles (TODO-028)。

    JS を ES Modules に分けたので、index.html の ?ts= 付き URL では
    キャッシュを避けられない (import した先のモジュールには効かない)。
    かわりにサーバが毎回問い合わせさせる。
    """

    def file_response(self, *args, **kwargs):
        res = super().file_response(*args, **kwargs)
        res.headers['Cache-Control'] = 'no-cache'
        return res


def create_app(svr_name, svr_ver, svr_id, image_dir) -> Starlette:
    """
    Starlette のアプリを作る。

    Parameters
    ----------
    svr_name: str
    svr_ver: str
    svr_id: str
    image_dir: str
        static/ 以下の画像ディレクトリ

    svr_name と image_dir は index.html の表示のためだけの値なので、
    BackgammonServer には渡さない (TODO-025)。
    """
    _log.debug('svr_name={}, svr_ver={}, svr_id={}, image_dir={}',
               svr_name, svr_ver, svr_id, image_dir)

    svr = BackgammonServer(svr_ver, svr_id)

    async def index(request):
        """'/', '/p1', '/p2' はいずれも同じ index.html を返す"""
        _log.debug('')
        response = templates.TemplateResponse(
            request, 'index.html',
            {
                'name': svr_name,
                'version': svr_ver,
                'server_id': svr_id,
                'image_dir': image_dir,
            })
        response.headers['Cache-Control'] = 'no-cache'
        return response

    async def websocket_endpoint(websocket):
        """
        クライアントとの WebSocket 1 本ぶんの受信ループ (TODO-009)。

        メッセージは全て {'src', 'type', 'data', 'history'} の JSON で、
        中身の分岐は svr.on_json() が見る。
        """
        await websocket.accept()

        try:
            await svr.on_connect(websocket)

            while True:
                try:
                    msg = await websocket.receive_json()
                except WebSocketDisconnect:
                    # 切断は異常ではない
                    _log.debug('disconnected')
                    break
                except json.JSONDecodeError as e:
                    # 読めないメッセージは捨てて、接続は保つ。移行前も
                    # engineio が不正なパケットを捨てていた (TODO-009)
                    svr.on_error(websocket, e)
                    continue
                except Exception as e:  # noqa: BLE001
                    # 受信そのものが失敗したときは、続けても同じことに
                    # なりかねないので抜ける。種類を絞らずに握るのは、
                    # 1 本の接続の失敗でサーバを止めないため
                    svr.on_error(websocket, e)
                    break

                _log.debug('msg={}', json.dumps(msg, ensure_ascii=False))

                try:
                    await svr.on_json(websocket, msg)
                except Exception as e:  # noqa: BLE001
                    # Flask-SocketIO の on_error_default に当たる受け皿。
                    # 1 通のメッセージの失敗で接続は切らない
                    svr.on_error(websocket, e, msg)
        finally:
            await svr.on_disconnect(websocket)

    app = Starlette(routes=[
        Route('/', index),
        Route('/p1', index),
        Route('/p2', index),
        WebSocketRoute('/ws', websocket_endpoint),
        Mount('/static',
              app=NoCacheStaticFiles(directory=str(WEBROOT / 'static')),
              name='static'),
    ])

    # テストから BackgammonServer を触れるようにしておく (TODO-025)
    app.state.svr = svr

    return app
##
