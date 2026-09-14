/**
 * 操作の判定と、送る内容・予測した盤面を求める純粋関数。
 *
 * **ここは DOM も表示部品も WebSocket も見ない。** 受け取るのは gameinfo と
 * チェッカーの ID (player * 100 + i)・プレーヤー番号のような値だけ。
 * import してよいのは rules/ の中だけ。
 *
 * plan_*() は、成り立たなければ null、成り立てば
 * `{message: {type, data}}` と、要るときだけ `predicted` (予測した gameinfo) を
 * 返す。**渡された gameinfo は書き換えない。** 送る・表示するのは呼んだ側。
 *
 * 判定の無い操作 (end_turn、take、cancel_double、名前・履歴・時計の設定) には
 * plan の関数を作らない。take / cancel_double と、ダイスを使い切ったあとの
 * end_turn は、判定のある plan_cube_drop() / plan_dice_click() が返す。渡す値を数に直すのは呼んだ側 (cookie から読んだ
 * プレーヤー番号は文字列のことがある)。
 */
import { Position, active_dice, bar_point, checkers_at,
         copy_gameinfo, has_dice } from "./position.js";
import { dice_for_move, disable_unusable, dst_points } from "./move.js";
import { winner_is } from "./judge.js";

/** キューブの値と得点の上限 (サーバの CUBE_MAX / SCORE_MAX と同じ) */
export const CUBE_MAX = 64;
export const SCORE_MAX = 99;

/**
 * ID のプレーヤー番号
 *
 * @param {number} id
 * @return {number}
 */
const id_player = (id) => Math.floor(id / 100);

/**
 * その ID のチェッカーがいるポイント (gameinfo から読む)
 *
 * @param {Object} gi
 * @param {number} id
 * @return {number}
 */
const point_of = (gi, id) => gi.board.checker[id_player(id)][id % 100][0];

/**
 * 使えるダイスの目を降順に
 *
 * @param {Object} gi
 * @param {number} player
 * @return {number[]}
 */
const active_dice_desc = (gi, player) => {
    return active_dice(gi, player).sort((a, b) => b - a);
};

// -----------------------------------------------------------------
// チェッカー
// -----------------------------------------------------------------

/**
 * そのチェッカーを掴んでよいか
 *
 * @param {Object} gi
 * @param {number} id - チェッカーの ID
 * @param {boolean} free_move
 * @return {boolean}
 */
export const can_pick_checker = (gi, id, free_move) => {
    if ( free_move ) {
        return true;
    }

    // 手番のプレーヤーのチェッカーだけ
    if ( gi.turn >= 2 || gi.turn < 0 ) {
        return false;
    }
    const player = id_player(id);
    if ( gi.turn != player ) {
        return false;
    }

    // 使えるダイスが残っていること
    const dice = active_dice(gi, player);
    if ( dice.length == 0 ) {
        return false;
    }

    // ヒットされている場合は、バーのポイントしか動かせない
    const src_p = point_of(gi, id);
    const bar_p = bar_point(player);
    if ( checkers_at(gi, bar_p).length > 0 && src_p != bar_p ) {
        return false;
    }

    // 移動できるポイントがあること
    return dst_points(Position.from_gameinfo(gi), player,
                      src_p, dice).length > 0;
}; // can_pick_checker()

/**
 * 行き先を決めて、ヒットするかを調べる
 *
 * 離した場所が元のポイントなら、ワンタッチでのムーブ
 * (行けるポイントの最初のもの)。
 *
 * @param {Object} gi
 * @param {number} id - 動かすチェッカーの ID
 * @param {number|undefined} point - 離した場所のポイント
 * @return {{point: number, hit_id: number|null}|null}
 *     動かせないときは null
 */
export const decide_dst = (gi, id, point) => {
    const player = id_player(id);
    const src_p = point_of(gi, id);
    let dst_p = point;

    const available_p = dst_points(Position.from_gameinfo(gi), player, src_p,
                                   active_dice_desc(gi, player));

    if ( dst_p == src_p ) {
        // ワンタッチでのムーブ
        if ( available_p.length == 0 ) {
            return null;
        }
        dst_p = available_p[0];
    }

    if ( available_p.indexOf(dst_p) < 0 ) {
        return null;
    }

    let hit_id = null;
    const checkers = checkers_at(gi, dst_p);
    if ( checkers.length == 1 && checkers[0].player != player ) {
        hit_id = checkers[0].id;
    }

    return { point: dst_p, hit_id: hit_id };
}; // decide_dst()

