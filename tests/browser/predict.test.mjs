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
    center_of, console_errors, launch_browser, open_board, send_msg,
    set_turn, start_server, wait_for,
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
 * board.apply() を包んで、呼ばれるたびに「そのときの盤面」を貯める。
 *
 * 先行実行とサーバの返事のどちらで表示が変わったのかを、
 * あとから順番に見られるようにする。
 *
 * @param {import('playwright').Page} page
 */
function record_apply(page) {
    return page.evaluate(() => {
        window.__applied = [];
        // 包みを重ねない (重ねると 1 回の apply() で何度も貯まる)
        if (window.__orig_apply === undefined) {
            window.__orig_apply = board.apply;
        }
        const orig = window.__orig_apply;
        board.apply = function (gameinfo, opts = {}) {
            const ret = orig.call(this, gameinfo, opts);
            window.__applied.push({
                // 予測には last_op も clock_state も付かない
                has_last_op: Boolean(opts.last_op),
                has_clock_state: Boolean(opts.clock_state),
                sn: gameinfo.sn,
                point: board.checker.map(p => p.map(ch => ch.cur_point)),
            });
            return ret;
        };
    });
}

/**
 * @param {import('playwright').Page} page
 * @return {Promise<Object[]>}
 */
function take_applied(page) {
    return page.evaluate(() => window.__applied.splice(0));
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
        () => page.evaluate(() => ({
            turn: board.turn,
            dice: board.roll_btn[0].get(),
        })),
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
    await page.evaluate(async p => {
        const { put_checker } = await import('/static/js/actions.js');
        put_checker(board, board.checker[1][0], p);
    }, p);
    await wait_for(
        () => page.evaluate(() => board.checker[1][0].cur_point),
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
function apply_local(page, opts) {
    return page.evaluate(({ src, blocks, dice }) => {
        const save = JSON.parse(JSON.stringify(board.gameinfo));
        const gi = JSON.parse(JSON.stringify(board.gameinfo));
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
        board.apply(gi, { sec: 0 });
        return save;
    }, opts);
}

/**
 * point 6 の先端のチェッカー (掴まれるもの) の番号を返す。
 *
 * @param {import('playwright').Page} page
 * @return {Promise<number>}
 */
function tip_of_point6(page) {
    return page.evaluate(() => {
        const ch = board.top_checker(6);
        return parseInt(ch.id.slice(1)) % 100;
    });
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
        const sn0 = await page.evaluate(() => board.gameinfo.sn);

        // ここから先、送ったメッセージはサーバへ届かない
        await record_sent(page, true);
        await record_apply(page);

        await one_touch_move(page);

        const state = await page.evaluate(i => ({
            point: board.checker[0][i].cur_point,
            n3: board.checker.flat().filter(c => c.cur_point === 3).length,
            n6: board.checker.flat().filter(c => c.cur_point === 6).length,
            entry: board.gameinfo.board.checker[0][i],
            sn: board.gameinfo.sn,
            pip: board.pip[0].pip_count,
            // 使ったダイスは使用済み (3 -> 13) になっている。
            // 予測した gameinfo に入っている (TODO-051)
            dice: board.roll_btn[0].get(),
            gi_dice: board.gameinfo.board.dice[0],
            active_dice: board.roll_btn[0].get_active_dice(),
        }), tip);

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
            () => page.evaluate(i => ({
                mine: board.checker[0][i].cur_point,
                hit: board.checker[1][0].cur_point,
                sn: board.gameinfo.sn,
            }), tip),
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
        await page.evaluate(() => {
            const orig = board.predict_gameinfo;
            board.predict_gameinfo = function (...args) {
                const gameinfo = orig.apply(this, args);
                const moves = args[0];
                const ch = moves[moves.length - 1].ch;
                const ch_i = parseInt(ch.id.slice(1)) % 100;
                gameinfo.board.checker[ch.player][ch_i] = [20, 0];
                return gameinfo;
            };
        });

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
            () => page.evaluate(i => ({
                point: board.checker[0][i].cur_point,
                n20: board.checker.flat().filter(
                    c => c.cur_point === 20).length,
                n3: board.checker.flat().filter(
                    c => c.cur_point === 3).length,
            }), tip),
            s => s.point === 3,
            { msg: 'correction' });
        assert.equal(state.n20, 0, 'point 20 にチェッカーが残っている');
        assert.equal(state.n3, 2);

        await page.evaluate(() => { delete board.predict_gameinfo; });
    });

    it('行けない場所で離すと、元に戻って何も送らない', async () => {
        // decide_dst() がキャンセルしたら undefined を返し、
        // on_mouse_up_xy() はそこで終わる (TODO-045)。
        // 分けたことで、この返り値がキャンセルとの唯一のつなぎになった。
        // 取り違えると、行けない場所への move がサーバへ飛ぶ
        await set_turn_dice(page, [3, 0, 0, 0]);
        const tip = await tip_of_point6(page);

        await record_sent(page);
        await record_apply(page);

        // point 6 の先端を、player1 の駒がいる point 19 へ運ぶ
        // (player0 は番号が減る方向なので、6 から 19 へは行けない)
        const src = await center_of(page, `#p0${String(tip).padStart(2, '0')}`);
        const dst_id = await page.evaluate(() => board.top_checker(19).id);
        const dst = await center_of(page, `#${dst_id}`);
        await page.mouse.move(src.x, src.y);
        await page.mouse.down();
        await page.mouse.move(dst.x, dst.y, { steps: 5 });
        await page.mouse.up();

        const state = await page.evaluate(i => ({
            point: board.checker[0][i].cur_point,
            moving: board.moving_checker !== undefined,
            dice: board.roll_btn[0].get(),
        }), tip);

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
        await page.evaluate(() => {
            board.predict_gameinfo = function () {
                throw new Error('predict failed (test)');
            };
        });

        try {
            await one_touch_move(page);

            const state = await page.evaluate(i => ({
                point: board.checker[0][i].cur_point,
                moving: board.moving_checker !== undefined,
                dice: board.roll_btn[0].get(),
            }), tip);
            assert.equal(state.point, 6, '元のポイントに戻っていない');
            assert.equal(state.moving, false, '掴んだままになっている');
            assert.deepEqual(state.dice, [3, 0, 0, 0]);
            assert.deepEqual(await take_sent(page), [],
                             '予測に失敗したのに送っている');
            assert.deepEqual(await take_applied(page), []);
        } finally {
            await page.evaluate(() => { delete board.predict_gameinfo; });
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

            const state = await page.evaluate(() => ({
                point: board.checker[0][0].cur_point,
                gi_dice: board.gameinfo.board.dice[0],
                dice: board.roll_btn[0].get(),
            }));
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
            await page.evaluate(g => board.apply(g, { sec: 0 }), save);
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
            await page.evaluate(g => board.apply(g, { sec: 0 }), save);
            await record_sent(page);
        }
    });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
