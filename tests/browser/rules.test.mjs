//
// (c) Yoichi Tanibayashi
//
// Board がルール層 (rules/) を呼んでいることの確認 (TODO-027)。
//
//   node --test tests/browser/
//
// rules/ そのもののテストは tests/js/ にある。ここで見るのは
// 「Board が rules/ につながっているか」だけ。
//
// 既存の board.test.mjs / clicks.test.mjs はドラッグを free move で
// 行うので、ルール判定を通らない。つなぎ間違えても気づけないため、
// 判定を呼ぶ経路をここで押さえる。
//
// **it の順番に依存しない。** ページは 1 つを使い回すが、盤面を変える
// it は自分で元に戻し、beforeEach が初期配置であることを確かめてから
// 始める (TODO-027 のレビューでの指摘)。
//
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { launch_browser, open_board, start_server } from './helper.mjs';

describe('Board とルール層のつながり', () => {
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

    // どの it も、初期配置・resign なしから始まることを確かめる
    beforeEach(async () => {
        const state = await page.evaluate(() => {
            return { pip: [board.pip_count(0), board.pip_count(1)],
                     resign: board.resign,
                     n6: board.position().count(6) };
        });
        assert.deepEqual(state, { pip: [167, 167], resign: -1, n6: 5 },
                         '前の it が盤面を戻していない');
    });

    it('board.position() が今の盤面を写している', async () => {
        const pos = await page.evaluate(() => {
            const p = board.position();
            return {
                n6: p.count(6), owner6: p.owner(6),
                n19: p.count(19), owner19: p.owner(19),
                n7: p.count(7), owner7: p.owner(7),
                n0: p.count(0),
            };
        });
        assert.deepEqual(pos, { n6: 5, owner6: 0,
                                n19: 5, owner19: 1,
                                n7: 0, owner7: null,
                                n0: 0 });
    });

    it('初期配置の pip count は 167 で、表示にも出ている', async () => {
        const pip = await page.evaluate(() => {
            return [board.pip_count(0), board.pip_count(1),
                    document.getElementById('p0pip').innerHTML];
        });
        assert.equal(pip[0], 167);
        assert.equal(pip[1], 167);
        assert.match(pip[2], /167/);
    });

    it('pip の表示が、計算し直した値になる', async () => {
        // 表示の初期値も 167 なので、動かしてから見る。
        // checker[0][0] は point 6 にあるので、ゴール (0) へ入れると
        // 6 減って 161 になる。
        //
        // サーバには送らない (put_checker() を直に呼ぶ) ので、
        // 動かしたぶんはこの it の中で戻す
        const pip = await page.evaluate(() => {
            const ch = board.checker[0][0];
            const src_p = ch.cur_point;

            board.put_checker(ch, 0);
            const moved = [board.pip_count(0),
                           document.getElementById('p0pip').innerHTML];

            board.put_checker(ch, src_p);
            const back = [board.pip_count(0),
                          document.getElementById('p0pip').innerHTML];

            return { src_p: src_p, moved: moved, back: back };
        });
        assert.equal(pip.src_p, 6);
        assert.equal(pip.moved[0], 161);
        assert.match(pip.moved[1], /161/);
        assert.equal(pip.back[0], 167);
        assert.match(pip.back[1], /167/);
    });

    it('初期配置では、まだ誰も勝っていない', async () => {
        const score = await page.evaluate(
            () => [board.winner_is(0), board.winner_is(1)]);
        assert.deepEqual(score, [0, 0]);
    });

    it('winner_is() が投了の勝ちを返し、board.resign を戻す', async () => {
        // resign はこの it の中で立てる。winner_is() が -1 に戻すので、
        // 戻ったことを確かめれば、盤面も元のまま
        const r = await page.evaluate(() => {
            board.resign = 1;
            const score = board.winner_is(0);
            return { score: score, resign: board.resign };
        });
        // 初期配置では、相手が point 1 (player0 のインナー) に
        // 残っているので backgammon 扱いの 3
        assert.equal(r.score, 3);
        assert.equal(r.resign, -1, 'resign が戻っていない');
    });

    it('初期配置ではクローズアウトしていない', async () => {
        const co = await page.evaluate(
            () => [board.closeout(0), board.closeout(1)]);
        assert.deepEqual(co, [false, false]);
    });

    it('行き先の計算が player ごとの向きになっている', async () => {
        const dst = await page.evaluate(() => {
            return { p0: board.get_dst_points(0, 24, [3]),
                     p1: board.get_dst_points(1, 1, [3]) };
        });
        assert.deepEqual(dst.p0, [21]);
        assert.deepEqual(dst.p1, [4]);
    });
});
