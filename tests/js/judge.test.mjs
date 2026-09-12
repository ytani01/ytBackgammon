//
// (c) Yoichi Tanibayashi
//
// rules/judge.js のテスト (TODO-027)。
//
//   node --test tests/js/
//
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calc_gammon, closeout, pip_count, winner_is } from
    '../../src/ytbg/webroot/static/js/rules/judge.js';
import { Position, bar_point, goal_point } from
    '../../src/ytbg/webroot/static/js/rules/position.js';
import { make_gameinfo, make_position, stack } from './helper.mjs';

/**
 * クローズアウトしている盤面
 *
 * player のインナー 6 ポイントに 2 枚ずつ、相手はバーに 1 枚。
 */
const closeout_position = (player) => {
    const inner = (player == 0)
          ? [1, 2, 3, 4, 5, 6] : [19, 20, 21, 22, 23, 24];
    let spec = {};
    for (const p of inner) {
        spec[p] = stack(player, 2);
    }
    spec[bar_point(1 - player)] = [1 - player];
    return make_position(spec);
};

describe('pip_count()', () => {
    it('初期配置は両プレーヤーとも 167', () => {
        const pos = Position.from_gameinfo(make_gameinfo());
        assert.equal(pip_count(pos, 0), 167);
        assert.equal(pip_count(pos, 1), 167);
    });

    it('全部ゴールに入っていれば 0', () => {
        const pos = make_position({0: stack(0, 15), 25: stack(1, 15)});
        assert.equal(pip_count(pos, 0), 0);
        assert.equal(pip_count(pos, 1), 0);
    });

    it('バーのチェッカーは 25 で数える', () => {
        const pos = make_position({
            [bar_point(0)]: [0],
            [bar_point(1)]: [1],
        });
        assert.equal(pip_count(pos, 0), 25);
        assert.equal(pip_count(pos, 1), 25);
    });

    it('同じポイントに両プレーヤーがいても、混ざらない (free move)', () => {
        // point 10: player0 が 1 枚、player1 が 2 枚
        const pos = make_position({10: [0, 1, 1]});
        assert.equal(pip_count(pos, 0), 10);
        assert.equal(pip_count(pos, 1), (25 - 10) * 2);
    });

    it('チェッカーが 1 枚も無ければ 0', () => {
        assert.equal(pip_count(make_position({}), 0), 0);
    });
});

describe('closeout()', () => {
    it('インナーが全部 2 枚以上で、相手がバーにいれば true', () => {
        assert.equal(closeout(closeout_position(0), 0), true);
        assert.equal(closeout(closeout_position(1), 1), true);
    });

    it('相手がバーにいなければ false', () => {
        for (const player of [0, 1]) {
            let pos = closeout_position(player);
            pos = pos.with_move(bar_point(1 - player), 13, 1 - player);
            assert.equal(closeout(pos, player), false);
        }
    });

    it('インナーの端のポイントが 1 枚だけなら false', () => {
        // player0 のインナーは 1..6。端 (1 と 6) をそれぞれ試す
        for (const p of [1, 6]) {
            let pos = closeout_position(0);
            pos = pos.with_move(p, 13, 0);
            assert.equal(pos.count(p), 1);
            assert.equal(closeout(pos, 0), false);
        }
        for (const p of [19, 24]) {
            let pos = closeout_position(1);
            pos = pos.with_move(p, 13, 1);
            assert.equal(closeout(pos, 1), false);
        }
    });

    it('インナーの中のポイントが相手のものなら false', () => {
        let pos = closeout_position(0);
        pos = pos.with_move(3, 13, 0).with_move(3, 13, 0);
        pos = pos.with_move(undefined, 3, 1).with_move(undefined, 3, 1);
        assert.equal(pos.count(3), 2);
        assert.equal(closeout(pos, 0), false);
    });

    it('インナーの外 (7 や 18) は関係ない', () => {
        let pos = closeout_position(0);
        assert.equal(pos.count(7), 0);
        assert.equal(closeout(pos, 0), true);

        pos = closeout_position(1);
        assert.equal(pos.count(18), 0);
        assert.equal(closeout(pos, 1), true);
    });

    it('プレーヤー番号が 0/1 でなければ false', () => {
        const pos = closeout_position(0);
        for (const player of [-1, 2, undefined]) {
            assert.equal(closeout(pos, player), false);
        }
    });

    it('自分のクローズアウトは、相手のクローズアウトではない', () => {
        assert.equal(closeout(closeout_position(0), 1), false);
    });
});