/**
 * チェッカーを動かしたあとの gameinfo を予測する (plan_move() の中身)
 *
 * 動かしたチェッカーの [point, idx] を書き換える。idx は、そのポイントに
 * 既にある枚数。移動元は gameinfo から読む。
 *
 * - **sn は書き換えない。** 予測はサーバの通し番号を進めない
 * - **動かせるかを Position.with_move() で確かめる。** 駒が無ければ例外
 * - player のダイスも書き換える。used_dice の目を 11〜16 にし、
 *   動かしたあとの盤面で使えなくなった目も 11〜16 にする
 *
 * @param {Object} gi
 * @param {{ch: number, p: number}[]} moves - ch は ID。動かす順に並べる
 * @param {number} player - ダイスを書き換えるプレーヤー
 * @param {number[]} used_dice - 使ったダイスの目
 * @return {Object} - 新しい gameinfo (gi は変えない)
 * @throws {Error} 動かせないとき
 */
const predict_moves = (gi, moves, player, used_dice) => {
    const gameinfo = copy_gameinfo(gi);
    let pos = Position.from_gameinfo(gameinfo);

    for (let mv of moves) {
        const ch_player = id_player(mv.ch);
        const i = mv.ch % 100;
        const idx = pos.count(mv.p);

        // 動かせるか確かめる (駒が無ければ例外)
        pos = pos.with_move(gameinfo.board.checker[ch_player][i][0],
                            mv.p, ch_player);

        gameinfo.board.checker[ch_player][i] = [mv.p, idx];
    } // for (mv)

    const dice = gameinfo.board.dice[player];
    for (let d1 of used_dice) {
        const i = dice.indexOf(d1);
        if ( i >= 0 ) {
            dice[i] += 10;
        }
    } // for (d1)
    gameinfo.board.dice[player] = disable_unusable(pos, player, dice);

    return gameinfo;
}; // predict_moves()

/**
 * 駒を動かす move と、動かしたあとの予測
 *
 * 行き先とヒットは decide_dst()。ヒットのときは 2 手ぶん (相手をバーへ、
 * 自分を移動先へ)。idx・ダイス (使った目と使えなくなった目は 11〜16)・
 * 勝ちの点数は、すべて同じ予測から求める。
 *
 * @param {Object} gi
 * @param {number} id - 動かすチェッカーの ID
 * @param {number|undefined} point - 離した場所のポイント
 * @return {{message: {type: string, data: Object}, predicted: Object}|null}
 * @throws {Error} 予測に失敗したとき (predict_moves())
 */
export const plan_move = (gi, id, point) => {
    const dst = decide_dst(gi, id, point);
    if ( dst === null ) {
        return null;
    }
    const player = id_player(id);

    let moves = [];
    if ( dst.hit_id !== null ) {
        moves.push({ ch: dst.hit_id, p: bar_point(id_player(dst.hit_id)) });
    }
    moves.push({ ch: id, p: dst.point });

    const used = dice_for_move(player, active_dice_desc(gi, player),
                               point_of(gi, id), dst.point);

    const predicted = predict_moves(gi, moves, player, used);

    const score = winner_is(Position.from_gameinfo(predicted), player, {
        resign: predicted.resign,
        cube_value: predicted.board.cube.value,
        cube_accepted: predicted.board.cube.accepted,
    }).score;

    const ch = predicted.board.checker;
    return {
        message: {
            type: "move",
            data: {
                player: player,
                moves: moves.map((mv) => ({
                    ch: mv.ch, p: mv.p,
                    idx: ch[id_player(mv.ch)][mv.ch % 100][1] })),
                dice: [...predicted.board.dice[player]],
                score: score,
            },
        },
        predicted: predicted,
    };
}; // plan_move()

/**
 * free move での移動。idx は今の盤面の、そのポイントの枚数。予測はしない
 *
 * @param {Object} gi
 * @param {number} id
 * @param {number|undefined} point
 * @return {{message: {type: string, data: Object}}}
 */
