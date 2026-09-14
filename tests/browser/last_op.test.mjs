//
// (c) Yoichi Tanibayashi
//
// 音とダイスの回転を last_op (直前の操作) から決めることの確認 (TODO-051)。
//
//   node --test tests/browser/
//
// BoardController.receive() に gameinfo と last_op を渡し、鳴らした音
// (SoundBase.play()) と、ダイスを回したか (BoardView.roll_dice()) を数える。
// receive() はサーバへ何も送らないので、ページの中だけで確かめる。
//
//   - roll: 振ったプレーヤーのダイスを回して、振る音を鳴らす
//   - move: turn を見ずに駒を置く音を鳴らす。moves にバー (26 以上) への
//     移動があればヒットの音
//   - put_checker: turn が -1 では鳴らさない (今までどおり)
//   - opening / end_turn: turn が変わったかを見ずに、手番が変わる音
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    apply_gameinfo, console_errors, dice_transforms, effects_of_apply,
    gameinfo,
    launch_browser, open_board, start_server,
} from './helper.mjs';

/**
 * 今の gameinfo を turn だけ変えて受け取らせ、鳴った音と回したダイスを返す。
 *
 * @param {import('playwright').Page} page
 * @param {number} turn
 * @param {Object} last_op
 * @return {Promise<{sound: string[], roll: number[]}>}
 */
async function apply_with(page, turn, last_op) {
    const gi = await gameinfo(page);
    gi.turn = turn;
    return effects_of_apply(page, gi, last_op);
}

describe('last_op からの音とダイスの回転', () => {
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

    const op = (type, data) => ({ src: 'client', type, data });

    it('roll → 振ったプレーヤーのダイスを回して、振る音を鳴らす',
       async () => {
           const r = await apply_with(
               page, 1, op('roll', { player: 1, dice: [3, 4, 0, 0] }));
           assert.deepEqual(r, { sound: ['sound_roll'], roll: [1] });
       });

    it('free move の dice → 回さず、音も鳴らさない', async () => {
        // dice に roll を付けていた頃は、roll: true で回していた
        const r = await apply_with(
            page, 1, op('dice', { player: 1, dice: [3, 4, 0, 0], roll: true }));
        assert.deepEqual(r, { sound: [], roll: [] });
    });

    it('move → 駒を置く音。turn が -1 (勝ちになる move) でも鳴らす',
       async () => {
           const data = { player: 0, moves: [{ ch: 0, p: 5, idx: 0 }],
                          dice: [13, 0, 0, 0], score: 0 };
           for (const turn of [0, -1]) {
               const r = await apply_with(page, turn, op('move', data));
               assert.deepEqual(r, { sound: ['sound_put'], roll: [] },
                                `turn=${turn}`);
           }
       });

    it('move で moves にバーへの移動がある → ヒットの音', async () => {
        // 先行実行した画面では、返事が届いた時点で駒がもうバーにある。
        // 動かす前の位置では見分けないこと
        const r = await apply_with(page, 0, op('move', {
            player: 0,
            moves: [{ ch: 100, p: 27, idx: 0 }, { ch: 0, p: 5, idx: 0 }],
            dice: [13, 0, 0, 0], score: 0,
        }));
        assert.deepEqual(r, { sound: ['sound_hit'], roll: [] });
    });

    it('put_checker → turn が -1 では鳴らさない', async () => {
        const data = { ch: 1, p: 6, idx: 5 };
        const r0 = await apply_with(page, 0, op('put_checker', data));
        assert.deepEqual(r0, { sound: ['sound_put'], roll: [] });
        const r1 = await apply_with(page, -1, op('put_checker', data));
        assert.deepEqual(r1, { sound: [], roll: [] });
    });

    it('put_checker → 動かす前がバーなら put、盤上からバーへなら hit',
       async () => {
           // 駒の引き当て (ID は player * 100 + num) を見る。プレーヤー 1 の
           // 通し番号 10 以上を使うと、[0] 固定・% 10・プレーヤーの
           // 取り違えのどれでも、引いた駒の位置が変わって結果が変わる
           const orig = await gameinfo(page);
           const gi = structuredClone(orig);
           gi.board.checker[1][14] = [27, 0];
           await apply_gameinfo(page, gi);
           try {
               const put = await apply_with(
                   page, 0, op('put_checker', { ch: 114, p: 27, idx: 0 }));
               assert.deepEqual(put, { sound: ['sound_put'], roll: [] });
               const hit = await apply_with(
                   page, 0, op('put_checker', { ch: 113, p: 27, idx: 1 }));
               assert.deepEqual(hit, { sound: ['sound_hit'], roll: [] });
           } finally {
               await apply_gameinfo(page, orig);
           }
       });

    for (const [type, data] of [['opening', { winner: 0 }],
                                ['end_turn', { player: 1 }]]) {
        it(`${type} → turn が変わっていなくても、手番が変わる音`,
           async () => {
               // 同じ turn で 2 回受け取っても、2 回とも鳴る
               for (let i = 0; i < 2; i++) {
                   const r = await apply_with(page, 0, op(type, data));
                   assert.deepEqual(r, { sound: ['sound_turn_change'],
                                         roll: [] }, `${i + 1} 回目`);
               }
           });
    }

    it('手番が変わらない操作 (set_score) → 手番が変わる音は鳴らない',
       async () => {
           const r = await apply_with(
               page, 0, op('set_score', { player: 0, score: 1 }));
           assert.deepEqual(r, { sound: [], roll: [] });
       });

    it('振ったダイスが傾くのは振った直後だけで、次の描画でまっすぐに戻る',
       async () => {
           const orig = await gameinfo(page);
           const gi = structuredClone(orig);
           gi.turn = 0;
           gi.board.dice = [[3, 4, 0, 0], [5, 6, 0, 0]];
           try {
               for (const p of [0, 1]) {
                   await apply_gameinfo(page, gi, {
                       last_op: op('roll', { player: p,
                                             dice: gi.board.dice[p] }) });
               }
               const rolled = [await dice_transforms(page, 0),
                               await dice_transforms(page, 1)];
               const after = [];
               for (let i = 0; i < 2; i++) {
                   await apply_gameinfo(page, gi);
                   after.push([await dice_transforms(page, 0),
                               await dice_transforms(page, 1)]);
               }
               const straight = [
                   ['rotate(0deg)', 'rotate(0deg)',
                    'rotate(0deg)', 'rotate(0deg)'],
                   ['rotate(180deg)', 'rotate(180deg)',
                    'rotate(0deg)', 'rotate(0deg)'],
               ];
               assert.notDeepEqual(rolled, straight, '振った直後に傾いていない');
               assert.deepEqual(after, [straight, straight],
                                `振った傾きが残っている: ${JSON.stringify(rolled)}`);
           } finally {
               await apply_gameinfo(page, orig);
           }
       });

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
