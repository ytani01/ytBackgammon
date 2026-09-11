import { log } from "../log.js";
import { emit_msg } from "../ws.js";
import { BgImage } from "./base.js";
import { bar_point,
         get_pip as rule_get_pip } from "../rules/position.js";

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
     * @return {number} z座標
     */
    calc_z() {
        let z = 0;

        for (let p=0; p < 2; p++) {
            for (let i=0; i < 15; i++) {
                let ch = this.board.checker[p][i];

                if (ch !== this) {
                    let d = this.distance(ch);
                    if ( d < this.w ) {
                        let z1 = ch.z + 1;
                        z = Math.max(z, z1);
                        // log(`Checker.calc_z> d=${d}, z=${z}`);
                    }
                }
            } // for (i)
        } // for (p)

        this.set_z(z);
    } // Checker.calc_z()

    /**
     * calcurate distance
     * @param {Checker} ch - distination checker object
     * @return {number} - distance
     */
    distance(ch) {
        let [dx, dy] = [ch.x - this.x, ch.y - this.y];
        return Math.sqrt(dx * dx + dy * dy);
    } // Checker.distance()
    
    /**
     * @return {number} - pip count
     */
    get_pip() {
        return rule_get_pip(this.player, this.cur_point);
    } // Checker.get_pip()

    /**
     * @return {boolean}
     */
    is_last_man() {
        const pip = this.get_pip();
        for (let i=0; i < 15; i++) {
            const pip2 = this.board.checker[this.player][i].get_pip();
            if ( pip2 > pip ) {
                return false;
            }
        } // for(i)
        return true;
    } // Checker.is_last_man()

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
     * @param {number} player
     * @param {number[]} active_dice
     * @param {number} from_p
     * @param {number} to_p
     * @return {number} - 使用するダイスの目
     *                    0: そこには移動できない
     */
    dice_check(active_dice, from_p, to_p) {
        log(`Checker.dice_check(`
                    + `active_dice=${JSON.stringify(active_dice)},`
                    + `from_p=${from_p}, to_p=${to_p}`);

        if ( from_p >= 26 ) {
            // バーから移動の場合の調整
            if ( this.player == 0 ) {
                from_p = 25;
            } else {
                from_p = 0;
            }
        }

        if ( this.player == 1 ) {
            from_p = 25 - from_p;
            to_p = 25 - to_p;
        }
        // log(`Checker.dice_check>from_p=${from_p} ==> to_p=${to_p}`);
        
        let diff_p = from_p - to_p;
        log(`Checker.dice_check>diff_p=${diff_p}`);

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

        log(
            `Checker.dice_check>dice_vals=${JSON.stringify(dice_vals)}`);
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
     * 移動可能なポイントの取得
     *
     * @param {Checker} ch
     * @param {number[]} available_dice
     * @return {number[]} points
     */
    get_available_points(ch, available_dice) {
        log(``);
        // T.B.D.
        // see get_dst_points()

        return [];
    } // Checker.get_available_points()

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
            if ( this.board.point[bar_p].checkers.length > 0 ) {
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
            ch = this.board.point[ch.cur_point].checkers.slice(-1)[0];
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

        let dice_value = [];

        let dst_p = ch.board.chpos2point(ch);
        log(`Checker.on_mouse_up_xy>dst_p=${dst_p}`);

        if ( this.board.free_move ) {
            ch.board.emit_put_checker(ch, dst_p, true);
            this.board.moving_checker = undefined;
            return;
        }

        let active_dice = this.board.get_active_dice(ch.player);

        // 降順にsort
        const koujun = (a, b) => {
            return b - a;
        };
        active_dice.sort(koujun);
        log("Checker.on_mouse_up_xy>"
                    + `active_dice=${JSON.stringify(active_dice)}`);

        let available_p = this.board.get_dst_points(ch.player,
                                                    ch.cur_point,
                                                    active_dice);
        log("Checker.on_mouse_up_xy>"
                    + `available_p=${JSON.stringify(available_p)}`);

        if ( dst_p == ch.cur_point ) {
            //
            // ワンタッチでのムーブ
            //
            if ( available_p.length == 0 ) {
                this.cancel_move(ch);
                return;
            }

            dst_p = available_p[0];
        }
        
        log("Checker.on_mouse_up_xy>"
                    + `dst_p=${JSON.stringify(dst_p)}`);

        if ( available_p.indexOf(dst_p) < 0 ) {
            this.cancel_move(ch);
            return;
        }

        /**
         * 移動先ポイントの状態に応じた判定
         */
        let hit_ch = undefined;
        let checkers = ch.board.point[dst_p].checkers;

        if ( checkers.length == 1 && checkers[0].player != ch.player ) {
            hit_ch = checkers[0];
            log(`Checker.on_mouse_up_xy>hit_ch.id=${hit_ch.id}`);
        }
        
        /**
         * 移動OK. 以降、移動後の処理
         */
        if ( hit_ch !== undefined ) {
            // hit
            log(`Checker.on_mouse_up_xy>hit_ch.id=${hit_ch.id}`);

            let bar_p = 26;
            if ( hit_ch.player == 1 ) {
                bar_p = 27;
            }

            ch.board.emit_put_checker(hit_ch, bar_p, false);
            /**
             * 上でemitしたメッセージ受信後に、put_checker()が 実行されるが、
             * この後のダイスチェックなどのために、先行して、
             * ここで put_checker() を実行する。
             * このため、ここでは効果音は鳴らさない。
             */
            ch.board.put_checker(hit_ch, bar_p, 0.2, false);
        }

        // move_checker
        ch.board.emit_put_checker(ch, dst_p, false);
        
        // 使ったダイスの組み合わせを取得
        dice_value = this.dice_check(active_dice, ch.cur_point, dst_p);
        log(`Checker.on_mouse_up_xy>`
                    + `dice_value=${JSON.stringify(dice_value)}`);

        const roll_btn = this.board.roll_btn[ch.player];
        
        // 使ったダイスを使用済みする
        for (let d1 of dice_value) {
            for (let d of roll_btn.dice ) {
                if ( d1 == d.value ) {
                    d.disable();
                    break;
                }
            }
        } // for(d)

        /**
         * 上でemitしたメッセージ受信後に、put_checker()が 実行されるが、
         * この後のダイスチェックなどのために、先行して、
         * ここで put_checker() を実行する。
         * このため、ここでは効果音は鳴らさない。
         */
        ch.board.put_checker(ch, dst_p, 0.2, false);

        roll_btn.check_disable();

        dice_value = roll_btn.get();
        log(`Checker.on_mouse_up_xy>`
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

        ch.board.moving_checker = undefined;
    } // Checker.on_mouse_up_xy()

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
