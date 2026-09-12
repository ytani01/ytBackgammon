//
// (c) Yoichi Tanibayashi
//
// rules/move.js のテスト (TODO-027)。
//
//   node --test tests/js/
//
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { all_inner, calc_dst_point, dice_for_move, dst_point,
         dst_points, usable_dice } from
    '../../src/ytbg/webroot/static/js/rules/move.js';
import { bar_point, goal_point } from
    '../../src/ytbg/webroot/static/js/rules/position.js';
import { make_position, stack } from './helper.mjs';

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

describe('all_inner()', () => {
    it('インナーだけなら true', () => {
        assert.equal(all_inner(make_position({3: stack(0, 15)}), 0), true);
        assert.equal(all_inner(make_position({22: stack(1, 15)}), 1), true);
    });

    it('ゴールに入った駒もインナー扱い', () => {
        const pos = make_position({0: stack(0, 5), 6: stack(0, 10)});
        assert.equal(all_inner(pos, 0), true);
        const pos1 = make_position({25: stack(1, 5), 19: stack(1, 10)});
        assert.equal(all_inner(pos1, 1), true);
    });

    it('1 枚でも外に出ていれば false', () => {
        assert.equal(
            all_inner(make_position({3: stack(0, 14), 7: [0]}), 0), false);
        assert.equal(
            all_inner(make_position({22: stack(1, 14), 18: [1]}), 1), false);
    });

    it('バーの駒はインナーではない', () => {
        assert.equal(
            all_inner(make_position({3: stack(0, 14),
                                     [bar_point(0)]: [0]}), 0), false);
        assert.equal(
            all_inner(make_position({22: stack(1, 14),
                                     [bar_point(1)]: [1]}), 1), false);
    });

    it('相手の駒は見ない', () => {
        const pos = make_position({3: stack(0, 15), 13: stack(1, 15)});
        assert.equal(all_inner(pos, 0), true);
    });
});

describe('dst_point(): ベアオフ', () => {
    it('ちょうどの目で出せる', () => {
        const pos = make_position({3: stack(0, 15)});
        assert.equal(dst_point(pos, 0, 3, 3), goal_point(0));
        const pos1 = make_position({22: stack(1, 15)});
        assert.equal(dst_point(pos1, 1, 22, 3), goal_point(1));
    });

    it('後ろに自分の駒が無ければ、大きい目でも出せる', () => {
        const pos = make_position({3: stack(0, 15)});
        assert.equal(dst_point(pos, 0, 3, 6), goal_point(0));
        const pos1 = make_position({22: stack(1, 15)});
        assert.equal(dst_point(pos1, 1, 22, 6), goal_point(1));
    });

    it('後ろに自分の駒が残っていると、大きい目では出せない', () => {
        const pos = make_position({3: stack(0, 14), 5: [0]});
        assert.equal(dst_point(pos, 0, 3, 6), undefined);
        // ちょうどの目なら出せる
        assert.equal(dst_point(pos, 0, 3, 3), goal_point(0));

        const pos1 = make_position({22: stack(1, 14), 20: [1]});
        assert.equal(dst_point(pos1, 1, 22, 6), undefined);
        assert.equal(dst_point(pos1, 1, 22, 3), goal_point(1));
    });

    it('後ろにあるのが相手の駒なら、大きい目で出せる', () => {
        const pos = make_position({3: stack(0, 15), 5: stack(1, 2)});
        assert.equal(dst_point(pos, 0, 3, 6), goal_point(0));
    });

    it('インナーに入りきっていなければ出せない', () => {
        const pos = make_position({3: stack(0, 14), 13: [0]});
        assert.equal(dst_point(pos, 0, 3, 3), undefined);
        assert.equal(dst_point(pos, 0, 3, 6), undefined);

        const pos1 = make_position({22: stack(1, 14), 12: [1]});
        assert.equal(dst_point(pos1, 1, 22, 3), undefined);
        assert.equal(dst_point(pos1, 1, 22, 6), undefined);
    });
});

describe('dst_point(): ブロック', () => {
    it('相手が 2 枚以上のポイントには入れない', () => {
        const pos = make_position({13: [0], 8: stack(1, 2)});
        assert.equal(dst_point(pos, 0, 13, 5), undefined);
    });

    it('相手が 1 枚 (ブロット) なら入れる', () => {
        const pos = make_position({13: [0], 8: [1]});
        assert.equal(dst_point(pos, 0, 13, 5), 8);
    });

    it('自分が何枚いても入れる', () => {
        const pos = make_position({13: [0], 8: stack(0, 5)});
        assert.equal(dst_point(pos, 0, 13, 5), 8);
    });

    it('空いていれば入れる', () => {
        const pos = make_position({13: [0]});
        assert.equal(dst_point(pos, 0, 13, 5), 8);
    });
});

