/**
 * 行き先の計算 (TODO-027)。
 *
 * **ここは DOM も Board も見ない。**
 */

import { bar_point } from "./position.js";

/**
 * ポイントとダイスの目から行き先のポイントを計算
 *
 * 注1: 実際に移動できるかどうかは判断しない。
 * 注2: ゴールを行き過ぎても、補正しない。
 *
 * @param {number} player - 0 or 1
 * @param {number} src_p
 * @param {number} dice_val
 * @return {number} - destination point
 */
export const calc_dst_point = (player, src_p, dice_val) => {
    if ( player == 0 ) {
        if ( src_p == bar_point(player) ) {
            src_p = 25;
        }
        return (src_p - dice_val);
    }

    // player 1
    if ( src_p == bar_point(player) ) {
        src_p = 0;
    }
    return (src_p + dice_val);
}; // calc_dst_point()
