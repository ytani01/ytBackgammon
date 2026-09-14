/**
 * チェッカーとキューブを「掴む・動かす・離す」 (TODO-053)。
 *
 * 掴んでいるもの (チェッカー 1 枚か、キューブ) と、掴んだときの位置は
 * ここだけが持つ。**行き先の判定と送信は actions.js** で、ここは
 * 離したときにそれを呼び、キャンセルなら元の位置へ戻す。
 */
import { log } from "./log.js";
import { can_pick_checker, drop_checker, can_hold_cube,
         drop_cube } from "./actions.js";

export class Drag {
    /**
     * @param {Board} board
     */
    constructor(board) {
        this.board = board;

        /** @type {Checker|undefined} 掴んでいるチェッカー */
        this.checker = undefined;
        /** @type {boolean} キューブを掴んでいるか */
        this.cube = false;

        // 掴んだときの位置。**チェッカーとキューブで別に持つ**
        // (free move ならマルチタッチで両方を同時に掴める)
        /** @type {number[]|undefined} チェッカーの [x, y]。キャンセルで戻す先 */
        this.checker_src = undefined;
        /** @type {number|undefined} キューブの y。離したときの判定に使う */
        this.cube_src_y = undefined;
    } // Drag.constructor()

    /**
     * 掴んでいるものを両方ともカーソルへ動かす (Board のマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
        this.move_checker(x, y);
        this.move_cube(x, y);
    } // Drag.move()

    /**
     * 掴んでいるチェッカーだけを動かす (Checker のマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move_checker(x, y) {
        if ( this.checker !== undefined ) {
            this.checker.move(x, y, true);
        }
    } // Drag.move_checker()

    /**
     * 掴んでいるキューブだけを動かす (Cube のマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move_cube(x, y) {
        if ( this.cube ) {
            this.board.cube.move(x, y, true);
        }
    } // Drag.move_cube()

    /**
     * チェッカーを掴む
     *
     * @param {Checker} ch - 押されたチェッカー
     * @param {number} x
     * @param {number} y
     */
    pick_checker(ch, x, y) {
        // 掴んでよいかの判定は actions.js (TODO-051)
        if ( ! can_pick_checker(this.board, ch) ) {
            return;
        }

        // クリックされたポイントの先端のチェッカーに持ち換える
        if ( ch.cur_point !== undefined ) {
            ch = this.board.top_checker(ch.cur_point);
            log(`Drag.pick_checker>ch.id=${ch.id}`);
        }
        this.checker = ch;

        this.checker_src = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    } // Drag.pick_checker()

    /**
     * チェッカーを離す
     *
     * 行き先の判定と送信 (free move なら put_checker、それ以外は
     * move の先行実行) は actions.js (TODO-051)。
     * **呼ぶ前に掴んでいる状態を外す。** move の先行実行は apply() を
     * 呼び、apply() は掴んでいるチェッカーを手元の座標へ戻すため。
     *
     * @param {number} x
     * @param {number} y
     */
    drop_checker(x, y) {
        const ch = this.checker;
        if ( ch === undefined ) {
            return;
        }
        this.checker = undefined;
        log(`Drag.drop_checker>ch.id=${ch.id}`);

        ch.move(x, y, true);

        const drop_p = this.board.chpos2point(ch);
        log(`Drag.drop_checker>drop_p=${drop_p}`);

        if ( ! drop_checker(this.board, ch, drop_p) ) {
            // 元の位置に戻して、移動をキャンセルする
            ch.move(...this.checker_src, true);
        }
    } // Drag.drop_checker()

    /**
     * キューブを掴む
     *
     * @param {number} x
     * @param {number} y
     */
    hold_cube(x, y) {
        // 触れてよいかの判定は actions.js (TODO-051)
        if ( ! can_hold_cube(this.board) ) {
            return;
        }

        const cube = this.board.cube;
        this.cube = true;
        this.cube_src_y = cube.y;
        cube.move(x, y, true);
    } // Drag.hold_cube()

    /**
     * キューブを離す。ダブル・テイク・取り消しのどれを送るかは
     * actions.js が、掴んだ位置と離した位置で決める
     *
     * @param {number} x
     * @param {number} y
     */
    drop_cube(x, y) {
        if ( ! this.cube ) {
            return;
        }
        this.cube = false;

        // 離した位置は、最後に動かしたキューブの位置 (TODO-053 より前と同じ)
        drop_cube(this.board, this.cube_src_y, this.board.cube.y);
    } // Drag.drop_cube()
} // class Drag
