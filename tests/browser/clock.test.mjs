//
// (c) Yoichi Tanibayashi
//
// クロックの状態を、サーバの返事の clock_state だけから作ることの確認。
//
//   node --test tests/browser/clock.test.mjs
//
// - Clock のチェックボックスは set_clock_switch を送るだけ。返事が届くまで、
//   時計の計算も表示も変わらない。チェックボックスの表示も返事の sw に揃う
// - 履歴の返事 (back / fwd) でも、clock_state を全部反映する
//   (クロックは履歴の対象外なので、巻き戻らない)
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, gameinfo, hold_received, launch_browser, open_board,
    release_received, send_msg, shown_clock, shown_parts, sleep, start_server,
    wait_for,
} from './helper.mjs';

/** 止まっている時計の背景の色 (#888) */
const GREY = 'rgb(136, 136, 136)';

/**
 * 送ったメッセージをサーバへ届けないようにする (block が false なら戻す)
 *
 * @param {import('playwright').Page} page
 * @param {boolean} block
 */
function block_send(page, block) {
    return page.evaluate(block => {
        if (window.__orig_send === undefined) {
            window.__orig_send = WebSocket.prototype.send;
        }
        const orig = window.__orig_send;
        WebSocket.prototype.send = function (d) {
            return block ? undefined : orig.call(this, d);
        };
    }, block);
}

describe('クロックと clock_state', () => {
    let server = undefined;
    let browser = undefined;
    let page1 = undefined;
    let page2 = undefined;

    before(async () => {
        server = await start_server();
        browser = await launch_browser();
        page1 = await open_board(browser, server.url);
        page2 = await open_board(browser, server.url);
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (server !== undefined) {
            await server.stop();
        }
    });

    it('Clock のチェックボックスは、返事が届くまで計算も表示も変えない',
       async () => {
           await send_msg(page1, 'resume_clock', { player: 0 });
           await wait_for(
               async () => (await shown_parts(page1)).clock_active[0],
               a => a === true, { msg: 'resume_clock' });

           // ここから先、送ったメッセージはサーバへ届かない (返事も来ない)
           await block_send(page1, true);
           try {
               await page1.locator('#clock_sw').click();
               await sleep(600);
               const t1 = await shown_clock(page1);
               await sleep(400);
               const t2 = await shown_clock(page1);

               assert.equal(t2.checked, false, 'チェックが外れていない');
               assert.notEqual(t2.clock[0].opacity, '0',
                               '返事の前に時計が消えた');
               assert.notEqual(t2.clock[0].color, GREY,
                               '返事の前に時計が止まった');
               assert.notEqual(t2.clock[0].text, t1.clock[0].text,
                               '返事の前に時計の計算が止まった');
           } finally {
               await block_send(page1, false);
           }

           // 何かの返事が届けば、チェックボックスはサーバの sw (true) に揃う
           const name = (await gameinfo(page1)).board.playername[1];
           await send_msg(page1, 'set_playername', { player: 1, name: name });
           await wait_for(async () => (await shown_clock(page1)).checked,
                          c => c === true, { msg: 'checkbox' });

           // 返事が届けば、時計は消えて止まる
           await page1.locator('#clock_sw').click();
           const off = await wait_for(
               () => shown_clock(page1),
               s => s.clock[0].opacity === '0', { msg: 'clock off' });
           assert.equal(off.checked, false);
           assert.equal((await shown_parts(page1)).clock_active[0], false);

           // 元に戻す
           await page1.locator('#clock_sw').click();
           await wait_for(() => shown_clock(page1),
                          s => s.clock[0].opacity === '1' && s.checked,
                          { msg: 'clock on' });
       });

    it('履歴の返事でも clock_state を全部反映する', async () => {
        // 戻せるように履歴を 1 件積む
        await send_msg(page1, 'set_score', { player: 0, score: 1 });
        await wait_for(async () => (await gameinfo(page1)).score[0],
                       s => s === 1, { msg: 'set_score' });

        const text0 = (await shown_clock(page2)).clock[0].text;

        // page1 だけ、クロックの返事を受け取らない。page2 は受け取る
        await hold_received(page1);
        try {
            await send_msg(page1, 'resume_clock', { player: 0 });
            await sleep(1200);
            await send_msg(page1, 'stop_clock', { player: 0 });
            await send_msg(page1, 'set_clock_switch', { switch: false });
            await wait_for(async () => (await shown_clock(page2)).checked,
                           c => c === false, { msg: 'page2 sw' });
        } finally {
            await release_received(page1);
        }

        // 履歴の返事で、残り時間・sw が page2 と同じになる
        await send_msg(page1, 'back', { n: 1 });
        await wait_for(async () => (await gameinfo(page1)).score[0],
                       s => s === 0, { msg: 'back' });
        const [c1, c2] = [await shown_clock(page1), await shown_clock(page2)];
        assert.notEqual(c2.clock[0].text, text0,
                        'page2 の時計が進んでいない (テストの前提)');
        assert.deepEqual(c1, c2, '履歴の返事の clock_state を反映していない');

        // active も反映する
        await hold_received(page1);
        try {
            await send_msg(page1, 'set_clock_switch', { switch: true });
            await send_msg(page1, 'resume_clock', { player: 0 });
            await wait_for(
                async () => (await shown_parts(page2)).clock_active[0],
                a => a === true, { msg: 'page2 active' });
        } finally {
            await release_received(page1);
        }
        await send_msg(page1, 'fwd', { n: 1 });
        await wait_for(async () => (await gameinfo(page1)).score[0],
                       s => s === 1, { msg: 'fwd' });
        assert.equal((await shown_parts(page1)).clock_active[0], true,
                     '履歴の返事の active を反映していない');
        assert.equal((await shown_clock(page1)).checked, true,
                     '履歴の返事の sw を反映していない');

        await send_msg(page1, 'stop_clock', { player: 0 });
    });

    it('コンソールエラーが出ていない', async () => {
        for (const [name, page] of [['page1', page1], ['page2', page2]]) {
            const errors = console_errors(page, server.url);
            assert.deepEqual(errors, [],
                             `${name}: ${JSON.stringify(errors, null, 2)}`);
        }
    });
});
