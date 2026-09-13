import { log } from "../log.js";
import { emit_msg } from "../ws.js";
import { BgImage } from "./base.js";
import { bar_point,
         get_pip as rule_get_pip } from "../rules/position.js";
import { dice_for_move } from "../rules/move.js";

/**
 *
 */
export class Checker extends BgImage {
    /**
     * @param {string} id - div tag id
     * @param {number} player - 0 or 1
     * @param {Board} board - board object
     */
    constructor(id, board, player) {
        super(id, 0, 0, 0, {board: board, player: player});

        [this.src_x, this.src_y] = [this.x, this.y];
        this.z = 0;
        
        this.el.style.cursor = "pointer";

        this.cur_point = undefined;
    } // Checker.constructor()

    /**
     * @return {number} - pip count
     */
    get_pip() {
        return rule_get_pip(this.player, this.cur_point);
    } // Checker.get_pip()

    /**
     * @return {boolean}
     */
    is_inner() {
        if ( this.player == 0 ) {
            return (this.cur_point <= 6);
        } else {
            return (this.cur_point >= 19 && this.cur_point <= 25);
        }
    } // Checker.is_inner()

    /**
     * 移動に使用するダイスの目の組み合わせを取得する
     *
     * 判定は rules/move.js (TODO-043)
     *
     * @param {number[]} active_dice
     * @param {number} from_p
     * @param {number} to_p
     * @return {number[]} - 使用するダイスの目。
     *                      空なら、そこには移動できない
     */
    dice_check(active_dice, from_p, to_p) {
        const dice_vals = dice_for_move(this.player, active_dice,
                                        from_p, to_p);
        log(`Checker.dice_check(`
                    + `active_dice=${JSON.stringify(active_dice)},`
                    + `from_p=${from_p}, to_p=${to_p}`
                    + `)>dice_vals=${JSON.stringify(dice_vals)}`);
        return dice_vals;
    } // Checker.dice_check()

