//
// (c) Yoichi Tanibayashi
//
// ブラウザでの基本の動作確認 (TODO-021)。
//
//   node --test tests/browser/
//
// サーバを 1 つ起動し、同じボードを 2 枚のページで開く。
// 操作は page1 で行い、page2 は共有ボードの同期を見るために使う。
// テストは書いた順に走るので、drag のあとに sync が来ることに依存している。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    console_errors, center_of, launch_browser, open_board, start_server,
    wait_for,
} from './helper.mjs';

describe('ブラウザでの基本の動作確認', () => {
    let server = undefined;
    let browser = undefined;
    let page1 = undefined;
    let page2 = undefined;

    // drag のテストが決めて、sync のテストが使う
    let moved = undefined;

    before(async () => {
        server = await start_server();
        browser = await launch_browser();
        page1 = await open_board(browser, server.url);
        page2 = await open_board(browser, server.url);
    });

    after(async () => {
        // 後始末は落とさない。サーバのプロセスが残るとポートを掴んだままになる
        if (browser !== undefined) {
            await browser.close();
        }
        if (server !== undefined) {
            await server.stop();
        }
    });

    it('盤面が描画される', async () => {
        // チェッカーが 2 人分 15 枚ずつ、どこかの point に乗っている
        const checkers = await page1.evaluate(() => {
            let ret = [];
            for (let p = 0; p < 2; p++) {
                for (let c = 0; c < 15; c++) {
                    const ch = board.checker[p][c];
                    ret.push({
                        id: ch.id, point: ch.cur_point,
                        w: ch.el.clientWidth, h: ch.el.clientHeight,
                    });
                }
            }
            return ret;
        });

        assert.equal(checkers.length, 30);
        for (const ch of checkers) {
            assert.ok(ch.point >= 0 && ch.point <= 27,
                      `${ch.id}: cur_point=${ch.point}`);
            assert.ok(ch.w > 0 && ch.h > 0, `${ch.id}: 大きさが 0`);
        }

        // 盤の画像が読めている。index.html の <image> は HTML の
        // パーサが <img> にするので、img で引く
        const base_w = await page1.evaluate(
            () => document.querySelector(
                'img[src*="board-base"]').naturalWidth);
        assert.ok(base_w > 0, 'board-base.png が読めていない');

        // 実際に描画されていることを、スクリーンショットが撮れることで見る
        // (ファイルには残さない)
        const png = await page1.screenshot();
        assert.ok(png.length > 10000, `screenshot が小さい: ${png.length}`);
    });

    it('Roll ボタンでダイスが出る', async () => {
        // 新しい盤面は turn == 2 (両方可) なので、両方の Roll が出ている
        const active = await page1.evaluate(() => board.roll_btn[0].active);
        assert.equal(active, true, 'Roll ボタンが出ていない');

        const before_dice = await page1.evaluate(
            () => board.roll_btn[0].get());
        assert.deepEqual(before_dice, [0, 0, 0, 0]);

        await page1.locator('#rollbutton0').click();

        // サーバが返す gameinfo で dice が入る
        const dice = await wait_for(
            () => page1.evaluate(() => board.roll_btn[0].get()),
            d => d.some(v => v >= 1 && v <= 6),
            { msg: 'dice' });

        assert.equal(dice.length, 4);
        assert.equal(dice.filter(v => v >= 1 && v <= 6).length, 1,
                     `オープニングロールは 1 個: ${JSON.stringify(dice)}`);
    });

    it('チェッカーをドラッグできる', async () => {
        // ルールに縛られずに動かせるように free move にする
        await page1.locator('#free-move').check();
        assert.equal(await page1.evaluate(() => board.free_move), true);

        // 移動先は、別の point に乗っているチェッカーの位置にする
        const dst = await page1.evaluate(() => {
            const ch = board.checker[1][0];
            return { id: ch.id, point: ch.cur_point };
        });

        // #p000 を掴むと、掴めるのは「その point の先端のチェッカー」で、
        // p000 そのものではない。Checker.on_mouse_down_xy() の意図どおりで、
        // 正しい挙動。新しい盤面では p000 は point 6 に 5 枚積まれた
        // いちばん下なので、先端は p004 になる
        const tip = await page1.evaluate(() => {
            const ch = board.checker[0][0];
            return board.point[ch.cur_point].checkers.slice(-1)[0].id;
        });
        assert.notEqual(tip, 'p000');

        const src_pos = await center_of(page1, '#p000');
        await page1.mouse.move(src_pos.x, src_pos.y);
        await page1.mouse.down();

        const moving = await page1.evaluate(() => ({
            id: board.moving_checker.id,
            point: board.moving_checker.cur_point,
        }));
        assert.equal(moving.id, tip);
        assert.notEqual(moving.point, dst.point,
                        '移動元と移動先が同じ point になっている');

        const dst_pos = await center_of(page1, `#${dst.id}`);
        await page1.mouse.move(dst_pos.x, dst_pos.y, { steps: 10 });

        // 掴んだままカーソルに付いてきている。
        // point 6 と point 19 は同じ列なので x だけでは判定できない
        const dragging = await page1.evaluate(() => {
            const ch = board.moving_checker;
            return { pos: [ch.x, ch.y], src: [ch.src_x, ch.src_y] };
        });
        assert.notDeepEqual(dragging.pos, dragging.src,
                            'ドラッグ中に動いていない');

        await page1.mouse.up();

        // サーバが返す gameinfo で移動が確定する
        const tip_i = Number(tip.slice(2));
        await wait_for(
            () => page1.evaluate(
                i => board.checker[0][i].cur_point, tip_i),
            p => p === dst.point,
            { msg: 'drag' });

        assert.equal(
            await page1.evaluate(() => board.moving_checker === undefined),
            true, 'moving_checker が残っている');

        moved = { checker_index: tip_i, point: dst.point };
    });

    it('2 枚目のタブに同期する', async () => {
        assert.notEqual(moved, undefined, 'drag のテストが先に必要');

        // page1 でのドラッグが、そのまま page2 にも届いている
        const point = await wait_for(
            () => page2.evaluate(
                i => board.checker[0][i].cur_point, moved.checker_index),
            p => p === moved.point,
            { msg: 'sync' });
        assert.equal(point, moved.point);

        // 逆向き (page2 での操作が page1 に届く) も見る
        await page2.locator('#p1name-input').fill('tester');
        await page2.locator('#p1name-input').blur();

        const name = await wait_for(
            () => page1.evaluate(() => board.player_name[1].name),
            t => t === 'tester',
            { msg: 'playername' });
        assert.equal(name, 'tester');
    });

    it('コンソールエラーが出ていない', async () => {
        for (const [name, page] of [['page1', page1], ['page2', page2]]) {
            const errors = console_errors(page, server.url);
            assert.deepEqual(
                errors, [],
                `${name}: ${JSON.stringify(errors, null, 2)}`);
        }
    });
});
