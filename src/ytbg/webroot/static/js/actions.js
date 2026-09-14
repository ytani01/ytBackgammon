/**
 * サーバへ送る操作 (TODO-051)。
 *
 * **`emit_msg` を import するのはここだけ。** 「いま押してよいか」の判定と
 * 送る内容は rules/actions.js にあり、ここはそれを呼んで送る。`ui/` の
 * 表示部品は、マウスの処理と表示だけを受け持ち、ここの関数を呼ぶ。
 *
 * 1 つの操作を 1 通で送る。どの関数も `board` を受け取り、判定と送る内容・
 * 予測は rules/actions.js に任せて、返った message を送り、予測を
 * `board.apply()` する。rules へ渡す値は数に直す (サーバが型を確かめて
 * 弾くため。cookie から読んだプレーヤー番号は文字列のことがある)。
 */
import { log } from "./log.js";
import { emit_msg } from "./ws.js";
import { can_hold_cube as rule_can_hold_cube,
         can_pick_checker as rule_can_pick_checker,
         plan_cube_drop, plan_dice_click, plan_put_checker, plan_resign,
         plan_roll, plan_score } from "./rules/actions.js";

/**
 * チェッカーの ID (player * 100 + i)
 *
 * @param {Checker} ch
 * @return {number}
 */
const checker_id = (ch) => ch.player * 100 + ch.num;

/**
 * plan の message を送る
 *
 * @param {{message: {type: string, data: Object}}} plan
 */
const send = (plan) => {
    emit_msg(plan.message.type, plan.message.data);
};

// -----------------------------------------------------------------
// ダイス
// -----------------------------------------------------------------

/**
 * ダイスを振って roll を送る。判定と目の並べ方は rules/actions.js の
 * plan_roll()。乱数はここで作る
 *
 * @param {Board} board
 * @param {number} player
 * @return {boolean} - 送ったか (キューブが受けられていないと振れない)
 */
export const roll = (board, player) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    player = parseInt(player);

    const d1 = Math.floor(Math.random() * 4);
    let d2 = d1;
    while ( d1 == d2 ) {
        d2 = Math.floor(Math.random() * 4);
    }
    const value1 = Math.floor(Math.random() * 6) + 1;
    const value2 = Math.floor(Math.random() * 6) + 1;

    const plan = plan_roll(gi, player, { d1: d1, d2: d2,
                                         value1: value1, value2: value2 });
    if ( plan === null ) {
        return false;
    }
    log(`roll> [d1, d2]=[${d1}, ${d2}], [${value1}, ${value2}]`);

    send(plan);
    return true;
}; // roll()

/**
 * ダイスを押したとき。判定は rules/actions.js の plan_dice_click()。
 *
 * free move のときは、予測した盤面を先に表示してから送る
 * (続けて押したときに、サーバの返事の前でも目が進むように)。
 *
 * @param {Board} board
 * @param {number} player - ダイスのプレーヤー
 * @param {number} i - 何番目のダイスか
 */
export const click_dice = (board, player, i) => {
    player = parseInt(player);
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }

    const plan = plan_dice_click(gi, player, i, board.settings.free_move);
    if ( plan === null ) {
        return;
    }
    if ( plan.predicted !== undefined ) {
        board.apply(plan.predicted, { sec: 0 });
    }
    send(plan);
}; // click_dice()

/**
 * 手番を相手に渡す (パスのとき)
 *
 * @param {Board} board
 * @param {number} player - 渡す側
 */
export const end_turn = (board, player) => {
    emit_msg("end_turn", { player: parseInt(player) });
}; // end_turn()

// -----------------------------------------------------------------
// チェッカー
// -----------------------------------------------------------------

/**
 * そのチェッカーを掴んでよいか (判定は rules/actions.js)
 *
 * @param {Board} board
 * @param {Checker} ch
 * @return {boolean}
 */
export const can_pick_checker = (board, ch) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    return rule_can_pick_checker(gi, checker_id(ch), board.settings.free_move);
}; // can_pick_checker()

/**
 * 掴んでいたチェッカーを離したとき。
 *
 * free move なら put_checker を送る。そうでなければ Board.plan_move() で
 * 行き先・送る move・予測を求め、move を 1 通送ってから予測を表示する
 * (先行実行)。
 *
 * **予測に失敗したら何も送らない。** 予測が外れても、サーバから届く
 * gameinfo で表示は戻る。
 *
 * @param {Board} board
 * @param {Checker} ch - 掴んでいたチェッカー
 * @param {number|undefined} drop_p - 離した場所のポイント
 * @return {boolean} - false なら何も送っていない (呼んだ側が元の位置へ戻す)
 */
