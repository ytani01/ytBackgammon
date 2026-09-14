//
// (c) Yoichi Tanibayashi
//
// ドラッグを離した瞬間の先行実行 (予測) の確認 (TODO-030)。
//
//   node --test tests/browser/
//
// ドラッグを離すと、actions.js の move() がサーバの応答を待たずに
// 「動かしたあとの gameinfo」を予測して Board.apply() に渡し、
// move を 1 通送る (TODO-051)。ここで見るのは次のとおり。
//
//   1. 応答が無くても表示が変わる (先行実行)
//   2. 予測した盤面に、使ったダイスと使えなくなったダイス (11〜16) が
//      入っている。送る dice もそれ
//   3. ヒットのときは 2 手ぶん (相手をバーへ、自分を移動先へ)
//   4. **予測が外れても、サーバから届く gameinfo で表示が戻る**
//   5. 予測に失敗したら何も送らない
//   6. 勝ちになる move は、予測した盤面から求めた点数を載せる
//
// 「予測はサーバへ何も送らない (turn が -1 に変わっていても)」は
// TODO-050 で消した。turn が -1 に変わるとサーバが両方のクロックを
// 止めるので、勝った側のクロックが動いたまま turn が -1 になる状態を
// もう作れない。
//
// **作れている「外れ方」は「行き先が違う」1 種類だけ。** 次の外れ方は
// ここでは見ていない (TODO-030 のレビューでの指摘)。
//
//   - 他の人が同時に動かした (2 枚のタブ)。**verifier の担当**
//   - ヒットの扱いが違う (ヒットを予測したが実際は違う、逆も)
//   - turn が変わっていた
//   - score / playername / cube が飛んでいる
//
// 既存の board.test.mjs / clicks.test.mjs のドラッグは free move
// なので、先行実行を通らない (free move はサーバの応答だけで動く)。
//
// **ポイントの枚数は cur_point から数える** (TODO-044)。cur_point を
// 設定するのは apply() の配り直しだけなので、「表示が変わったか」を
// 見ていることになる。board.checkers_at(p).length は gameinfo を
// 数え直した値で、届いた gameinfo からほぼ自明に決まってしまう。
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
    apply_gameinfo, center_of, checkers, console_errors, corrupt_prediction,
    dragging, fail_prediction, gameinfo, judge, launch_browser, open_board,
    record_apply, restore_prediction, send_msg, send_put_checker, set_turn,
    shown_dice, shown_parts, stack, start_server, take_applied, wait_for,
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
 * ターン (プレーヤー 0) とダイスをサーバに設定して、届くまで待つ。
 *
 * @param {import('playwright').Page} page
 * @param {number[]} dice - [d0, d1, d2, d3]
 */
async function set_turn_dice(page, dice) {
    await set_turn(page, 0);
    await send_msg(page, 'dice', { player: 0, dice: dice });

    await wait_for(
        async () => {
            const gi = await gameinfo(page);
            return { turn: gi.turn, dice: gi.board.dice[0] };
        },
        s => s.turn === 0 && JSON.stringify(s.dice) === JSON.stringify(dice),
        { msg: 'set_turn_dice' });
}

/**
 * プレーヤー 1 のチェッカー 0 (#p100) を、サーバの盤面で p へ置く
 *
 * @param {import('playwright').Page} page
 * @param {number} p
 */
async function put_p100(page, p) {
    await send_put_checker(page, 1, 0, p);
    await wait_for(
        async () => (await checkers(page))[1][0].point,
        cur => cur === p, { msg: `put_p100(${p})` });
}

/**
 * サーバへは送らずに、手元の盤面だけを差し替える。
 *
 * player 0 の手番で、checker[0][0] を src に、残り 14 枚をゴール (0) に
 * 置く。player 1 は blocks の各ポイントに 2 枚ずつ、残りをゴール (25) に
 * 置く。ダイスは dice。**元に戻すのは呼んだ側** (返す gameinfo を
 * apply() する)。
 *
 * @param {import('playwright').Page} page
 * @param {{src: number, blocks: number[], dice: number[]}} opts
 * @return {Promise<Object>} - 差し替える前の gameinfo
 */
async function apply_local(page, { src, blocks, dice }) {
    const save = await gameinfo(page);
    const gi = structuredClone(save);
    gi.turn = 0;
    gi.resign = -1;
    gi.board.cube = { side: -1, value: 1, accepted: true };
    gi.board.dice = [dice, [0, 0, 0, 0]];
    gi.board.checker[0] = Array.from(
        { length: 15 }, (_, i) => (i === 0 ? [src, 0] : [0, i - 1]));
    let c1 = [];
    for (const b of blocks) {
        c1.push([b, 0], [b, 1]);
    }
    while (c1.length < 15) {
        c1.push([25, c1.length - blocks.length * 2]);
    }
    gi.board.checker[1] = c1;
    await apply_gameinfo(page, gi);
    return save;
}

