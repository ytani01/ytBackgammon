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

/**
 * player のチェッカーが全てインナーに入っているか (TODO-043)
 *
 * player 0 は 0〜6 (ゴールの 0 を含む)、player 1 は 19〜25。
 * バー (26, 27) はインナーではない。
 *
 * @param {Position} pos
 * @param {number} player - 0 or 1
 * @return {boolean}
 */
export const all_inner = (pos, player) => {
    for (let p of pos.points_of(player)) {
        if ( player == 0 ) {
            if ( p > 6 ) {
                return false;
            }
        } else {
            if ( p < 19 || p > 25 ) {
                return false;
            }
        }
    } // for (p)
    return true;
}; // all_inner()

/**
 * 1 つの目での行き先 (TODO-043)
 *
 * 移動できないときは undefined。
 *
 * @param {Position} pos
 * @param {number} player - 0 or 1
 * @param {number} src_p
 * @param {number} dice_val
 * @return {number|undefined} - destination point
 */
export const dst_point = (pos, player, src_p, dice_val) => {
    let dst_p1 = calc_dst_point(player, src_p, dice_val);

    if ( player == 0 && dst_p1 <= 0 ) {
        if ( ! all_inner(pos, player) ) {
            return undefined;
        }
        // すべてインナー
        if ( dst_p1 < 0 ) {
            // src_p以降のポイントにCheckerが存在するか確認
            for (let p=src_p+1; p <= 6; p++) {
                if ( pos.owner(p) === player ) {
                    return undefined;
                }
            } // for(p)
            dst_p1 = 0;
        }
    }
    if ( player == 1 && dst_p1 >= 25 ) {
        if ( ! all_inner(pos, player) ) {
            return undefined;
        }
        // すべてインナー
        if ( dst_p1 > 25 ) {
            // src_p以降のポイントにCheckerが存在するか確認
            for (let p=src_p-1; p >= 19; p--) {
                if ( pos.owner(p) === player ) {
                    return undefined;
                }
            } // for(p)
            dst_p1 = 25;
        }
    }

    if ( pos.count(dst_p1) >= 2 && pos.owner(dst_p1) !== player ) {
        return undefined;
    }

    return dst_p1;
}; // dst_point()

/**
 * 移動可能なポイントの一覧 (TODO-043)
 *
 * ゾロ目は、足し合わせた目も順に確かめる。
 *
 * @param {Position} pos
 * @param {number} player - 0 or 1
 * @param {number} src_p
 * @param {number[]} dice_vals
 * @return {number[]} - destination points
 */
export const dst_points = (pos, player, src_p, dice_vals) => {
    let dst_p = [];

    if ( dice_vals.length == 0 ) {
        return [];
    }

    for (let dice_val of dice_vals) {
        const dst_p1 = dst_point(pos, player, src_p, dice_val);
        if ( dst_p1 === undefined ) {
            continue;
        }
        dst_p.push(dst_p1);
    } // for(dice_val)

    if ( dst_p.length == 0 ) {
        return [];
    }

    // 重複削除
    dst_p = [...new Set(dst_p)];

    let dst_p1 = undefined;
    let dice_val = undefined;

    if ( dice_vals.length >= 2 ) {
        // サイコロの目を足した場合も確認
        dice_val = dice_vals[0] + dice_vals[1];
        dst_p1 = dst_point(pos, player, src_p, dice_val);
        if ( dst_p1 !== undefined ) {
            dst_p.push(dst_p1);
        }

        if ( dice_vals.length >= 3 && dst_p1 !== undefined ) {
            // ぞろ目の場合
            dice_val += dice_vals[2];
            dst_p1 = dst_point(pos, player, src_p, dice_val);
            if ( dst_p1 !== undefined ) {
                dst_p.push(dst_p1);
            }

            if ( dice_vals.length == 4 && dst_p1 !== undefined ) {
                dice_val += dice_vals[3];
                dst_p1 = dst_point(pos, player, src_p, dice_val);
                if ( dst_p1 !== undefined ) {
                    dst_p.push(dst_p1);
                }
            }
        }
    }

    return dst_p;
}; // dst_points()

/**
 * それぞれのダイスが使えるか (TODO-043)
 *
 * dice_vals と同じ長さの配列を返す。値が 1〜6 でない要素は
 * 判定の対象外で true。
 *
 * バーに駒があって復帰できないときは、全て false。
 *
 * @param {Position} pos
 * @param {number} player - 0 or 1
 * @param {number[]} dice_vals
 * @return {boolean[]}
 */
