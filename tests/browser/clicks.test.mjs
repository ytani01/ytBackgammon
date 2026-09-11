//
// (c) Yoichi Tanibayashi
//
// ヘッダ・メニュー・盤面のボタンを実際にクリックする確認 (TODO-028)。
//
//   node --test tests/browser/
//
// 1 項目ごとに「何を押して、何が送られたか (type と data)、
// board のどの属性が変わったか」を見る。
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
    console_errors, launch_browser, open_board, sleep, start_server,
    wait_for,
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
 * 目印には、プレーヤー 1 の名前を今の値のまま送る (history: false)。
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
            data: { player: 1, name: name }, history: false,
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
 * type のメッセージが送られるまで待ち、data と history を比べる。
 *
 * history の期待値は、TODO-028 で分ける前の ytbg.js (390e397) が
 * 送っていた値に合わせてある。今のコードから写さないこと。
 *
 * @param {import('playwright').Page} page
 * @param {string} type
 * @param {any} data
 * @param {boolean} history
 */
async function assert_sent(page, type, data, history) {
    const m = await wait_sent(page, m => m.type === type, type);
    assert.deepEqual(m.data, data);
    assert.equal(m.history, history, `${type}: history`);
}

/**
 * パスのバナーを出して押し、押した直後の状態を返す。
 *
 * 押したのと同じタスクの中で読む。サーバの返事の load_gameinfo() →
 * set_turn() もバナーを全部 off() にするので、返事が届いてから見ると
 * on_pass の off() を確かめたことにならない。
 * change_turn() はインスタンスの上で包んで数え、終わったら外す。
 *
 * @param {import('playwright').Page} page
 * @param {'click'|'space'} how - バナーを押すか、スペースキーか
 * @return {Promise<{shown: boolean, active: boolean, called: number}>}
 */
function press_pass(page, how) {
    return page.evaluate(how => {
        const btn = board.pass_btn[0];
        const clock = board.player_clock[0];
        let called = 0;
        const orig = clock.change_turn;
        clock.change_turn = function (...args) {
            called++;
            return orig.apply(this, args);
        };

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
        delete clock.change_turn;   // prototype のものに戻す
        return { shown, active, called };
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
               await assert_sent(page, type, data, false);
           });
    }

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

    it('ヘッダ Clock → set_clock_switch {switch: false} を送る', async () => {
        await take_sent(page);
        await page.locator('#clock_sw').click();
        await assert_sent(page, 'set_clock_switch', { switch: false },
                          false);

        // 元に戻す
        await take_sent(page);
        await page.locator('#clock_sw').click();
        await assert_sent(page, 'set_clock_switch', { switch: true },
                          false);
    });

    // gameinfo が届くたびに、持ち時間の入力は 2 つともサーバの値で
    // 書き戻される (Board.load_gameinfo())。1 つ目の返事が届く前に
    // 2 つ目を触ると、入れた値が消えて揺れるので、届くのを待ってから
    // 次へ進む。change は fill() のあとの blur() で 1 回だけ起こす
    it('ヘッダ 持ち時間 (分) → set_clock_limit {index: 0} を送る',
       async () => {
           await take_sent(page);
           await page.locator('#clock_limit0').fill('3');
           await page.locator('#clock_limit0').blur();
           await assert_sent(page, 'set_clock_limit',
                             { index: 0, clock_limit: 180 }, true);
           await wait_for(
               () => page.evaluate(() => board.clock_limit.limit[0]),
               v => v === 180, { msg: 'clock_limit[0]' });
       });

    it('ヘッダ 持ち時間 (秒) → set_clock_limit {index: 1} を送る',
       async () => {
           await take_sent(page);
           await page.locator('#clock_limit1').fill('15');
           await page.locator('#clock_limit1').blur();
           await assert_sent(page, 'set_clock_limit',
                             { index: 1, clock_limit: 15 }, true);
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
                          { player: 0, name: 'Alice' }, true);
    });

    // --- 盤面のボタン ---

    it('盤面の戻すボタン → back {n: 1} を送る', async () => {
        await take_sent(page);
        await page.locator('#button-back').click({ force: true });
        await assert_sent(page, 'back', { n: 1 }, false);
    });

    it('盤面の進めるボタン → fwd {n: 1} を送る', async () => {
        await take_sent(page);
        await page.locator('#button-fwd').click({ force: true });
        await assert_sent(page, 'fwd', { n: 1 }, false);
    });

    it('盤面の回転ボタン → board.player が反転する', async () => {
        const p0 = await board_attr('player');
        await page.locator('#button-inverse').click({ force: true });
        await wait_player(1 - p0);
        await page.locator('#button-inverse').click({ force: true });
        await wait_player(p0);
    });

    it('スコアの ▲ → set_score {player: 0, score: +1} を送る', async () => {
        const s0 = await page.evaluate(() => board.score[0].score);
        await take_sent(page);
        await page.locator('#score_up0').click({ force: true });
        await assert_sent(page, 'set_score', { player: 0, score: s0 + 1 },
                          true);
    });

    // --- バナー (押したときの動作は on_click で渡している) ---

    it('パスのバナー → その場で消えて change_turn() を呼び、'
       + 'set_turn {turn: 1} を送る',
       async () => {
           await settle(page);
           await take_sent(page);
           const r = await press_pass(page, 'click');
           assert.equal(r.shown, true, 'パスのバナーが出ていない');
           assert.equal(r.active, false, 'パスのバナーが消えていない');
           assert.equal(r.called, 1, 'change_turn() が呼ばれていない');
           await assert_sent(page, 'set_turn', { turn: 1, resign: -1 }, true);

           // サーバの返事で turn が 1 になるのを待つ (次の項目のため)
           await wait_for(() => board_attr('turn'), t => t === 1,
                          { msg: 'turn' });
       });

    it('スペースキー (パスのバナーが出ているとき) → その場で消えて '
       + 'change_turn() を呼び、set_turn {turn: 1} を送る',
       async () => {
           await settle(page);
           await take_sent(page);
           const r = await press_pass(page, 'space');
           assert.equal(r.shown, true, 'パスのバナーが出ていない');
           assert.equal(r.active, false, 'パスのバナーが消えていない');
           assert.equal(r.called, 1, 'change_turn() が呼ばれていない');
           await assert_sent(page, 'set_turn', { turn: 1, resign: -1 }, true);
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

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