/**
 * point 6 の先端のチェッカー (掴まれるもの) の番号を返す。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number>}
 */
async function tip_of_point6(page) {
    const { tip } = await stack(page, 6);
    return parseInt(tip.slice(1)) % 100;
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
        const sn0 = (await gameinfo(page)).sn;

        // ここから先、送ったメッセージはサーバへ届かない
        await record_sent(page, true);
        await record_apply(page);

        await one_touch_move(page);

        // 送信を止めているので、読む間に返事は届かない
        const shown = await shown_parts(page);
        const all = (await checkers(page)).flat();
        const gi = await gameinfo(page);
        const state = {
            point: all[tip].point,
            n3: all.filter(c => c.point === 3).length,
            n6: all.filter(c => c.point === 6).length,
            entry: gi.board.checker[0][tip],
            sn: gi.sn,
            pip: shown.pip[0].count,
            // 使ったダイスは使用済み (3 -> 13) になっている。
            // 予測した gameinfo に入っている (TODO-051)
            gi_dice: gi.board.dice[0],
            active_dice: (await judge(page)).active_dice[0],
        };
        state.dice = await shown_dice(page, 0);

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
        assert.deepEqual(state.gi_dice, [13, 0, 0, 0]);
        assert.deepEqual(state.active_dice, []);

        // apply() は予測で 1 回だけ呼ばれた。last_op も clock_state も無い
        const applied = await take_applied(page);
        assert.equal(applied.length, 1);
        assert.equal(applied[0].has_last_op, false);
        assert.equal(applied[0].has_clock_state, false);
        assert.equal(applied[0].point[0][tip], 3);

        // 送ったのは move 1 通だけ (TODO-051)
        const sent = await page.evaluate(() => window.__sent);
        assert.deepEqual(sent.map(m => [m.type, m.data]), [
            ['move', { player: 0, moves: [{ ch: tip, p: 3, idx: 0 }],
                       dice: [13, 0, 0, 0], score: 0 }],
        ]);
        assert.ok(sent.every(m => !('history' in m)), 'history を送っている');

        // 送信を元に戻す。この it の操作はサーバへ届いていないので、
        // 次の it が送るメッセージへの返事で、表示はサーバの盤面に戻る
        await record_sent(page);
    });

    it('ヒットのときは 2 手ぶん動かし、move 1 通に 2 手載せる', async () => {
        // 相手のチェッカーを point 3 に 1 枚置く (ブロット)
        await put_p100(page, 3);

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
        assert.deepEqual(sent.map(m => m.type), ['move']);
        assert.deepEqual(
            sent[0].data.moves.map(m => [m.ch, m.p, m.idx]),
            [[100, 27, 0], [tip, 3, 0]]);

        // サーバの返事でも同じ盤面になる
        await wait_for(
            async () => {
                const ch = await checkers(page);
                return { mine: ch[0][tip].point, hit: ch[1][0].point };
            },
            s => s.mine === 3 && s.hit === 27,
            { msg: 'hit' });

        // 後始末: バーの駒を point 1 へ戻す (次の it のため)
        await put_p100(page, 1);
    });

    it('予測が外れても、サーバの gameinfo で表示が戻る', async () => {
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);

        // わざと外れる予測を作る。動かしたチェッカーを、
        // サーバへ送る移動先 (3) ではなく 20 へ置いたことにする
        await corrupt_prediction(page, 20);

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
            sent.filter(m => m.type === 'move').map(
                m => m.data.moves.map(mv => [mv.ch, mv.p])),
            [[[tip, 3]]]);

        // サーバから届く gameinfo で、正しいところへ戻る
        const state = await wait_for(
            async () => {
                const ch = await checkers(page);
                const all = ch.flat();
                return { point: ch[0][tip].point,
                         n20: all.filter(c => c.point === 20).length,
                         n3: all.filter(c => c.point === 3).length };
            },
            s => s.point === 3,
            { msg: 'correction' });
        assert.equal(state.n20, 0, 'point 20 にチェッカーが残っている');
        assert.equal(state.n3, 2);

        await restore_prediction(page);
    });

    it('行けない場所で離すと、元に戻って何も送らない', async () => {
        // decide_dst() がキャンセルしたら undefined を返し、
        // Drag.drop_checker() はそこで終わる (TODO-045、TODO-053)。
        // 分けたことで、この返り値がキャンセルとの唯一のつなぎになった。
        // 取り違えると、行けない場所への move がサーバへ飛ぶ
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);

        // point 6 の先端を、player1 の駒がいる point 19 へ運ぶ
        // (player0 は番号が減る方向なので、6 から 19 へは行けない)
        const src = await center_of(page, `#p0${String(tip).padStart(2, '0')}`);
        const dst_id = (await stack(page, 19)).tip;
        const dst = await center_of(page, `#${dst_id}`);
        await page.mouse.move(src.x, src.y);
        await page.mouse.down();
        await page.mouse.move(dst.x, dst.y, { steps: 5 });
        await page.mouse.up();

        const state = {
            point: (await checkers(page))[0][tip].point,
            moving: await dragging(page) !== undefined,
        };
        state.dice = await shown_dice(page, 0);

        assert.equal(state.point, 6, '元のポイントに戻っていない');
        assert.equal(state.moving, false, '掴んだままになっている');
        assert.deepEqual(state.dice, [3, 0, 0, 0],
                         'ダイスが使われてしまった');
        assert.deepEqual(await take_sent(page), [],
                         'キャンセルしたのに送っている');
        assert.deepEqual(await take_applied(page), [],
                         'キャンセルしたのに予測を反映している');
    });

    it('予測に失敗したら何も送らず、元の位置へ戻す', async () => {
        // gameinfo がまだ届いていないときなど。TODO-051 より前は
        // put_checker だけを送っていた
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);
        await fail_prediction(page);

        try {
            await one_touch_move(page);

            const state = {
                point: (await checkers(page))[0][tip].point,
                moving: await dragging(page) !== undefined,
            };
            state.dice = await shown_dice(page, 0);
            assert.equal(state.point, 6, '元のポイントに戻っていない');
            assert.equal(state.moving, false, '掴んだままになっている');
            assert.deepEqual(state.dice, [3, 0, 0, 0]);
            assert.deepEqual(await take_sent(page), [],
                             '予測に失敗したのに送っている');
            assert.deepEqual(await take_applied(page), []);
        } finally {
            await restore_prediction(page);
        }
    });

    it('動かしたあとに使えなくなったダイスも 11〜16 にして送る', async () => {
        // checker[0][0] を 9 に置き、残りはゴール。相手は 3 に 2 枚。
        // ダイスは [5, 1]。ワンタッチでは 9 -> 4 (5 を使う)。4 から 1 では
        // 3 (相手が 2 枚) に行けないので、1 も使えなくなる。
        // 動かす前は 9 -> 8 に行けるので、1 は使える
        await record_sent(page, true);
        const save = await apply_local(
            page, { src: 9, blocks: [3], dice: [5, 1, 0, 0] });
        try {
            await record_apply(page);
            await one_touch_move(page);

            const state = {
                point: (await checkers(page))[0][0].point,
                gi_dice: (await gameinfo(page)).board.dice[0],
            };
            state.dice = await shown_dice(page, 0);
            assert.equal(state.point, 4, '先行実行で動いていない');
            assert.deepEqual(state.gi_dice, [15, 11, 0, 0],
                             '予測した gameinfo のダイス');
            assert.deepEqual(state.dice, [15, 11, 0, 0], '表示のダイス');

            const sent = await take_sent(page);
            assert.deepEqual(sent.map(m => [m.type, m.data]), [
                ['move', { player: 0, moves: [{ ch: 0, p: 4, idx: 0 }],
                           dice: [15, 11, 0, 0], score: 0 }],
            ]);
        } finally {
            await apply_gameinfo(page, save);
            await record_sent(page);
        }
    });

    it('勝ちになる move は、予測した盤面から求めた点数を載せる', async () => {
        // checker[0][0] を 1 に置き、残りはゴール。1 の目で上がると勝ち。
        // 相手は 24 に 2 枚、残り 13 枚はゴールにあるので、シングル
        // (キューブ 1 で 1 点)
        await record_sent(page, true);
        const save = await apply_local(
            page, { src: 1, blocks: [24], dice: [1, 0, 0, 0] });
        try {
            await one_touch_move(page);

            const sent = await take_sent(page);
            assert.deepEqual(sent.map(m => [m.type, m.data]), [
                ['move', { player: 0, moves: [{ ch: 0, p: 0, idx: 14 }],
                           dice: [11, 0, 0, 0], score: 1 }],
            ]);
        } finally {
            await apply_gameinfo(page, save);
            await record_sent(page);
        }
    });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
