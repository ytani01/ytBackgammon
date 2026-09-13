//
// (c) Yoichi Tanibayashi
//
// ヘッダ・メニュー・盤面のボタンを実際にクリックする確認 (TODO-028)。
//
//   node --test tests/browser/
//
// 1 項目ごとに「何を押して、何が送られたか (type と data)、
// board のどの属性が変わったか」を見る。1 つの操作は 1 通で送るので
// (TODO-051)、盤面を変える操作では、送ったのがその 1 通だけかも見る。
// メッセージに history は付かない。
//
// 送ったメッセージは WebSocket.prototype.send を包んで window.__sent に
// 貯める。confirm() (New Game と 履歴を削除) は自動で OK する。
// settle() は、それまでに送ったメッセージへの返事が出揃うのを待つ。
//
// テストは書いた順に走り、1 つのサーバの盤面を順に変えていく。
// 前の項目の結果に依存しているものがあるので、並べ替えないこと。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    center_of, console_errors, launch_browser, open_board, send_msg,
    dice_from_els, set_turn, sleep, start_server, wait_for,
} from './helper.mjs';

/**
 * 送ったメッセージを window.__sent に貯めるようにする。
 *
 * send は prototype で包むので、つないである WebSocket にも効く。
 * settle() のために、WebSocket (__ws) と元の send (__orig_send) を控え、
 * 届いた gameinfo の last_op.src を __seen_src に貯める。
 *
 * @param {import('playwright').Page} page
 */
