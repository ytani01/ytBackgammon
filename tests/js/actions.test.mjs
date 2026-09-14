//
// (c) Yoichi Tanibayashi
//
// rules/actions.js のテスト。
//
//   node --test tests/js/
//
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    CUBE_MAX, SCORE_MAX, can_hold_cube, can_pick_checker, decide_dst,
    plan_cube_drop, plan_dice_click, plan_double, plan_move,
    plan_put_checker, plan_resign, plan_roll, plan_score, predict_moves,
} from '../../src/ytbg/webroot/static/js/rules/actions.js';
import { bar_point, copy_gameinfo } from
    '../../src/ytbg/webroot/static/js/rules/position.js';
import { make_gameinfo } from './helper.mjs';

/**
 * 残りをゴールに置いた checker[player] を作る
 *
 * @param {number} player
 * @param {number[][]} head - 先頭から置く [point, idx]
 * @return {number[][]}
 */
const with_rest_at_goal = (player, head) => {
    const goal = 25 * player;
    const rest = Array.from({length: 15 - head.length},
                            (_, i) => [goal, i]);
    return [...head, ...rest];
};

/**
 * gameinfo を作り、turn・dice・cube を上書きする
 *
 * @param {Object} opts
 * @return {Object}
 */
const gi_with = ({checker=undefined, turn=0, dice=[[0, 0, 0, 0], [0, 0, 0, 0]],
                  cube=undefined, sn=10}={}) => {
    const gi = make_gameinfo(checker);
    gi.sn = sn;
    gi.turn = turn;
    gi.board.dice = dice;
    if ( cube !== undefined ) {
        gi.board.cube = cube;
    }
    return gi;
};

/**
 * player0 の 2 枚がバーにあり、19〜21・23・24 が player1 にふさがれている。
 * 22 だけ空いている
 */
const bar_blocked_checker = () => [
    with_rest_at_goal(0, [[26, 0], [26, 1]]),
    [[19, 0], [19, 1], [20, 0], [20, 1], [21, 0], [21, 1],
     [23, 0], [23, 1], [24, 0], [24, 1],
     [25, 0], [25, 1], [25, 2], [25, 3], [25, 4]],
];

// -----------------------------------------------------------------

