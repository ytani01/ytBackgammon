//
// (c) Yoichi Tanibayashi
//
// ブラウザでの動作確認の共通部分 (TODO-021)。
//
// サーバを実プロセスとして起動 → chromium でページを開く →
// 操作する → ページの中の board を読む、という流れを組み立てる。
//
// **テスト本体はページの中の board を直接触らない。** 盤面を読む、
// 受信を差し替える、予測を観測する、といった操作は下の関数を通す。
// board の形が変わっても、ここだけを直せば済むようにするため。
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

    await wait_board(page);

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

// ------------------------------------------------------------------
// ページの中の board を読む・触る
//
// テスト本体から board を直接触らないように、ここに集める。
// 関数は board の形ではなく、テストが見たいことで分けてある。
// 1 つの evaluate の中で続けて行う必要があるもの (返事が届く前に
// 読むもの、包んでから呼んで戻すもの) は、1 つの関数にしてある。
// ------------------------------------------------------------------

/**
 * board ができるまで待つ。
 *
 * 既定では、サーバからの最初の gameinfo が駒の位置に反映されるまで待つ。
 * received: false なら、board が組み上がるところまでしか待たない
 * (サーバにつながないページで使う)。
 *
 * @param {import('playwright').Page} page
 * @param {{received?: boolean}} [opts]
 * @return {Promise<void>}
 */
export async function wait_board(page, { received = true } = {}) {
    if (!received) {
        await page.waitForFunction(
            () => typeof board !== 'undefined' && board !== undefined
                && board.cube !== undefined);
        return;
    }
    await page.waitForFunction(
        () => typeof board !== 'undefined' && board !== undefined
            && board.checker !== undefined
            && board.checker[0][0].cur_point !== undefined);
}

// --- 盤面を読む ---

/**
 * 今の gameinfo の写し。まだ届いていなければ undefined
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object|undefined>}
 */
export function gameinfo(page) {
    return page.evaluate(() => board.gameinfo);
}

/**
 * 画面ごとの設定
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{player: number, sound: boolean, free_move: boolean,
 *                   disp_pip: boolean}>}
 */
export function settings(page) {
    return page.evaluate(() => {
        const s = board.settings;
        return { player: s.player, sound: s.sound,
                 free_move: s.free_move, disp_pip: s.disp_pip };
    });
}

/**
 * サーバの ID (URL の ?board=N。cookie の名前に入る)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number>}
 */
export function server_id(page) {
    return page.evaluate(() => board.svr_id);
}

/**
 * 表示している駒。checker[player][num] の形で、point は表示の位置
 * (配り直しで決まる cur_point)。w / h は要素の大きさ
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{id: string, player: number, num: number, point: number,
 *                   x: number, y: number, z: number,
 *                   w: number, h: number}[][]>}
 */
export function checkers(page) {
    return page.evaluate(() => board.checker.map(p => p.map(ch => ({
        id: ch.id, player: ch.player, num: ch.num, point: ch.cur_point,
        x: ch.x, y: ch.y, z: ch.z,
        w: ch.el.clientWidth, h: ch.el.clientHeight,
    }))));
}

/**
 * そのポイントに積まれた駒 (下から順) と、先端の駒
 *
 * @param {import('playwright').Page} page
 * @param {number} point
 * @return {Promise<{ids: string[], z: number[], tip: string|undefined}>}
 */
export function stack(page, point) {
    return page.evaluate(point => {
        const at = board.checkers_at(point);
        return { ids: at.map(c => c.id), z: at.map(c => c.z),
                 tip: board.top_checker(point)?.id };
    }, point);
}

/**
 * 掴んでいる駒。掴んでいなければ undefined。
 * src は掴んだときの位置 [x, y]
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{id: string, point: number, x: number, y: number,
 *                   src: number[]}|undefined>}
 */
export function dragging(page) {
    return page.evaluate(() => {
        const ch = board.drag.checker;
        if (ch === undefined) {
            return undefined;
        }
        return { id: ch.id, point: ch.cur_point, x: ch.x, y: ch.y,
                 src: board.drag.checker_src };
    });
}

