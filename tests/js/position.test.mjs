//
// (c) Yoichi Tanibayashi
//
// rules/position.js のテスト (TODO-027)。
//
//   node --test tests/js/
//
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { N_POINT, Position, bar_point, get_pip, goal_point } from
    '../../src/ytbg/webroot/static/js/rules/position.js';
import { init_checker, make_gameinfo, make_position, stack } from
    './helper.mjs';

describe('goal_point() / bar_point()', () => {
    it('ゴールは player0 が 0、player1 が 25', () => {
        assert.equal(goal_point(0), 0);
        assert.equal(goal_point(1), 25);
    });

    it('バーは player0 が 26、player1 が 27', () => {
        assert.equal(bar_point(0), 26);
        assert.equal(bar_point(1), 27);
    });

    it('ゴールとバーは別のポイント', () => {
        for (const p of [0, 1]) {
            assert.notEqual(goal_point(p), bar_point(p));
        }
    });
});

describe('get_pip()', () => {
    it('player0 はポイント番号がそのまま pip', () => {
        assert.equal(get_pip(0, 24), 24);
        assert.equal(get_pip(0, 6), 6);
        assert.equal(get_pip(0, 0), 0);
    });

    it('player1 は 25 から引いた値', () => {
        assert.equal(get_pip(1, 1), 24);
        assert.equal(get_pip(1, 19), 6);
        assert.equal(get_pip(1, 25), 0);
    });

    it('バー (26, 27) は両プレーヤーとも 25', () => {
        for (const player of [0, 1]) {
            assert.equal(get_pip(player, 26), 25);
            assert.equal(get_pip(player, 27), 25);
        }
    });

    it('ポイントが undefined なら undefined', () => {
        assert.equal(get_pip(0, undefined), undefined);
        assert.equal(get_pip(1, undefined), undefined);
    });

    it('ゴールにあるチェッカーは 0 pip', () => {
        assert.equal(get_pip(0, goal_point(0)), 0);
        assert.equal(get_pip(1, goal_point(1)), 0);
    });
});

describe('Position.from_gameinfo()', () => {
    it('初期配置のポイントと枚数', () => {
        const pos = Position.from_gameinfo(make_gameinfo());

        assert.equal(pos.count(6), 5);
        assert.equal(pos.owner(6), 0);
        assert.equal(pos.count(8), 3);
        assert.equal(pos.count(13), 5);
        assert.equal(pos.count(24), 2);

        assert.equal(pos.count(19), 5);
        assert.equal(pos.owner(19), 1);
        assert.equal(pos.count(17), 3);
        assert.equal(pos.count(12), 5);
        assert.equal(pos.count(1), 2);
    });

    it('初期配置では、チェッカーの合計が 30 枚', () => {
        const pos = Position.from_gameinfo(make_gameinfo());
        let n = 0;
        for (let p=0; p < N_POINT; p++) {
            n += pos.count(p);
        }
        assert.equal(n, 30);
        assert.equal(pos.points_of(0).length, 15);
        assert.equal(pos.points_of(1).length, 15);
    });

    it('初期配置では、ゴールもバーも空', () => {
        const pos = Position.from_gameinfo(make_gameinfo());
        for (const p of [0, 25, 26, 27]) {
            assert.equal(pos.count(p), 0);
            assert.equal(pos.owner(p), null);
        }
    });

    it('idx の小さい順に積む (Board.load_gameinfo() と同じ)', () => {
        // 同じポイントに両プレーヤーが乗る (free move)。
        // idx が小さい player1 が下になる
        const checker = init_checker();
        checker[0][0] = [10, 1];
        checker[1][0] = [10, 0];

        const pos = Position.from_gameinfo(make_gameinfo(checker));
        assert.deepEqual(pos.players(10), [1, 0]);
        assert.equal(pos.owner(10), 1);
        assert.equal(pos.count(10), 2);
    });

    it('ポイント番号が範囲外なら RangeError', () => {
        const checker = init_checker();
        checker[0][0] = [28, 0];
        assert.throws(() => Position.from_gameinfo(make_gameinfo(checker)),
                      RangeError);
    });
});

