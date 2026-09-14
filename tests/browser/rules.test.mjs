//
// (c) Yoichi Tanibayashi
//
// ページの中の gameinfo と、ルール層 (rules/) の結果が合っているかの確認
// (TODO-027)。
//
//   node --test tests/browser/
//
// rules/ そのもののテストは tests/js/ にある。ここで見るのは、ページで
// 読み込んだ rules/ に BoardController の gameinfo を渡した結果
// (枚数・PIP・勝ち・クローズアウト・行き先) と、PIP の表示が、
// 盤面と合っているか。helper の judge() などは rules/ を直接呼ぶので、
// BoardView がルール層を呼ぶ経路 (バナーの判定など) はここでは見ていない。
// PIP の表示だけは BoardView.render() が書いた値を読む。
//
// **it の順番に依存しない。** ページは 1 つを使い回すが、盤面を変える
// it は自分で元に戻し、beforeEach が初期配置であることを確かめてから
// 始める (TODO-027 のレビューでの指摘)。
//
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    apply_gameinfo, dst_points, gameinfo, judge, launch_browser, open_board,
    pip_count, put_checker_local, shown_banners, start_server,
} from './helper.mjs';

/** プレーヤー 0 の PIP の表示 (要素の中身) */
const pip_text = page => page.evaluate(
    () => document.getElementById('p0pip').innerHTML);

describe('gameinfo とルール層の結果', () => {
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
        const state = { pip: await pip_count(page),
                        resign: (await gameinfo(page)).resign,
                        n6: (await judge(page)).count[6] };
        assert.deepEqual(state, { pip: [167, 167], resign: -1, n6: 5 },
                         '前の it が盤面を戻していない');
    });

    it('position() が今の盤面を写している', async () => {
        const { count, owner } = await judge(page);
        const pos = {
            n6: count[6], owner6: owner[6],
            n19: count[19], owner19: owner[19],
            n7: count[7], owner7: owner[7],
            n0: count[0],
        };
        assert.deepEqual(pos, { n6: 5, owner6: 0,
                                n19: 5, owner19: 1,
                                n7: 0, owner7: null,
                                n0: 0 });
    });

    it('初期配置の pip count は 167 で、表示にも出ている', async () => {
        const pip = [...await pip_count(page), await pip_text(page)];
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
        const src_p = await put_checker_local(page, 0, 0, 0);
        const moved = [(await pip_count(page))[0], await pip_text(page)];

        await put_checker_local(page, 0, 0, src_p);
        const back = [(await pip_count(page))[0], await pip_text(page)];

        const pip = { src_p: src_p, moved: moved, back: back };
        assert.equal(pip.src_p, 6);
        assert.equal(pip.moved[0], 161);
        assert.match(pip.moved[1], /161/);
        assert.equal(pip.back[0], 167);
        assert.match(pip.back[1], /167/);
    });

    it('初期配置では、まだ誰も勝っていない', async () => {
        const score = (await judge(page)).winner;
        assert.deepEqual(score, [0, 0]);
    });

    it('winner_is() が投了の勝ちを返し、gameinfo.resign は書き換えない',
       async () => {
           // 判定するだけで状態は変えない (TODO-051。以前は -1 に戻して
           // いた)。判定は gameinfo を読む (TODO-052)。resign はこの it の
           // 中で立てて、最後に戻す
           const j = await judge(page, { resign: 1 });
           const r = { score: j.winner[0], resign: j.resign };
           // 初期配置では、相手が point 1 (player0 のインナー) に
           // 残っているので backgammon 扱いの 3
           assert.equal(r.score, 3);
           assert.equal(r.resign, 1, 'resign を書き換えている');
       });

    it('初期配置ではクローズアウトしていない', async () => {
        const co = (await judge(page)).closeout;
        assert.deepEqual(co, [false, false]);
    });

    it('相手に閉め出されている手番では、パスのバナーが出る', async () => {
        // プレーヤー 1 がインナー (19〜24) に 2 枚ずつ、残りはゴール。
        // プレーヤー 0 は 1 枚がバー (26)、残りは 6 に積む。手番は 0
        const orig = await gameinfo(page);
        const gi = structuredClone(orig);
        gi.turn = 0;
        gi.resign = -1;
        gi.board.dice = [[0, 0, 0, 0], [0, 0, 0, 0]];
        gi.board.checker[1] = Array.from({ length: 15 }, (_, i) => (
            i < 12 ? [19 + Math.floor(i / 2), i % 2] : [25, i - 12]));
        gi.board.checker[0] = Array.from({ length: 15 }, (_, i) => (
            i === 0 ? [26, 0] : [6, i - 1]));
        try {
            await apply_gameinfo(page, gi);
            const closed = await shown_banners(page);

            gi.board.checker[0][0] = [13, 0];
            await apply_gameinfo(page, gi);
            const open = await shown_banners(page);

            assert.deepEqual(closed.pass, [true, false],
                             '閉め出されているのにパスのバナーが出ない');
            assert.deepEqual(open.pass, [false, false],
                             '閉め出されていないのにパスのバナーが出る');
        } finally {
            await apply_gameinfo(page, orig);
        }
    });

    it('上がった盤面では、勝った側に勝ちのバナーが出て名前が強調される',
       async () => {
           // 勝ちの点数は表示に出ない (バナーを出すかの判定だけに使う)。
           // プレーヤー 0 が全部ゴール、turn は -1
           const orig = await gameinfo(page);
           const gi = structuredClone(orig);
           gi.turn = -1;
           gi.resign = -1;
           gi.board.dice = [[0, 0, 0, 0], [0, 0, 0, 0]];
           gi.board.checker[0] = Array.from(
               { length: 15 }, (_, i) => [0, i]);
           try {
               await apply_gameinfo(page, gi);
               const s = await shown_banners(page);
               assert.deepEqual(
                   { win: s.win, name_on: s.name_on },
                   { win: [true, false], name_on: [true, false] });
           } finally {
               await apply_gameinfo(page, orig);
           }
       });

    it('行き先の計算が player ごとの向きになっている', async () => {
        const dst = { p0: await dst_points(page, 0, 24, [3]),
                      p1: await dst_points(page, 1, 1, [3]) };
        assert.deepEqual(dst.p0, [21]);
        assert.deepEqual(dst.p1, [4]);
    });
});
