import { BgText } from "./base.js";

/**
 * 時計の表示 (残り時間の文字と、残りの割合を示す背景)。
 *
 * 残り時間の計算と、動いているか・sw・持ち時間は BoardController が持つ。
 * ここは渡された値を表示するだけ。押したときの処理は BoardView がつなぐ。
 */
export class PlayerClock extends BgText {
    /**
     * @param {HTMLElement} el
     * @param {HTMLElement} bg_el - 背景 (p{n}clock-bg)
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(el, bg_el, player, x, y, deg) {
        super(el, x, y, deg, {player: player});

        this.bg_width0 = 130;
        this.bg_width = this.bg_width0;

        this.el_bg = bg_el;
        this.el_bg.style.left = this.x + "px";
        this.el_bg.style.top = this.y + "px";
        this.el_bg.style.width = this.bg_width + "px";
        this.el_bg.style.height = "24px";
        this.el_bg.style.backgroundColor = "#444";
        this.el_bg.style.transformOrigin = "left top";
        this.el_bg.style.transform = `rotate(${this.deg}deg)`;
    } // PlayerClock.constructor

    on() {
        super.on();
        this.el_bg.style.opacity = 1;
    }

    off() {
        super.off();
        this.el_bg.style.opacity = 0;
    }

    set_color(color) {
        this.el.style.color = "#000";
        this.el_bg.style.backgroundColor = color;
    }

    /**
     * 残り時間を表示する
     *
     * @param {number[]} clock - [持ち時間, 猶予] sec
     * @param {number[]} limit - [持ち時間, 猶予] の上限 sec
     * @param {boolean} running - 動いているか (sw が有効で active)
     */
    show(clock, limit, running) {
        if ( running ) {
            if ( clock[1] > 0 ) {
                this.set_color("#0FF");
            } else if ( clock[0] > 10 ) {
                this.set_color("#FF0");
            } else {
                this.set_color("#F00");
            }
        } else {
            this.set_color("#888");
        }

        const clock0 = clock[0].toFixed(1);
        const clock1 = clock[1].toFixed(1);
        this.el.innerHTML = `&nbsp;${clock0}/${clock1}&nbsp;`;

        this.bg_width = (clock[0] + clock[1]) /
            (limit[0] + limit[1]) * this.bg_width0;
        if ( this.bg_width < 1 ) {
            this.bg_width = 1;
        }
        this.el_bg.style.width = this.bg_width + "px";
    } // PlayerClock.show()
} // class PlayerClock
