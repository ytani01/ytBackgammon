//
// (c) Yoichi Tanibayashi
//
// ドラッグ中に gameinfo が届いたときの動作確認 (TODO-053)。
//
//   node --test tests/browser/drag.test.mjs
//
// 共有ボードなので、駒を掴んでいる間にも他の人の操作で gameinfo が届く。
// BoardView.render() はチェッカーとキューブを置き直すが、掴んでいる駒と
// キューブは手元の座標と z に残すこと。
//
// 掴んだ位置はチェッカーとキューブで別に持つこと。free move なら
// マルチタッチで両方を同時に掴める。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    center_of, dragging, drop_cube_while_holding_checker, gameinfo,
    holding_cube, launch_browser, open_board, send_msg, set_turn, sleep,
    start_server, wait_for, wait_still,
} from './helper.mjs';

describe('ドラッグ中に gameinfo が届く', () => {
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

    it('掴んでいる駒は手元の座標に残る', async () => {
        // ルールに縛られずに掴めるように free move にする
        await page1.locator('#free-move').check();

        const src = await center_of(page1, '#p000');
        await page1.mouse.move(src.x, src.y);
        await page1.mouse.down();
        await page1.mouse.move(src.x + 120, src.y - 150, { steps: 10 });

        const before_pos = await dragging(page1);
        assert.notDeepEqual([before_pos.x, before_pos.y], before_pos.src,
                            'ドラッグ中に動いていない');

        // 別のタブから名前を変え、page1 に gameinfo を届かせる
        await send_msg(page2, 'set_playername',
                       { player: 0, name: 'dragtest' });
        await wait_for(
            async () => (await gameinfo(page1)).board.playername[0],
            n => n === 'dragtest', { msg: 'gameinfo が届かない' });

        const { id, x, y } = await dragging(page1);
        assert.deepEqual({ id, x, y },
                         { id: before_pos.id, x: before_pos.x,
                           y: before_pos.y },
                         '掴んでいる駒が定位置へ戻った');

        await page1.mouse.up();
    });

    it('キューブとチェッカーを同時に掴んでも、キューブを離せば take を送る',
       async () => {
        await page1.locator('#free-move').check();

        // プレーヤー 1 がダブルを掛け、キューブはプレーヤー 0 の側で未テイク
        await set_turn(page1, 1);
        await send_msg(page1, 'double', { player: 1 });
        await wait_for(
            async () => (await gameinfo(page1)).board.cube,
            c => c.side === 0 && c.accepted === false, { msg: 'double' });
        // キューブは move_sec (0.3 秒) かけて y1[0] へ動く
        await sleep(500);

        // キューブを掴む → チェッカーを掴む → キューブをテイクの側へ離す
        const sent = await drop_cube_while_holding_checker(page1, 30);
        assert.ok(sent.includes('take'), `take を送っていない: ${sent}`);
    });

    it('掴んでいるキューブも手元の座標と z に残る', async () => {
        // キューブに触れるように、手番を自分 (プレーヤー 0) にする。
        // キューブはプレーヤー 0 の側でテイク済み
        await set_turn(page1, 0);
        await wait_for(
            async () => (await gameinfo(page1)).board.cube,
            c => c.side === 0 && c.accepted === true, { msg: 'take' });

        // 新しく開いた画面では、テイク済みのキューブの z は決まっていない。
        // 掴んでいる間に届く double の描画は z を 100 にするので、
        // z を手元に残さなければ変わる
        const page3 = await open_board(browser, server.url);
        try {
            // 開いた直後のキューブは、最初の描画で定位置へ動いている途中
            await wait_still(page3, '#cube');
            const src = await center_of(page3, '#cube');
            await page3.mouse.move(src.x, src.y);
            await page3.mouse.down();
            await page3.mouse.move(src.x + 60, src.y - 40, { steps: 10 });

            const before_pos = await holding_cube(page3);
            assert.notEqual(before_pos, undefined, 'キューブを掴めていない');

            await send_msg(page2, 'double', { player: 0 });
            await wait_for(
                async () => (await gameinfo(page3)).board.cube,
                c => c.side === 1 && c.accepted === false,
                { msg: 'gameinfo が届かない' });

            assert.deepEqual(await holding_cube(page3), before_pos,
                             '掴んでいるキューブが手元の座標と z に残っていない');

            await page3.mouse.up();
        } finally {
            await page3.close();
        }
    });
});
