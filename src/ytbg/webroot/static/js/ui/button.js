import { BgImage } from "./base.js";

/**
 * 得点の ▲ / ▼ のボタン。押したときの処理は BoardView がつなぐ
 */
export class ScoreButton extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    constructor(el, x, y, w, h) {
        super(el, x, y, 0);
        this.set_wh(w, h);

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
} // class ScoreButton

/**
 * Banner button
 *
 * 押したときの動作は、生成するときに on_click で渡す (TODO-028)。
 * 押されたら BoardView が on_click を呼ぶ (投了・パス・勝ちのバナー)。
 */
export class BannerButton extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {function(BannerButton): void} [on_click] - 押したときの動作。
     *   押されたボタンを引数に呼ぶ。省くと何もしない
     */
    constructor(el, player, x, y, deg=0, on_click=undefined) {
        super(el, x, y, deg, {player: player});
        this.on_click = on_click;

        this.el.style.opacity = 0.9;
        this.move(this.x, this.y);
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
     * 押されたとき (BoardView が呼ぶ)
     */
    click() {
        if ( this.on_click ) {
            this.on_click(this);
        }
    } // BannerButton.click()
} // class BannerButton

/**
 * Roll ボタン (ダイスのカップ)。
 *
 * 隠すときは盤の隅へ動かす (他のバナーのように hidden にしない)。
 * ダイスは持たない (BoardView が並べて持つ)。
 */
export class RollButton extends BannerButton {
    /**
     * @param {HTMLElement} el
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} board_w - 盤面の幅 (隠す位置を決める)
     * @param {number} board_h - 盤面の高さ
     */
    constructor(el, player, x, y, board_w, board_h) {
        super(el, player, x, y, 0);

        [this.x1, this.y1] = [this.x, this.y];

        if ( this.player == 0 ) {
            this.x0 = board_w - this.w;
            this.y0 = board_h - this.h;
        } else {
            this.x0 = this.w;
            this.y0 = this.h;
        }

        this.off();
    } // RollButton.constructor()

    /**
     *
     */
    on() {
        this.active = true;
        this.set_z(5);
        this.move(this.x1, this.y1);
    } // RollButton.on()

    /**
     *
     */
    off() {
        if ( ! this.active ) {
            return;
        }
        this.active = false;
        this.move(this.x0, this.y0);
        this.set_z(-1);
    } // RollButton.off()
} // class RollButton