describe('calc_gammon()', () => {
    it('相手がゴールに 1 枚でも入れていれば normal (cube 倍)', () => {
        const pos = make_position({[goal_point(1)]: [1], 13: stack(1, 14)});
        assert.equal(calc_gammon(pos, 0, 1, true), 1);
        assert.equal(calc_gammon(pos, 0, 4, true), 4);
    });

    it('相手が 1 枚も上がっていなければ gammon (cube の 2 倍)', () => {
        const pos = make_position({13: stack(1, 15)});
        assert.equal(calc_gammon(pos, 0, 1, true), 2);
        assert.equal(calc_gammon(pos, 0, 2, true), 4);
    });

    it('相手が自分のインナーに残っていれば backgammon (3 倍)', () => {
        for (const p of [1, 6]) {
            const pos = make_position({[p]: [1], 13: stack(1, 14)});
            assert.equal(calc_gammon(pos, 0, 1, true), 3);
        }
        for (const p of [19, 24]) {
            const pos = make_position({[p]: [0], 13: stack(0, 14)});
            assert.equal(calc_gammon(pos, 1, 1, true), 3);
        }
    });

    it('相手がバーに残っていれば backgammon', () => {
        const pos = make_position({[bar_point(1)]: [1], 13: stack(1, 14)});
        assert.equal(calc_gammon(pos, 0, 1, true), 3);

        const pos1 = make_position({[bar_point(0)]: [0], 13: stack(0, 14)});
        assert.equal(calc_gammon(pos1, 1, 1, true), 3);
    });

    it('インナーの外に残っていても backgammon にはならない', () => {
        const pos = make_position({7: [1], 13: stack(1, 14)});
        assert.equal(calc_gammon(pos, 0, 1, true), 2);
    });

    it('ダブルを受理していなければ、cube の半分', () => {
        const pos = make_position({13: stack(1, 15)});
        assert.equal(calc_gammon(pos, 0, 2, false), 1);
        assert.equal(calc_gammon(pos, 0, 4, false), 2);
    });
});

describe('winner_is()', () => {
    const won = make_position({0: stack(0, 15), 13: stack(1, 15)});
    const playing = Position.from_gameinfo(make_gameinfo());

    it('全部上がっていれば勝ち', () => {
        const r = winner_is(won, 0, {cube_value: 1, cube_accepted: true});
        assert.equal(r.score, 2);   // 相手は 1 枚も上がっていない
        assert.equal(r.by_resign, false);
    });

    it('まだ上がっていなければ 0', () => {
        const r = winner_is(playing, 0);
        assert.equal(r.score, 0);
        assert.equal(r.by_resign, false);
    });

    it('相手が投了していれば勝ち (by_resign)', () => {
        const r = winner_is(playing, 0, {resign: 1});
        // 初期配置では、相手 (player1) が player0 のインナー (point 1) に
        // 残っているので backgammon 扱いの 3
        assert.equal(r.score, 3);
        assert.equal(r.by_resign, true);
    });

    it('自分が投了していても、勝ちにはならない', () => {
        const r = winner_is(playing, 0, {resign: 0});
        assert.equal(r.score, 0);
        assert.equal(r.by_resign, false);
    });

    it('投了が無ければ (-1)、勝ちにはならない', () => {
        const r = winner_is(playing, 0, {resign: -1});
        assert.equal(r.score, 0);
    });

    it('上がっていても、相手が投了していれば by_resign', () => {
        const r = winner_is(won, 0, {resign: 1});
        // 投了が先に見られるので、どちらでも勝ちだが by_resign になる
        assert.equal(r.by_resign, true);
    });

    it('Position も引数も書き換えない', () => {
        const opts = {resign: 1, cube_value: 1, cube_accepted: true};
        winner_is(playing, 0, opts);
        assert.equal(opts.resign, 1);
        assert.equal(pip_count(playing, 0), 167);
    });
});
