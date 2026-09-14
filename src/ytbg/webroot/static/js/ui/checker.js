import { BgImage } from "./base.js";

/**
 * 駒 1 枚。掴む・動かす・離すは BoardView の Drag
 */
export class Checker extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {number} player - 0 or 1
     * @param {number} num - 通し番号 (0〜14)。ID は player * 100 + num
     */
    constructor(el, player, num) {
        super(el, 0, 0, 0, {player: player});
        this.num = num;

        this.z = 0;

        this.el.style.cursor = "pointer";

        // 表示しているポイント。BoardView.render() が gameinfo から書き直す
        this.cur_point = undefined;
    } // Checker.constructor()
} // class Checker
