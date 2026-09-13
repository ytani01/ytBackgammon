import { log } from "../log.js";
import { can_pick_checker, drop_checker } from "../actions.js";
import { BgImage } from "./base.js";
import { get_pip as rule_get_pip } from "../rules/position.js";

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
        
        // 掴んでよいかの判定は actions.js (TODO-051)
        if ( ! can_pick_checker(this.board, this) ) {
            return;
        }

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

        // 行き先の判定と送信 (free move なら put_checker、それ以外は
        // move の先行実行) は actions.js (TODO-051)
        if ( drop_checker(this.board, ch, drop_p) ) {
            this.board.moving_checker = undefined;
        } else {
            this.cancel_move(ch);
        }
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
