import { log } from "../log.js";
import { emit_msg } from "../ws.js";
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

        this.player = undefined;
        this.value = 1;
        this.accepted = false;

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

    emit(val, player=undefined, accepted) {
        if ( player < 0 ) {
            player = undefined;
        }

        let side = player;
        if ( side === undefined ) {
            side = -1;
        }
        emit_msg("cube", { side: side, value: val, accepted: accepted }, true);
    } // Cube.emit()

    /**
     * @param {number} val
     * @param {number} player
     * @param {boolean} accepted
     */
    set(val, player=undefined, accepted=false) {
        /*
        log("Cube.set("
                    + `val=${val},`
                    + `player=${player},`
                    + `accepted=${accepted}`
                    + ")");
        */
        
        this.value = val;
        this.player = player;
        this.accepted = accepted;

        if ( player < 0 ) {
            this.player = undefined;
        }

        let file_val = val;
        if ( val > 64 ) {
            file_val = 1;
        }
        let filename = this.file_prefix;
        filename += ("0" + file_val).slice(-2);
        filename += this.image_suffix;

        this.el.children[0].src = filename;

        if ( this.player === undefined ) {
            this.rotate(0, true);
            this.move(this.x0, this.y0, true, this.move_sec);
        } else if ( accepted ) {
            this.player = player;
            if ( this.player == 0 ) {
                this.rotate(90, true);
            } else {
                this.rotate(-90, true);
            }
            this.move(this.x0, this.y2[this.player], true, this.move_sec);
        } else {
            this.player = player;
            this.set_z(100);
            if ( this.player == 0 ) {
                this.rotate(90, true);
            } else {
                this.rotate(-90, true);
            }
            this.move(this.x1[this.player], this.y1[this.player],
                      true, this.move_sec);
        }
    } // Cube.set()

    /**
     * 
     */
    double(player=undefined) {
        log(`Cube.double(player=${player})`);

        if ( player === undefined ) {
            return;
        }

        this.player = 1 - player;
        log("Cube.double> this.player=" + this.player);

        let val = this.value * 2;
        if ( val > 64 ) {
            val = 64;
        }

        // ダブルは手番を渡すのと同じ扱いにする。掛けた側のクロックを
        // 止めて、相手のクロックを動かす (テイクかパスかを考える時間は
        // 相手の持ち時間から使う)。stop() では自分の画面しか止まらず、
        // サーバへ知らせないので、返ってきた gameinfo で動き出す
        // (TODO-015)
        this.board.player_clock[player].change_turn();
        this.emit(val, this.player, false);
    } // Cube.double()

    /**
     *
     */
    accept_double() {
        log("Cube.accept_double()");

        this.board.player_clock[1-this.board.turn].change_turn();
        this.emit(this.value, this.player, true);
    } // Cube.accept_double()

    /**
     *
     */
    cancel_double() {
        log("Cube.cancel_double()");
        
        let val = this.value / 2;
        let player = 1 - this.player;
        if ( val == 1 ) {
            player = undefined;
        }
        this.board.player_clock[this.player].change_turn();
        this.emit(val, player, true);
    } // Cube.cancel_double()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`Cube.on_mouse_down_xy():this.plyaer=${this.player}`);
        log(`Cube.on_mouse_down_xy():this.board.plyaer=${this.board.player}`);
        log(`Cube.on_mouse_down_xy():this.board.turn=${this.board.turn}`);
        if ( this.board.turn >= 2 || this.board.turn < 0 ) {
            // ゲーム開始時、終了時は、触れない
            return false;
        }

        if ( this.player !== undefined && this.player != this.board.player ) {
            // 相手側にあるキューブは、触れない
            return false;
        }
        
        if ( this.accepted ) {
            if ( this.board.turn != this.board.player ) {
                // 自分の番にしかダブルを掛けられない
                return false;
            }
            if ( this.player && this.player != this.board.player ) {
                // 相手側にあるキューブは、触れない
                return false;
            }
        }

        for (let rb of this.board.roll_btn) {
            // ダイスがアクティブのときは、キューブに触れない
            if ( rb.dice_active ) {
                return false;
            }
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
        log(`Cube.on_mouse_down_xy>this.player=${this.player},`
                    + `this.board.player=${this.board.player}`);

        if ( this.moving ) {
            this.moving = false;
        } else {
            return false;
        }

        if ( ! this.accepted ) {
            // ダブルが掛けられた状態
            if ( this.player == this.board.player ) {
                if ( this.src_y == this.y1[0] ) {
                    if ( this.y >= this.y0 ) {
                        this.accept_double();
                    } else {
                        // redouble
                        this.double(0);
                    }
                }
                if ( this.src_y == this.y1[1] ) {
                    if ( this.y <= this.y0 ) {
                        this.accept_double();
                    } else {
                        // redouble
                        this.double(1);
                    }
                }
                
                return false;
            }
            this.cancel_double();
            return false;
        }

        // this.accepted == true
        if (this.player === undefined || this.player == this.board.player) {
            if ( this.value < 64 ) {
                this.double(this.board.player);
            }
        }
        return false;
    } // Cube.on_mouse_down_xy()
} // class Cube
