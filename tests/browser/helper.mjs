//
// (c) Yoichi Tanibayashi
//
// ブラウザでの動作確認の共通部分 (TODO-021)。
//
// サーバを実プロセスとして起動 → chromium でページを開く →
// 操作する → ページの中の board を読む、という流れを組み立てる。
//
// 走らせ方: node --test tests/browser/
//
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

/** リポジトリのルート (この助けを tests/browser/ に置いている前提) */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * システムの chromium を使う。
 *
 * playwright 1.63.0 が要求する chromium のリビジョン (1243) と、
 * ~/.cache/ms-playwright/ にあるリビジョン (1234) が合わず、既定の
 * ままでは起動しない。`npx playwright install` で数百 MB を落とす
 * かわりに、Debian の chromium を executablePath で指定している。
 * ここを消さないこと (TODO-021)。
 */
export const CHROMIUM_PATH = process.env.YTBG_TEST_CHROMIUM
      || '/usr/bin/chromium';

/**
 * 空いている TCP ポートを 1 つ取る。
 *
 * ytbg-boot.sh が使う 5001〜5004 や、他の作業とぶつからないように、
 * 固定のポートではなく OS に選ばせる。
 *
 * @return {Promise<number>}
 */
export function free_port() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/**
 * ytbg サーバを実プロセスとして起動する。
 *
 * 保存先は YTBG_DATA_DIR で一時ディレクトリへ逃がすので、
 * 利用者の ~/ytbg-* は読み書きされない (TODO-021)。
 *
 * @param {{server_id?: string, image_dir?: string}} [opts]
 * @return {Promise<{url: string, port: number, data_dir: string,
 *                   stop: function(): Promise<void>}>}
 */
export async function start_server(opts = {}) {
    const server_id = opts.server_id || 'browsertest';
    const image_dir = opts.image_dir || 'images1a';

    const port = await free_port();
    const data_dir = await mkdtemp(path.join(os.tmpdir(), 'ytbg-test-'));

    // detached: true でプロセスグループを作り、後始末では -pid へ
    // シグナルを送る。`uv run` の下に python がぶら下がるので、
    // uv だけを kill すると python が残る。pkill は使わない
    // (パターンが自分のシェルにも当たる)
    const child = spawn(
        'uv', ['run', 'ytbg', '-p', String(port), '-i', image_dir, server_id],
        {
            cwd: REPO_ROOT,
            env: { ...process.env, YTBG_DATA_DIR: data_dir },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
        });

    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });

    let exited = false;
    const exited_promise = new Promise(
        resolve => child.on('exit', () => { exited = true; resolve(); }));

    const url = `http://127.0.0.1:${port}`;

    const stop = async () => {
        if (!exited) {
            try {
                process.kill(-child.pid, 'SIGTERM');
            } catch {
                // すでに落ちている
            }
            const killed = await Promise.race([
                exited_promise.then(() => true),
                sleep(5000).then(() => false),
            ]);
            if (!killed) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {
                    // すでに落ちている
                }
                await exited_promise;
            }
        }
        await rm(data_dir, { recursive: true, force: true });
    };

    // 起動を待つ
    const limit = Date.now() + 30000;
    for (;;) {
        if (exited) {
            await stop();
            throw new Error(`server exited before it started up:\n${log}`);
        }
        try {
            const res = await fetch(`${url}/`);
            if (res.ok) {
                await res.text();
                break;
            }
        } catch {
            // まだ listen していない
        }
        if (Date.now() > limit) {
            await stop();
            throw new Error(`server did not start up:\n${log}`);
        }
        await sleep(200);
    }

    return { url, port, data_dir, stop };
}

/**
 * chromium を起動する。
 *
 * @return {Promise<import('playwright').Browser>}
 */
export function launch_browser() {
    return chromium.launch({ executablePath: CHROMIUM_PATH });
}

/**
 * ページを開いて、board が組み上がるまで待つ。
 *
 * コンソールに出たエラーは page.ytbg_errors へ貯める。
 * {url, text} の配列で、判定は console_errors() で行う。
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @return {Promise<import('playwright').Page>}
 */
export async function open_board(browser, url) {
    const page = await browser.newPage();
    page.ytbg_errors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            page.ytbg_errors.push({
                url: msg.location().url, text: msg.text(),
            });
        }
    });
    page.on('pageerror', e => {
        page.ytbg_errors.push({ url: page.url(), text: e.message });
    });

    await page.goto(url);

    // board の生成と、サーバからの最初の gameinfo を待つ
    await page.waitForFunction(
        () => typeof board !== 'undefined' && board !== undefined
            && board.checker !== undefined
            && board.checker[0][0].cur_point !== undefined);

    return page;
}

/**
 * ページで見つかったコンソールエラーのうち、判定の対象になるものを返す。
 *
 * 除くもの:
 *
 * - サーバ以外から取るもの。index.html が font awesome を CDN から
 *   読んでおり、ネットワークが無いところでは必ず失敗する。
 *   このテストが見たいのはクライアントの JS なので対象外にする。
 *   なお、この振り分けは url が空文字のもの (スタックの位置が取れない
 *   console.error()) も一緒に除いてしまう
 *
 * @param {import('playwright').Page} page
 * @param {string} url - サーバの URL
 * @return {{url: string, text: string}[]}
 */