/**
 * 表示部品の状態 (2 人ぶんのものは [0, 1] の配列)
 *
 * - roll_active: Roll ボタンが出ているか
 * - clock_active: クロックが動いているか
 * - clock_limit: 持ち時間 (秒) [分の入力, 秒の入力]
 * - player_name: 名前の表示
 * - cube_y1: キューブを置く y 座標 [プレーヤー 0 の側, 1 の側]
 * - pip: PIP の表示 (count は表示している値、opacity は出ているか)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object>}
 */
export function shown_parts(page) {
    return page.evaluate(() => {
        const both = f => [0, 1].map(f);
        return {
            roll_active: both(p => board.roll_btn[p].active),
            clock_active: both(p => board.player_clock[p].active),
            clock_limit: board.clock_limit.limit.slice(),
            player_name: both(p => board.player_name[p].name),
            cube_y1: board.cube.y1.slice(),
            pip: both(p => ({ count: board.pip[p].pip_count,
                              opacity: board.pip[p].el.style.opacity })),
        };
    });
}

/**
 * 表示部品が持っている要素の id。部品を取り違えていないかを見るため
 * (2 人ぶんのものは [0, 1] の配列)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object>}
 */
export function part_el_ids(page) {
    return page.evaluate(() => {
        const both = f => [0, 1].map(f);
        const id = obj => obj.el?.id;
        return {
            board: id(board), cube: id(board.cube),
            button_resign: id(board.button_resign),
            button_inverse: id(board.button_inverse),
            button_fwd: id(board.button_fwd),
            button_back: id(board.button_back),
            checker: board.checker.map(p => p.map(ch => ({
                el_id: id(ch), player: ch.player, num: ch.num }))),
            dice: both(p => board.roll_btn[p].dice.map(id)),
            roll_btn: both(p => id(board.roll_btn[p])),
            pass_btn: both(p => id(board.pass_btn[p])),
            win_btn: both(p => id(board.win_btn[p])),
            resign_banner_btn: both(p => id(board.resign_banner_btn[p])),
            score: both(p => id(board.score[p])),
            score_up: both(p => id(board.score_btn[p].up)),
            score_down: both(p => id(board.score_btn[p].down)),
            player_name: both(p => id(board.player_name[p])),
            player_name_input: both(p => board.player_name[p].el_input?.id),
            player_clock: both(p => id(board.player_clock[p])),
            player_clock_bg: both(p => board.player_clock[p].el_bg?.id),
            pip: both(p => id(board.pip[p])),
        };
    });
}

/**
 * 今の盤面からのルールの判定 (2 人ぶんのものは [0, 1] の配列)。
 *
 * patch を渡すと、gameinfo のその項目を判定の間だけ書き換え、
 * 判定のあとに戻す。resign は、判定したあと・戻す前の値
 * (判定が gameinfo を書き換えていないかを見るため)。
 *
 * - count / owner: ポイント 0〜27 ごとの枚数と持ち主
 * - winner: 勝ちの点数 (0 なら勝ちではない)
 *
 * @param {import('playwright').Page} page
 * @param {Object} [patch]
 * @return {Promise<{count: number[], owner: (number|null)[],
 *                   winner: number[], closeout: boolean[],
 *                   active_dice: number[][], has_dice: boolean[],
 *                   resign: number}>}
 */
export function judge(page, patch = {}) {
    return page.evaluate(patch => {
        const save = {};
        for (const k of Object.keys(patch)) {
            save[k] = board.gameinfo[k];
            board.gameinfo[k] = patch[k];
        }
        try {
            const both = f => [0, 1].map(f);
            const pos = board.position();
            const points = Array.from({ length: 28 }, (_, i) => i);
            return {
                count: points.map(i => pos.count(i)),
                owner: points.map(i => pos.owner(i)),
                winner: both(p => board.winner_is(p)),
                closeout: both(p => board.closeout(p)),
                active_dice: both(p => board.get_active_dice(p)),
                has_dice: both(p => board.has_dice(p)),
                resign: board.gameinfo?.resign,
            };
        } finally {
            for (const k of Object.keys(save)) {
                board.gameinfo[k] = save[k];
            }
        }
    }, patch);
}

