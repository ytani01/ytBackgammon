import { BgImage } from "./base.js";

/**
 *                      bx[1]                                    bx[5]
 *                    x0|bx[2]             bx[3]                 |bx[6]
 *                    | ||                 |   bx[4]             ||   bx[7]
 *                    | vv                 |   |                 ||   |
 *            y ->+---|-------------------------------------------------
 *                |   v   13 14 15 16 17 18     19 20 21 22 23 24       |
 *        by[0] --->+-+-----------------------------------------------  |
 *                | |   ||p0          p1   |   |p1             p0||   | |
 * y2[1] ------------>+ ||p0          p1   |   |p1             p0||   | |
 *                | |   ||p0          p1   |27 |p1               ||25 | |
 * y1[1] ------------>+ ||p0               |   |p1               ||   | |
 *                | |   ||p0               |   |p1               ||   | |
 *                | |   ||                 |   |                 ||   | |
 * y0 --------------->+ ||                 |---|                 ||---| |
 *                | |   ||                 |   |                 ||   | |
 *                | |   ||p1               |   |p0               ||   | |
 * y1[0] ------------>+ ||p1               |   |p0               ||   | |
 *                | |   ||p1          p0   |26 |p0               || 0 | |
 * y2[0] ------------>+ ||p1          p0   |   |p0             p1||   | |
 *                | |   ||p1          p0   |   |p0             p1||   | |
 *        by[9] --->+-------------------------------------------------  |
 *                |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *                 ----------------------------------------------------- 
 */
export class Cube extends BgImage {
    constructor(el, board) {
        super(el, 0, 0, 0, {board: board});

        // 値・向き・テイク済みかは持たない。表示は apply() が
        // gameinfo から毎回作り、判定は gameinfo を読む (TODO-052)

        this.move_sec = 0.3;
        
        this.x0 = (this.board.bx[0] + this.board.bx[1]) / 2;
        this.x1 = [(this.board.bx[4] + this.board.bx[5]) / 2,
                   (this.board.bx[2] + this.board.bx[3]) / 2];
        this.y0 = this.board.h / 2;
        this.y2 = [this.board.by[9] - this.h / 2,
                   this.board.by[0] + this.h / 2];
        this.y1 = [(this.y2[0] + this.board.h / 2) / 2,
                   (this.y2[1] + this.board.h / 2) / 2];

        this.file_prefix = this.image_dir + "cube";

        this.el.style.cursor = "pointer";

        this.move(this.x0, this.board.h / 2, true);
    } // Cube.constructor()

    /**
     * 表示だけを変える
     *
     * @param {number} val
     * @param {number} side - どちらの側か。-1 なら中央
     * @param {boolean} accepted
     */
    set(val, side=-1, accepted=false) {

        let file_val = val;
        if ( val > 64 ) {
            file_val = 1;
        }
        let filename = this.file_prefix;
        filename += ("0" + file_val).slice(-2);
        filename += this.image_suffix;

        this.el.children[0].src = filename;

        if ( side === undefined || side < 0 ) {
            this.rotate(0, true);
            this.move(this.x0, this.y0, true, this.move_sec);
        } else if ( accepted ) {
            if ( side == 0 ) {
                this.rotate(90, true);
            } else {
                this.rotate(-90, true);
            }
            this.move(this.x0, this.y2[side], true, this.move_sec);
        } else {
            this.set_z(100);
            if ( side == 0 ) {
                this.rotate(90, true);
            } else {
                this.rotate(-90, true);
            }
            this.move(this.x1[side], this.y1[side],
                      true, this.move_sec);
        }
    } // Cube.set()

    /**
     * 掴む・動かす・離すは drag.js (TODO-053)
     *
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        this.board.drag.hold_cube(x, y);
    } // Cube.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        this.board.drag.move_cube(x, y);
    } // Cube.on_mouse_move_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        this.board.drag.drop_cube(x, y);
    } // Cube.on_mouse_up_xy()
} // class Cube
