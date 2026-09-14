//
// (c) Yoichi Tanibayashi
//
// cookie から読んだプレーヤー番号が数になっていることの確認 (TODO-050)。
//
//   node --test tests/browser/
//
// Settings.load_player() は cookie の値 (文字列) を読む。数に直さないと、
// プレーヤー 0 の画面を開き直したときに Settings の player が "0" のまま残り、
// 投了ボタンが resign の player に文字列を送る。サーバは data の型を
// 確かめるので、それを弾いて投了が効かなくなる。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, gameinfo, launch_browser, open_board, press_part,
    server_id, settings, start_server, wait_board, wait_for,
} from './helper.mjs';

describe('cookie のプレーヤー番号', () => {
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

    it('cookie が "0" の画面を開き直して投了すると、resign の player は数の 0',
       async () => {
           const svr_id = await server_id(page);
           await page.evaluate(id => {
               document.cookie = `board${id}_player=0;`;
           }, svr_id);
           await page.reload();
           await wait_board(page);

           // 送ったものを貯める (投了ボタンを押す間だけ)
           const cookie = await page.evaluate(() => {
               window.__sent = [];
               window.__orig_send = WebSocket.prototype.send;
               WebSocket.prototype.send = function (d) {
                   window.__sent.push(JSON.parse(d));
                   return window.__orig_send.call(this, d);
               };
               return document.cookie;
           });
           const player = (await settings(page)).player;
           await press_part(page, 'resign');
           const sent = {
               cookie, player,
               sent: await page.evaluate(() => {
                   WebSocket.prototype.send = window.__orig_send;
                   return window.__sent;
               }),
           };

           assert.match(sent.cookie, /_player=0/, 'cookie が "0" でない');
           assert.equal(sent.player, 0);
           // 投了は resign 1 通だけ (TODO-051)。キューブは 1 でテイク済み
           // なので、相手に足す点数は 3
           assert.deepEqual(sent.sent.map(m => [m.type, m.data]),
                            [['resign', { player: 0, score: 3 }]]);

           // サーバが弾かずに受け付け、turn が -1 になる
           await wait_for(async () => (await gameinfo(page)).turn,
                          t => t === -1, { msg: 'resign', timeout: 30000 });
       });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
