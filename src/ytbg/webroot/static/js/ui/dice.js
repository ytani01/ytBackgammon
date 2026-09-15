import { BgImage } from "./base.js";

/**
 * ダイス 1 個。
 *
 * 目は持たない。表示は BoardView が gameinfo から毎回作り、
 * 判定は gameinfo.board.dice を読む (TODO-052)。
 * 押したときの処理は BoardView がつなぐ。
 */
export class Dice extends BgImage {
    /**
     * @param {HTMLElement} el
     * @param {number} player
     * @param {number} x1 - 出したときの x
     * @param {number} y1 - 出したときの y
     * @param {string} file_prefix - 画像のファイル名の頭 ("dice0")
     * @param {number} board_w - 盤面の幅 (隠す位置を決める)
     * @param {number} board_h - 盤面の高さ
     */
    constructor(el, player, x1, y1, file_prefix, board_w, board_h) {
        super(el, x1, y1, 0, {player: player});
        this.file_prefix = file_prefix;

        [this.x1, this.y1] = [x1, y1];

        const offset0 = 5;

        if ( this.player == 0 ) {
            this.x0 = board_w - this.w / 2 - offset0;
            this.y0 = board_h - this.h / 2 - offset0;
        } else {
            this.x0 = this.w / 2 + offset0;
            this.y0 = this.h / 2 + offset0;
        }

        this.el.style.backgroundColor = "#000";
        this.el.style.cursor = "pointer";

        this.move0();
    } // Dice.constructor()

    /**
     *
     */
    enable() {
        this.image_el.style.opacity = 1.0;
    } // Dice.enable()

    /**
     *
     */
    disable() {
        this.image_el.style.opacity = 0.5;
    } // Dice.disable()

    /**
     *
     */
    get_filename(val) {
        return this.image_dir + this.file_prefix + val + this.image_suffix;
    } // Dice.get_filename()

    /**
     * 隠す (盤の隅へ)
     */
    move0() {
        this.set_z(-1);
        super.move(this.x0, this.y0, true, 0);
        this.rotate(0, true, 0);
    } // Dice.move0()

    /**
     * @param {number} deg
     * @param {number} sec
     */
    move1(deg, sec) {
        this.set_z(10);
        super.move(this.x1, this.y1, true, sec);
        if ( this.player == 1 ) {
            deg += 180;
        }
        this.rotate(deg, true, sec);
    } // Dice.move1()

    /**
     * 目の画像・不透明度・定位置を反映する
     *
     * @param {number} val - dice number 1-6:active, 11-16:inactive, 0:no dice
     */
    set(val) {
        this.enable();

        if (val % 10 < 1) {
            this.move0();
            return;
        }

        if (val > 10) {
            this.disable();
        }

        this.image_el.src = this.get_filename(val % 10);

        // 描画のたびにまっすぐ (プレーヤー 1 は 180 度) に置き直す。
        // 傾くのは振った直後 (animate_roll()) だけ
        this.move1(0, 0);
    } // Dice.set()

    /**
     * 振ったときの回転。**set() のあと、スタイルが確定する前に呼ぶ**
     * (カップの位置から出てくる動きを、set() の 0 秒の移動と
     * まとめて 0.5 秒で見せるため)。隠れているダイスは回さない
     */
    animate_roll() {
        if ( this.z < 0 ) {
            return;
        }
        this.move1(Math.floor(Math.random() * 720 - 360), 0.5);
    } // Dice.animate_roll()
} // class Dice
