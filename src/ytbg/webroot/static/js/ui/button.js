import { log } from "../log.js";
import { emit_msg } from "../ws.js";
import { BgImage } from "./base.js";

/**
 *
 */
export class InverseButton extends BgImage {
    constructor(id, board, x, y) {
        super(id, x, y, 0, {board: board});
    } // InverseButton.constructor()

    on_mouse_down_xy(x, y) {
        this.board.inverse(0.5);
    } // InverseButton.on_mouse_down_xy()
} // class InverseButton

/**
 *
 */
export class ResignButton extends BgImage {
    constructor(id, board, x, y) {
        super(id, x, y, 0, {board: board});
    } // ResignButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        let score;
        if ( ! this.board.cube.accepted ) {
            // ダブルを掛けられて降りる場合、ダブルを掛ける前の値
            score = this.board.cube.value / 2;
        } else {
            // ダブルを掛けれてないときに降りる場合は、
            // 「バックギャモン」(3倍)扱い
            score = this.board.cube.value * 3;
        }
        log(`ResignButton.on_mouse_down_xy>score=${score}`);
        this.board.player_clock[0].emit_stop();
        this.board.player_clock[1].emit_stop();
        this.board.emit_turn(-1, this.board.player, false);
        this.board.score[1 - this.board.player].up(score);
    } // ResignButton.on_mouse_down_xy()
} // class ResignButton

/**
 * 押すと type と data をそのままサーバへ送るボタン
 *
 * 前は type ごとにサブクラス (BackButton, FwdButton ...) があったが、
 * 違うのは引数だけなので、生成するときに渡す (TODO-028)。
 */
export class EmitButton extends BgImage {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {string} type - emit_msg() の type
     * @param {Object} data - emit_msg() の data
     * @param {number} x
     * @param {number} y
     */
    constructor(id, board, type, data, x, y) {
        super(id, x, y, 0, {board: board});

        this.type = type;
        this.data = data;
    } // EmitButton.constructor()

    on_mouse_down_xy(x, y) {
        emit_msg(this.type, this.data);
    } // EmitButton.on_mouse_down_xy()
} // class EmitButton

/**
 *
 */
export class ScoreButton extends BgImage {
    constructor(id, board, player, x, y, w, h, score_obj, offset) {
        super(id, x, y, 0, {board: board, player: player});
        this.set_wh(w, h);
        this.score_obj = score_obj;
        this.offset = offset;

        this.el.style.backgroundColor = "#FFF";
        this.image_el.style.opacity = 0;
    } // ScoreButton.constructor()

    /**
     * @param {number} w
     * @param {number} h
     */
    set_wh(w, h) {
        super.set_wh(w, h);
        this.image_el.style.width = `${this.w}px`;
        this.image_el.style.height = `${this.h}px`;
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`ScoreButton.on_mouse_down_xy()`);
        log(`ScoreButton.on_mouse_down_xy>offset=${this.offset}`);
        if ( this.offset > 0 ) {
            this.score_obj.up(1);
        } else {
            this.score_obj.clear();
        }
    } // ScoreButton.on_mouse_down_xy()
} // class ScoreButton

/**
 * Banner button
 *
 * 押したときの動作は、生成するときに on_click で渡す (TODO-028)。
 * 前は PassButton / ResignBannerButton / WinButton のサブクラスがあったが、
 * 違うのは押したときの動作だけだった。
 * RollButton はダイスを持ち、表示の出し入れも違うので、サブクラスのまま。
 */
export class BannerButton extends BgImage {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {function(BannerButton): void} [on_click] - 押したときの動作。
     *   押されたボタンを引数に呼ぶ。省くと何もしない
     */
    constructor(id, board, player, x, y, deg=0, on_click=undefined) {
        super(id, x, y, deg, {board: board, player: player});
        this.on_click = on_click;

        this.el.style.opacity = 0.9;
        this.move(this.x, this.y);

        //this.off();
    } // BannerButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
        super.move(x, y, true);
    } // BannerButton.move()

    /**
     * 
     */
    on() {
        super.on();
        this.set_z(5);
    } // BannerButton.on()

    /**
     * 
     */
    off() {
        super.off();
        this.set_z(-2);
    } // BannerButton.off()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        if ( this.on_click ) {
            this.on_click(this);
        }
    } // BannerButton.on_mouse_down_xy()
} // class BannerButton
