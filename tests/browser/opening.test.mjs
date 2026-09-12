//
// (c) Yoichi Tanibayashi
//
// 先手決め (opening roll) の経路の確認 (TODO-041)。
//
//   node --test tests/browser/
//
// turn >= 2 のとき、Roll を押した 2 秒後に dice[0] の
// on_mouse_down_xy() が自動で呼ばれる (RollButton.on_mouse_down_xy())。
// この自動クリックの this がずれていても、free move でないときは
// this.value を読まない枝を通るので、見た目には気づけない。
// そこで free move でも 1 件見る。
//
// ダイスの目は roll() が乱数で決めるので、振ったあとに
// emit_dice() でサーバ経由の値へ置き換えてから 2 秒を待つ。
// **ローカルに set() するだけでは足りない** (roll() が送った
// メッセージへの返事が届いて、apply() が上書きしてしまう)。
//
// 各 it は先頭で set_opening() を呼んで turn とダイスを置き直し、
// free move も毎回設定するので、**書いた順に依存しない**
// (predict.test.mjs は 1 つの盤面を順に変えていくので依存する)。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, launch_browser, open_board, start_server, wait_for,
} from './helper.mjs';

/** 自動クリックまでの 2 秒 + 往復のぶん */
const AUTO_CLICK_WAIT = 8000;

/**
 * turn を 2 (先手決め) にして、両者のダイスを決め打ちで置く。
 *
 * @param {import('playwright').Page} page
 * @param {number[]} dice0 - プレーヤー 0 のダイス
 * @param {number[]} dice1 - プレーヤー 1 のダイス
 */
async function set_opening(page, dice0, dice1) {
    await page.evaluate(([d0, d1]) => {
        board.emit_turn(2, -1, false);
        board.roll_btn[0].emit_dice(d0, false, false);
        board.roll_btn[1].emit_dice(d1, false, false);
    }, [dice0, dice1]);

    await wait_for(
        () => page.evaluate(() => ({
            turn: board.turn,
            d0: board.roll_btn[0].get(),
            d1: board.roll_btn[1].get(),
        })),
        s => s.turn === 2
            && JSON.stringify(s.d0) === JSON.stringify(dice0)
            && JSON.stringify(s.d1) === JSON.stringify(dice1),
        { msg: 'set_opening' });
}

/**
 * free move の on/off を切り替える。
 *
 * @param {import('playwright').Page} page
 * @param {boolean} on
 */
async function set_free_move(page, on) {
    await page.evaluate(v => {
        document.getElementById('free-move').checked = v;
        board.apply_free_move();
    }, on);
    assert.equal(await page.evaluate(() => board.free_move), on);
}

describe('先手決め (opening roll)', () => {
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

    it('相手が振ったあとに Roll を押すと、2 秒後に先手が決まる',
       async () => {
           await set_free_move(page, false);

           // 相手 (プレーヤー 1) だけが振った状態にする
           await set_opening(page, [0, 0, 0, 0], [0, 0, 2, 0]);

           // 自分が Roll を押す。乱数で振ったあと、2 秒後の自動クリック
           // までにサーバ経由で目を 5 に置き換える
           await page.evaluate(() => {
               board.roll_btn[0].on_mouse_down_xy(0, 0);
               board.roll_btn[0].emit_dice([5, 0, 0, 0], false, false);
           });
           await wait_for(
               () => page.evaluate(() => board.roll_btn[0].get()),
               d => JSON.stringify(d) === JSON.stringify([5, 0, 0, 0]),
               { msg: 'force dice' });

           // 5 > 2 なので、自分が先手
           const state = await wait_for(
               () => page.evaluate(() => ({
                   turn: board.turn,
                   d0: board.roll_btn[0].get(),
                   d1: board.roll_btn[1].get(),
               })),
               s => s.turn !== 2,
               { msg: 'opening roll', timeout: AUTO_CLICK_WAIT });

           assert.equal(state.turn, 0, '先手が自分になっていない');
           assert.deepEqual(state.d0, [5, 0, 0, 2],
                            '両者の目が自分側に集まっていない');
           assert.deepEqual(state.d1, [0, 0, 0, 0],
                            '相手のダイスが消えていない');
       });

    it('free move でも、自動クリックが dice[0] を進める', async () => {
        // 自動クリックの this が RollButton になっていると、
        // free move の枝で this.value (RollButton には無い) を読み、
        // ダイスが NaN になる (TODO-041)
        await set_free_move(page, true);

        await set_opening(page, [0, 0, 0, 0], [0, 0, 2, 0]);

        await page.evaluate(() => {
            board.roll_btn[0].on_mouse_down_xy(0, 0);
            board.roll_btn[0].emit_dice([5, 0, 0, 0], false, false);
        });
        await wait_for(
            () => page.evaluate(() => board.roll_btn[0].get()),
            d => JSON.stringify(d) === JSON.stringify([5, 0, 0, 0]),
            { msg: 'force dice' });

        // free move では、クリックされたダイスの目が 1 つ進む
        const d0 = await wait_for(
            () => page.evaluate(() => board.roll_btn[0].get()),
            d => JSON.stringify(d) !== JSON.stringify([5, 0, 0, 0]),
            { msg: 'free move click', timeout: AUTO_CLICK_WAIT });

        assert.deepEqual(d0, [6, 0, 0, 0],
                         'dice[0] 以外が書き換わっている');
        assert.equal(await page.evaluate(() => board.turn), 2,
                     'free move で先手が決まってしまっている');

        await set_free_move(page, false);
    });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