export const drop_checker = (board, ch, drop_p) => {
    if ( board.settings.free_move ) {
        put_checker(board, ch, drop_p);
        return true;
    }

    let plan = null;
    try {
        plan = board.plan_move(checker_id(ch), drop_p);
    } catch (e) {
        log(`drop_checker>${e}`);
        return false;
    }
    if ( plan === null ) {
        return false;
    }
    log(`drop_checker>move=${JSON.stringify(plan.message.data)}`);

    send(plan);

    // 予測を表示する。音は鳴らさない (last_op を渡さない)。
    // apply() は掴んでいるチェッカーを手元の座標に戻すが、
    // drag.js が離したときに外してから呼んでいる
    board.apply(plan.predicted, { sec: 0.2 });
    return true;
}; // drop_checker()

/**
 * free move での移動。idx は今の盤面の、そのポイントの枚数
 *
 * @param {Board} board
 * @param {Checker} ch
 * @param {number} p - point index
 */
export const put_checker = (board, ch, p) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }
    send(plan_put_checker(gi, checker_id(ch), p));
}; // put_checker()

// -----------------------------------------------------------------
// キューブ
// -----------------------------------------------------------------

/**
 * キューブを掴んでよいか (判定は rules/actions.js)
 *
 * @param {Board} board
 * @return {boolean}
 */
export const can_hold_cube = (board) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    return rule_can_hold_cube(gi, board.settings.player);
}; // can_hold_cube()

/**
 * 掴んでいたキューブを離したとき。ダブル・テイク・取り消しのどれを
 * 送るかは rules/actions.js の plan_cube_drop() が決める
 *
 * @param {Board} board
 * @param {number} src_y - 掴んだときのキューブの y
 * @param {number} y - 離したときのキューブの y
 */
export const drop_cube = (board, src_y, y) => {
    const cube_ui = board.cube;

    // 掴めたなら gameinfo は届いている (can_hold_cube())
    const plan = plan_cube_drop(board.gameinfo, board.settings.player, {
        src_y: src_y, y: y, y0: cube_ui.y0, y1: cube_ui.y1 });
    if ( plan !== null ) {
        send(plan);
    }
}; // drop_cube()

// -----------------------------------------------------------------
// 投了・得点・名前
// -----------------------------------------------------------------

/**
 * 投了。相手に足す点数は rules/actions.js の plan_resign()
 *
 * @param {Board} board
 */
export const resign = (board) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }
    const plan = plan_resign(gi, parseInt(board.settings.player));
    log(`resign>score=${plan.message.data.score}`);
    send(plan);
}; // resign()

/**
 * 得点の ▲ (1 足す。上限 99)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_up = (board, player) => {
    set_score(board, player, "up");
}; // score_up()

/**
 * 得点の ▼ (0 にする)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_clear = (board, player) => {
    set_score(board, player, "clear");
}; // score_clear()

/**
 * 得点を変えた盤面を先に表示してから set_score を送る。
 * 続けて押したときに、サーバの返事の前でも足されるように
 *
 * @param {Board} board
 * @param {number} player
 * @param {"up"|"clear"} operation
 */
const set_score = (board, player, operation) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }
    const plan = plan_score(gi, parseInt(player), operation);
    board.apply(plan.predicted, { sec: 0 });
    send(plan);
}; // set_score()

/**
 * @param {Board} board
 * @param {number} player
 * @param {string} name
 */
export const set_playername = (board, player, name) => {
    emit_msg("set_playername", { player: parseInt(player), name: name });
}; // set_playername()

// -----------------------------------------------------------------
// クロック・設定
// -----------------------------------------------------------------

/**
 * クロックを押したとき。動いていれば止め、止まっていれば再開する
 *
 * @param {Board} board
 * @param {number} player
 */
export const toggle_clock = (board, player) => {
    player = parseInt(player);
    if ( board.player_clock[player].active ) {
        emit_msg("stop_clock", { player: player });
    } else if ( board.clock_sw ) {
        emit_msg("resume_clock", { player: player });
    }
}; // toggle_clock()

/**
 * クロック機能の ON/OFF。両方のクロックはサーバが止める
 *
 * @param {Board} board
 * @param {boolean} sw
 */
export const set_clock_switch = (board, sw) => {
    emit_msg("set_clock_switch", { switch: Boolean(sw) });
}; // set_clock_switch()

/**
 * 持ち時間 (index 0) か猶予 (index 1) を変える。
 * 両方のクロックはサーバが止める
 *
 * @param {Board} board
 * @param {number} index
 * @param {number} limit - sec
 */
export const set_clock_limit = (board, index, limit) => {
    emit_msg("set_clock_limit", { index: parseInt(index),
                                  clock_limit: Number(limit) });
}; // set_clock_limit()

// -----------------------------------------------------------------
// 履歴
// -----------------------------------------------------------------

/**
 * 履歴の操作 (back / back2 / back_all / fwd / fwd2 / fwd_all /
 * clear_hist / new)
 *
 * @param {string} type
 * @param {Object} [data={}] - back / fwd は {n}
 */
export const history_op = (type, data={}) => {
    emit_msg(type, data);
}; // history_op()
