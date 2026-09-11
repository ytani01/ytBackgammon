//
// (c) Yoichi Tanibayashi
//
// ドラッグを離した瞬間の先行実行 (予測) の確認 (TODO-030)。
//
//   node --test tests/browser/
//
// Checker.on_mouse_up_xy() は、サーバの応答を待たずに
// 「動かしたあとの gameinfo」を予測して Board.apply() に渡す。
// ここで見るのは次の 5 つ。
//
//   1. 応答が無くても表示が変わる (先行実行)
//   2. 予測のあとで、使ったダイスが使用済みになる
//      (順番が逆だと、apply() が gameinfo の値に戻してしまう)
//   3. ヒットのときは 2 手ぶん (相手をバーへ、自分を移動先へ)
//   4. **予測が外れても、サーバから届く gameinfo で表示が戻る**
//   5. 予測は表示を変えるだけで、サーバへ何も送らない
//      (掴んでいる間に turn が -1 になったときの stop_clock)
//
// **作れている「外れ方」は「行き先が違う」1 種類だけ。** 次の外れ方は
// ここでは見ていない (TODO-030 のレビューでの指摘)。
//
//   - 他の人が同時に動かした (2 枚のタブ)。**verifier の担当**
//   - ヒットの扱いが違う (ヒットを予測したが実際は違う、逆も)
//   - turn が変わっていた (5 番は送信だけを見ており、収束は見ていない)
//   - score / playername / cube が飛んでいる
//
// 既存の board.test.mjs / clicks.test.mjs のドラッグは free move
// なので、先行実行を通らない (free move はサーバの応答だけで動く)。
//
// テストは書いた順に走り、1 つのサーバの盤面を順に変えていく。
// 並べ替えないこと。
//
// ページは 1 枚だけ開く (同時に走る他のテストと CPU を取り合うので、
// 増やすと待ち時間の判定が揺れる)。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    center_of, console_errors, launch_browser, open_board, start_server,
    wait_for,
} from './helper.mjs';

/**
 * 送ったメッセージを window.__sent に貯める。
 *
 * block が true のときは、本物の send を呼ばない。サーバへ届かないので、
 * 返事の gameinfo も来ない。表示が変わったら、それは先行実行の結果。
 *
 * @param {import('playwright').Page} page
 * @param {boolean} [block=false]
 */
function record_sent(page, block = false) {
    return page.evaluate(block => {
        window.__sent = [];
        // 包みを重ねない (block の包みが残ると、送れないままになる)
        if (window.__orig_send === undefined) {
            window.__orig_send = WebSocket.prototype.send;
        }
        const orig = window.__orig_send;
        WebSocket.prototype.send = function (d) {
            window.__ws = this;
            window.__sent.push(JSON.parse(d));
            if (block) {
                return undefined;
            }
            return orig.call(this, d);
        };
    }, block);
}

/**
 * 貯めたメッセージを取り出して空にする。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<Object[]>}
 */
function take_sent(page) {
    return page.evaluate(() => window.__sent.splice(0));
}

/**
 * board.apply() を包んで、呼ばれるたびに「そのときの盤面」を貯める。
 *
 * 先行実行とサーバの返事のどちらで表示が変わったのかを、
 * あとから順番に見られるようにする。
 *
 * @param {import('playwright').Page} page
 */
