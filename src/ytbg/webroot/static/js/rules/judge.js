/**
 * 盤面の判定 (TODO-027)。
 *
 * **ここは DOM も Board も見ない。値を返すだけで、表示も状態も変えない。**
 * 表示の更新 (`pip[player].set()`) と状態の書き換え (`resign = -1`) は
 * 呼んだ側が行う。
 */

import { bar_point, get_pip, goal_point } from "./position.js";

/**
 * PIP カウント
 *
 * @param {Position} position
 * @param {number} player - 0 or 1
 * @return {number|undefined} - pip count
 */
export const pip_count = (position, player) => {
    let count = 0;
    for (let point of position.points_of(player)) {
        count += get_pip(player, point);
        if ( isNaN(count) ) {
            return undefined;
        }
    } // for (point)
    return count;
}; // pip_count()

/**
 * player の勝利が確定していることが前提で、
 * ノーマル/ギャモン/バックギャモン の判定。
 * Cube のポイントも掛けた結果を返す。
 *
 * @param {Position} position
 * @param {number} player - 0 or 1
 * @param {number} cube_value
 * @param {boolean} cube_accepted
 * @return {number} point - cube_val の 1倍:normal, 2倍:gammon, 3倍:backgammon
 */
export const calc_gammon = (position, player, cube_value, cube_accepted) => {
    let cube_val = cube_value;
    if ( ! cube_accepted ) {
        // ダブルを掛けられて、受理してない場合
        cube_val /= 2;
    }

    if ( ! cube_accepted || position.count(goal_point(1 - player)) > 0 ) {
        return cube_val;
    }

    let points = [];
    if ( 1 - player == 0 ) {
        points = [19, 20, 21, 22, 23, 24, bar_point(0)];
    } else {
        points = [1, 2, 3, 4, 5, 6, bar_point(1)];
    }
    for (let p of points) {
        if ( position.count(p) > 0 && position.owner(p) == 1 - player ) {
            // backgammon !
            return (cube_val * 3);
        }
    } // for (p)

    // gammon !
    return (cube_val * 2);
}; // calc_gammon()

/**
 * player の勝ちかどうかの判定。
 *
 * **`resign` は書き換えない** (TODO-027)。投了による勝ちだったことは
 * `by_resign` で返すので、`resign = -1` は呼んだ側が行う。
 *
 * @param {Position} position
 * @param {number} player - 0 or 1
 * @param {Object} [opts]
 * @param {number} [opts.resign=-1] - 投了したプレーヤー。-1: なし
 * @param {number} [opts.cube_value=1]
 * @param {boolean} [opts.cube_accepted=true]
 * @return {{score: number, by_resign: boolean}}
 *     score が 0 なら勝ちではない
 */
export const winner_is = (position, player,
                          {resign=-1, cube_value=1,
                           cube_accepted=true}={}) => {
    if ( resign == 1 - player ) {
        return { score: calc_gammon(position, player,
                                    cube_value, cube_accepted),
                 by_resign: true };
    }

    if ( pip_count(position, player) == 0 ) {
        return { score: calc_gammon(position, player,
                                    cube_value, cube_accepted),
                 by_resign: false };
    }

    return { score: 0, by_resign: false };
}; // winner_is()

/**
 * クローズアウトしている？
 *
 * 相手のチェッカーがバーにあり、player のインナーの 6 ポイントすべてに
 * player のチェッカーが 2 枚以上ある状態。
 *
 * @param {Position} position
 * @param {number} player - 0 or 1
 * @return {boolean}
 */
export const closeout = (position, player) => {
    if ( player != 0 && player != 1 ) {
        return false;
    }
    if ( position.count(bar_point(1 - player)) == 0 ) {
        return false;
    }

    let [from_p, to_p] = [1, 6];
    if ( player == 1 ) {
        [from_p, to_p] = [19, 24];
    }

    for (let p=from_p; p <= to_p; p++) {
        if ( position.count(p) < 2 ) {
            return false;
        }
        if ( position.owner(p) != player ) {
            return false;
        }
    } // for (p)

    return true;
}; // closeout()
