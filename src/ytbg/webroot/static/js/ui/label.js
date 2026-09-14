import { log } from "../log.js";
import { BgText } from "./base.js";

/**
 * <div>${name}</div>
 */
export class PlayerName extends BgText {
    /**
     * @param {HTMLElement} el
     * @param {HTMLInputElement} input_el - 名前の入力欄 (p{n}name-input)
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     * @param {{x: number, y: number, w: number, h: number}} board_rect -
     *     盤面の位置と大きさ (入力欄はページ座標で置くので要る)
     */
    constructor(el, input_el, player, x, y, deg, board_rect) {
        super(el, x, y, deg, {player: player});
        this.board_rect = board_rect;

        // this.def_name = `Player ${this.player}`;
        this.def_name = "[Input name]";
        this.name = this.def_name;

        this.el_input = input_el;
        this.el_input.style.left = board_rect.x + this.x + "px";
        this.el_input.style.top = board_rect.y + this.y + "px";
        //this.el_input.transitionDuration = "5s";
        this.el_input.style.transformOrigin = "left top";
        this.el_input.style.transform = `rotate(${this.deg}deg)`;
        this.el_input.style.zIndex = -1;
    } // PlayerName.constructor()

    inverse() {
        const b = this.board_rect;
        const x0 = parseInt(this.el_input.style.left.slice(0,-2));
        const y0 = parseInt(this.el_input.style.top.slice(0, -2));
        const deg0 = parseInt(this.el_input.style.transform.slice(7,-4));
        log(`x0=${x0},y0=${y0},deg0=${deg0}`);
        const dx0 = x0 - b.x - b.w / 2;
        const dy0 = y0 - b.y - b.h / 2;
        log(`dx0=${dx0},dy0=${dy0}`);
        const x1 = b.x + b.w / 2 - dx0;
        const y1 = b.y + b.h / 2 - dy0;
        const deg1 = (deg0 + 180) % 360;
        log(`x1=${x1},y1=${y1},deg1=${deg1}`);
        this.el_input.style.left = x1 + "px";
        this.el_input.style.top = y1 + "px";
        this.el_input.style.transform = `rotate(${deg1}deg)`;
    }

    /**
     * @param {string} name
     */
    set(name) {
        this.name = name.trim();
        //log(`name=${JSON.stringify(this.name)},length=${this.name.length}`);
        if ( this.name.length == 0 ) {
            this.name = this.def_name;
        }
        super.set(this.name);

        //document.getElementById("player-name").value = "";
    } // PlayerName.set()

    /**
     * 
     */
    on() {
        this.el.style.color = "rgba(255, 255, 128, 0.8)";
    } // PlayerName.on()

    /**
     * 
     */
    off() {
        this.el.style.color = "rgba(0, 0, 0, 0.8)";
    } // PlayerName.off()

    /**
     * 名前を押したとき。入力欄を前に出す (送るのは main.js)
     */
    edit() {
        log('PlayerName.edit');
        this.el_input.value = "";
        this.el_input.style.zIndex = 10;
        this.el_input.focus();
    }
} // class PlayerName

/**
 * <div>Pip: ${pip_count}</div>
 */
export class PlayerPipCount extends BgText {
    /**
     * @param {HTMLElement} el
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(el, player, x, y, deg) {
        super(el, x, y, deg, {player: player});

        this.prefix = "Pip:";
        this.pip_count = 167;
        this.set(this.pip_count);
    } // PlayerPipCount.constructor()

    /**
     * @param {number} pip_count
     */
    set(pip_count) {
        this.pip_count = pip_count;
        super.set(`${this.prefix} ${this.pip_count}`);
        this.move(this.x, this.y);
        this.rotate(this.deg);
    } // PlayerPipCount.set()

    /**
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
        super.move(x, y, true, 0);
    } // PlayerPipCount.move()

    /**
     * @param {number} deg
     */
    rotate(deg) {
        super.rotate(deg, true, 0);
    }
} // class PlayerPipCount

/**
 * <div>${score}</div>
 */
export class PlayerScore extends BgText {
    /**
     * @param {HTMLElement} el
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     */
    constructor(el, player, x, y, deg=0) {
        super(el, x, y, deg, {player: player});

        this.el.style.width = "42px";
        this.el.style.textAlign = "center";
        this.el.style.fontSize = "30px";
        this.el.style.transform = "rotate(-90deg)";
        this.el.style.transformOrigin = "left top";
        // ▲ / ▼ のボタン (ScoreButton) に重なっているので、クリックは
        // 下へ通す。スコアを操作するのは ScoreButton だけ (TODO-048)
        this.el.style.pointerEvents = "none";

        this.set("");
    } // Score.constructor()

    /**
     * @param {number} score
     */
    set(score) {
        super.set(`${score}`);
    }

    /**
     * @return {number} score
     */
    get() {
        return parseInt(super.get());
    }
} // class PlayerScore
