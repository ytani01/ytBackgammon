import { log } from "../log.js";
import { emit_msg } from "../ws.js";
import { BgText } from "./base.js";

/**
 * <div id="${id}">${name}</div>
 */
export class PlayerName extends BgText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, x, y, deg, {board: board, player: player});

        // this.def_name = `Player ${this.player}`;
        this.def_name = "[Input name]";
        this.name = this.def_name;

        this.el_input = document.getElementById(`${id}-input`);
        this.el_input.style.left = this.board.x + this.x + "px";
        this.el_input.style.top = this.board.y + this.y + "px";
        //this.el_input.transitionDuration = "5s";
        this.el_input.style.transformOrigin = "left top";
        this.el_input.style.transform = `rotate(${this.deg}deg)`;
        this.el_input.style.zIndex = -1;
    } // PlayerName.constructor()

    inverse() {
        const x0 = parseInt(this.el_input.style.left.slice(0,-2));
        const y0 = parseInt(this.el_input.style.top.slice(0, -2));
        const deg0 = parseInt(this.el_input.style.transform.slice(7,-4));
        log(`x0=${x0},y0=${y0},deg0=${deg0}`);
        const dx0 = x0 - this.board.x - this.board.w / 2;
        const dy0 = y0 - this.board.y - this.board.h / 2;
        log(`dx0=${dx0},dy0=${dy0}`);
        const x1 = this.board.x + this.board.w / 2 - dx0;
        const y1 = this.board.y + this.board.h / 2 - dy0;
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
     * @param {string} name
     * @param {boolean} add_hist
     */
    emit(name, add_hist=true) {
        emit_msg("set_playername", { player: parseInt(this.player),
                                     name: name }, add_hist);
    } // PlayerName.emit()

    /**
     * 
     */
    on_mouse_down_xy(x, y) {
        log('PlayerName.on_mouse_down_xy');
        this.el_input.value = "";
        this.el_input.style.zIndex = 10;
        this.el_input.focus();
    }
} // class PlayerName

/**
 * <div id="${id}">Pip: ${pip_count}</div>
 */
export class PlayerPipCount extends BgText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, x, y, deg, {board: board, player: player});

        this.prefix = "Pip:";
        this.pip_count = 167;
        this.set(this.pip_count);

        if ( document.getElementById("disp-pip").checked ) {
            this.on();
        } else {
            this.off();
        }
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
 * <div id="${id}">${score}</div>
 */
export class PlayerScore extends BgText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     */
    constructor(id, board, player, x, y, deg=0) {
        super(id, x, y, deg, {board: board, player: player});

        this.score = 0;

        this.el.style.width = "42px";
        this.el.style.textAlign = "center";
        this.el.style.fontSize = "30px";
        this.el.style.transform = "rotate(-90deg)";
        this.el.style.transformOrigin = "left top";

        this.default_text = `${this.score}`;
        this.set("");
    } // Score.constructor()

    /**
     * @param {number} score
     */
    set(score) {
        this.score = score;
        super.set(`${score}`);
    }

    /**
     * @return {number} score
     */
    get() {
        return parseInt(super.get());
    }

    /**
     * @param {number} score
     */
    up(score) {
        this.score += score;
        if ( this.score > 99 ) {
            this.score = 99;
        }
        this.emit(this.score, true);
    }

    /**
     *
     */
    clear() {
        this.score = 0;
        this.emit(this.score, true);
    }

    /**
     * @param {number} score
     * @param {boolean} add_hist
     */
    emit(score, add_hist=true) {
        emit_msg("set_score", { player: parseInt(this.player),
                                score: parseInt(score) }, add_hist);
    } // PlayerScore.emit()

    on_mouse_down_xy(x, y) {
        log(`PlayerScore[${this.player}].on_mouse_down_xy()`);
        if ( this.board.score_btn[this.player].up.in_this(x, y) ) {
            this.up(1);
        } else if ( this.board.score_btn[this.player].down.in_this(x, y) ) {
            this.clear();
        }
    }
} // class PlayerScore