export const plan_put_checker = (gi, id, point) => {
    return {
        message: {
            type: "put_checker",
            data: { ch: id, p: point, idx: checkers_at(gi, point).length },
        },
    };
}; // plan_put_checker()

// -----------------------------------------------------------------
// ダイス
// -----------------------------------------------------------------

/**
 * ダイスを振る roll
 *
 * 先手決め (turn >= 2) では 1 個、それ以外は 2 個 (ゾロ目なら 4 個)。
 * 使えない目は 11〜16 にする。乱数は呼んだ側が作って渡す。
 *
 * @param {Object} gi
 * @param {number} player
 * @param {{d1: number, d2: number, value1: number, value2: number}}
 *     random_values - d1 / d2 はダイスの位置 (0〜3、互いに違う)、
 *     value1 / value2 は目 (1〜6)
 * @return {{message: {type: string, data: Object}}|null}
 *     キューブが受けられていないと null
 */
export const plan_roll = (gi, player, random_values) => {
    if ( ! gi.board.cube.accepted ) {
        return null;
    }
    const { d1, d2, value1, value2 } = random_values;

    let dice = [0, 0, 0, 0];
    if ( gi.turn >= 2 ) {
        dice[d1] = value1;
    } else if ( value1 != value2 ) {
        dice[d1] = value1;
        dice[d2] = value2;
    } else {
        dice = [value1, value1, value1, value1];
    }
    dice = disable_unusable(Position.from_gameinfo(gi), player, dice);

    return { message: { type: "roll", data: { player: player, dice: dice } } };
}; // plan_roll()

/**
 * ダイスを押したとき
 *
 * - free move: 押したダイスの目を 1 つ進めた dice と、その予測
 * - 先手決め (turn >= 2): 相手も振っていれば、目を比べて opening
 * - それ以外: 使えるダイスが残っていなければ、手番を渡す end_turn
 *
 * @param {Object} gi
 * @param {number} player - ダイスのプレーヤー
 * @param {number} index - 何番目のダイスか
 * @param {boolean} free_move
 * @return {{message: {type: string, data: Object}, predicted?: Object}|null}
 */
export const plan_dice_click = (gi, player, index, free_move) => {
    if ( free_move ) {
        const cur = gi.board.dice[player][index];
        if ( cur < 1 ) {
            return null;
        }
        let val = cur + 1;
        if ( cur > 6 ) {
            val = cur % 10;
        } else if ( val > 6 ) {
            val = 1;
        }
        // 続けて押したときに、サーバの返事の前でも目が進むように、
        // 呼んだ側が予測を先に表示する
        const predicted = copy_gameinfo(gi);
        predicted.board.dice[player][index] = val;
        return {
            message: { type: "dice",
                       data: { player: player,
                               dice: [...predicted.board.dice[player]] } },
            predicted: predicted,
        };
    }

    if ( gi.turn < 0 ) {
        return null;
    }

    if ( gi.turn >= 2 ) {
        // 先手決め。双方が振った後、目が大きい方が先手
        if ( ! has_dice(gi, 1 - player) ) {
            return null;
        }
        const d0 = active_dice(gi, player)[0];
        const d1 = active_dice(gi, 1 - player)[0];

        let winner = -1;   // 同じ目なら、もう一度
        if ( d0 > d1 ) {
            winner = player;
        } else if ( d0 < d1 ) {
            winner = 1 - player;
        }
        return { message: { type: "opening", data: { winner: winner } } };
    }

    if ( active_dice(gi, player).length > 0 ) {
        return null;
    }
    return { message: { type: "end_turn", data: { player: player } } };
}; // plan_dice_click()

// -----------------------------------------------------------------
// キューブ
// -----------------------------------------------------------------

/**
 * キューブを掴んでよいか
 *
 * @param {Object} gi
 * @param {number} player - 画面のプレーヤー
 * @return {boolean}
 */
export const can_hold_cube = (gi, player) => {
    const cube = gi.board.cube;   // side: -1 なら中央

    if ( gi.turn >= 2 || gi.turn < 0 ) {
        // ゲーム開始時、終了時は、触れない
        return false;
    }
    if ( cube.side >= 0 && cube.side != player ) {
        // 相手側にあるキューブは、触れない
        return false;
    }
    if ( cube.accepted && gi.turn != player ) {
        // 自分の番にしかダブルを掛けられない
        return false;
    }
    for (let p=0; p < 2; p++) {
        // ダイスが出ているときは、キューブに触れない
        if ( has_dice(gi, p) ) {
            return false;
        }
    }
    return true;
}; // can_hold_cube()

