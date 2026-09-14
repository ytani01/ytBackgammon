//
// (c) Yoichi Tanibayashi
//
// ブラウザでの動作確認の共通部分 (TODO-021)。
//
// サーバを実プロセスとして起動 → chromium でページを開く →
// 操作する → ページの中の board を読む、という流れを組み立てる。
// ページの中の board は main.js が公開する {controller, view}
// (BoardController と BoardView)。
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
 * YTBG_TEST_HEADED が空でも 0 でもなければ、画面を表示して chromium を起動する。
 * YTBG_TEST_SLOWMO (ミリ秒) を渡すと、playwright の操作ごとに待ちを入れる
 * (TODO-062)。
 */
const HEADED = !['', '0'].includes(process.env.YTBG_TEST_HEADED ?? '');
const SLOWMO = Number(process.env.YTBG_TEST_SLOWMO) || 0;

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
    return chromium.launch({
        executablePath: CHROMIUM_PATH,
        headless: !HEADED,
        slowMo: SLOWMO,
    });
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
 * 要素の CSS の transition が終わるまで待つ。
 *
 * 描画で位置が変わる部品 (キューブは 0.3 秒かけて動く) は、動いている
 * 途中で center_of() を読むと、マウスを下ろしたときにはもう別の場所にある。
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @return {Promise<void>}
 */
export async function wait_still(page, selector) {
    await page.waitForFunction(
        sel => document.querySelector(sel).getAnimations().length === 0,
        selector);
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
    const cur = await page.evaluate(() => board.controller.gameinfo.turn);
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
        () => page.evaluate(() => board.controller.gameinfo.turn),
        t => t === turn, { msg: `set_turn(${turn})` });
}

/**
 * 画面に出ているダイスの目を、表示から読む (TODO-052)。
 *
 * ダイスは目を持たない (表示は BoardView.render() が gameinfo から作る) ので、
 * 要素の状態から戻す。隠れている (z が負) なら 0、暗い (opacity 0.5) なら
 * 11〜16、それ以外は画像のファイル名の数字。gameinfo.board.dice と
 * 比べれば、表示まで届いたかが分かる。
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @return {Promise<number[]>}
 */
export async function shown_dice(page, player) {
    const els = await page.evaluate(p => board.view.dice[p].map(
        d => ({ z: d.z, src: d.image_el.src,
                opacity: d.image_el.style.opacity })), player);
    return dice_from_els(els);
}

/**
 * ダイスの要素の回転 (style.transform) を読む。隠れているものも含めて 4 個
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @return {Promise<string[]>} - 例: "rotate(180deg)"
 */
export function dice_transforms(page, player) {
    return page.evaluate(p => [0, 1, 2, 3].map(
        i => document.getElementById(`dice${p}${i}`).style.transform), player);
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
                && board.view !== undefined);
        return;
    }
    await page.waitForFunction(
        () => typeof board !== 'undefined' && board !== undefined
            && board.view !== undefined
            && board.view.checker[0][0].cur_point !== undefined);
}

// --- 盤面を読む ---

/**
 * 今の gameinfo の写し。まだ届いていなければ undefined
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object|undefined>}
 */
export function gameinfo(page) {
    return page.evaluate(() => board.controller.gameinfo);
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
        const s = board.controller.settings;
        return { player: s.player, sound: s.sound,
                 free_move: s.free_move, disp_pip: s.disp_pip };
    });
}

/**
 * サーバの ID (<body data-server-id>。cookie の名前に入る)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<string>}
 */
