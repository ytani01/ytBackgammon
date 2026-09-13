import { log } from "../log.js";
import { can_hold_cube, cancel_double, double, take } from "../actions.js";
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
    constructor(id, board) {
        super(id, 0, 0, 0, {board: board});

        // 値・向き・テイク済みかは持たない。表示は apply() が
        // gameinfo から毎回作り、判定は gameinfo を読む (TODO-052)

        this.move_sec = 0.3;
        this.moving = false;
        
        this.x0 = (this.board.bx[0] + this.board.bx[1]) / 2;
        this.x1 = [(this.board.bx[4] + this.board.bx[5]) / 2,
                   (this.board.bx[2] + this.board.bx[3]) / 2];
        this.y0 = this.board.h / 2;
        this.y2 = [this.board.by[9] - this.h / 2,
                   this.board.by[0] + this.h / 2];
        this.y1 = [(this.y2[0] + this.board.h / 2) / 2,
                   (this.y2[1] + this.board.h / 2) / 2];

        [this.src_x, this.src_y] = [undefined, undefined];
        
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
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`Cube.on_mouse_down_xy():this.board.plyaer=${this.board.player}`);
        // 触れてよいかの判定は actions.js (TODO-051)
        if ( ! can_hold_cube(this.board) ) {
            return false;
        }

        this.moving = true;
        [this.src_x, this.src_y] = [this.x, this.y];
        this.move(x, y, true);
        return false;
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        if ( this.moving ) {
            this.move(x, y, true);
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        log(`Cube.on_mouse_up_xy>this.board.player=${this.board.player}`);

        if ( this.moving ) {
            this.moving = false;
        } else {
            return false;
        }

        // 掴めたなら gameinfo は届いている (can_hold_cube())
        const cube = this.board.gameinfo.board.cube;
        const side = cube.side;   // -1 なら中央

        if ( ! cube.accepted ) {
            // ダブルが掛けられた状態
            if ( side == this.board.player ) {
                if ( this.src_y == this.y1[0] ) {
                    if ( this.y >= this.y0 ) {
                        take(this.board, side);
                    } else {
                        // redouble
                        double(this.board, 0, true);
                    }
                }
                if ( this.src_y == this.y1[1] ) {
                    if ( this.y <= this.y0 ) {
                        take(this.board, side);
                    } else {
                        // redouble
                        double(this.board, 1, true);
                    }
                }
                
                return false;
            }
            // 掛けた側 (キューブの反対側) が取り消す
            cancel_double(this.board, 1 - side);
            return false;
        }

        // cube.accepted == true
        if ( side < 0 || side == this.board.player ) {
            double(this.board, this.board.player);
        }
        return false;
    } // Cube.on_mouse_down_xy()
} // class Cube