function record_apply(page) {
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
 * @param {import('playwright').Page} page
 * @return {Promise<Object[]>}
 */
function take_applied(page) {
    return page.evaluate(() => window.__applied.splice(0));
}

/**
 * ターンとダイスをサーバに設定して、届くまで待つ。
 *
 * @param {import('playwright').Page} page
 * @param {number[]} dice - [d0, d1, d2, d3]
 */
async function set_turn_dice(page, dice) {
    await page.evaluate(d => {
        board.emit_turn(0, -1, false);
        board.roll_btn[0].emit_dice(d, false, false);
    }, dice);

    await wait_for(
        () => page.evaluate(() => ({
            turn: board.turn,
            dice: board.roll_btn[0].get_active_dice(),
        })),
        s => s.turn === 0 && s.dice.length > 0,
        { msg: 'set_turn_dice' });
}

/**
 * point 6 の先端のチェッカー (掴まれるもの) の番号を返す。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number>}
 */
function tip_of_point6(page) {
    return page.evaluate(() => {
        const ch = board.point[6].checkers.slice(-1)[0];
        return parseInt(ch.id.slice(1)) % 100;
    });
}

/**
 * #p000 の上でボタンを押して、その場で離す (ワンタッチでのムーブ)。
 *
 * 掴まれるのは point 6 の先端のチェッカーで、離した場所が元の point の
 * ままなので、移動可能なポイントの先頭へ動く。
 *
 * @param {import('playwright').Page} page
 */
async function one_touch_move(page) {
    const pos = await center_of(page, '#p000');
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.mouse.up();
}

describe('ドラッグの先行実行 (予測)', () => {
    let server = undefined;
    let browser = undefined;
    let page = undefined;

    before(async () => {
        server = await start_server();
        browser = await launch_browser();
        page = await open_board(browser, server.url);
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (server !== undefined) {
            await server.stop();
        }
    });

    it('サーバの応答が無くても、離した瞬間に表示が変わる', async () => {
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);
        const sn0 = await page.evaluate(() => board.gameinfo.sn);

        // ここから先、送ったメッセージはサーバへ届かない
        await record_sent(page, true);
        await record_apply(page);

        await one_touch_move(page);

        const state = await page.evaluate(i => ({
            point: board.checker[0][i].cur_point,
            n3: board.point[3].checkers.length,
            n6: board.point[6].checkers.length,
            entry: board.gameinfo.board.checker[0][i],
            sn: board.gameinfo.sn,
            pip: board.pip[0].pip_count,
            // 使ったダイスは使用済み (3 -> 13) になっている。
            // 予測を反映する前に disable() すると、apply() が
            // gameinfo の値 (3) に戻してしまう
            dice: board.roll_btn[0].get(),
            active_dice: board.roll_btn[0].get_active_dice(),
        }), tip);

        // 表示 (サーバの応答は届いていない)
        assert.equal(state.point, 3, '先行実行で動いていない');
        assert.equal(state.n3, 1);
        assert.equal(state.n6, 4);
        assert.equal(state.pip, 164, 'pip が更新されていない');

        // 予測した gameinfo。sn は進めない
        assert.deepEqual(state.entry, [3, 0]);
        assert.equal(state.sn, sn0, '予測が sn を進めている');

        // 使ったダイス
        assert.deepEqual(state.dice, [13, 0, 0, 0]);
        assert.deepEqual(state.active_dice, []);

        // apply() は予測で 1 回だけ呼ばれた。last_op も clock_state も無い
        const applied = await take_applied(page);
        assert.equal(applied.length, 1);
        assert.equal(applied[0].has_last_op, false);
        assert.equal(applied[0].has_clock_state, false);
        assert.equal(applied[0].point[0][tip], 3);

        // 送ったメッセージ (TODO-030 より前と同じ)
        const sent = await page.evaluate(() => window.__sent);
        assert.deepEqual(
            sent.filter(m => m.type === 'put_checker').map(
                m => [m.data.ch, m.data.p, m.data.idx, m.history]),
            [[tip, 3, 0, false]]);
        assert.deepEqual(
            sent.filter(m => m.type === 'dice').map(
                m => [m.data.player, m.data.dice, m.data.roll, m.history]),
            [[0, [13, 0, 0, 0], false, true]]);

        // 送信を元に戻す。この it の操作はサーバへ届いていないので、
        // 次の it が送るメッセージへの返事で、表示はサーバの盤面に戻る
        await record_sent(page);
    });

    it('ヒットのときは 2 手ぶん動かし、2 本送る', async () => {
        // 相手のチェッカーを point 3 に 1 枚置く (ブロット)
        await page.evaluate(
            () => board.emit_put_checker(board.checker[1][0], 3, false));
        await wait_for(
            () => page.evaluate(() => board.checker[1][0].cur_point),
            p => p === 3, { msg: 'blot' });

        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);

        await one_touch_move(page);

        // 先行実行のぶん。ヒットされた駒はバー (27) へ
        const applied = await page.evaluate(
            () => window.__applied.slice(0, 1));
        assert.equal(applied.length, 1, '先行実行が行われていない');
        assert.equal(applied[0].has_last_op, false);
        assert.equal(applied[0].point[0][tip], 3);
        assert.equal(applied[0].point[1][0], 27);

        // 送ったメッセージ: 相手をバーへ、そのあと自分を移動先へ
        const sent = await page.evaluate(() => window.__sent);
        assert.deepEqual(
            sent.filter(m => m.type === 'put_checker').map(
                m => [m.data.ch, m.data.p, m.data.idx, m.history]),
            [[100, 27, 0, false], [tip, 3, 0, false]]);

        // サーバの返事でも同じ盤面になる
        await wait_for(
            () => page.evaluate(i => ({
                mine: board.checker[0][i].cur_point,
                hit: board.checker[1][0].cur_point,
                sn: board.gameinfo.sn,
            }), tip),
            s => s.mine === 3 && s.hit === 27,
            { msg: 'hit' });

        // 後始末: バーの駒を point 3 へ戻す (次の it のため)
        await page.evaluate(
            () => board.emit_put_checker(board.checker[1][0], 1, false));
        await wait_for(
            () => page.evaluate(() => board.checker[1][0].cur_point),
            p => p === 1, { msg: 'restore' });
    });

    it('予測が外れても、サーバの gameinfo で表示が戻る', async () => {
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);

        // わざと外れる予測を作る。動かしたチェッカーを、
        // サーバへ送る移動先 (3) ではなく 20 へ置いたことにする
        await page.evaluate(() => {
            const orig = board.predict_gameinfo;
            board.predict_gameinfo = function (moves) {
                const gameinfo = orig.call(this, moves);
                const ch = moves[moves.length - 1].ch;
                const ch_i = parseInt(ch.id.slice(1)) % 100;
                gameinfo.board.checker[ch.player][ch_i] = [20, 0];
                return gameinfo;
            };
        });

        await one_touch_move(page);

        // 予測どおり (= 間違ったところ) に表示されている
        const applied = await page.evaluate(
            () => window.__applied.slice(0, 1));
        assert.equal(applied.length, 1, '先行実行が行われていない');
        assert.equal(applied[0].has_last_op, false);
        assert.equal(applied[0].point[0][tip], 20,
                     'わざと外した予測が反映されていない');

        // サーバへ送った移動先は、予測を外しても 3 のまま
        const sent = await page.evaluate(() => window.__sent);
        assert.deepEqual(
            sent.filter(m => m.type === 'put_checker').map(
                m => [m.data.ch, m.data.p]),
            [[tip, 3]]);

        // サーバから届く gameinfo で、正しいところへ戻る
        const state = await wait_for(
            () => page.evaluate(i => ({
                point: board.checker[0][i].cur_point,
                n20: board.point[20].checkers.length,
                n3: board.point[3].checkers.length,
            }), tip),
            s => s.point === 3,
            { msg: 'correction' });
        assert.equal(state.n20, 0, 'point 20 にチェッカーが残っている');
        assert.equal(state.n3, 2);

        await page.evaluate(() => { delete board.predict_gameinfo; });
    });

    it('予測はサーバへ何も送らない (turn が -1 に変わっていても)',
       async () => {
           // 予測は apply() を通るので set_turn() まで走る。
           // set_turn() には「turn < 0 で勝者がいて、そのクロックが
           // 動作中なら stop_clock を送る」枝がある (TODO-015)。
           // **予測からは送らないこと** (TODO-030。同じメッセージが
           // 2 回飛ぶ)。
           //
           // 仕込み: player0 が全部あがった盤面 / turn = 1 /
           // player0 のクロックが動作中
           await record_sent(page);
           await page.evaluate(() => {
               for (let i = 0; i < 15; i++) {
                   board.emit_put_checker(board.checker[0][i], 0, false);
               }
               board.emit_turn(1, -1, false);
               board.roll_btn[1].emit_dice([3, 0, 0, 0], false, false);
               board.player_clock[0].emit_start();
           });
           await wait_for(
               () => page.evaluate(() => ({
                   n0: board.point[0].checkers.length,
                   turn: board.turn,
                   active0: board.player_clock[0].active,
                   dice: board.roll_btn[1].get_active_dice(),
                   win0: board.winner_is(0),
               })),
               s => s.n0 === 15 && s.turn === 1 && s.active0
                   && s.dice.length > 0 && s.win0 > 0,
               { msg: 'bearoff', timeout: 20000 });

           // player1 の駒を掴む (point 12 の先端。ダイス 3 で 15 へ動ける)
           const tip_id = await page.evaluate(
               () => board.point[12].checkers.slice(-1)[0].id);
           const pos = await center_of(page, `#${tip_id}`);
           await page.mouse.move(pos.x, pos.y);
           await page.mouse.down();

           // ここから自分の送信は止める。自分が送る stop_clock が
           // サーバへ届くと、返事でクロックが止まってしまい、
           // 「勝者のクロックが動作中のまま」を作れない
           await record_sent(page, true);

           // 掴んでいる間に、誰かが turn を -1 にした
           // (包んでいない send で直に流す)
           await page.evaluate(() => {
               window.__orig_send.call(window.__ws, JSON.stringify({
                   src: 'predict-test', type: 'set_turn',
                   data: { turn: -1, resign: -1 }, history: false,
               }));
           });
           await wait_for(() => page.evaluate(() => board.turn),
                          t => t === -1, { msg: 'turn -1' });

           // サーバから届いた gameinfo では、今までどおり送る
           assert.deepEqual(
               (await take_sent(page)).map(m => m.type), ['stop_clock'],
               'サーバの gameinfo で stop_clock を送っていない');
           assert.equal(
               await page.evaluate(() => board.player_clock[0].active),
               true, 'クロックが止まってしまった');

           // 離す (予測 -> apply() -> set_turn(-1))
           await page.mouse.up();
           assert.deepEqual(
               (await take_sent(page)).map(m => m.type),
               ['put_checker', 'dice'],
               '予測から stop_clock が飛んでいる');

           // put_checker() を直に呼ぶ経路も同じ
           await page.evaluate(
               () => board.put_checker(board.checker[1][5], 5));
           assert.deepEqual(
               await take_sent(page), [],
               'put_checker() から stop_clock が飛んでいる');
       });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