export const usable_dice = (pos, player, dice_vals) => {
    const bar_p = bar_point(player);
    const active_d = dice_vals.filter((v) => v >= 1 && v <= 6);

    if ( pos.count(bar_p) > 0 ) {
        // ヒットされている場合は、復活できるか確認
        const dst_p = dst_points(pos, player, bar_p, active_d);
        if ( dst_p.length == 0 ) {
            // 復活できない
            return dice_vals.map(() => false);
        }

        // T.B.D. 復活できる場合、もう一つのダイスが使えるか確認?

        return dice_vals.map(() => true);
    }

    // 全ての持ち駒について、移動できるかのチェック
    let usable = [];
    for (let i=0; i < dice_vals.length; i++) {
        let can_use = false;

        const dice_val = dice_vals[i];
        if ( dice_val < 1 || dice_val > 6 ) {
            usable.push(true);
            continue;
        }

        for (let p=1; p <= 24; p++) {
            if ( pos.count(p) == 0 ) {
                continue;
            }
            if ( pos.owner(p) != player ) {
                continue;
            }

            const dst = dst_point(pos, player, p, dice_val);
            if ( dst !== undefined ) {
                can_use = true;
                break;
            }

            // 使えない場合は、もう一つのダイスが使えるか確認後
            // 足した場合も確認
            for (let i2=0; i2 < dice_vals.length; i2++) {
                if ( i2 == i ) {
                    continue;
                }
                const dice_val2 = dice_vals[i2];
                if ( dice_val2 < 1 || dice_val2 > 6 ) {
                    continue;
                }
                const dst2 = dst_point(pos, player, p, dice_val2);
                if ( dst2 === undefined ) {
                    continue;
                }

                // もう一つのダイスが使える場合、出目を足して確認
                // 足した目で利用可能なら、dice[i] を利用可とする
                const dst3 = dst_point(pos, player, p, dice_val + dice_val2);
                if ( dst3 !== undefined ) {
                    can_use = true;
                    break;
                }
            } // for(i2)
            if ( can_use ) {
                break;
            }
        } // for(p)

        usable.push(can_use);
    } // for(i)

    return usable;
}; // usable_dice()

/**
 * 使えない目を 11〜16 にした、新しいダイスの配列 (TODO-053)
 *
 * **渡した配列は書き換えない。** 判定は usable_dice()。
 *
 * @param {Position} pos
 * @param {number} player - 0 or 1
 * @param {number[]} dice_vals
 * @return {number[]}
 */
export const disable_unusable = (pos, player, dice_vals) => {
    const usable = usable_dice(pos, player, dice_vals);
    return dice_vals.map((v, i) => usable[i] ? v : v % 10 + 10);
}; // disable_unusable()

/**
 * 移動に使用するダイスの目の組み合わせ (TODO-043)
 *
 * **盤面は見ない。** 移動できるかどうかは呼ぶ側が確かめ済みという前提。
 *
 * @param {number} player - 0 or 1
 * @param {number[]} active_dice
 * @param {number} from_p
 * @param {number} to_p
 * @return {number[]} - 使用するダイスの目。空なら、そこには移動できない
 */
export const dice_for_move = (player, active_dice, from_p, to_p) => {
    if ( from_p >= 26 ) {
        // バーから移動の場合の調整
        if ( player == 0 ) {
            from_p = 25;
        } else {
            from_p = 0;
        }
    }

    if ( player == 1 ) {
        from_p = 25 - from_p;
        to_p = 25 - to_p;
    }

    const diff_p = from_p - to_p;

    let dice_vals = [];
    if ( diff_p == active_dice[0] ) {
        dice_vals = [active_dice[0]];
    } else if ( diff_p == active_dice[1] ) {
        dice_vals = [active_dice[1]];
    } else if ( diff_p == active_dice[0] + active_dice[1] ) {
        dice_vals = [active_dice[0], active_dice[1]];
    }

    if ( active_dice.length >= 3 ) {
        let sum_d = active_dice[0] * 3;
        if ( diff_p == sum_d ) {
            dice_vals = [active_dice[0], active_dice[0], active_dice[0]];
        }
        if ( active_dice.length == 4 ) {
            sum_d += active_dice[0];
            if ( diff_p == sum_d ) {
                dice_vals = [ active_dice[0], active_dice[0],
                              active_dice[0], active_dice[0] ];
            }
        }
    }

    if ( dice_vals.length == 0 && to_p == 0 ) {
        // bearing off
        // 移動可能かどうかは、事前に確認済と仮定
        // 該当するダイスが無い場合は、大きい方を使用する。
        dice_vals = [ Math.max(...active_dice) ];
    }

    return dice_vals;
}; // dice_for_move()
