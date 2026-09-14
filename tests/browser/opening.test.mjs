//
// (c) Yoichi Tanibayashi
//
// 先手決め (opening roll) の経路の確認 (TODO-041)。
//
//   node --test tests/browser/
//
// turn >= 2 のとき、Roll を押した 2 秒後に dice[0] を押したことになる
// (BoardController.roll() が click_dice(player, 0) を予約する)。
// 押すダイスを取り違えていても、free move でないときは
// 押したダイスの目を読まない枝を通るので、見た目には気づけない。
// そこで free move でも 1 件見る。
//
// ダイスの目は roll() が乱数で決めるので、振ったあとに
// dice を送ってサーバ経由の値へ置き換えてから 2 秒を待つ。
// **ローカルに set() するだけでは足りない** (roll() が送った
// メッセージへの返事が届いて、描画が上書きしてしまう)。
//
// 各 it は先頭で set_opening() を呼んで turn とダイスを置き直し、
// free move も毎回設定するので、**書いた順に依存しない**
// (predict.test.mjs は 1 つの盤面を順に変えていくので依存する)。
// 先手が決まったあと turn を 2 に戻す type は無いので、new で
// 盤面ごと戻す (TODO-051)。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, gameinfo, launch_browser, open_board, press_part,
    send_msg, set_free_move as apply_free_move, set_turn, settings,
    start_server, wait_for,
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
    if ( (await gameinfo(page)).turn < 2 ) {
        await send_msg(page, 'new', {});
        await wait_for(async () => (await gameinfo(page)).turn,
                       t => t === 2, { msg: 'new' });
    }
    await set_turn(page, 2);
    await send_msg(page, 'dice', { player: 0, dice: dice0 });
    await send_msg(page, 'dice', { player: 1, dice: dice1 });

    await wait_for(
        () => turn_dice(page),
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
    await apply_free_move(page, on);
    assert.equal((await settings(page)).free_move, on);
}

/**
 * turn と両者のダイス
 *
 * @param {import('playwright').Page} page
 * @return {Promise<{turn: number, d0: number[], d1: number[]}>}
 */
async function turn_dice(page) {
    const gi = await gameinfo(page);
    return { turn: gi.turn, d0: gi.board.dice[0], d1: gi.board.dice[1] };
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
           await press_part(page, 'roll', 0);
           await send_msg(page, 'dice', { player: 0, dice: [5, 0, 0, 0] });
           await wait_for(
               async () => (await gameinfo(page)).board.dice[0],
               d => JSON.stringify(d) === JSON.stringify([5, 0, 0, 0]),
               { msg: 'force dice' });

           // 5 > 2 なので、自分が先手
           const state = await wait_for(
               () => turn_dice(page),
               s => s.turn !== 2,
               { msg: 'opening roll', timeout: AUTO_CLICK_WAIT });

           assert.equal(state.turn, 0, '先手が自分になっていない');
           assert.deepEqual(state.d0, [5, 0, 0, 2],
                            '両者の目が自分側に集まっていない');
           assert.deepEqual(state.d1, [0, 0, 0, 0],
                            '相手のダイスが消えていない');
       });

    it('free move でも、自動クリックが dice[0] を進める', async () => {
        // 自動クリックの this を取り違えていると、
        // free move の枝で押したダイスを取り違え、
        // ダイスが NaN になる (TODO-041)
        await set_free_move(page, true);

        await set_opening(page, [0, 0, 0, 0], [0, 0, 2, 0]);

        await press_part(page, 'roll', 0);
        await send_msg(page, 'dice', { player: 0, dice: [5, 0, 0, 0] });
        await wait_for(
            async () => (await gameinfo(page)).board.dice[0],
            d => JSON.stringify(d) === JSON.stringify([5, 0, 0, 0]),
            { msg: 'force dice' });

        // free move では、クリックされたダイスの目が 1 つ進む
        const d0 = await wait_for(
            async () => (await gameinfo(page)).board.dice[0],
            d => JSON.stringify(d) !== JSON.stringify([5, 0, 0, 0]),
            { msg: 'free move click', timeout: AUTO_CLICK_WAIT });

        assert.deepEqual(d0, [6, 0, 0, 0],
                         'dice[0] 以外が書き換わっている');
        assert.equal((await gameinfo(page)).turn, 2,
                     'free move で先手が決まってしまっている');

        await set_free_move(page, false);
    });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
