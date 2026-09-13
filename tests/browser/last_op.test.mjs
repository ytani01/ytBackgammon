//
// (c) Yoichi Tanibayashi
//
// 音とダイスの回転を last_op (直前の操作) から決めることの確認 (TODO-051)。
//
//   node --test tests/browser/
//
// Board.apply() に gameinfo と last_op を渡し、鳴らした音 (SoundBase.play())
// と、ダイスを回したか (RollButton.set() の roll_flag) を数える。
// apply() はサーバへ何も送らないので、ページの中だけで確かめる。
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
    console_errors, launch_browser, open_board, start_server,
} from './helper.mjs';

/**
 * 今の gameinfo を turn だけ変えて apply() し、鳴った音と回したダイスを返す。
 *
 * @param {import('playwright').Page} page
 * @param {number} turn
 * @param {Object} last_op
 * @return {Promise<{sound: string[], roll: number[]}>}
 */
function apply_with(page, turn, last_op) {
    return page.evaluate(([turn, last_op]) => {
        const sound = [];
        const roll = [];
        const names = ['sound_roll', 'sound_put', 'sound_hit',
                       'sound_turn_change'];
        for (const name of names) {
            board[name].play = () => { sound.push(name); };
        }
        for (let p = 0; p < 2; p++) {
            const btn = board.roll_btn[p];
            btn.set = function (dice, roll_flag = false) {
                if (roll_flag) {
                    roll.push(p);
                }
                return Object.getPrototypeOf(this).set.call(
                    this, dice, roll_flag);
            };
        }
        try {
            const gi = JSON.parse(JSON.stringify(board.gameinfo));
            gi.turn = turn;
            board.apply(gi, { sec: 0, last_op: last_op });
        } finally {
            for (const name of names) {
                delete board[name].play;
            }
            for (let p = 0; p < 2; p++) {
                delete board.roll_btn[p].set;
            }
        }
        return { sound, roll };
    }, [turn, last_op]);
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

    for (const [type, data] of [['opening', { winner: 0 }],
                                ['end_turn', { player: 1 }]]) {
        it(`${type} → turn が変わっていなくても、手番が変わる音`,
           async () => {
               // 同じ turn で 2 回 apply() しても、2 回とも鳴る
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

    it('コンソールエラーが出ていない', async () => {
        const errors = console_errors(page, server.url);
        assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
    });
});