async function record_sent(page) {
    page.on('dialog', d => d.accept());
    await page.evaluate(() => {
        window.__sent = [];
        window.__seen_src = [];
        const orig = WebSocket.prototype.send;
        window.__orig_send = orig;
        WebSocket.prototype.send = function (d) {
            window.__ws = this;
            window.__sent.push(JSON.parse(d));
            return orig.call(this, d);
        };
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

let settle_n = 0;

/**
 * それまでに送ったメッセージへの返事 (gameinfo) が出揃うまで待つ。
 *
 * load_gameinfo() はバナーを全部 off() にしてから turn に応じて出し直す。
 * 返事が届く前にバナーを on() にすると、あとから届いた返事で消されて揺れる。
 *
 * 目印を付けたメッセージを 1 本送り、その返事 (last_op.src が目印) が
 * 届くのを待つ。サーバは 1 つの接続のメッセージを順に処理するので、
 * 目印の返事が届いたときには、それより前の返事は届いている。
 * 返事を返さないメッセージ (登録表に無い type、連続再生) もあるので、
 * 送った数と届いた数を比べる形にはしない。
 *
 * 目印には、プレーヤー 1 の名前を今の値のまま送る。
 * このファイルはプレーヤー 1 の名前を変えないので、盤面は変わらない。
 * 元の send で送るので __sent には入らない。
 *
 * @param {import('playwright').Page} page
 */
async function settle(page) {
    const src = `settle-${++settle_n}`;
    await page.evaluate(src => {
        const name = board.gameinfo.board.playername[1];
        window.__orig_send.call(window.__ws, JSON.stringify({
            src: src, type: 'set_playername',
            data: { player: 1, name: name },
        }));
    }, src);
    await wait_for(
        () => page.evaluate(s => window.__seen_src.includes(s), src),
        seen => seen, { msg: 'settle' });
}

/**
 * 貯めたメッセージを取り出して空にする。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{type: string, data: any}[]>}
 */
function take_sent(page) {
    return page.evaluate(() => window.__sent.splice(0));
}

/**
 * 条件に合うメッセージが送られるまで待ち、そのメッセージを返す。
 *
 * @param {import('playwright').Page} page
 * @param {function({type: string, data: any}): boolean} match
 * @param {string} msg - タイムアウトしたときに出す名前
 * @return {Promise<{type: string, data: any}>}
 */
async function wait_sent(page, match, msg) {
    const sent = await wait_for(
        () => page.evaluate(() => window.__sent.slice()),
        s => s.some(match),
        { msg });
    return sent.find(match);
}

/**
 * type のメッセージが送られるまで待ち、data を比べる。
 * history が付いていないことも見る (TODO-051)。
 *
 * @param {import('playwright').Page} page
 * @param {string} type
 * @param {any} data
 */
async function assert_sent(page, type, data) {
    const m = await wait_sent(page, m => m.type === type, type);
    assert.deepEqual(m.data, data);
    assert.equal('history' in m, false, `${type}: history を送っている`);
}

/**
 * type のメッセージが送られるのを待ち、返事が出揃ってから、送ったのが
 * その 1 通だけであることを確かめる (TODO-051)。
 *
 * 1 つの操作が何通にも分かれていた頃は、手番を渡すだけで 5 通
 * (dice / stop_clock / set_player_clock / start_clock / set_turn) 送っていた。
 *
 * @param {import('playwright').Page} page
 * @param {string} type
 * @param {any} data - 関数なら data を渡して判定する
 */
async function assert_only_sent(page, type, data) {
    await wait_sent(page, m => m.type === type, type);
    await settle(page);
    const sent = await take_sent(page);
    assert.deepEqual(sent.map(m => m.type), [type],
                     `1 通だけではない: ${JSON.stringify(sent)}`);
    if (typeof data === 'function') {
        assert.ok(data(sent[0].data), JSON.stringify(sent[0].data));
    } else {
        assert.deepEqual(sent[0].data, data);
    }
    assert.equal('history' in sent[0], false, `${type}: history を送っている`);
}

/**
 * パスのバナーを出して押し、押した直後の状態を返す。
 *
 * 押したのと同じタスクの中で読む。サーバの返事の load_gameinfo() →
 * set_turn() もバナーを全部 off() にするので、返事が届いてから見ると
 * on_pass の off() を確かめたことにならない。
 *
 * @param {import('playwright').Page} page
 * @param {'click'|'space'} how - バナーを押すか、スペースキーか
 * @return {Promise<{shown: boolean, active: boolean}>}
 */
function press_pass(page, how) {
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

describe('クリックでの操作', () => {
    let server = undefined;
    let browser = undefined;
    let page = undefined;

    before(async () => {
        server = await start_server();
        browser = await launch_browser();
        page = await open_board(browser, server.url);
        await record_sent(page);
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (server !== undefined) {
            await server.stop();
        }
    });

    const board_attr = name => page.evaluate(n => board[n], name);
    const turn = () => page.evaluate(() => board.gameinfo.turn);

    /**
     * メニューを開いて項目を押す。押す前に貯めたメッセージは捨てる
     *
     * @param {string} text - 項目の文字
     */
    const menu = async (text) => {
        await page.locator('#nav-open').click();
        await take_sent(page);
        await page.getByText(text, { exact: true }).click();
    };

    /**
     * board.player が want になるまで待つ (回転は 0.5 秒かけて動く)
     *
     * @param {number} want
     */
    const wait_player = want => wait_for(
        () => board_attr('player'), p => p === want, { msg: 'player' });

    // --- メニュー ---

    it('メニュー「ボード回転」→ board.player が反転し、メニューが閉じる',
       async () => {
           const p0 = await board_attr('player');
           await menu('ボード回転');
           await wait_player(1 - p0);
           assert.equal(
               await page.evaluate(
                   () => document.getElementById('nav-input').checked),
               false, 'メニューが閉じていない');

           // 元の向きに戻しておく
           await menu('ボード回転');
           await wait_player(p0);
       });

    for (const [text, type, data] of [
        ['1つ戻す', 'back', { n: 1 }],
        ['連続で戻す', 'back2', {}],
        ['連続で戻す(高速)', 'back_all', {}],
        ['1つ進める', 'fwd', { n: 1 }],
        ['連続で進める', 'fwd2', {}],
        ['連続で進める(高速)', 'fwd_all', {}],
        ['履歴を削除', 'clear_hist', {}],
        ['New Game', 'new', {}],
    ]) {
        it(`メニュー「${text}」→ ${type} ${JSON.stringify(data)} を送る`,
           async () => {
               await menu(text);
               await assert_sent(page, type, data);
           });
    }

    it('確認をキャンセルすると「履歴を削除」は送られない', async () => {
        // 共有ボードなので、全員の履歴が消える。confirm で止まること
        // そのものを見る (page.on('dialog') は自動で OK するので、
        // ここだけ window.confirm を差し替える)
        await page.evaluate(() => {
            window.__orig_confirm = window.confirm;
            window.confirm = () => false;
        });
        try {
            await menu('履歴を削除');
            await settle(page);
            const sent = await take_sent(page);
            assert.deepEqual(sent.filter(m => m.type === 'clear_hist'), []);
        } finally {
            await page.evaluate(() => {
                window.confirm = window.__orig_confirm;
            });
        }
    });

    // --- ヘッダ ---

    it('ヘッダ Sound → board.sound が反転する', async () => {
        const s0 = await board_attr('sound');
        await page.locator('#sound-switch').click();
        assert.equal(await board_attr('sound'), !s0);
        await page.locator('#sound-switch').click();
        assert.equal(await board_attr('sound'), s0);
    });

    it('ヘッダ Free → board.free_move が true になる', async () => {
        await page.locator('#free-move').click();
        assert.equal(await board_attr('free_move'), true);
        await page.locator('#free-move').click();
        assert.equal(await board_attr('free_move'), false);
    });

    it('ヘッダ Pip → board.disp_pip が true になる', async () => {
        await page.locator('#disp-pip').click();
        assert.equal(await board_attr('disp_pip'), true);
        await page.locator('#disp-pip').click();
        assert.equal(await board_attr('disp_pip'), false);
    });

    it('ヘッダ Clock → set_clock_switch {switch: false} だけを送る',
       async () => {
           // クロックを止めるのはサーバ (TODO-050)。stop_clock は送らない
           await settle(page);
           await take_sent(page);
           await page.locator('#clock_sw').click();
           await assert_only_sent(page, 'set_clock_switch',
                                  { switch: false });

           // 元に戻す
           await page.locator('#clock_sw').click();
           await assert_only_sent(page, 'set_clock_switch',
                                  { switch: true });
       });

    // gameinfo が届くたびに、持ち時間の入力は 2 つともサーバの値で
    // 書き戻される (Board.load_gameinfo())。1 つ目の返事が届く前に
    // 2 つ目を触ると、入れた値が消えて揺れるので、届くのを待ってから
    // 次へ進む。change は fill() のあとの blur() で 1 回だけ起こす
    it('ヘッダ 持ち時間 (分) → set_clock_limit {index: 0} だけを送る',
       async () => {
           await settle(page);
           await take_sent(page);
           await page.locator('#clock_limit0').fill('3');
           await page.locator('#clock_limit0').blur();
           await assert_only_sent(page, 'set_clock_limit',
                                  { index: 0, clock_limit: 180 });
           await wait_for(
               () => page.evaluate(() => board.clock_limit.limit[0]),
               v => v === 180, { msg: 'clock_limit[0]' });
       });

    it('ヘッダ 持ち時間 (秒) → set_clock_limit {index: 1} だけを送る',
       async () => {
           await settle(page);
           await take_sent(page);
           await page.locator('#clock_limit1').fill('15');
           await page.locator('#clock_limit1').blur();
           await assert_only_sent(page, 'set_clock_limit',
                                  { index: 1, clock_limit: 15 });
           await wait_for(
               () => page.evaluate(() => board.clock_limit.limit[1]),
               v => v === 15, { msg: 'clock_limit[1]' });
       });

    it('名前の入力 → set_playername を送る', async () => {
        await take_sent(page);
        await page.locator('#p0name-input').fill('Alice');
        await page.locator('#p0name-input').blur();
        // onChange と onFocusOut の両方から送られるので、有無だけを見る
        await assert_sent(page, 'set_playername',
                          { player: 0, name: 'Alice' });
    });

    // 名前の <input> は focusout と change の両方から emit_playername() を
    // 呼んでいる。上の fill() → blur() はどちらか片方でも通ってしまうので、
    // 片方ずつしか通らない操作で 2 本に分けて見る (TODO-029)。
    //
    // プレーヤー 1 の名前は settle() の目印なので、ここでは触らない

    it('名前の入力: 打たずにフォーカスを外す → set_playername を送る'
       + ' (focusout)',
       async () => {
           // 値を決めておく。ここまでの送信は捨てる
           await page.locator('#p0name-input').fill('Bob');
           await page.locator('#p0name-input').blur();
           await settle(page);
           await take_sent(page);

           // 打たないので change は起きない。focusout だけが残る
           await page.locator('#p0name-input').focus();
           await page.locator('#p0name-input').blur();

           await assert_sent(page, 'set_playername',
                             { player: 0, name: 'Bob' });
       });

    it('名前の入力: 打って Enter → フォーカスを外す前に set_playername を'
       + '送る (change)',
       async () => {
           await settle(page);
           await take_sent(page);

           // Enter を押すだけ。フォーカスは外さないので focusout は起きない
           await page.locator('#p0name-input').focus();
           await page.keyboard.press('Control+a');
           await page.keyboard.type('Carol');
           await page.keyboard.press('Enter');

           assert.equal(
               await page.evaluate(
                   () => document.activeElement && document.activeElement.id),
               'p0name-input', 'フォーカスが外れている');

           await assert_sent(page, 'set_playername',
                             { player: 0, name: 'Carol' });

           // 次の項目のためにフォーカスを戻しておく
           await page.locator('#p0name-input').blur();
           await settle(page);
       });

    // --- 盤面のボタン ---

    it('盤面の戻すボタン → back {n: 1} を送る', async () => {
        await take_sent(page);
        await page.locator('#button-back').click({ force: true });
        await assert_sent(page, 'back', { n: 1 });
    });

    it('盤面の進めるボタン → fwd {n: 1} を送る', async () => {
        await take_sent(page);
        await page.locator('#button-fwd').click({ force: true });
        await assert_sent(page, 'fwd', { n: 1 });
    });

    it('盤面の回転ボタン → board.player が反転する', async () => {
        const p0 = await board_attr('player');
        await page.locator('#button-inverse').click({ force: true });
        await wait_player(1 - p0);
        await page.locator('#button-inverse').click({ force: true });
        await wait_player(p0);
    });

    it('スコアの ▲ → set_score {player: 0, score: +1} を送る', async () => {
        await settle(page);
        const s0 = await page.evaluate(() => board.gameinfo.score[0]);
        await take_sent(page);
        await page.locator('#score_up0').click({ force: true });
        await assert_only_sent(page, 'set_score',
                               { player: 0, score: s0 + 1 });
    });

    it('スコアの ▼ → set_score {player: 0, score: 0} を送る', async () => {
        await take_sent(page);
        await page.locator('#score_down0').click({ force: true });
        await assert_only_sent(page, 'set_score', { player: 0, score: 0 });
    });

    /**
     * 要素を、返事を待たずに続けて n 回押し、押し終えた直後の状態を返す。
     *
     * 1 回の evaluate の中で押すので、その間にサーバの返事は届かない。
     * 手元の写しを持たずに gameinfo を読むので、先に表示 (apply()) して
     * いないと 2 回目も同じ値を送ってしまう (TODO-052)
     *
     * @param {string} id
     * @param {number} n
     * @return {Promise<{score: number[], shown: string, dice: number[],
     *                   shown_dice: number[]}>}
     */
    const press_n = (id, n) => page.evaluate(([id, n]) => {
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
    }, [id, n]).then(r => ({ ...r, shown_dice: dice_from_els(r.dice_els) }));

    it('スコアの ▲ を返事の前に 2 回押す → 2 回ぶん足される', async () => {
        // 上の ▼ で 0 になっている
        await settle(page);
        const s0 = await page.evaluate(() => board.gameinfo.score[0]);
        await take_sent(page);

        const r = await press_n('score_up0', 2);
        // 返事の前に、表示と gameinfo が 2 つ進んでいる (先行実行)
        assert.equal(r.score[0], s0 + 2, 'gameinfo が 2 つ進んでいない');
        assert.equal(r.shown, String(s0 + 2), '表示が 2 つ進んでいない');

        await settle(page);
        const sent = await take_sent(page);
        assert.deepEqual(sent.map(m => [m.type, m.data]), [
            ['set_score', { player: 0, score: s0 + 1 }],
            ['set_score', { player: 0, score: s0 + 2 }],
        ]);
        assert.equal(await page.evaluate(() => board.gameinfo.score[0]),
                     s0 + 2, 'サーバの盤面が 2 つ進んでいない');

        // 元に戻す
        await page.locator('#score_down0').click({ force: true });
        await assert_only_sent(page, 'set_score', { player: 0, score: 0 });
    });

    it('free move でダイスを返事の前に 2 回押す → 目が 2 つ進む', async () => {
        await send_msg(page, 'dice', { player: 0, dice: [5, 0, 0, 0] });
        await wait_for(
            () => page.evaluate(() => board.gameinfo.board.dice[0]),
            d => d[0] === 5, { msg: 'dice' });
        await page.locator('#free-move').click();
        try {
            await settle(page);
            await take_sent(page);

            // 5 -> 6 -> 1
            const r = await press_n('dice00', 2);
            assert.deepEqual(r.dice, [1, 0, 0, 0],
                             'gameinfo が 2 つ進んでいない');
            assert.deepEqual(r.shown_dice, [1, 0, 0, 0],
                             '表示が 2 つ進んでいない');

            await settle(page);
            const sent = await take_sent(page);
            assert.deepEqual(sent.map(m => [m.type, m.data]), [
                ['dice', { player: 0, dice: [6, 0, 0, 0] }],
                ['dice', { player: 0, dice: [1, 0, 0, 0] }],
            ]);
            assert.deepEqual(
                await page.evaluate(() => board.gameinfo.board.dice[0]),
                [1, 0, 0, 0], 'サーバの盤面が 2 つ進んでいない');
        } finally {
            await page.locator('#free-move').click();
            // 次の項目 (キューブ) はダイスが空の前提
            await send_msg(page, 'dice', { player: 0, dice: [0, 0, 0, 0] });
            await wait_for(
                () => page.evaluate(() => board.gameinfo.board.dice[0]),
                d => d.every(v => v === 0), { msg: 'dice clear' });
        }
    });

    it('スコアの ▲ / ▼ の上に、押せなくする要素が重なっていない', async () => {
        // 数字の要素 (p0score / p1score) は ▲ の 7 割、▼ の 4 割を
        // 覆っている。pointer-events: none でクリックを下のボタンへ
        // 通している (TODO-048)。付け忘れると、覆われた部分を押しても
        // 何も起きない (クリックを受ける数字の側に振り分けが無いため)。
        // 上の 2 件はボタンの中心を押すだけなので、中心が覆われて
        // いなければ気づけない。ボタンの範囲を 2px 刻みで全部見る
        const covered = await page.evaluate(() => {
            let bad = {};
            for (const id of ['score_up0', 'score_down0',
                              'score_up1', 'score_down1']) {
                const el = document.getElementById(id);
                const r = el.getBoundingClientRect();
                let n = 0;
                for (let dx = 1; dx < r.width; dx += 2) {
                    for (let dy = 1; dy < r.height; dy += 2) {
                        const hit = document.elementFromPoint(
                            r.left + dx, r.top + dy);
                        if ( ! el.contains(hit) ) {
                            n += 1;
                        }
                    }
                }
                if ( n > 0 ) {
                    bad[id] = n;
                }
            }
            return bad;
        });
        assert.deepEqual(covered, {},
                         `ボタンが覆われている: ${JSON.stringify(covered)}`);
    });

    // --- ゲームを進める操作 (TODO-051) ---

    it('キューブを動かす → double {player: 0} だけを送る', async () => {
        // New Game のあとなので、キューブは中央でテイク済み、ダイスは空。
        // 手番を自分 (プレーヤー 0) にする
        await set_turn(page, 0);
        await settle(page);
        await take_sent(page);

        const pos = await center_of(page, '#cube');
        await page.mouse.move(pos.x, pos.y);
        await page.mouse.down();
        await page.mouse.move(pos.x + 5, pos.y + 5, { steps: 2 });
        await page.mouse.up();

        await assert_only_sent(page, 'double', { player: 0 });
        await wait_for(
            () => page.evaluate(() => board.gameinfo.board.cube),
            c => c.side === 1 && c.value === 2 && c.accepted === false,
            { msg: 'double' });

        // 後始末: プレーヤー 1 がテイクしたことにする (次の Roll のため)
        await send_msg(page, 'take', { player: 1 });
        await wait_for(
            () => page.evaluate(() => board.gameinfo.board.cube.accepted),
            a => a === true, { msg: 'take' });
    });

    /**
     * キューブを今の位置から dy だけドラッグする
     *
     * @param {number} dy
     */
    const drag_cube = async (dy) => {
        // サーバの返事で置き直したキューブは move_sec (0.3 秒) かけて動く。
        // 動いている途中の位置を押すと掴めない
        await sleep(500);
        const pos = await center_of(page, '#cube');
        await page.mouse.move(pos.x, pos.y);
        await page.mouse.down();
        await page.mouse.move(pos.x, pos.y + dy, { steps: 20 });
        await page.mouse.up();
    };

    /**
     * サーバのキューブが want になるまで待つ
     *
     * @param {{side: number, value: number, accepted: boolean}} want
     */
    const wait_cube = want => wait_for(
        () => page.evaluate(() => board.gameinfo.board.cube),
        c => c.side === want.side && c.value === want.value
            && c.accepted === want.accepted,
        { msg: `cube ${JSON.stringify(want)}` });

    it('掛けられたキューブを反対側へ動かす (リダブル) → double {player: 0} '
       + 'だけを送る', async () => {
        // 上の項目のあと: キューブは 2 でプレーヤー 1 の側、テイク済み、
        // turn は 0。プレーヤー 1 に掛けさせて、自分 (0) の側に未テイクで置く
        await set_turn(page, 1);
        await send_msg(page, 'double', { player: 1 });
        await wait_cube({ side: 0, value: 4, accepted: false });
        await settle(page);
        await take_sent(page);

        // 自分の側 (下) から中央より上へ動かす
        const dy = await page.evaluate(
            () => board.cube.y1[1] - board.cube.y1[0]);
        await drag_cube(dy);

        await assert_only_sent(page, 'double', { player: 0 });
        await wait_cube({ side: 1, value: 8, accepted: false });
    });

    it('掛けられたキューブを自分の側で動かす (テイク) → take {player: 0} '
       + 'だけを送る', async () => {
        // プレーヤー 1 にテイクさせてから掛けさせ、自分の側に未テイクで置く
        await send_msg(page, 'take', { player: 1 });
        await wait_cube({ side: 1, value: 8, accepted: true });
        await send_msg(page, 'double', { player: 1 });
        await wait_cube({ side: 0, value: 16, accepted: false });
        await settle(page);
        await take_sent(page);

        // 中央を越えない
        await drag_cube(5);

        await assert_only_sent(page, 'take', { player: 0 });
        await wait_cube({ side: 0, value: 16, accepted: true });

        // 次の Roll のために手番を自分に戻す
        await set_turn(page, 0);
    });

    it('Roll ボタン → roll {player: 0, dice} だけを送る', async () => {
        await settle(page);
        await take_sent(page);
        await page.locator('#rollbutton0').click({ force: true });
        // 2 個 (ゾロ目なら 4 個)。使えない目は 11〜16
        await assert_only_sent(page, 'roll', d =>
            d.player === 0 && d.dice.length === 4
                && [2, 4].includes(d.dice.filter(v => v !== 0).length)
                && d.dice.every(v => v === 0 || (v % 10 >= 1 && v % 10 <= 6)));
    });

    it('ダイスが出ているときにキューブを動かす → 何も送らない', async () => {
        // Roll のあとなので、ダイスが出ていて turn は 0。キューブは
        // テイクの項目のまま自分の側でテイク済みなので、ダイスが無ければ
        // double を送る盤面 (TODO-052)
        await settle(page);
        assert.ok(await page.evaluate(() => board.has_dice(0)), 'ダイスが無い');
        await take_sent(page);

        await drag_cube(5);

        await settle(page);
        assert.deepEqual(await take_sent(page), []);
    });

    it('クロックを押す → 止まっていれば resume_clock、動いていれば '
       + 'stop_clock を 1 通だけ送る', async () => {
        // キューブの操作でクロックが切り替わっているので、動いているか
        // どうかはここで読む
        await settle(page);
        const active0 = await page.evaluate(() => board.player_clock[0].active);
        for (const active of [active0, !active0]) {
            await take_sent(page);
            await page.locator('#p0clock').click({ force: true });
            await assert_only_sent(
                page, active ? 'stop_clock' : 'resume_clock', { player: 0 });
            await wait_for(
                () => page.evaluate(() => board.player_clock[0].active),
                a => a === !active, { msg: 'clock' });
        }
    });

    it('使えるダイスが無いときにダイスを押す → end_turn {player: 0} '
       + 'だけを送る', async () => {
        // Roll のあとなので turn は 0。目を使えないもの (11〜16) にする
        await send_msg(page, 'dice', { player: 0, dice: [13, 15, 0, 0] });
        await wait_for(
            () => page.evaluate(() => board.gameinfo.board.dice[0]),
            d => d[0] === 13 && d[1] === 15, { msg: 'dice' });
        await settle(page);
        await take_sent(page);

        await page.locator('#dice00').click({ force: true });

        await assert_only_sent(page, 'end_turn', { player: 0 });
        await wait_for(() => turn(), t => t === 1,
                       { msg: 'turn' });
    });

    // --- バナー (押したときの動作は on_click で渡している) ---

    it('パスのバナー → その場で消えて、end_turn {player: 0} だけを送る',
       async () => {
           await set_turn(page, 0);
           await settle(page);
           await take_sent(page);
           const r = await press_pass(page, 'click');
           assert.equal(r.shown, true, 'パスのバナーが出ていない');
           assert.equal(r.active, false, 'パスのバナーが消えていない');
           await assert_only_sent(page, 'end_turn', { player: 0 });

           // サーバの返事で turn が 1 になるのを待つ
           await wait_for(() => turn(), t => t === 1,
                          { msg: 'turn' });
       });

    it('スペースキー (パスのバナーが出ているとき) → その場で消えて '
       + 'end_turn {player: 0} だけを送る',
       async () => {
           await set_turn(page, 0);
           await settle(page);
           await take_sent(page);
           const r = await press_pass(page, 'space');
           assert.equal(r.shown, true, 'パスのバナーが出ていない');
           assert.equal(r.active, false, 'パスのバナーが消えていない');
           await assert_only_sent(page, 'end_turn', { player: 0 });
       });

    for (const [name, list] of [['投了', 'resign_banner_btn'],
                                ['勝ち', 'win_btn']]) {
        it(`${name}のバナー → on_click が呼ばれ、何も送らない`, async () => {
            await settle(page);
            // on_click を包んで、呼ばれたことを記録する
            const id = await page.evaluate(l => {
                const b = board[l][0];
                const orig = b.on_click;
                window.__clicked = undefined;
                b.on_click = btn => {
                    window.__clicked = btn.id;
                    orig(btn);
                };
                b.on();
                return b.id;
            }, list);
            await take_sent(page);
            await page.locator(`#${id}`).click({ force: true });

            await wait_for(() => page.evaluate(() => window.__clicked),
                           c => c === id, { msg: 'on_click' });
            // on_click はその場で送るので、呼ばれた時点で出揃っている。
            // 念のため少し待ってから見る
            await sleep(200);
            assert.deepEqual(await take_sent(page), []);

            await page.evaluate(l => board[l][0].off(), list);
        });
    }

    // --- キーボード (Ctrl-Z / Ctrl-Y) ---

    for (const [key, type] of [['z', 'back'], ['y', 'fwd']]) {
        it(`Ctrl-${key.toUpperCase()} → ${type} {n: 1} を送る`, async () => {
            await settle(page);
            await take_sent(page);
            await page.evaluate(k => {
                document.body.dispatchEvent(new KeyboardEvent('keydown', {
                    key: k, ctrlKey: true, bubbles: true,
                }));
            }, key);
            await assert_sent(page, type, { n: 1 });
        });
    }

    it('投了ボタン → resign {player: 0, score} だけを送る', async () => {
        // TODO-051 より前は stop_clock 2 通・set_turn・set_score を送っていた
        await settle(page);
        const cube = await page.evaluate(() => board.gameinfo.board.cube);
        const score = cube.accepted ? cube.value * 3 : cube.value / 2;
        await take_sent(page);
        await page.locator('#button-resign').click({ force: true });
        await assert_only_sent(page, 'resign', { player: 0, score: score });
        await wait_for(() => turn(), t => t === -1,
                       { msg: 'resign' });
    });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });

    it('gameinfo が届く前にキューブ・▲・Roll を押す → 何も送らず、'
       + 'エラーも出ない', async () => {
        // サーバにつながず、ページが送ったものだけを受ける (TODO-052)。
        // 判定が gameinfo の無いことを見ていなければ、送るか、
        // gameinfo を読んで TypeError になる
        const p = await browser.newPage();
        const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        const received = [];
        await p.routeWebSocket(/\/ws$/, ws => {
            ws.onMessage(m => received.push(m));
        });
        try {
            await p.goto(server.url);
            await p.waitForFunction(
                () => typeof board !== 'undefined' && board !== undefined
                    && board.cube !== undefined);

            await p.evaluate(() => {
                const fire = (el, type) => {
                    const r = el.getBoundingClientRect();
                    el.dispatchEvent(new MouseEvent(type, {
                        bubbles: true,
                        clientX: r.x + r.width / 2,
                        clientY: r.y + r.height / 2,
                    }));
                };
                const cube = document.getElementById('cube');
                fire(cube, 'mousedown');
                fire(cube, 'mouseup');
                fire(document.getElementById('score_up0'), 'mousedown');
                fire(document.getElementById('rollbutton0'), 'mousedown');
                // つながっていて送れることの確かめ。履歴の操作は
                // gameinfo を読まずに送る
                fire(document.getElementById('button-back'), 'mousedown');
            });
            await wait_for(() => received.length, n => n > 0,
                           { msg: 'back' });
            await sleep(200);

            assert.equal(await p.evaluate(() => board.gameinfo), undefined);
            assert.deepEqual(received.map(m => JSON.parse(m).type), ['back']);
            assert.deepEqual(errors, []);
        } finally {
            await p.close();
        }
    });
});
