//
// (c) Yoichi Tanibayashi
//
// cookie から読んだプレーヤー番号が数になっていることの確認 (TODO-050)。
//
//   node --test tests/browser/
//
// Board.load_player() は cookie の値 (文字列) を読む。数に直さないと、
// プレーヤー 0 の画面を開き直したときに board.player が "0" のまま残り、
// 投了ボタンが resign の player に文字列を送る。サーバは data の型を
// 確かめるので、それを弾いて投了が効かなくなる。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, launch_browser, open_board, start_server,
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
           await page.evaluate(() => {
               document.cookie = `board${board.svr_id}_player=0;`;
           });
           await page.reload();
           await page.waitForFunction(
               () => typeof board !== 'undefined' && board !== undefined
                   && board.checker !== undefined
                   && board.checker[0][0].cur_point !== undefined);

           const sent = await page.evaluate(() => {
               const sent = [];
               const orig = WebSocket.prototype.send;
               WebSocket.prototype.send = function (d) {
                   sent.push(JSON.parse(d));
                   return orig.call(this, d);
               };
               const cookie = document.cookie;
               const player = board.player;
               board.button_resign.on_mouse_down_xy(0, 0);
               WebSocket.prototype.send = orig;
               return { cookie, player, sent };
           });

           assert.match(sent.cookie, /_player=0/, 'cookie が "0" でない');
           assert.equal(sent.player, 0);
           // 投了は resign 1 通だけ (TODO-051)。キューブは 1 でテイク済み
           // なので、相手に足す点数は 3
           assert.deepEqual(sent.sent.map(m => [m.type, m.data]),
                            [['resign', { player: 0, score: 3 }]]);

           // サーバが弾かずに受け付け、turn が -1 になる
           await page.waitForFunction(() => board.gameinfo.turn === -1);
       });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
