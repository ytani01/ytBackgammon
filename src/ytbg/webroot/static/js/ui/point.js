import { log } from "../log.js";
import { BgBase } from "./base.js";

/**
 * 
 */
export class BoardPoint extends BgBase {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} idx - point index number
     * @param {number} direction - -1: 上から下, 1: 下から上
     * @param {number} max_n
     */
    constructor(id, board, x, y, w, h, idx, direction, max_n) {
        super(id, x, y, 0, {w: w, h: h, board: board});
        this.idx = idx;
        this.direction = direction; // up: +1, down: -1
        this.max_n = max_n;

        this.cx = this.x + this.w / 2;

        if ( this.direction > 0 ) {
            this.y0 = this.y;
        } else {
            this.y0 = this.y  + this.h;
        }
    } // BoardPoint.constructor()

    /**
     * ch を、このポイントの n 枚目の位置へ動かす。
     *
     * **持っているのは座標の計算だけ** (TODO-044)。積む順は呼ぶ側が
     * 決めて n で渡し、ch.cur_point も呼ぶ側が設定する。
     *
     * @param {Checker} ch
     * @param {number} n - 積む位置 (0 から)
     * @param {number} sec
     * @return {number} - position index
     */
    add(ch, n, sec=0) {
        // log(`BoardPoint.add(ch.id=${ch.id},n=${n},sec=${sec})`);
        const n2 = n % this.max_n;
        const n3 = Math.floor(n / this.max_n);
        const x = this.cx - ch.w * 0.05 * n3;
        const y = parseInt(Math.round(this.y0
                                      + ch.h * (0.5 + n2 * 0.75 + 0.1 * n3)
                                      * this.direction));
        // log(`BoardPoint.add()> n=${n},y=${y}`);
        ch.move(x, y, true, sec);
        ch.set_z(n);

        return n;
    } // BoardPoint.add()
} // class BoardPoint
