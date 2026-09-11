import { log } from "./log.js";

let ws = undefined;
// 再接続の間隔 [sec]。つながるまで倍にし、つながったら最小へ戻す
const WS_RETRY_SEC_MIN = 1;
const WS_RETRY_SEC_MAX = 10;
let ws_retry_sec = WS_RETRY_SEC_MIN;

/**
 * WebSocket の URL
 *
 * @return {string}
 */
const ws_url = () => {
    const proto = (document.location.protocol === "https:") ? "wss:" : "ws:";
    let url = `${proto}//${document.domain}`;
    log(`location.port=${location.port}`);
    if ( location.port != "" ) {
        url += ":" + location.port;
    }
    url += "/ws";
    return url;
};

/**
 * Emit message to server
 *
 * @param {string} type
 * @param {Object} data
 * @param {boolean} [history=false]
 */
export const emit_msg = (type, data, history=false) => {
    log(`emit_msg> type=${type}, data=${JSON.stringify(data)}`);
    if ( ws === undefined || ws.readyState !== WebSocket.OPEN ) {
        // 切断中は捨てる。つなぎ直せばサーバから gameinfo が送られてくる
        log(`emit_msg> not connected .. ignored`);
        return;
    }
    ws.send(JSON.stringify({src: "client", type: type,
                            data: data, history: history}));
};

/**
 * connect to server
 *
 * 切れたら一定時間後につなぎ直す。間隔は WS_RETRY_SEC_MIN から
 * 倍にしていき、WS_RETRY_SEC_MAX で頭打ち。つながったら戻す。
 * つなぎ直せばサーバが gameinfo を送ってくるので、切れている間の
 * 取りこぼしを埋める仕組みは要らない。
 *
 * @param {function(Object): void} on_msg - 届いた msg を渡す
 */
export const ws_connect = (on_msg) => {
    const url = ws_url();
    log(`ws_connect> url=${url}`);
    ws = new WebSocket(url);

    ws.onopen = function() {
        log("ws.onopen()");
        ws_retry_sec = WS_RETRY_SEC_MIN;
    };

    ws.onerror = function() {
        // 続けて onclose が呼ばれるので、ここでは再接続しない
        log("ws.onerror()");
    };

    ws.onclose = function() {
        log(`ws.onclose()> retry in ${ws_retry_sec} sec`);
        setTimeout(() => ws_connect(on_msg), ws_retry_sec * 1000);
        ws_retry_sec = Math.min(ws_retry_sec * 2, WS_RETRY_SEC_MAX);
    };

    /**
     * msg := {
     *   type: str,
     *   data: Object
     * }
     */
    ws.onmessage = function(ev) {
        const msg = JSON.parse(ev.data);
        log(`ws.onmessage:msg=${JSON.stringify(msg)}`);
        on_msg(msg);
    }; // ws.onmessage
}; // ws_connect