describe('dst_point(): バーからの復帰', () => {
    it('相手が 2 枚以上のポイントには入れない', () => {
        const pos = make_position({[bar_point(0)]: [0],
                                   22: stack(1, 2)});
        assert.equal(dst_point(pos, 0, bar_point(0), 3), undefined);
    });

    it('相手が 1 枚 (ブロット) なら入れる', () => {
        const pos = make_position({[bar_point(0)]: [0], 22: [1]});
        assert.equal(dst_point(pos, 0, bar_point(0), 3), 22);
    });

    it('空いていれば入れる', () => {
        const pos = make_position({[bar_point(0)]: [0]});
        assert.equal(dst_point(pos, 0, bar_point(0), 3), 22);
    });

    it('player1 はバーから番号が増える方向', () => {
        const pos = make_position({[bar_point(1)]: [1], 3: stack(0, 2)});
        assert.equal(dst_point(pos, 1, bar_point(1), 3), undefined);
        assert.equal(dst_point(pos, 1, bar_point(1), 4), 4);
    });
});

describe('dst_points()', () => {
    it('ダイスが無ければ空', () => {
        const pos = make_position({13: [0]});
        assert.deepEqual(dst_points(pos, 0, 13, []), []);
    });

    it('2 つの目と、その和', () => {
        const pos = make_position({13: [0]});
        assert.deepEqual(dst_points(pos, 0, 13, [3, 5]), [10, 8, 5]);
    });

    it('同じ行き先は重複しない', () => {
        const pos = make_position({13: [0]});
        assert.deepEqual(dst_points(pos, 0, 13, [3, 3]), [10, 7]);
    });

    it('片方がブロックされていれば、その行き先は出ない', () => {
        const pos = make_position({13: [0], 10: stack(1, 2)});
        // 3 は使えないが、3+5=8 は通り道を見ないので出る
        assert.deepEqual(dst_points(pos, 0, 13, [3, 5]), [8, 5]);
    });

    it('ゾロ目は 2 個・3 個・4 個の足し合わせも出る', () => {
        const pos = make_position({20: [0]});
        assert.deepEqual(dst_points(pos, 0, 20, [3, 3, 3, 3]),
                         [17, 14, 11, 8]);
    });

    it('バーからの復帰でも、ゾロ目の足し合わせが出る', () => {
        const pos = make_position({[bar_point(0)]: [0]});
        assert.deepEqual(dst_points(pos, 0, bar_point(0), [3, 3, 3, 3]),
                         [22, 19, 16, 13]);
    });

    it('ゾロ目でも、途中がブロックされていれば、そこで止まる', () => {
        const pos = make_position({20: [0], 14: stack(1, 2)});
        assert.deepEqual(dst_points(pos, 0, 20, [3, 3, 3, 3]), [17]);
    });
});

describe('usable_dice()', () => {
    it('普通に動かせれば、全部 true', () => {
        const pos = make_position({13: stack(0, 15)});
        assert.deepEqual(usable_dice(pos, 0, [3, 5, 0, 0]),
                         [true, true, true, true]);
    });

    it('使用済み (11〜16) と非表示 (0, 10) は、判定せずに true', () => {
        // Dice.value が取るのは 0 / 10 (非表示)、1〜6 (有効)、
        // 11〜16 (使用済み) だけ。7 や -1 は来ない。
        // 11 を素の目として判定すると、2 がふさがれているので
        // false になってしまう
        const pos = make_position({13: [0], 2: stack(1, 2)});
        assert.deepEqual(usable_dice(pos, 0, [0, 11, 10, 0]),
                         [true, true, true, true]);
    });

    it('バーの駒が復帰できなければ、全部 false', () => {
        let spec = {[bar_point(0)]: [0]};
        for (const p of [19, 20, 21, 22, 23, 24]) {
            spec[p] = stack(1, 2);
        }
        const pos = make_position(spec);
        assert.deepEqual(usable_dice(pos, 0, [3, 5, 0, 0]),
                         [false, false, false, false]);
    });

    it('バーの駒が復帰できれば、全部 true', () => {
        let spec = {[bar_point(0)]: [0]};
        for (const p of [19, 20, 21, 23, 24]) {
            spec[p] = stack(1, 2);
        }
        const pos = make_position(spec);  // 22 が空いている
        assert.deepEqual(usable_dice(pos, 0, [3, 5, 0, 0]),
                         [true, true, true, true]);
    });

    it('player1 のバーも、そのプレーヤーのバーを見る', () => {
        // bar_point(player) を 26 固定にすると、player1 のバーの駒を
        // 見落として「普通に動かせる」側へ倒れる
        let spec = {[bar_point(1)]: [1]};
        for (const p of [1, 2, 3, 4, 5, 6]) {
            spec[p] = stack(0, 2);
        }
        const pos = make_position(spec);
        assert.deepEqual(usable_dice(pos, 1, [3, 5, 0, 0]),
                         [false, false, false, false]);
    });

    it('動かせる駒が 1 つも無ければ false', () => {
        // player0 の駒は 13 だけ。2 の行き先 (11) も
        // 5 の行き先 (8) もふさがっている
        const pos = make_position({13: [0],
                                   8: stack(1, 2),
                                   11: stack(1, 2),
                                   10: stack(1, 2),
                                   5: stack(1, 2)});
        assert.deepEqual(usable_dice(pos, 0, [2, 5, 0, 0]),
                         [false, false, true, true]);
    });

    it('1 つの目では動かせなくても、和で動かせれば true', () => {
        // 2 単独は 11 がふさがれて不可。だが 5 は使えて、
        // 2+5=7 も空いているので、2 も使える扱いになる
        const pos = make_position({13: [0],
                                   11: stack(1, 2)});
        assert.deepEqual(usable_dice(pos, 0, [2, 5, 0, 0]),
                         [true, true, true, true]);
    });

    it('端のポイント (1, 24) の駒も数える', () => {
        const pos = make_position({24: stack(0, 15)});
        assert.deepEqual(usable_dice(pos, 0, [3, 5, 0, 0]),
                         [true, true, true, true]);
        const pos1 = make_position({1: stack(1, 15)});
        assert.deepEqual(usable_dice(pos1, 1, [3, 5, 0, 0]),
                         [true, true, true, true]);
    });

    it('ゴール (0, 25) の駒は動かす元として数えない', () => {
        // 判定するのは 1〜24 のポイントだけ
        const pos = make_position({0: stack(0, 15)});
        assert.deepEqual(usable_dice(pos, 0, [3, 5, 0, 0]),
                         [false, false, true, true]);
    });
});