export function console_errors(page, url) {
    const origin = new URL(url).origin;

    return page.ytbg_errors.filter(e => {
        if (!e.url.startsWith(origin)) {
            return false;
        }
        return true;
    });
}

/**
 * 要素の中心の座標 (ページ座標) を返す。
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @return {Promise<{x: number, y: number}>}
 */
export async function center_of(page, selector) {
    const box = await page.locator(selector).boundingBox();
    if (box === null) {
        throw new Error(`no bounding box: ${selector}`);
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * 条件が成り立つまで待つ。成り立った時点の値を返す。
 *
 * @param {function(): Promise<any>} get - 値を取る
 * @param {function(any): boolean} ok - 判定
 * @param {{timeout?: number, interval?: number, msg?: string}} [opts]
 * @return {Promise<any>}
 */
export async function wait_for(get, ok, opts = {}) {
    const timeout = opts.timeout || 5000;
    const interval = opts.interval || 50;
    const limit = Date.now() + timeout;

    let value = undefined;
    for (;;) {
        value = await get();
        if (ok(value)) {
            return value;
        }
        if (Date.now() > limit) {
            throw new Error(
                `${opts.msg || 'wait_for'}: timeout.`
                    + ` last value=${JSON.stringify(value)}`);
        }
        await sleep(interval);
    }
}

/**
 * @param {number} msec
 * @return {Promise<void>}
 */
export function sleep(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
}

/**
 * メッセージを 1 通、サーバへ送る (TODO-051)。
 *
 * ページの中で ws.js を import して emit_msg() を呼ぶ。main.js が
 * 読んだものと同じ URL なので、同じモジュール (つないである
 * WebSocket) が使われる。テスト専用の type は無いので、盤面の用意も
 * 残っている type で行う。
 *
 * @param {import('playwright').Page} page
 * @param {string} type
 * @param {Object} data
 * @return {Promise<void>}
 */
export function send_msg(page, type, data) {
    return page.evaluate(async ([type, data]) => {
        const { emit_msg } = await import('/static/js/ws.js');
        emit_msg(type, data);
    }, [type, data]);
}

/**
 * サーバの turn を変えて、届くまで待つ (TODO-051)。
 *
 * - 0 / 1: turn が 2 以上なら opening (winner を指定)。
 *   0 と 1 の間は end_turn
 * - 2: turn が 2 以上なら opening (winner: -1)
 * - -1: moves が空で score が 1 の move (得点が 1 増える)
 *
 * 0 / 1 / -1 から 2 へは戻せない (opening は turn が 2 以上のときしか
 * 受け付けない)。そのときは例外にする。
 *
 * @param {import('playwright').Page} page
 * @param {number} turn
 */
export async function set_turn(page, turn) {
    const cur = await page.evaluate(() => board.gameinfo.turn);
    if (cur === turn) {
        return;
    }
    if (turn === -1) {
        await send_msg(page, 'move', {
            player: 0, moves: [], dice: [0, 0, 0, 0], score: 1,
        });
    } else if (cur >= 2) {
        await send_msg(page, 'opening', { winner: turn >= 2 ? -1 : turn });
    } else if ((cur === 0 || cur === 1) && turn === 1 - cur) {
        await send_msg(page, 'end_turn', { player: cur });
    } else {
        throw new Error(`set_turn: ${cur} -> ${turn} はできない`);
    }
    await wait_for(
        () => page.evaluate(() => board.gameinfo.turn),
        t => t === turn, { msg: `set_turn(${turn})` });
}

/**
 * 画面に出ているダイスの目を、表示から読む (TODO-052)。
 *
 * ダイスは目を持たない (表示は apply() が gameinfo から作る) ので、
 * 要素の状態から戻す。隠れている (z が負) なら 0、暗い (opacity 0.5) なら
 * 11〜16、それ以外は画像のファイル名の数字。gameinfo.board.dice と
 * 比べれば、表示まで届いたかが分かる。
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @return {Promise<number[]>}
 */
export async function shown_dice(page, player) {
    const els = await page.evaluate(p => board.roll_btn[p].dice.map(
        d => ({ z: d.z, src: d.image_el.src,
                opacity: d.image_el.style.opacity })), player);
    return dice_from_els(els);
}

/**
 * shown_dice() の読み替えの部分。ページの中で要素の状態
 * ({z, src, opacity}) だけを取り、ここで目に直す (押したのと同じ
 * evaluate の中で読みたいときに使う)
 *
 * @param {{z: number, src: string, opacity: string}[]} els
 * @return {number[]}
 */
export function dice_from_els(els) {
    return els.map(e => {
        if (e.z < 0) {
            return 0;
        }
        const n = parseInt(e.src.match(/(\d)\.[a-z]+$/)[1]);
        return e.opacity === '0.5' ? n + 10 : n;
    });
}