describe('can_pick_checker()', () => {
    it('free move なら、いつでも掴める', () => {
        const gi = gi_with({ turn: -1 });
        assert.equal(can_pick_checker(gi, 100, true), true);
    });

    it('turn が 0 / 1 でなければ掴めない', () => {
        for (const turn of [-1, 2]) {
            const gi = gi_with({ turn: turn,
                                 dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
            assert.equal(can_pick_checker(gi, 7, false), false, `turn=${turn}`);
        }
    });

    it('手番でないプレーヤーの駒は掴めない', () => {
        // 両方にダイスを置く (片方だけだと「使えるダイスが無い」で false になり、
        // 手番を見ているかを確かめられない)
        const dice = [[3, 5, 0, 0], [3, 5, 0, 0]];
        const gi = gi_with({ turn: 0, dice: dice });
        assert.equal(can_pick_checker(gi, 7, false), true);
        assert.equal(can_pick_checker(gi, 100, false), false);
        gi.turn = 1;
        assert.equal(can_pick_checker(gi, 7, false), false);
        assert.equal(can_pick_checker(gi, 100, false), true);
    });

    it('使えるダイスが無ければ掴めない', () => {
        const gi = gi_with({ dice: [[13, 15, 0, 0], [0, 0, 0, 0]] });
        assert.equal(can_pick_checker(gi, 7, false), false);
    });

    it('バーに駒があれば、バーの駒しか掴めない', () => {
        const gi = gi_with({ checker: bar_blocked_checker(),
                             dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        assert.equal(can_pick_checker(gi, 0, false), true);
        // checker[0][2] はゴール
        assert.equal(can_pick_checker(gi, 2, false), false);
    });

    it('行ける場所が無ければ掴めない', () => {
        // バーから 5 は 20 (ふさがっている)
        const gi = gi_with({ checker: bar_blocked_checker(),
                             dice: [[5, 0, 0, 0], [0, 0, 0, 0]] });
        assert.equal(can_pick_checker(gi, 0, false), false);
    });

    it('移動元は gameinfo から読む', () => {
        // checker[0][14] は初期配置で 24。3 で 21 へ行ける
        const gi = gi_with({ dice: [[3, 0, 0, 0], [0, 0, 0, 0]] });
        assert.equal(can_pick_checker(gi, 14, false), true);
        // checker[0][0] をバーに置くと、24 の駒は掴めず、バーの駒は掴める
        // (3 で 22 へ入れる)
        gi.board.checker[0][0] = [26, 0];
        assert.equal(can_pick_checker(gi, 14, false), false);
        assert.equal(can_pick_checker(gi, 0, false), true);
    });
});

describe('decide_dst()', () => {
    it('離した場所へ行けるなら、そこ', () => {
        const gi = gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        // 13 から 5 で 8
        assert.deepEqual(decide_dst(gi, 12, 8), { point: 8, hit_id: null });
    });

    it('元のポイントで離すと、行ける場所の最初 (大きい目から)', () => {
        const gi = gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        assert.deepEqual(decide_dst(gi, 12, 13), { point: 8, hit_id: null });
    });

    it('行けない場所なら null', () => {
        const gi = gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        assert.equal(decide_dst(gi, 12, 19), null);
        assert.equal(decide_dst(gi, 12, undefined), null);
    });

    it('相手が 1 枚ならヒットで、その ID を返す', () => {
        const gi = gi_with({
            checker: [with_rest_at_goal(0, [[8, 0]]),
                      with_rest_at_goal(1, [[5, 0]])],
            dice: [[3, 1, 0, 0], [0, 0, 0, 0]] });
        assert.deepEqual(decide_dst(gi, 0, 5), { point: 5, hit_id: 100 });
    });

    it('自分の駒が 1 枚のポイントへ動かしてもヒットにならない', () => {
        const gi = gi_with({
            checker: [with_rest_at_goal(0, [[8, 0], [5, 0]]),
                      with_rest_at_goal(1, [])],
            dice: [[3, 1, 0, 0], [0, 0, 0, 0]] });
        assert.deepEqual(decide_dst(gi, 0, 5), { point: 5, hit_id: null });
        assert.deepEqual(plan_move(gi, 0, 5).message.data.moves,
                         [{ ch: 0, p: 5, idx: 1 }]);
    });
});

describe('plan_move()', () => {
    it('積み順の idx と、使ったダイスの消費', () => {
        // 8 の先端 (checker[0][7]) を 6 (5 枚) へ
        const gi = gi_with({ dice: [[2, 0, 0, 0], [0, 0, 0, 0]] });
        const plan = plan_move(gi, 7, 6);
        assert.deepEqual(plan.message, {
            type: 'move',
            data: { player: 0, moves: [{ ch: 7, p: 6, idx: 5 }],
                    dice: [12, 0, 0, 0], score: 0 },
        });
        assert.deepEqual(plan.predicted.board.checker[0][7], [6, 5]);
        assert.deepEqual(plan.predicted.board.dice[0], [12, 0, 0, 0]);
    });

    it('ヒットは 2 手 (相手をバーへ、自分を移動先へ)', () => {
        const gi = gi_with({
            checker: [with_rest_at_goal(0, [[8, 0]]),
                      with_rest_at_goal(1, [[5, 0]])],
            dice: [[3, 1, 0, 0], [0, 0, 0, 0]] });
        const plan = plan_move(gi, 0, 5);
        assert.deepEqual(plan.message.data.moves, [
            { ch: 100, p: bar_point(1), idx: 0 },
            { ch: 0, p: 5, idx: 0 },
        ]);
        assert.deepEqual(plan.message.data.dice, [13, 1, 0, 0]);
        assert.deepEqual(plan.predicted.board.checker[1][0], [bar_point(1), 0]);
        assert.deepEqual(plan.predicted.board.checker[0][0], [5, 0]);
    });

    it('勝ちの点数 (シングル、ギャモン)', () => {
        const cube = { side: 0, value: 2, accepted: true };
        const single = gi_with({
            checker: [with_rest_at_goal(0, [[1, 0]]),
                      [[25, 0], ...Array.from({length: 14}, (_, i) => [12, i])]],
            dice: [[1, 0, 0, 0], [0, 0, 0, 0]], cube: cube });
        assert.equal(plan_move(single, 0, 0).message.data.score, 2);

        const gammon = copy_gameinfo(single);
        gammon.board.checker[1][0] = [12, 14];
        assert.equal(plan_move(gammon, 0, 0).message.data.score, 4);
    });

    it('渡した盤面を書き換えず、sn を進めない', () => {
        const gi = gi_with({
            checker: [with_rest_at_goal(0, [[8, 0]]),
                      with_rest_at_goal(1, [[5, 0]])],
            dice: [[3, 1, 0, 0], [0, 0, 0, 0]], sn: 42 });
        const before = copy_gameinfo(gi);
        const plan = plan_move(gi, 0, 5);
        assert.deepEqual(gi, before);
        assert.equal(plan.predicted.sn, 42);
    });

    it('行けないなら null', () => {
        const gi = gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        assert.equal(plan_move(gi, 12, 19), null);
    });

    it('バーから復帰できなくなっても、目が 0 のダイスは 0 のまま', () => {
        // バーの 2 枚のうち 1 枚を 3 で 22 へ。残りの 5 は 20 がふさがれて
        // 使えない。0 は 10 にしない
        const gi = gi_with({ checker: bar_blocked_checker(),
                             dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        const plan = plan_move(gi, 1, bar_point(0));
        assert.deepEqual(plan.message.data.moves, [{ ch: 1, p: 22, idx: 0 }]);
        assert.deepEqual(plan.message.data.dice, [13, 15, 0, 0]);
        assert.deepEqual(plan.predicted.board.dice[0], [13, 15, 0, 0]);
    });
});

describe('predict_moves()', () => {
    it('gameinfo の位置が壊れていれば例外', () => {
        const gi = gi_with();
        gi.board.checker[0][0] = [99, 0];
        assert.throws(() => predict_moves(gi, [{ ch: 0, p: 5 }]));
    });

    it('player を渡さなければダイスは変えない', () => {
        const gi = gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] });
        const got = predict_moves(gi, [{ ch: 0, p: 3 }]);
        assert.deepEqual(got.board.dice, gi.board.dice);
        assert.deepEqual(got.board.checker[0][0], [3, 0]);
    });
});

describe('plan_put_checker()', () => {
    it('idx は、そのポイントの両プレーヤーぶんの枚数', () => {
        const gi = gi_with();
        assert.deepEqual(plan_put_checker(gi, 100, 6), {
            message: { type: 'put_checker',
                       data: { ch: 100, p: 6, idx: 5 } } });
        assert.equal(plan_put_checker(gi, 100, 7).message.data.idx, 0);
    });
});

describe('plan_roll()', () => {
    const rv = { d1: 0, d2: 2, value1: 3, value2: 5 };

    it('キューブが受けられていなければ null', () => {
        const gi = gi_with({ cube: { side: 1, value: 2, accepted: false } });
        assert.equal(plan_roll(gi, 0, rv), null);
    });

    it('2 個の目を d1 / d2 の位置に置く', () => {
        const gi = gi_with();
        assert.deepEqual(plan_roll(gi, 0, rv), {
            message: { type: 'roll',
                       data: { player: 0, dice: [3, 0, 5, 0] } } });
    });

    it('ゾロ目は 4 個', () => {
        const gi = gi_with();
        assert.deepEqual(
            plan_roll(gi, 0, { ...rv, value2: 3 }).message.data.dice,
            [3, 3, 3, 3]);
    });

    it('先手決め (turn >= 2) では 1 個', () => {
        const gi = gi_with({ turn: 2 });
        assert.deepEqual(plan_roll(gi, 1, rv).message.data.dice,
                         [3, 0, 0, 0]);
    });

    it('バーから復帰できなくても、目が 0 のダイスは 0 のまま', () => {
        const gi = gi_with({ checker: bar_blocked_checker() });
        // 3 は 22 へ行けるので、ここでは全部使える
        assert.deepEqual(plan_roll(gi, 0, rv).message.data.dice,
                         [3, 0, 5, 0]);
        gi.board.checker[1][10] = [22, 0];
        gi.board.checker[1][11] = [22, 1];
        assert.deepEqual(plan_roll(gi, 0, rv).message.data.dice,
                         [13, 0, 15, 0]);
    });
});

describe('plan_dice_click()', () => {
    it('free move は目を 1 つ進めた予測を先に作る (6 の次は 1、使用済みは戻す)',
       () => {
           const gi = gi_with({ turn: -1, dice: [[3, 6, 14, 0], [0, 0, 0, 0]] });
           const before = copy_gameinfo(gi);
           const plan = plan_dice_click(gi, 0, 0, true);
           assert.deepEqual(plan.message, {
               type: 'dice', data: { player: 0, dice: [4, 6, 14, 0] } });
           assert.deepEqual(plan.predicted.board.dice[0], [4, 6, 14, 0]);
           assert.deepEqual(gi, before);
           assert.deepEqual(plan_dice_click(gi, 0, 1, true).message.data.dice,
                            [3, 1, 14, 0]);
           assert.deepEqual(plan_dice_click(gi, 0, 2, true).message.data.dice,
                            [3, 6, 4, 0]);
           assert.equal(plan_dice_click(gi, 0, 3, true), null);
       });

    it('turn が -1 なら null', () => {
        const gi = gi_with({ turn: -1 });
        assert.equal(plan_dice_click(gi, 0, 0, false), null);
    });

    it('先手決めは、相手が振っていなければ null', () => {
        const gi = gi_with({ turn: 2, dice: [[4, 0, 0, 0], [0, 0, 0, 0]] });
        assert.equal(plan_dice_click(gi, 0, 0, false), null);
    });

    it('先手決めは目の大きい方、同じなら -1', () => {
        const gi = gi_with({ turn: 2, dice: [[4, 0, 0, 0], [0, 2, 0, 0]] });
        assert.deepEqual(plan_dice_click(gi, 0, 0, false),
                         { message: { type: 'opening', data: { winner: 0 } } });
        assert.equal(plan_dice_click(gi, 1, 1, false).message.data.winner, 0);
        gi.board.dice[1] = [0, 0, 0, 6];
        assert.equal(plan_dice_click(gi, 0, 0, false).message.data.winner, 1);
        gi.board.dice[1] = [0, 0, 4, 0];
        assert.equal(plan_dice_click(gi, 0, 0, false).message.data.winner, -1);
    });

    it('使えるダイスが残っていれば null、無ければ end_turn', () => {
        const gi = gi_with({ dice: [[13, 5, 0, 0], [0, 0, 0, 0]] });
        assert.equal(plan_dice_click(gi, 0, 0, false), null);
        gi.board.dice[0] = [13, 15, 0, 0];
        assert.deepEqual(plan_dice_click(gi, 0, 0, false),
                         { message: { type: 'end_turn',
                                      data: { player: 0 } } });
    });
});

describe('can_hold_cube()', () => {
    it('turn が 0 / 1 のときだけ', () => {
        assert.equal(can_hold_cube(gi_with({ turn: 0 }), 0), true);
        assert.equal(can_hold_cube(gi_with({ turn: 2 }), 0), false);
        assert.equal(can_hold_cube(gi_with({ turn: -1 }), 0), false);
    });

    it('相手側 (side) のキューブは触れない', () => {
        const cube = { side: 1, value: 2, accepted: true };
        assert.equal(can_hold_cube(gi_with({ turn: 0, cube: cube }), 0), false);
        assert.equal(can_hold_cube(gi_with({ turn: 1, cube: cube }), 1), true);
        // side 0 も「相手側」になる
        const cube0 = { side: 0, value: 2, accepted: true };
        assert.equal(can_hold_cube(gi_with({ turn: 1, cube: cube0 }), 1), false);
        assert.equal(can_hold_cube(gi_with({ turn: 0, cube: cube0 }), 0), true);
    });

    it('accepted なら自分の番だけ、未テイクなら相手の番でも触れる', () => {
        assert.equal(can_hold_cube(gi_with({ turn: 1 }), 0), false);
        const cube = { side: 0, value: 2, accepted: false };
        assert.equal(can_hold_cube(gi_with({ turn: 1, cube: cube }), 0), true);
    });

    it('どちらかのダイスが出ていれば触れない (使用済みも含む)', () => {
        for (const dice of [[[3, 0, 0, 0], [0, 0, 0, 0]],
                            [[0, 0, 0, 0], [0, 13, 0, 0]]]) {
            assert.equal(can_hold_cube(gi_with({ turn: 0, dice: dice }), 0),
                         false, JSON.stringify(dice));
        }
    });
});

describe('plan_double()', () => {
    it('上限に達していれば null。リダブルは上限を見ない', () => {
        const cube = { side: -1, value: CUBE_MAX, accepted: true };
        const gi = gi_with({ cube: cube });
        assert.equal(plan_double(gi, 0), null);
        assert.deepEqual(plan_double(gi, 0, true),
                         { message: { type: 'double', data: { player: 0 } } });
        gi.board.cube.value = CUBE_MAX / 2;
        assert.deepEqual(plan_double(gi, 1)?.message.data, { player: 1 });
    });

    it('player が undefined なら null', () => {
        assert.equal(plan_double(gi_with(), undefined), null);
    });
});

describe('plan_cube_drop()', () => {
    const geo = { src_y: 0, y: 0, y0: 400, y1: [600, 200] };

    it('accepted で中央か自分の側なら double', () => {
        const gi = gi_with();
        assert.deepEqual(plan_cube_drop(gi, 1, geo),
                         { message: { type: 'double', data: { player: 1 } } });
        gi.board.cube = { side: 0, value: 2, accepted: true };
        assert.equal(plan_cube_drop(gi, 0, geo).message.data.player, 0);
        assert.equal(plan_cube_drop(gi, 1, geo), null);
        gi.board.cube.value = CUBE_MAX;
        assert.equal(plan_cube_drop(gi, 0, geo), null);
    });

    it('未テイクで相手側なら、掛けた側の cancel_double', () => {
        const gi = gi_with({ cube: { side: 1, value: 2, accepted: false } });
        assert.deepEqual(plan_cube_drop(gi, 0, geo),
                         { message: { type: 'cancel_double',
                                      data: { player: 0 } } });
    });

    it('未テイクで自分の側: 中央を越えなければ take、越えればリダブル', () => {
        const gi = gi_with({ cube: { side: 0, value: 2, accepted: false } });
        const take = { message: { type: 'take', data: { player: 0 } } };
        // y1[0] から掴んだ: y >= y0 で take (等号を含む)
        assert.deepEqual(plan_cube_drop(gi, 0, { ...geo, src_y: 600, y: 400 }),
                         take);
        assert.deepEqual(plan_cube_drop(gi, 0, { ...geo, src_y: 600, y: 399 }),
                         { message: { type: 'double', data: { player: 0 } } });
        // y1[1] から掴んだ: y <= y0 で take
        assert.deepEqual(plan_cube_drop(gi, 0, { ...geo, src_y: 200, y: 400 }),
                         take);
        assert.deepEqual(plan_cube_drop(gi, 0, { ...geo, src_y: 200, y: 401 }),
                         { message: { type: 'double', data: { player: 1 } } });
        // player 1 でも、y1[0] から掴んだリダブルは player 0、y1[1] は 1
        const gi1 = gi_with({ cube: { side: 1, value: 2, accepted: false } });
        assert.deepEqual(plan_cube_drop(gi1, 1, { ...geo, src_y: 600, y: 399 }),
                         { message: { type: 'double', data: { player: 0 } } });
        assert.deepEqual(plan_cube_drop(gi1, 1, { ...geo, src_y: 200, y: 401 }),
                         { message: { type: 'double', data: { player: 1 } } });
        // どちらの基準でもない位置から掴んだら何もしない
        assert.equal(plan_cube_drop(gi, 0, { ...geo, src_y: 300, y: 400 }),
                     null);
    });
});

describe('plan_resign()', () => {
    it('テイク済みならキューブの 3 倍、未テイクなら掛ける前の値', () => {
        const gi = gi_with({ cube: { side: 0, value: 4, accepted: true } });
        assert.deepEqual(plan_resign(gi, 1), {
            message: { type: 'resign', data: { player: 1, score: 12 } } });
        gi.board.cube.accepted = false;
        assert.equal(plan_resign(gi, 1).message.data.score, 2);
    });
});

describe('plan_score()', () => {
    it('up は 1 足し、上限で止まる。予測も同じ値', () => {
        const gi = gi_with();
        gi.score = [3, SCORE_MAX];
        const before = copy_gameinfo(gi);
        const plan = plan_score(gi, 0, 'up');
        assert.deepEqual(plan.message,
                         { type: 'set_score', data: { player: 0, score: 4 } });
        assert.deepEqual(plan.predicted.score, [4, SCORE_MAX]);
        assert.deepEqual(gi, before);
        assert.equal(plan_score(gi, 1, 'up').message.data.score, SCORE_MAX);
    });

    it('clear は 0。知らない operation は null', () => {
        const gi = gi_with();
        gi.score = [3, 5];
        assert.deepEqual(plan_score(gi, 1, 'clear').predicted.score, [3, 0]);
        assert.equal(plan_score(gi, 1, 'down'), null);
    });
});