    /**
     * 元の位置に戻して、移動をキャンセルする
     *
     * @param {Checker} ch
     */
    cancel_move(ch) {
        log(`Checker.cancel_move(ch.id=${ch.id})`);
        ch.move(ch.src_x, ch.src_y, true);
        ch.board.moving_checker = undefined;
    } // Checker.cancel_move()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log("Checker.on_mouse_down_xy>"
                    + `this.id=${this.id},(x,y)=${x},${y})`);
        
        if ( ! this.board.free_move ) {
            // check turn
            if ( this.board.turn >= 2 || this.board.turn < 0 ) {
                return;
            }

            if ( this.board.turn != this.player ) {
                return;
            }

            // check active dices
            const active_dice = this.board.get_active_dice(this.player);
            log(`Checker.on_mouse_down_xy>active_dice=${active_dice}`);
            if ( active_dice.length == 0 ) {
                return;
            }

            // ヒットされている場合は、バーのポイントしか動かせない
            const bar_p = bar_point(this.player);
            if ( this.board.checkers_at(bar_p).length > 0 ) {
                if ( this.cur_point != bar_p ) {
                    return;
                }
            }

            // 移動可能か確認
            // const dice_vals = this.board.get_active_dice(this.player);
            const dst_p = this.board.get_dst_points(this.player,
                                                    this.cur_point,
                                                    active_dice);
            log(`dst_p=${JSON.stringify(dst_p)}`);
            if ( dst_p.length == 0 ) {
                return;
            }
        } // if (!free_move)

        // クリックされたポイントの先端のチェッカーに持ち換える
        let ch = this;
        if ( ch.cur_point !== undefined ) {
            ch = this.board.top_checker(ch.cur_point);
            log(`Checker.on_mouse_down_xy>ch.id=${ch.id}`);
        }
        this.board.moving_checker = ch;

        [ch.src_x, ch.src_y] = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    } // Checker.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        log("Checker.on_mouse_up_xy>"
                    + `this.id=${this.id},(x,y)=(${x},${y})`);
        const ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }

        log(`Checker.on_mouse_up_xy>ch.id=${ch.id}`);

        ch.move(x, y, true);

        const drop_p = ch.board.chpos2point(ch);
        log(`Checker.on_mouse_up_xy>drop_p=${drop_p}`);

        if ( this.board.free_move ) {
            ch.board.emit_put_checker(ch, drop_p, true);
            this.board.moving_checker = undefined;
            return;
        }

        // 降順にsort
        let active_dice = this.board.get_active_dice(ch.player);
        active_dice.sort((a, b) => b - a);
        log("Checker.on_mouse_up_xy>"
                    + `active_dice=${JSON.stringify(active_dice)}`);

        const dst = this.decide_dst(ch, drop_p, active_dice);
        if ( dst === undefined ) {
            // 動かせない。decide_dst() が元の位置へ戻している
            return;
        }

        this.apply_move(ch, dst.dst_p, dst.hit_ch, active_dice);
        this.after_move(ch);
    } // Checker.on_mouse_up_xy()

    /**
     * 行き先を決めて、ヒットするかを調べる (TODO-045)
     *
     * 動かせないときは cancel_move() で元の位置へ戻し、undefined を返す。
     *
     * @param {Checker} ch - 動かすチェッカー (board.moving_checker)
     * @param {number} drop_p - 離した場所のポイント
     * @param {number[]} active_dice - 降順
     * @return {{dst_p: number, hit_ch: Checker|undefined}|undefined}
     */
    decide_dst(ch, drop_p, active_dice) {
        let dst_p = drop_p;

        const available_p = this.board.get_dst_points(ch.player,
                                                      ch.cur_point,
                                                      active_dice);
        log("Checker.decide_dst>"
                    + `available_p=${JSON.stringify(available_p)}`);

        if ( dst_p == ch.cur_point ) {
            //
            // ワンタッチでのムーブ
            //
            if ( available_p.length == 0 ) {
                this.cancel_move(ch);
                return undefined;
            }

            dst_p = available_p[0];
        }

        log(`Checker.decide_dst>dst_p=${JSON.stringify(dst_p)}`);

        if ( available_p.indexOf(dst_p) < 0 ) {
            this.cancel_move(ch);
            return undefined;
        }

        /**
         * 移動先ポイントの状態に応じた判定
         */
        let hit_ch = undefined;
        const checkers = ch.board.checkers_at(dst_p);

        if ( checkers.length == 1 && checkers[0].player != ch.player ) {
            hit_ch = checkers[0];
            log(`Checker.decide_dst>hit_ch.id=${hit_ch.id}`);
        }

        return { dst_p: dst_p, hit_ch: hit_ch };
    } // Checker.decide_dst()

    /**
     * 移動を反映する (TODO-045)
     *
     * 先行実行 (予測) → サーバへ送信 → 使ったダイスを使用済みにする。
     *
     * **順番を変えないこと** (TODO-030)。
     *
     * - dice_check() は apply() より前。apply() が ch.cur_point を
     *   移動先に変えてしまう
     * - 使ったダイスの disable() は apply() のあと。apply() は dice を
     *   gameinfo の値に戻すので、先に disable() すると使用済みが消える
     *
     * @param {Checker} ch
     * @param {number} dst_p
     * @param {Checker|undefined} hit_ch
     * @param {number[]} active_dice - 降順
     */
    apply_move(ch, dst_p, hit_ch, active_dice) {
        //
        // 先行実行 (TODO-030)
        //
        // サーバの応答を待たずに表示を変える (共有ボードなので、
        // ドラッグを離した瞬間に反応が無いと操作感が悪い)。
        // 表示を変えるのは Board.apply() だけなので、ここでは
        // 「動かしたあとの gameinfo」を予測して渡す。
        // ヒットのときは 2 手ぶん (相手をバーへ、自分を移動先へ)。
        //
        // 予測が外れても、サーバから届く gameinfo で表示は戻る。
        let moves = [];
        if ( hit_ch !== undefined ) {
            moves.push({ ch: hit_ch, p: bar_point(hit_ch.player) });
        }
        moves.push({ ch: ch, p: dst_p });

        let predicted = undefined;
        try {
            predicted = ch.board.predict_gameinfo(moves);
        } catch (e) {
            // 予測できないときは先行実行をあきらめる。
            // 表示はサーバから届く gameinfo で決まる
            log(`Checker.apply_move>${e}`);
        }

        // サーバへ送る
        //
        // idx は予測した gameinfo から取る (先に表示を変えてから
        // 数えていた、TODO-030 より前と同じ値になる)
        for (let mv of moves) {
            const ch_i = parseInt(mv.ch.id.slice(1)) % 100;
            let idx = undefined;
            if ( predicted !== undefined ) {
                idx = predicted.board.checker[mv.ch.player][ch_i][1];
            }
            ch.board.emit_put_checker(mv.ch, mv.p, false, idx);
        } // for (mv)

        // 使ったダイスの組み合わせを取得
        //
        // **apply() より前に求める。** apply() は ch.cur_point を
        // 移動先に変える
        const dice_value = this.dice_check(active_dice, ch.cur_point, dst_p);
        log(`Checker.apply_move>`
                    + `dice_value=${JSON.stringify(dice_value)}`);

        const roll_btn = this.board.roll_btn[ch.player];

        // 予測した gameinfo を表示に反映する
        //
        // 音は鳴らさない (last_op を渡さない)。サーバから gameinfo が
        // 届いたときに鳴る。
        // apply() は掴んでいるチェッカーを手元の座標に戻すので、
        // その前に moving_checker を外す
        this.board.moving_checker = undefined;
        if ( predicted !== undefined ) {
            ch.board.apply(predicted, {sec: 0.2, predict: true});
        }

        // 使ったダイスを使用済みする
        //
        // **apply() のあとで行う。** apply() は dice を gameinfo の値に
        // 戻すので、先に disable() すると使用済みが消える (TODO-030)
        for (let d1 of dice_value) {
            for (let d of roll_btn.dice ) {
                if ( d1 == d.value ) {
                    d.disable();
                    break;
                }
            }
        } // for(d)

        roll_btn.check_disable();
    } // Checker.apply_move()

    /**
     * 動かしたあとの勝敗と得点 (TODO-045)
     *
     * 勝っていれば turn を -1 にして得点を足し、そうでなければ
     * ダイスの状態を履歴に積む。
     *
     * @param {Checker} ch
     */
    after_move(ch) {
        const dice_value = this.board.roll_btn[ch.player].get();
        log(`Checker.after_move>`
                    + `dice_value=${JSON.stringify(dice_value)}`);

        const score = this.board.winner_is(ch.player);
        if ( score > 0 ) {
            emit_msg("dice", { player: this.player,
                               dice: dice_value,
                               roll: false }, false);
            this.board.emit_turn(-1, -1, false);
            this.board.score[ch.player].up(score);
        } else {
            emit_msg("dice", { player: this.player,
                               dice: dice_value,
                               roll: false }, true);
        }
    } // Checker.after_move()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        let ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }
        ch.move(x, y, true);
    } // Checker.on_mouse_move_xy()
} // class Checker
