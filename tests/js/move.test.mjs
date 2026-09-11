//
// (c) Yoichi Tanibayashi
//
// rules/move.js のテスト (TODO-027)。
//
//   node --test tests/js/
//
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calc_dst_point } from
    '../../src/ytbg/webroot/static/js/rules/move.js';
import { bar_point } from
    '../../src/ytbg/webroot/static/js/rules/position.js';

describe('calc_dst_point()', () => {
    it('player0 は番号が減る方向', () => {
        assert.equal(calc_dst_point(0, 13, 5), 8);
        assert.equal(calc_dst_point(0, 24, 1), 23);
        assert.equal(calc_dst_point(0, 6, 6), 0);
    });

    it('player1 は番号が増える方向', () => {
        assert.equal(calc_dst_point(1, 12, 5), 17);
        assert.equal(calc_dst_point(1, 1, 1), 2);
        assert.equal(calc_dst_point(1, 19, 6), 25);
    });

    it('player0 と player1 は逆向き', () => {
        for (const dice_val of [1, 2, 3, 4, 5, 6]) {
            assert.equal(calc_dst_point(0, 13, dice_val), 13 - dice_val);
            assert.equal(calc_dst_point(1, 13, dice_val), 13 + dice_val);
        }
    });

    it('バーからは、player0 が 25、player1 が 0 から数える', () => {
        assert.equal(calc_dst_point(0, bar_point(0), 3), 22);
        assert.equal(calc_dst_point(1, bar_point(1), 3), 3);
    });

    it('相手のバーは、バーとして扱わない', () => {
        // player0 が 27 (player1 のバー) にいることは無いが、
        // 26 だけを特別扱いしていることを確かめる
        assert.equal(calc_dst_point(0, bar_point(1), 3), 24);
        assert.equal(calc_dst_point(1, bar_point(0), 3), 29);
    });

    it('ゴールを行き過ぎても補正しない', () => {
        assert.equal(calc_dst_point(0, 3, 6), -3);
        assert.equal(calc_dst_point(1, 22, 6), 28);
    });
});