describe('dice_for_move()', () => {
    it('1 つの目', () => {
        assert.deepEqual(dice_for_move(0, [3, 5], 13, 10), [3]);
        assert.deepEqual(dice_for_move(0, [3, 5], 13, 8), [5]);
        assert.deepEqual(dice_for_move(1, [3, 5], 12, 15), [3]);
        assert.deepEqual(dice_for_move(1, [3, 5], 12, 17), [5]);
    });

    it('ダイスが 1 個 (1 手目を使ったあと)', () => {
        // active_dice[1] が undefined の枝。== を === に変える、
        // Number() に通すといった整形で静かに壊れるところ
        assert.deepEqual(dice_for_move(0, [3], 13, 10), [3]);
        assert.deepEqual(dice_for_move(0, [3], 13, 8), []);
        assert.deepEqual(dice_for_move(1, [3], 12, 15), [3]);
        assert.deepEqual(dice_for_move(0, [6], 3, goal_point(0)), [6]);
    });

    it('2 つの目の合計', () => {
        assert.deepEqual(dice_for_move(0, [3, 5], 13, 5), [3, 5]);
        assert.deepEqual(dice_for_move(1, [3, 5], 12, 20), [3, 5]);
    });

    it('届かないところへは空', () => {
        assert.deepEqual(dice_for_move(0, [3, 5], 13, 11), []);
    });

    it('バーからは、player0 は 25、player1 は 0 から数える', () => {
        assert.deepEqual(dice_for_move(0, [3, 5], bar_point(0), 22), [3]);
        assert.deepEqual(dice_for_move(1, [3, 5], bar_point(1), 3), [3]);
        assert.deepEqual(dice_for_move(0, [3, 5], bar_point(0), 17), [3, 5]);
    });

    it('ゾロ目は 3 個・4 個も', () => {
        assert.deepEqual(dice_for_move(0, [3, 3, 3, 3], 20, 17), [3]);
        assert.deepEqual(dice_for_move(0, [3, 3, 3, 3], 20, 14), [3, 3]);
        assert.deepEqual(dice_for_move(0, [3, 3, 3, 3], 20, 11), [3, 3, 3]);
        assert.deepEqual(dice_for_move(0, [3, 3, 3, 3], 20, 8), [3, 3, 3, 3]);
        assert.deepEqual(dice_for_move(1, [3, 3, 3, 3], 5, 17), [3, 3, 3, 3]);
    });

    it('ベアオフで、ちょうどの目が無ければ大きい方を使う', () => {
        assert.deepEqual(dice_for_move(0, [4, 6], 3, goal_point(0)), [6]);
        assert.deepEqual(dice_for_move(1, [4, 6], 22, goal_point(1)), [6]);
    });

    it('ベアオフでも、ちょうどの目があればそれを使う', () => {
        assert.deepEqual(dice_for_move(0, [3, 6], 3, goal_point(0)), [3]);
        assert.deepEqual(dice_for_move(1, [3, 6], 22, goal_point(1)), [3]);
    });
});