/**
 * PIP を計算し直す [プレーヤー 0, 1]。**表示も更新する** (Board と同じ)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number[]>}
 */
export function pip_count(page) {
    return page.evaluate(() => [board.pip_count(0), board.pip_count(1)]);
}

/**
 * src から dice で行けるポイント
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @param {number} src
 * @param {number[]} dice
 * @return {Promise<number[]>}
 */
export function dst_points(page, player, src, dice) {
    return page.evaluate(([player, src, dice]) => board.get_dst_points(
        player, src, dice), [player, src, dice]);
}

// --- 受信を差し替える ---

/**
 * サーバから届いたことにして、gameinfo を盤面に反映する。
 * サーバへは何も送らない。opts は sec (既定 0) と last_op
 *
 * @param {import('playwright').Page} page
 * @param {Object} gi
 * @param {{sec?: number, last_op?: Object}} [opts]
 * @return {Promise<void>}
 */
export function apply_gameinfo(page, gi, opts = {}) {
    return page.evaluate(([gi, opts]) => {
        board.apply(gi, { sec: 0, ...opts });
    }, [gi, opts]);
}

/**
 * gameinfo を last_op 付きで反映し、鳴らした音と、回したダイスの
 * プレーヤーを返す。音は鳴らさずに名前 (sound_roll / sound_put /
 * sound_hit / sound_turn_change) を貯める
 *
 * @param {import('playwright').Page} page
 * @param {Object} gi
 * @param {Object} last_op
 * @return {Promise<{sound: string[], roll: number[]}>}
 */
export function effects_of_apply(page, gi, last_op) {
    return page.evaluate(([gi, last_op]) => {
        const sound = [];
        const roll = [];
        const names = ['sound_roll', 'sound_put', 'sound_hit',
                       'sound_turn_change'];
        for (const name of names) {
            board[name].play = () => { sound.push(name); };
        }
        for (let p = 0; p < 2; p++) {
            const btn = board.roll_btn[p];
            btn.set = function (dice, roll_flag = false) {
                if (roll_flag) {
                    roll.push(p);
                }
                return Object.getPrototypeOf(this).set.call(
                    this, dice, roll_flag);
            };
        }
        try {
            board.apply(gi, { sec: 0, last_op: last_op });
        } finally {
            for (const name of names) {
                delete board[name].play;
            }
            for (let p = 0; p < 2; p++) {
                delete board.roll_btn[p].set;
            }
        }
        return { sound, roll };
    }, [gi, last_op]);
}

/**
 * サーバの返事を受け取るたびに、last_op.src を window.__seen_src に貯める
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function record_received_src(page) {
    return page.evaluate(() => {
        window.__seen_src = [];
        // load_gameinfo(gameinfo, sec, history_flag, clock_state, last_op)
        const orig_load = board.load_gameinfo;
        board.load_gameinfo = function (...args) {
            const last_op = args[4];
            if ( last_op ) {
                window.__seen_src.push(last_op.src);
            }
            return orig_load.apply(this, args);
        };
    });
}

/**
 * 盤面を表示に反映するたびに (予測でもサーバの返事でも)、
 * 「そのときの盤面」を window.__applied に貯める。
 *
 * 貯めるのは {has_last_op, has_clock_state, sn, point}。point は
 * 反映したあとの駒の表示位置 [player][num]。
 * 先行実行とサーバの返事のどちらで表示が変わったのかを、
 * あとから順番に見られるようにする。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function record_apply(page) {
    return page.evaluate(() => {
        window.__applied = [];
        // 包みを重ねない (重ねると 1 回の apply() で何度も貯まる)
        if (window.__orig_apply === undefined) {
            window.__orig_apply = board.apply;
        }
        const orig = window.__orig_apply;
        board.apply = function (gameinfo, opts = {}) {
            const ret = orig.call(this, gameinfo, opts);
            window.__applied.push({
                // 予測には last_op も clock_state も付かない
                has_last_op: Boolean(opts.last_op),
                has_clock_state: Boolean(opts.clock_state),
                sn: gameinfo.sn,
                point: board.checker.map(p => p.map(ch => ch.cur_point)),
            });
            return ret;
        };
    });
}

/**
 * record_apply() で貯めたものを取り出して空にする
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object[]>}
 */
