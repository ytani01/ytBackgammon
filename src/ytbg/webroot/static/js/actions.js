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
import { Position, bar_point, copy_gameinfo } from "./rules/position.js";
import { dice_for_move, disable_unusable } from "./rules/move.js";
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
    const gi = board.gameinfo;
    if ( gi === undefined || ! gi.board.cube.accepted ) {
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
    if ( gi.turn >= 2 ) {
        dice[d1] = value1;
    } else if ( value1 != value2 ) {
        dice[d1] = value1;
        dice[d2] = value2;
    } else {
        dice = [value1, value1, value1, value1];
    }
    dice = disable_unusable(board.position(), player, dice);

    emit_msg("roll", { player: player, dice: dice });
    return true;
}; // roll()

/**
 * ダイスを押したとき。
 *
 * - free move: 押したダイスの目を 1 つ進めた盤面を先に表示し、dice を送る
 * - 先手決め (turn >= 2): 相手も振っていれば、目を比べて opening を送る
 * - それ以外: 使えるダイスが残っていなければ、手番を渡す (end_turn)
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

    if ( board.settings.free_move ) {
        const cur = gi.board.dice[player][i];
        if ( cur < 1 ) {
            return;
        }
        let val = cur + 1;
        if ( cur > 6 ) {
            val = cur % 10;
        } else if ( val > 6 ) {
            val = 1;
        }
        // 続けて押したときに、サーバの返事の前でも目が進むように、
        // 予測した盤面を先に表示する (move と同じ先行実行。TODO-052)
        const predicted = copy_gameinfo(gi);
        predicted.board.dice[player][i] = val;
        board.apply(predicted, { sec: 0 });
        emit_msg("dice", { player: player,
                           dice: predicted.board.dice[player] });
        return;
    }

    if ( gi.turn < 0 ) {
        log(`click_dice>turn=${gi.turn} .. ignored`);
        return;
    }

    if ( gi.turn >= 2 ) {
        // 先手決め。双方が振った後、目が大きい方が先手
        if ( ! board.has_dice(1 - player) ) {
            return;
        }
        const d0 = board.get_active_dice(player)[0];
        const d1 = board.get_active_dice(1 - player)[0];

        let winner = -1;   // 同じ目なら、もう一度
        if ( d0 > d1 ) {
            winner = player;
        } else if ( d0 < d1 ) {
            winner = 1 - player;
        }
        emit_msg("opening", { winner: winner });
        return;
    }

    if ( board.get_active_dice(player).length > 0 ) {
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
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    if ( board.settings.free_move ) {
        return true;
    }

    // 手番のプレーヤーのチェッカーだけ
    if ( gi.turn >= 2 || gi.turn < 0 ) {
        return false;
    }
    if ( gi.turn != ch.player ) {
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
    if ( board.settings.free_move ) {
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
    // apply() は掴んでいるチェッカーを手元の座標に戻すが、
    // drag.js が離したときに外してから呼んでいる (TODO-053)
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
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    const cube = gi.board.cube;   // side: -1 なら中央

    if ( gi.turn >= 2 || gi.turn < 0 ) {
        // ゲーム開始時、終了時は、触れない
        return false;
    }
    if ( cube.side >= 0 && cube.side != board.settings.player ) {
        // 相手側にあるキューブは、触れない
        return false;
    }
    if ( cube.accepted && gi.turn != board.settings.player ) {
        // 自分の番にしかダブルを掛けられない
        return false;
    }
    for (let p=0; p < 2; p++) {
        // ダイスが出ているときは、キューブに触れない
        if ( board.has_dice(p) ) {
            return false;
        }
    }
    return true;
}; // can_hold_cube()

/**
 * 掴んでいたキューブを離したとき。掴んだ位置と離した位置で、
 * ダブル・テイク・取り消しのどれを送るかを決める
 *
 * @param {Board} board
 * @param {number} src_y - 掴んだときのキューブの y
 * @param {number} y - 離したときのキューブの y
 */
export const drop_cube = (board, src_y, y) => {
    const cube_ui = board.cube;
    const player = board.settings.player;

    // 掴めたなら gameinfo は届いている (can_hold_cube())
    const cube = board.gameinfo.board.cube;
    const side = cube.side;   // -1 なら中央

    if ( ! cube.accepted ) {
        // ダブルが掛けられた状態
        if ( side == player ) {
            if ( src_y == cube_ui.y1[0] ) {
                if ( y >= cube_ui.y0 ) {
                    take(board, side);
                } else {
                    // redouble
                    double(board, 0, true);
                }
            }
            if ( src_y == cube_ui.y1[1] ) {
                if ( y <= cube_ui.y0 ) {
                    take(board, side);
                } else {
                    // redouble
                    double(board, 1, true);
                }
            }
            return;
        }
        // 掛けた側 (キューブの反対側) が取り消す
        cancel_double(board, 1 - side);
        return;
    }

    // cube.accepted == true
    if ( side < 0 || side == player ) {
        double(board, player);
    }
}; // drop_cube()

/**
 * ダブル
 *
 * @param {Board} board
 * @param {number} player - 掛ける側
 * @param {boolean} [redouble=false] - 掛けられたキューブをさらに倍にする。
 *     リダブルでは上限を見ない (上限はサーバが抑える。TODO-051 より前と同じ)
 */
export const double = (board, player, redouble=false) => {
    const gi = board.gameinfo;
    if ( player === undefined || gi === undefined ) {
        return;
    }
    if ( ! redouble && gi.board.cube.value >= CUBE_MAX ) {
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
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }
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
    log(`resign>score=${score}`);
    emit_msg("resign", { player: parseInt(board.settings.player),
                         score: parseInt(score) });
}; // resign()

/**
 * 得点の ▲ (1 足す。上限 99)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_up = (board, player) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return;
    }
    set_score(board, player, Math.min(gi.score[player] + 1, SCORE_MAX));
}; // score_up()

/**
 * 得点の ▼ (0 にする)
 *
 * @param {Board} board
 * @param {number} player
 */
export const score_clear = (board, player) => {
    if ( board.gameinfo === undefined ) {
        return;
    }
    set_score(board, player, 0);
}; // score_clear()

/**
 * 得点を変えた盤面を先に表示してから set_score を送る。
 * 続けて押したときに、サーバの返事の前でも足されるように
 * (move と同じ先行実行。TODO-052)
 *
 * @param {Board} board - gameinfo が届いていること
 * @param {number} player
 * @param {number} score
 */
const set_score = (board, player, score) => {
    player = parseInt(player);
    const predicted = copy_gameinfo(board.gameinfo);
    predicted.score[player] = score;
    board.apply(predicted, { sec: 0 });
    emit_msg("set_score", { player: player, score: parseInt(score) });
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
