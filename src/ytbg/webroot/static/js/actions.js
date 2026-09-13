/**
 * サーバへ送る操作 (TODO-051)。
 *
 * **`emit_msg` を import するのはここだけ。** ゲームを進める処理と、
 * 「いま押してよいか」の判定をここに置く。`ui/` の表示部品は、
 * マウスの処理と表示だけを受け持ち、ここの関数を呼ぶ。
 *
 * 1 つの操作を 1 通で送る。どの関数も `board` を受け取り、
 * 判定してから送る。送る値は数に直す (サーバが型を確かめて弾くため。
 * cookie から読んだプレーヤー番号は文字列のことがある)。
 */
import { log } from "./log.js";
import { emit_msg } from "./ws.js";
import { Position, bar_point } from "./rules/position.js";
import { dice_for_move, usable_dice } from "./rules/move.js";
import { winner_is } from "./rules/judge.js";

/** キューブの値と得点の上限 (サーバの CUBE_MAX / SCORE_MAX と同じ) */
const CUBE_MAX = 64;
const SCORE_MAX = 99;

/**
 * チェッカーの ID (player * 100 + i)
 *
 * @param {Checker} ch
 * @return {number}
 */
const checker_id = (ch) => parseInt(ch.id.slice(1));

/**
 * 使えない目を 11〜16 にする
 *
 * @param {Position} position
 * @param {number} player
 * @param {number[]} dice - 書き換える
 * @return {number[]} dice
 */
export const disable_unusable = (position, player, dice) => {
    const usable = usable_dice(position, player, dice);
    log(`disable_unusable>usable=${JSON.stringify(usable)}`);
    for (let i=0; i < usable.length; i++) {
        if ( ! usable[i] ) {
            dice[i] = dice[i] % 10 + 10;
        }
    }
    return dice;
}; // disable_unusable()

// -----------------------------------------------------------------
// ダイス
// -----------------------------------------------------------------

/**
 * ダイスを振って roll を送る。
 *
 * 先手決め (turn >= 2) では 1 個、それ以外は 2 個 (ゾロ目なら 4 個)。
 * 使えない目は 11〜16 にして送る。
 *
 * @param {Board} board
 * @param {number} player
 * @return {boolean} - 送ったか (キューブが受けられていないと振れない)
 */