export function take_applied(page) {
    return page.evaluate(() => window.__applied.splice(0));
}

// --- 予測を観測する ---

/**
 * 予測をわざと外す。動かした (最後の手の) 駒を point に置いたことにする。
 * 戻すのは restore_prediction()
 *
 * @param {import('playwright').Page} page
 * @param {number} point
 * @return {Promise<void>}
 */
export function corrupt_prediction(page, point) {
    return page.evaluate(point => {
        const orig = Object.getPrototypeOf(board).predict_gameinfo;
        board.predict_gameinfo = function (...args) {
            const gameinfo = orig.apply(this, args);
            const moves = args[0];
            const ch = moves[moves.length - 1].ch;
            const ch_i = parseInt(ch.id.slice(1)) % 100;
            gameinfo.board.checker[ch.player][ch_i] = [point, 0];
            return gameinfo;
        };
    }, point);
}

/**
 * 予測を失敗させる (例外を投げる)。戻すのは restore_prediction()
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function fail_prediction(page) {
    return page.evaluate(() => {
        board.predict_gameinfo = function () {
            throw new Error('predict failed (test)');
        };
    });
}

/**
 * corrupt_prediction() / fail_prediction() を戻す
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function restore_prediction(page) {
    return page.evaluate(() => { delete board.predict_gameinfo; });
}

// --- 操作する ---

/**
 * 駒を point へ置く操作をする (サーバへ送る。free move のドロップと同じ)
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @param {number} num
 * @param {number} point
 * @return {Promise<void>}
 */
export function send_put_checker(page, player, num, point) {
    return page.evaluate(async ([player, num, point]) => {
        const { put_checker } = await import('/static/js/actions.js');
        put_checker(board, board.checker[player][num], point);
    }, [player, num, point]);
}

/**
 * 駒を手元の盤面だけで point へ置く (サーバへは送らない)。
 * 置く前の表示位置を返す
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @param {number} num
 * @param {number} point
 * @return {Promise<number>}
 */
export function put_checker_local(page, player, num, point) {
    return page.evaluate(([player, num, point]) => {
        const ch = board.checker[player][num];
        const src = ch.cur_point;
        board.put_checker(ch, point);
        return src;
    }, [player, num, point]);
}

/**
 * 部品の押したときの処理を、座標を経ずに直接呼ぶ。
 * name は 'roll' (player の Roll ボタン) か 'resign' (投了ボタン)
 *
 * @param {import('playwright').Page} page
 * @param {'roll'|'resign'} name
 * @param {number} [player=0]
 * @return {Promise<void>}
 */
export function press_part(page, name, player = 0) {
    return page.evaluate(([name, player]) => {
        const part = { roll: () => board.roll_btn[player],
                       resign: () => board.button_resign }[name]();
        part.on_mouse_down_xy(0, 0);
    }, [name, player]);
}

/**
 * free move の on/off を、チェックボックスを経ずに切り替える
 *
 * @param {import('playwright').Page} page
 * @param {boolean} on
 * @return {Promise<void>}
 */
export function set_free_move(page, on) {
    return page.evaluate(v => {
        document.getElementById('free-move').checked = v;
        board.settings.apply_free_move();
    }, on);
}

/**
 * パスのバナー (プレーヤー 0) を出して押し、押した直後の状態を返す。
 *
 * 押したのと同じタスクの中で読む。サーバの返事の load_gameinfo() →
 * set_turn() もバナーを全部 off() にするので、返事が届いてから見ると
 * on_pass の off() を確かめたことにならない。
 *
 * @param {import('playwright').Page} page
 * @param {'click'|'space'} how - バナーを押すか、スペースキーか
 * @return {Promise<{shown: boolean, active: boolean}>}
 */