describe('Position の owner() / count() / count_of() / points_of()', () => {
    it('空のポイントは owner が null で count が 0', () => {
        const pos = Position.empty();
        assert.equal(pos.owner(13), null);
        assert.equal(pos.count(13), 0);
    });

    it('owner はいちばん下 (先に積んだ) のチェッカー', () => {
        const pos = make_position({5: [0, 0, 1]});
        assert.equal(pos.owner(5), 0);
        assert.equal(pos.count(5), 3);
    });

    it('count_of() はプレーヤーごとの枚数', () => {
        const pos = make_position({5: [0, 0, 1]});
        assert.equal(pos.count_of(5, 0), 2);
        assert.equal(pos.count_of(5, 1), 1);
    });

    it('points_of() はチェッカー 1 枚につき 1 つ、昇順', () => {
        const pos = make_position({3: [0, 1], 7: stack(0, 2)});
        assert.deepEqual(pos.points_of(0), [3, 7, 7]);
        assert.deepEqual(pos.points_of(1), [3]);
    });

    it('players() は複製を返す (書き換えても Position は変わらない)', () => {
        const pos = make_position({5: [0, 0]});
        const players = pos.players(5);
        players.push(1);
        assert.equal(pos.count(5), 2);
    });

    it('コンストラクタも複製する', () => {
        let pt = Array.from({length: N_POINT}, () => []);
        pt[5] = [0, 0];
        const pos = new Position(pt);
        pt[5].push(1);
        assert.equal(pos.count(5), 2);
    });

    it('ポイントの数が合わなければ RangeError', () => {
        assert.throws(() => new Position([[], []]), RangeError);
    });
});

describe('Position.with_move()', () => {
    it('動かした後の Position を返す', () => {
        const pos = make_position({13: stack(0, 5)});
        const pos2 = pos.with_move(13, 7, 0);

        assert.equal(pos2.count(13), 4);
        assert.equal(pos2.count(7), 1);
        assert.equal(pos2.owner(7), 0);
    });

    it('元の Position は変わらない', () => {
        const pos = make_position({13: stack(0, 5)});
        pos.with_move(13, 7, 0);

        assert.equal(pos.count(13), 5);
        assert.equal(pos.count(7), 0);
    });

    it('from_p が undefined なら、置くだけ', () => {
        const pos = make_position({});
        const pos2 = pos.with_move(undefined, 26, 1);
        assert.equal(pos2.count(26), 1);
        assert.equal(pos2.owner(26), 1);
    });

    it('上に積む (owner は変わらない)', () => {
        const pos = make_position({6: [1], 13: [0]});
        const pos2 = pos.with_move(13, 6, 0);

        assert.deepEqual(pos2.players(6), [1, 0]);
        assert.equal(pos2.owner(6), 1);
    });

    it('動かすのは、そのポイントの上にある自分のチェッカー', () => {
        const pos = make_position({6: [0, 1, 0], 13: []});
        const pos2 = pos.with_move(6, 13, 0);

        assert.deepEqual(pos2.players(6), [0, 1]);
        assert.deepEqual(pos2.players(13), [0]);
    });

    it('自分のチェッカーが無いポイントからは動かせない (例外)', () => {
        // 黙って積むと駒が増えてしまうので、その場で落とす
        const pos = make_position({6: [1]});
        assert.throws(() => pos.with_move(6, 13, 0), /with_move/);

        // 空のポイントからも同じ
        const empty = make_position({});
        assert.throws(() => empty.with_move(6, 13, 0), /with_move/);
    });

    it('例外のときは、どこの誰の駒かが分かる', () => {
        const pos = make_position({6: [1]});
        assert.throws(() => pos.with_move(6, 13, 0), (e) => {
            assert.match(e.message, /point 6/);
            assert.match(e.message, /player0/);
            return true;
        });
    });

    it('動かしても、そのプレーヤーの枚数は変わらない', () => {
        // バーもゴールも含めて数える。今回の壊れ方は「合計が増える」
        const pos = Position.from_gameinfo(make_gameinfo());
        const count_all = (p, player) => {
            let n = 0;
            for (let i=0; i < N_POINT; i++) {
                n += p.count_of(i, player);
            }
            return n;
        };
        assert.equal(count_all(pos, 0), 15);

        // 盤上 → 盤上 → バー → ゴール と続けて動かす
        let pos2 = pos.with_move(13, 7, 0);
        assert.equal(count_all(pos2, 0), 15);
        assert.equal(count_all(pos2, 1), 15);

        pos2 = pos2.with_move(7, bar_point(0), 0);
        assert.equal(count_all(pos2, 0), 15);

        pos2 = pos2.with_move(bar_point(0), goal_point(0), 0);
        assert.equal(count_all(pos2, 0), 15);
        assert.equal(count_all(pos2, 1), 15);
    });
});
