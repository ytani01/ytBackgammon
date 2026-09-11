//
// (c) Yoichi Tanibayashi
//
// ルール層のテスト用の道具 (TODO-027)。
//
// ブラウザも DOM も使わない。rules/ の関数に渡す Position と gameinfo を
// 組み立てるだけ。
//
import { Position, N_POINT } from
    '../../src/ytbg/webroot/static/js/rules/position.js';

/**
 * 初期配置の checker (src/ytbg/gameinfo.py の init_checker() と同じ)
 *
 * checker[player][i] = [point, idx]
 */
export const init_checker = () => {
    return [
        [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
         [8, 0], [8, 1], [8, 2],
         [13, 0], [13, 1], [13, 2], [13, 3], [13, 4],
         [24, 0], [24, 1]],
        [[19, 0], [19, 1], [19, 2], [19, 3], [19, 4],
         [17, 0], [17, 1], [17, 2],
         [12, 0], [12, 1], [12, 2], [12, 3], [12, 4],
         [1, 0], [1, 1]],
    ];
};

/**
 * gameinfo (の、ルール層が見る部分だけ) を作る
 *
 * @param {number[][][]} [checker] - 省略すると初期配置
 * @return {Object}
 */
export const make_gameinfo = (checker=undefined) => {
    return {
        turn: -1,
        resign: -1,
        score: [0, 0],
        board: {
            playername: ['', ''],
            cube: { side: -1, value: 1, accepted: true },
            dice: [[0, 0, 0, 0], [0, 0, 0, 0]],
            checker: checker === undefined ? init_checker() : checker,
        },
    };
};

/**
 * { point: [プレーヤー番号, ..] } から Position を作る
 *
 * 書いていないポイントは空。
 *
 * @param {Object} spec - {ポイント番号: プレーヤー番号の配列}
 * @return {Position}
 */
export const make_position = (spec) => {
    let pt = Array.from({length: N_POINT}, () => []);
    for (const [p, players] of Object.entries(spec)) {
        pt[Number(p)] = [...players];
    }
    return Position.from_points(pt);
};

/**
 * n 枚を同じプレーヤーで並べた配列
 *
 * @param {number} player
 * @param {number} n
 * @return {number[]}
 */
export const stack = (player, n) => {
    return Array.from({length: n}, () => player);
};