export function server_id(page) {
    return page.evaluate(() => document.body.dataset.serverId);
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
    return page.evaluate(() => board.view.checker.map(p => p.map(ch => ({
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
        const at = board.controller.checkers_at(point)
              .filter(id => id % 100 < 15)
              .map(id => board.view.checker[Math.floor(id / 100)][id % 100]);
        return { ids: at.map(c => c.id), z: at.map(c => c.z),
                 tip: board.view.top_checker(point)?.id };
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
        const drag = board.view.drag;
        const ch = drag.checker;
        if (ch === undefined) {
            return undefined;
        }
        return { id: ch.id, point: ch.cur_point, x: ch.x, y: ch.y,
                 src: drag.checker_src };
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
        const { controller, view } = board;
        return {
            roll_active: both(p => view.roll_btn[p].active),
            clock_active: controller.clock.active.slice(),
            clock_limit: controller.clock.limit.slice(),
            player_name: both(p => view.player_name[p].name),
            cube_y1: view.cube.y1.slice(),
            pip: both(p => ({ count: view.pip[p].pip_count,
                              opacity: view.pip[p].el.style.opacity })),
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
        const v = board.view;
        return {
            board: id(v.board), cube: id(v.cube),
            button_resign: id(v.button_resign),
            button_inverse: id(v.button_inverse),
            button_fwd: id(v.button_fwd),
            button_back: id(v.button_back),
            checker: v.checker.map(p => p.map(ch => ({
                el_id: id(ch), player: ch.player, num: ch.num }))),
            dice: both(p => v.dice[p].map(id)),
            roll_btn: both(p => id(v.roll_btn[p])),
            pass_btn: both(p => id(v.pass_btn[p])),
            win_btn: both(p => id(v.win_btn[p])),
            resign_banner_btn: both(p => id(v.resign_banner_btn[p])),
            score: both(p => id(v.score[p])),
            score_up: both(p => id(v.score_btn[p].up)),
            score_down: both(p => id(v.score_btn[p].down)),
            player_name: both(p => id(v.player_name[p])),
            player_name_input: both(p => v.player_name[p].el_input?.id),
            player_clock: both(p => id(v.player_clock[p])),
            player_clock_bg: both(p => v.player_clock[p].el_bg?.id),
            pip: both(p => id(v.pip[p])),
        };
    });
}

/**
 * 今の盤面からのルールの判定 (2 人ぶんのものは [0, 1] の配列)。
 *
 * ページの中で rules/ を import し、BoardController の gameinfo で呼ぶ
 * (main.js が読んだものと同じモジュール)。
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
    return page.evaluate(async patch => {
        const { Position, active_dice, has_dice } = await import(
            '/static/js/rules/position.js');
        const { closeout, winner_is } = await import(
            '/static/js/rules/judge.js');
        const gi = board.controller.gameinfo;
        const save = {};
        for (const k of Object.keys(patch)) {
            save[k] = gi[k];
            gi[k] = patch[k];
        }
        try {
            const both = f => [0, 1].map(f);
            const pos = Position.from_gameinfo(gi);
            const points = Array.from({ length: 28 }, (_, i) => i);
            return {
                count: points.map(i => pos.count(i)),
                owner: points.map(i => pos.owner(i)),
                winner: both(p => winner_is(pos, p, {
                    resign: gi.resign,
                    cube_value: gi.board.cube.value,
                    cube_accepted: gi.board.cube.accepted,
                }).score),
                closeout: both(p => closeout(pos, p)),
                active_dice: both(p => active_dice(gi, p)),
                has_dice: both(p => has_dice(gi, p)),
                resign: gi.resign,
            };
        } finally {
            for (const k of Object.keys(save)) {
                gi[k] = save[k];
            }
        }
    }, patch);
}

/**
 * 今の盤面の PIP [プレーヤー 0, 1]。計算するだけで、表示は変えない
 * (表示は BoardView.render() が変える)
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number[]>}
 */
export function pip_count(page) {
    return page.evaluate(async () => {
        const { Position } = await import('/static/js/rules/position.js');
        const { pip_count } = await import('/static/js/rules/judge.js');
        const pos = Position.from_gameinfo(board.controller.gameinfo);
        return [pip_count(pos, 0), pip_count(pos, 1)];
    });
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
    return page.evaluate(async ([player, src, dice]) => {
        const { Position } = await import('/static/js/rules/position.js');
        const { dst_points } = await import('/static/js/rules/move.js');
        return dst_points(Position.from_gameinfo(board.controller.gameinfo),
                          player, src, dice);
    }, [player, src, dice]);
}

// --- 受信を差し替える ---

/**
 * サーバから届いたことにして、gameinfo を盤面に反映する。
 * サーバへは何も送らない。opts は sec (既定 0) と last_op。
 * clock_state は渡さない (クロックは変えない)
 *
 * @param {import('playwright').Page} page
 * @param {Object} gi
 * @param {{sec?: number, last_op?: Object}} [opts]
 * @return {Promise<void>}
 */
export function apply_gameinfo(page, gi, opts = {}) {
    return page.evaluate(([gi, opts]) => {
        board.controller.receive({ gameinfo: gi, sec: 0, ...opts });
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
        const view = board.view;
        const sound = [];
        const roll = [];
        const names = ['sound_roll', 'sound_put', 'sound_hit',
                       'sound_turn_change'];
        for (const name of names) {
            view[name].play = () => { sound.push(name); };
        }
        view.roll_dice = function (player) {
            roll.push(player);
            return Object.getPrototypeOf(this).roll_dice.call(this, player);
        };
        try {
            board.controller.receive({ gameinfo: gi, sec: 0,
                                       last_op: last_op });
        } finally {
            for (const name of names) {
                delete view[name].play;
            }
            delete view.roll_dice;
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
        const c = board.controller;
        const orig_receive = c.receive;
        c.receive = function (data) {
            if ( data.last_op ) {
                window.__seen_src.push(data.last_op.src);
            }
            return orig_receive.call(this, data);
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
        const c = board.controller;
        // 包みを重ねない (重ねると 1 回の反映で何度も貯まる)
        if (window.__orig_receive === undefined) {
            window.__orig_receive = c.receive;
            window.__orig_predict = c.predict;
        }
        const push = (gameinfo, has_last_op, has_clock_state) => {
            window.__applied.push({
                // 予測には last_op も clock_state も付かない
                has_last_op: has_last_op,
                has_clock_state: has_clock_state,
                sn: gameinfo.sn,
                point: board.view.checker.map(
                    p => p.map(ch => ch.cur_point)),
            });
        };
        c.receive = function (data) {
            const ret = window.__orig_receive.call(this, data);
            push(data.gameinfo, Boolean(data.last_op),
                 Boolean(data.clock_state));
            return ret;
        };
        c.predict = function (gameinfo, opts) {
            const ret = window.__orig_predict.call(this, gameinfo, opts);
            push(gameinfo, false, false);
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
        const c = board.controller;
        const orig = Object.getPrototypeOf(c).plan_move;
        c.plan_move = function (...args) {
            const plan = orig.apply(this, args);
            if ( plan === null ) {
                return plan;
            }
            const moves = plan.message.data.moves;
            const id = moves[moves.length - 1].ch;
            plan.predicted.board.checker[Math.floor(id / 100)][id % 100] =
                [point, 0];
            return plan;
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
        board.controller.plan_move = function () {
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
    return page.evaluate(() => { delete board.controller.plan_move; });
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
    return page.evaluate(([player, num, point]) => {
        board.controller.put_checker(player * 100 + num, point);
    }, [player, num, point]);
}

/**
 * 駒を手元の盤面だけで point へ置く (サーバへは送らない)。
 * idx はそのポイントに既にある枚数。置く前の表示位置を返す
 *
 * @param {import('playwright').Page} page
 * @param {number} player
 * @param {number} num
 * @param {number} point
 * @return {Promise<number>}
 */
export function put_checker_local(page, player, num, point) {
    return page.evaluate(([player, num, point]) => {
        const { controller, view } = board;
        const src = view.checker[player][num].cur_point;
        const gi = structuredClone(controller.gameinfo);
        gi.board.checker[player][num] = [
            point, controller.checkers_at(point).length];
        controller.predict(gi, { sec: 0 });
        return src;
    }, [player, num, point]);
}

/**
 * 部品を押したときの操作を、座標を経ずに直接呼ぶ。
 * name は 'roll' (player の Roll ボタン) か 'resign' (投了ボタン)
 *
 * @param {import('playwright').Page} page
 * @param {'roll'|'resign'} name
 * @param {number} [player=0]
 * @return {Promise<void>}
 */
export function press_part(page, name, player = 0) {
    return page.evaluate(([name, player]) => {
        const c = board.controller;
        ({ roll: () => c.roll(player),
           resign: () => c.resign() })[name]();
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
        board.controller.settings.apply_free_move();
    }, on);
}

/**
 * パスのバナー (プレーヤー 0) を出して押し、押した直後の状態を返す。
 *
 * 押したのと同じタスクの中で読む。サーバの返事の描画もバナーを
 * 全部 off() にするので、返事が届いてから見ると、押したときに
 * 隠したことを確かめたことにならない。
 *
 * @param {import('playwright').Page} page
 * @param {'click'|'space'} how - バナーを押すか、スペースキーか
 * @return {Promise<{shown: boolean, active: boolean}>}
 */
export function press_pass_banner(page, how) {
    return page.evaluate(how => {
        const view = board.view;
        const btn = view.pass_btn[0];

        if (how === 'space') {
            // Roll ボタンが出ているとスペースキーはそちらへ行く
            view.roll_btn[0].off();
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
        const { controller, view } = board;
        const el = document.getElementById(id);
        for (let i = 0; i < n; i++) {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
            }));
        }
        return { score: controller.gameinfo.score.slice(),
                 shown: view.score[0].el.innerHTML,
                 dice: controller.gameinfo.board.dice[0].slice(),
                 dice_els: view.dice[0].map(
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
        const v = board.view;
        const b = { resign: v.resign_banner_btn, win: v.win_btn }[name][0];
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
        const v = board.view;
        ({ resign: v.resign_banner_btn, win: v.win_btn })[name][0].off();
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
            const { view } = board;
            const drag = view.drag;
            const cube = view.cube;
            drag.hold_cube(cube.x, cube.y);
            const ch = view.checker[0][0];
            drag.pick_checker(ch, ch.x, ch.y);
            drag.move_cube(cube.x, cube.y0 + dy);
            drag.drop_cube(cube.x, cube.y0 + dy);
            drag.drop_checker(ch.x, ch.y);
        } finally {
            WebSocket.prototype.send = orig;
        }
        return sent.map(m => m.type);
    }, dy);
}

// --- クロックと受信の保留 ---

/**
 * 時計の表示を要素から読む (2 人ぶん)。checked は Clock のチェックボックス
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{clock: {text: string, color: string, opacity: string}[],
 *                   checked: boolean}>}
 */
export function shown_clock(page) {
    return page.evaluate(() => ({
        clock: [0, 1].map(p => ({
            text: document.getElementById(`p${p}clock`).innerHTML,
            color: document.getElementById(`p${p}clock-bg`)
                .style.backgroundColor,
            opacity: document.getElementById(`p${p}clock`).style.opacity,
        })),
        checked: document.getElementById('clock_sw').checked,
    }));
}

/**
 * サーバから届いた gameinfo を、release_received() まで捨てる
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function hold_received(page) {
    return page.evaluate(() => {
        board.controller.receive = function () {};
    });
}

/**
 * hold_received() を戻す。捨てたものは届け直さない
 *
 * @param {import('playwright').Page} page
 * @return {Promise<void>}
 */
export function release_received(page) {
    return page.evaluate(() => { delete board.controller.receive; });
}

/**
 * バナーが出ているか (要素の hidden から読む。2 人ぶん [0, 1])。
 * name_on は名前が強調されている (色が明るい) か
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{pass: boolean[], win: boolean[], resign: boolean[],
 *                   name_on: boolean[]}>}
 */
export function shown_banners(page) {
    return page.evaluate(() => {
        const both = f => [0, 1].map(f);
        const shown = id => !document.getElementById(id).hidden;
        return {
            pass: both(p => shown(`passbutton${p}`)),
            win: both(p => shown(`winbutton${p}`)),
            resign: both(p => shown(`resignbutton${p}`)),
            name_on: both(p => document.getElementById(`p${p}name`)
                          .style.color === 'rgba(255, 255, 128, 0.8)'),
        };
    });
}

/**
 * 掴んでいるキューブの座標と z。掴んでいなければ undefined。
 * z_index / left / top は要素の style の値
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{x: number, y: number, z: number|undefined,
 *                   z_index: string, left: string,
 *                   top: string}|undefined>}
 */
export function holding_cube(page) {
    return page.evaluate(() => {
        if (!board.view.drag.cube) {
            return undefined;
        }
        const c = board.view.cube;
        return { x: c.x, y: c.y, z: c.z, z_index: c.el.style.zIndex,
                 left: c.el.style.left, top: c.el.style.top };
    });
}
