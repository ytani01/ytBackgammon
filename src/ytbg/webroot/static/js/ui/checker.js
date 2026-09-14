import { BgImage } from "./base.js";
import { get_pip as rule_get_pip } from "../rules/position.js";

/**
 *
 */
export class Checker extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {Board} board - board object
     * @param {number} player - 0 or 1
     * @param {number} num - 通し番号 (0〜14)。ID は player * 100 + num
     */
    constructor(el, board, player, num) {
        super(el, 0, 0, 0, {board: board, player: player});
        this.num = num;

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
     * 掴む・動かす・離すは drag.js (TODO-053)
     *
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        this.board.drag.pick_checker(this, x, y);
    } // Checker.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        this.board.drag.drop_checker(x, y);
    } // Checker.on_mouse_up_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        this.board.drag.move_checker(x, y);
    } // Checker.on_mouse_move_xy()
} // class Checker
