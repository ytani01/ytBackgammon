import { log } from "../log.js";
import { history_op, resign, score_clear, score_up } from "../actions.js";
import { BgImage } from "./base.js";

/**
 *
 */
export class InverseButton extends BgImage {
    constructor(el, board, x, y) {
        super(el, x, y, 0, {board: board});
    } // InverseButton.constructor()

    on_mouse_down_xy(x, y) {
        this.board.inverse(0.5);
    } // InverseButton.on_mouse_down_xy()
} // class InverseButton

/**
 *
 */
export class ResignButton extends BgImage {
    constructor(el, board, x, y) {
        super(el, x, y, 0, {board: board});
    } // ResignButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        // 点数の計算と送信は actions.js (TODO-051)
        resign(this.board);
    } // ResignButton.on_mouse_down_xy()
} // class ResignButton

/**
 * 押すと履歴の操作 (type と data) をサーバへ送るボタン
 *
 * 前は type ごとにサブクラス (BackButton, FwdButton ...) があったが、
 * 違うのは引数だけなので、生成するときに渡す (TODO-028)。
 * 送るのは actions.js の history_op() (TODO-051)。
 */
export class EmitButton extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {Board} board
     * @param {string} type - 履歴の操作の type
     * @param {Object} data - その data
     * @param {number} x
     * @param {number} y
     */
    constructor(el, board, type, data, x, y) {
        super(el, x, y, 0, {board: board});

        this.type = type;
        this.data = data;
    } // EmitButton.constructor()

    on_mouse_down_xy(x, y) {
        history_op(this.type, this.data);
    } // EmitButton.on_mouse_down_xy()
} // class EmitButton

/**
 *
 */
export class ScoreButton extends BgImage {
    constructor(el, board, x, y, w, h, score_obj, offset) {
        super(el, x, y, 0, {board: board});
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
        // 送るのは actions.js (TODO-051)
        if ( this.offset > 0 ) {
            score_up(this.board, this.score_obj.player);
        } else {
            score_clear(this.board, this.score_obj.player);
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
     * @param {HTMLElement} el
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {function(BannerButton): void} [on_click] - 押したときの動作。
     *   押されたボタンを引数に呼ぶ。省くと何もしない
     */
    constructor(el, board, player, x, y, deg=0, on_click=undefined) {
        super(el, x, y, deg, {board: board, player: player});
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