export function press_pass_banner(page, how) {
    return page.evaluate(how => {
        const btn = board.pass_btn[0];

        if (how === 'space') {
            // Roll ボタンが出ているとスペースキーはそちらへ行く
            board.roll_btn[0].off();
        }
        btn.on();
        const shown = btn.active;

        if (how === 'click') {
            const r = btn.el.getBoundingClientRect();
            btn.el.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
            }));
        } else {
            document.body.dispatchEvent(
                new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        }

        const active = btn.active;
        return { shown, active };
    }, how);
}

/**
 * 要素を、返事を待たずに続けて n 回押し、押し終えた直後の状態を返す。
 *
 * 1 回の evaluate の中で押して読むので、その間にサーバの返事は届かない。
 *
 * @param {import('playwright').Page} page
 * @param {string} id
 * @param {number} n
 * @return {Promise<{score: number[], shown: string, dice: number[],
 *                   shown_dice: number[]}>} - shown はプレーヤー 0 の
 *     得点の表示、dice / shown_dice はプレーヤー 0 の gameinfo と表示のダイス
 */
export function press_n(page, id, n) {
    return page.evaluate(([id, n]) => {
        const el = document.getElementById(id);
        for (let i = 0; i < n; i++) {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
            }));
        }
        return { score: board.gameinfo.score.slice(),
                 shown: board.score[0].el.innerHTML,
                 dice: board.gameinfo.board.dice[0].slice(),
                 dice_els: board.roll_btn[0].dice.map(
                     d => ({ z: d.z, src: d.image_el.src,
                             opacity: d.image_el.style.opacity })) };
    }, [id, n]).then(({ dice_els, ...r }) => (
        { ...r, shown_dice: dice_from_els(dice_els) }));
}

/**
 * プレーヤー 0 のバナーを出す。押されたら window.__clicked に
 * バナーの id を入れる (押したときの処理はそのまま呼ぶ)。
 * name は 'resign' (投了) か 'win' (勝ち)。バナーの id を返す
 *
 * @param {import('playwright').Page} page
 * @param {'resign'|'win'} name
 * @return {Promise<string>}
 */
export function show_banner(page, name) {
    return page.evaluate(name => {
        const b = { resign: board.resign_banner_btn,
                    win: board.win_btn }[name][0];
        const orig = b.on_click;
        window.__clicked = undefined;
        b.on_click = btn => {
            window.__clicked = btn.id;
            orig(btn);
        };
        b.on();
        return b.id;
    }, name);
}

/**
 * show_banner() で出したバナーを消す
 *
 * @param {import('playwright').Page} page
 * @param {'resign'|'win'} name
 * @return {Promise<void>}
 */
export function hide_banner(page, name) {
    return page.evaluate(name => {
        ({ resign: board.resign_banner_btn,
           win: board.win_btn })[name][0].off();
    }, name);
}

/**
 * キューブを掴む → 駒 (p000) を掴む → キューブを dy だけ下へ動かして
 * 離す → 駒をその場で離す、を 1 つのタスクの中で行い (マルチタッチ)、
 * その間に送ったメッセージの type を返す
 *
 * @param {import('playwright').Page} page
 * @param {number} dy - キューブの y0 からの距離
 * @return {Promise<string[]>}
 */
export function drop_cube_while_holding_checker(page, dy) {
    return page.evaluate(dy => {
        const sent = [];
        const orig = WebSocket.prototype.send;
        WebSocket.prototype.send = function (d) {
            sent.push(JSON.parse(d));
            return orig.call(this, d);
        };
        try {
            const cube = board.cube;
            board.drag.hold_cube(cube.x, cube.y);
            const ch = board.checker[0][0];
            board.drag.pick_checker(ch, ch.x, ch.y);
            board.drag.move_cube(cube.x, cube.y0 + dy);
            board.drag.drop_cube(cube.x, cube.y0 + dy);
            board.drag.drop_checker(ch.x, ch.y);
        } finally {
            WebSocket.prototype.send = orig;
        }
        return sent.map(m => m.type);
    }, dy);
}