export const roll = (board, player) => {
    if ( ! board.cube.accepted ) {
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
    log(`roll> [d1, d2]=[${d1}, ${d2}], [${value1}, ${value2}]`);

    let dice = [0, 0, 0, 0];
    if ( board.turn >= 2 ) {
        dice[d1] = value1;
    } else if ( value1 != value2 ) {
        dice[d1] = value1;
        dice[d2] = value2;
    } else {
        dice = [value1, value1, value1, value1];
    }
    disable_unusable(board.position(), player, dice);

    emit_msg("roll", { player: player, dice: dice });
    return true;
}; // roll()

/**
 * ダイスを押したとき。
 *
 * - free move: 押したダイスの目を 1 つ進めて dice を送る
 * - 先手決め (turn >= 2): 相手も振っていれば、目を比べて opening を送る
 * - それ以外: 使えるダイスが残っていなければ、手番を渡す (end_turn)
 *
 * @param {Board} board
 * @param {number} player - ダイスのプレーヤー
 * @param {number} i - 何番目のダイスか
 */
export const click_dice = (board, player, i) => {
    player = parseInt(player);
    const roll_btn = board.roll_btn[player];
    const roll_btn1 = board.roll_btn[1 - player];

    if ( board.free_move ) {
        const d = roll_btn.dice[i];
        if ( d.value < 1 ) {
            return;
        }
        let val = d.value + 1;
        if ( d.value > 6 ) {
            val = d.value % 10;
        } else if ( val > 6 ) {
            val = 1;
        }
        // 続けて押したときに、サーバの返事の前でも目が進むように、
        // 画面の値も変えておく (TODO-052 で gameinfo を読む形にする)
        d.set(val);
        emit_msg("dice", { player: player, dice: roll_btn.get() });
        return;
    }

    if ( board.turn < 0 ) {
        log(`click_dice>turn=${board.turn} .. ignored`);
        return;
    }

    if ( board.turn >= 2 ) {
        // 先手決め。双方が振った後、目が大きい方が先手
        if ( ! roll_btn1.dice_active ) {
            return;
        }
        const d0 = roll_btn.get_active_dice()[0];
        const d1 = roll_btn1.get_active_dice()[0];

        let winner = -1;   // 同じ目なら、もう一度
        if ( d0 > d1 ) {
            winner = player;
        } else if ( d0 < d1 ) {
            winner = 1 - player;
        }
        emit_msg("opening", { winner: winner });
        return;
    }

    if ( roll_btn.get_active_dice().length > 0 ) {
        return;
    }
    end_turn(board, player);
}; // click_dice()

/**
 * 手番を相手に渡す (ダイスを使い切ったとき、パスのとき)
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
 * そのチェッカーを掴んでよいか
 *
 * @param {Board} board
 * @param {Checker} ch
 * @return {boolean}
 */
export const can_pick_checker = (board, ch) => {
    if ( board.free_move ) {
        return true;
    }

    // 手番のプレーヤーのチェッカーだけ
    if ( board.turn >= 2 || board.turn < 0 ) {
        return false;
    }
    if ( board.turn != ch.player ) {
        return false;
    }

    // 使えるダイスが残っていること
    const active_dice = board.get_active_dice(ch.player);
    log(`can_pick_checker>active_dice=${active_dice}`);
    if ( active_dice.length == 0 ) {
        return false;
    }

    // ヒットされている場合は、バーのポイントしか動かせない
    const bar_p = bar_point(ch.player);
    if ( board.checkers_at(bar_p).length > 0 && ch.cur_point != bar_p ) {
        return false;
    }

    // 移動できるポイントがあること
    const dst_p = board.get_dst_points(ch.player, ch.cur_point, active_dice);
    log(`can_pick_checker>dst_p=${JSON.stringify(dst_p)}`);
    return dst_p.length > 0;
}; // can_pick_checker()

/**
 * 掴んでいたチェッカーを離したとき。
 *
 * free move なら put_checker を送る。そうでなければ行き先を決めて
 * move を送る。
 *
 * @param {Board} board
 * @param {Checker} ch - 掴んでいたチェッカー
 * @param {number|undefined} drop_p - 離した場所のポイント
 * @return {boolean} - false なら何も送っていない (呼んだ側が元の位置へ戻す)
 */
export const drop_checker = (board, ch, drop_p) => {
    if ( board.free_move ) {
        put_checker(board, ch, drop_p);
        return true;
    }

    // 降順
    const active_dice = board.get_active_dice(ch.player);
    active_dice.sort((a, b) => b - a);
    log(`drop_checker>active_dice=${JSON.stringify(active_dice)}`);

    const dst = decide_dst(board, ch, drop_p, active_dice);
    if ( dst === undefined ) {
        return false;
    }
    return move(board, ch, dst.dst_p, dst.hit_ch, active_dice);
}; // drop_checker()

/**
 * free move での移動。idx は今の盤面の、そのポイントの枚数
 *
 * @param {Board} board
 * @param {Checker} ch
 * @param {number} p - point index
 */
export const put_checker = (board, ch, p) => {
    const idx = board.checkers_at(p).length;
    emit_msg("put_checker", { ch: checker_id(ch), p: p, idx: idx });
}; // put_checker()

/**
 * 行き先を決めて、ヒットするかを調べる (TODO-045)
 *
 * @param {Board} board
 * @param {Checker} ch
 * @param {number|undefined} drop_p - 離した場所のポイント
 * @param {number[]} active_dice - 降順
 * @return {{dst_p: number, hit_ch: Checker|undefined}|undefined}
 *     動かせないときは undefined
 */
export const decide_dst = (board, ch, drop_p, active_dice) => {
    let dst_p = drop_p;

    const available_p = board.get_dst_points(ch.player, ch.cur_point,
                                             active_dice);
    log(`decide_dst>available_p=${JSON.stringify(available_p)}`);

    if ( dst_p == ch.cur_point ) {
        // ワンタッチでのムーブ
        if ( available_p.length == 0 ) {
            return undefined;
        }
        dst_p = available_p[0];
    }

    if ( available_p.indexOf(dst_p) < 0 ) {
        return undefined;
    }

    let hit_ch = undefined;
    const checkers = board.checkers_at(dst_p);
    if ( checkers.length == 1 && checkers[0].player != ch.player ) {
        hit_ch = checkers[0];
        log(`decide_dst>hit_ch.id=${hit_ch.id}`);
    }

    return { dst_p: dst_p, hit_ch: hit_ch };
}; // decide_dst()

/**
 * 駒を動かして move を 1 通送り、予測した盤面を表示する (先行実行)。
 *
 * 動かしたあとの盤面を Board.predict_gameinfo() で作り、そこから
 * idx・ダイス (使った目と使えなくなった目は 11〜16)・勝ちの点数を
 * 求めて送る。ヒットのときは 2 手ぶん (相手をバーへ、自分を移動先へ)。
 *
 * **予測に失敗したら何も送らない** (gameinfo がまだ届いていないとき)。
 * 予測が外れても、サーバから届く gameinfo で表示は戻る。
 *
 * @param {Board} board
 * @param {Checker} ch
 * @param {number} dst_p
 * @param {Checker|undefined} hit_ch
 * @param {number[]} active_dice - 降順
 * @return {boolean} - 送ったか
 */
export const move = (board, ch, dst_p, hit_ch, active_dice) => {
    const player = ch.player;

    let moves = [];
    if ( hit_ch !== undefined ) {
        moves.push({ ch: hit_ch, p: bar_point(hit_ch.player) });
    }
    moves.push({ ch: ch, p: dst_p });

    // 使ったダイスの目。predict_gameinfo() より前に求める
    // (ch.cur_point は動かす前の位置)
    const used = dice_for_move(player, active_dice, ch.cur_point, dst_p);
    log(`move>used=${JSON.stringify(used)}`);

    let predicted = undefined;
    try {
        predicted = board.predict_gameinfo(moves, player, used);
    } catch (e) {
        log(`move>${e}`);
        return false;
    }

    const score = winner_is(Position.from_gameinfo(predicted), player, {
        resign: predicted.resign,
        cube_value: predicted.board.cube.value,
        cube_accepted: predicted.board.cube.accepted,
    }).score;

    emit_msg("move", {
        player: player,
        moves: moves.map((mv) => {
            const id = checker_id(mv.ch);
            return { ch: id, p: mv.p,
                     idx: predicted.board.checker[mv.ch.player][id % 100][1] };
        }),
        dice: predicted.board.dice[player],
        score: score,
    });

    // 予測を表示する。音は鳴らさない (last_op を渡さない)。
    // apply() は掴んでいるチェッカーを手元の座標に戻すので、
    // その前に moving_checker を外す
    board.moving_checker = undefined;
    board.apply(predicted, { sec: 0.2 });
    return true;
}; // move()

// -----------------------------------------------------------------
// キューブ
// -----------------------------------------------------------------

/**
 * キューブを掴んでよいか
 *
 * @param {Board} board
 * @return {boolean}
 */
export const can_hold_cube = (board) => {
    const cube = board.cube;

    if ( board.turn >= 2 || board.turn < 0 ) {
        // ゲーム開始時、終了時は、触れない
        return false;
    }
    if ( cube.player !== undefined && cube.player != board.player ) {
        // 相手側にあるキューブは、触れない
        return false;
    }
    if ( cube.accepted ) {
        if ( board.turn != board.player ) {
            // 自分の番にしかダブルを掛けられない
            return false;
        }
        if ( cube.player && cube.player != board.player ) {
            return false;
        }
    }
    for (let rb of board.roll_btn) {
        // ダイスがアクティブのときは、キューブに触れない
        if ( rb.dice_active ) {
            return false;
        }
    }
    return true;
}; // can_hold_cube()

/**
 * ダブル
 *
 * @param {Board} board
 * @param {number} player - 掛ける側
 * @param {boolean} [redouble=false] - 掛けられたキューブをさらに倍にする。
 *     リダブルでは上限を見ない (上限はサーバが抑える。TODO-051 より前と同じ)
 */
export const double = (board, player, redouble=false) => {
    if ( player === undefined ) {
        return;
    }
    if ( ! redouble && board.cube.value >= CUBE_MAX ) {
        return;
    }
    emit_msg("double", { player: parseInt(player) });
}; // double()

/**
 * テイク
 *
 * @param {Board} board
 * @param {number} player - 受ける側
 */
export const take = (board, player) => {
    emit_msg("take", { player: parseInt(player) });
}; // take()

/**
 * ダブルの取り消し
 *
 * @param {Board} board
 * @param {number} player - 掛けた側
 */
export const cancel_double = (board, player) => {
    emit_msg("cancel_double", { player: parseInt(player) });
}; // cancel_double()

// -----------------------------------------------------------------
// 投了・得点・名前
// -----------------------------------------------------------------

/**
 * 投了。相手に足す点数を求めて送る
 *
 * @param {Board} board
 */
export const resign = (board) => {
    let score;
    if ( ! board.cube.accepted ) {
        // ダブルを掛けられて降りる場合、ダブルを掛ける前の値
        score = board.cube.value / 2;
    } else {
        // ダブルを掛けられてないときに降りる場合は、
        // 「バックギャモン」(3倍)扱い
        score = board.cube.value * 3;
    }
    log(`resign>score=${score}`);
    emit_msg("resign", { player: parseInt(board.player),
                         score: parseInt(score) });
}; // resign()

/**
 * 得点の ▲ (1 足す。上限 99)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_up = (board, player) => {
    const s = board.score[player];
    // 続けて押したときに、サーバの返事の前でも足されるように、
    // 手元の値も変えておく (TODO-052 で gameinfo を読む形にする)
    s.score = Math.min(s.score + 1, SCORE_MAX);
    set_score(player, s.score);
}; // score_up()

/**
 * 得点の ▼ (0 にする)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_clear = (board, player) => {
    board.score[player].score = 0;
    set_score(player, 0);
}; // score_clear()

/**
 * @param {number} player
 * @param {number} score
 */
const set_score = (player, score) => {
    emit_msg("set_score", { player: parseInt(player),
                            score: parseInt(score) });
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