/**
 * ダブル
 *
 * @param {Object} gi
 * @param {number|undefined} player - 掛ける側
 * @param {boolean} [redouble=false] - 掛けられたキューブをさらに倍にする。
 *     リダブルでは上限を見ない (上限はサーバが抑える)
 * @return {{message: {type: string, data: Object}}|null}
 */
export const plan_double = (gi, player, redouble=false) => {
    if ( player === undefined ) {
        return null;
    }
    if ( ! redouble && gi.board.cube.value >= CUBE_MAX ) {
        return null;
    }
    return { message: { type: "double", data: { player: player } } };
}; // plan_double()

/**
 * 掴んでいたキューブを離したとき。掴んだ位置と離した位置で、
 * ダブル・テイク・取り消しのどれを送るかを決める
 *
 * @param {Object} gi
 * @param {number} player - 画面のプレーヤー
 * @param {{src_y: number, y: number, y0: number, y1: number[]}} geometry
 *     src_y は掴んだときの y、y は最後に描画した y、y0 は中央、
 *     y1 は両側 [プレーヤー 0 側, 1 側] の基準の y
 * @return {{message: {type: string, data: Object}}|null}
 */
export const plan_cube_drop = (gi, player, geometry) => {
    const { src_y, y, y0, y1 } = geometry;
    const cube = gi.board.cube;
    const side = cube.side;   // -1 なら中央

    if ( ! cube.accepted ) {
        // ダブルが掛けられた状態
        if ( side == player ) {
            const take = { message: { type: "take",
                                      data: { player: side } } };
            if ( src_y == y1[0] ) {
                if ( y >= y0 ) {
                    return take;
                }
                // redouble
                return plan_double(gi, 0, true);
            }
            if ( src_y == y1[1] ) {
                if ( y <= y0 ) {
                    return take;
                }
                // redouble
                return plan_double(gi, 1, true);
            }
            return null;
        }
        // 掛けた側 (キューブの反対側) が取り消す
        return { message: { type: "cancel_double",
                            data: { player: 1 - side } } };
    }

    // cube.accepted == true
    if ( side < 0 || side == player ) {
        return plan_double(gi, player);
    }
    return null;
}; // plan_cube_drop()

// -----------------------------------------------------------------
// 投了・得点
// -----------------------------------------------------------------

/**
 * 投了。相手に足す点数を求める
 *
 * @param {Object} gi
 * @param {number} player - 投了する側
 * @return {{message: {type: string, data: Object}}}
 */
export const plan_resign = (gi, player) => {
    const cube = gi.board.cube;
    let score;
    if ( ! cube.accepted ) {
        // ダブルを掛けられて降りる場合、ダブルを掛ける前の値
        score = cube.value / 2;
    } else {
        // ダブルを掛けられてないときに降りる場合は、
        // 「バックギャモン」(3倍)扱い
        score = cube.value * 3;
    }
    return { message: { type: "resign",
                        data: { player: player, score: parseInt(score) } } };
}; // plan_resign()

/**
 * 得点の ▲ (1 足す。上限 99) と ▼ (0 にする)
 *
 * 続けて押したときに、サーバの返事の前でも足されるように、
 * 呼んだ側が予測を先に表示する。
 *
 * @param {Object} gi
 * @param {number} player
 * @param {"up"|"clear"} operation
 * @return {{message: {type: string, data: Object}, predicted: Object}|null}
 */
export const plan_score = (gi, player, operation) => {
    let score;
    if ( operation == "up" ) {
        score = Math.min(gi.score[player] + 1, SCORE_MAX);
    } else if ( operation == "clear" ) {
        score = 0;
    } else {
        return null;
    }
    const predicted = copy_gameinfo(gi);
    predicted.score[player] = score;
    return {
        message: { type: "set_score",
                   data: { player: player, score: parseInt(score) } },
        predicted: predicted,
    };
}; // plan_score()
