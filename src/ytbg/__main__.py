#!/usr/bin/env python3
#
# (c) Yoichi Tanibayashi
#
"""
__main__.py
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/05'

import json

import click
import uvicorn
from starlette.applications import Starlette
from starlette.routing import Mount, Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from . import WEBROOT, __prog_name__, __version__
from .mylog import getLogger, loggerInit
from .yt_backgammon_server import ytBackgammonServer

CONTEXT_SETTINGS = {'help_option_names': ['-h', '--help']}

MY_NAME = __prog_name__
VERSION = __version__

_log = getLogger('main')

svr_id = "0"
# main() の中で生成する。ここで None を入れないのは、
# 型チェックのたびに Optional を剥がす必要が出るため
svr: ytBackgammonServer


async def index(request):
    """'/', '/p1', '/p2' はいずれも同じ index.html を返す"""
    _log.debug('')
    return svr.app_index(request)


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
          app=StaticFiles(directory=str(WEBROOT / 'static')),
          name='static'),
])


@click.command(context_settings=CONTEXT_SETTINGS)
@click.argument('server_id', type=str)
@click.option('--port', '-p', 'port', type=int, default=5001,
              help='port number')
@click.option('--image_dir', '-i', 'image_dir', type=str,
              default="images1",
              help="Images directory under '/static/'")
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(server_id, port, image_dir, debug):
    global svr_id, svr
    loggerInit(debug)
    _log.info('server_id={}, port={}, image_dir={}',
              server_id, port, image_dir)

    svr_id = server_id
    svr = ytBackgammonServer(MY_NAME, VERSION, svr_id, image_dir)

    try:
        # uvicorn で動かす (TODO-009)。ping は uvicorn の既定
        # (ws_ping_interval = 20 秒) に任せる。
        #
        # --debug はログレベルと、uvicorn のアクセスログ (access_log)
        # だけに効く。uvicorn のログは loguru とは別系統で、
        # uvicorn 自身の書式で stderr に出るので、--debug が無いときは
        # log_level を上げて、起動や接続の INFO も出ないようにする
        uvicorn.run(app, host='0.0.0.0', port=int(port),
                    log_level=('info' if debug else 'warning'),
                    access_log=debug)
    finally:
        _log.info('end')


if __name__ == "__main__":
    main()
