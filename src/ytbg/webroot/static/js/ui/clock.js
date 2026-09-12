import { log } from "../log.js";
import { emit_msg } from "../ws.js";
import { BgText } from "./base.js";

/**
 * 持ち時間と猶予の限度 (ヘッダの <input> 2 つ)。
 *
 * BgText を継承していたが、el も board も持たないので、継承した機能は
 * 全部使えていなかった。ただの class にした (TODO-038)。
 */
export class ClockLimit {
    constructor() {
        this.el_limit = [
            document.getElementById("clock_limit0"),
            document.getElementById("clock_limit1")
        ];
        const value0 = parseFloat(this.el_limit[0].value) * 60;
        const value1 = parseFloat(this.el_limit[1].value);
        this.limit = [value0, value1];
    } // ClockLimit.constructor

    /**
     * @param {number} index
     * @param {number} limit - sec
     */
    set(index, limit) {
        log(`ClockLimit.set(${index}, ${limit})`);
        this.limit[index] = limit;

        if ( index == 0 ) {
            this.el_limit[index].value = `${this.limit[index] / 60}`;
        } else {
            this.el_limit[index].value = `${this.limit[index]}`;
        }
    } // ClockLimit.set()

    /**
     * サーバは set_clock_limit を履歴に積まない (TODO-032)。
     * clock_limit は gameinfo の外にあり、history: true で送っても
     * 積まれるエントリが sn 以外すべて同じになるだけなので、常に false
     *
     * @param {number} index
     * @param {number} limit - sec
     */
    emit_set(index, limit) {
        emit_msg("set_clock_limit",
                 { index: index, clock_limit: limit },
                 false);
    } // ClockLimit.emit_set()
} // class ClockLimit

/**
 *
 */
export class PlayerClock extends BgText {
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

        this.clock = [0, 0];
        this.start_clock = [0, 0];
        this.start_time = Date.now();
        this.msec = 0;
        this.active = false;

        this.bg_width0 = 130;
        this.bg_width = this.bg_width0;

        this.el_bg = document.getElementById(`${this.id}-bg`);
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
        //this.el.style.backgroundColor = color;
        this.el_bg.style.backgroundColor = color;
    }

    set_bg() {
        const limit = this.board.clock_limit.limit;
        log(`limit=${limit}`)
        log(`clock=${this.clock}`)
        this.bg_width = (this.clock[0] + this.clock[1]) /
            (limit[0] + limit[1]) * this.bg_width0;
        if ( this.bg_width < 1 ) {
            this.bg_width = 1;
        }
        log(`bg_width=${this.bg_width}`);
        this.el_bg.style.width = this.bg_width + "px";
    }

    /**
     * @param {number[]} clock - sec
     */
    set(clock) {
        //log(`PlayerClock.set([${clock[0]},${clock[1]}])`);
        this.clock = [clock[0], clock[1]];
        log(`PlayerClock.set():clock=${JSON.stringify(this.clock)}`);
        this.update_start_clock();

        this.update();
    } // PlayerClock.set()

    to_str() {
        const clock0 = this.clock[0].toFixed(1);
        const clock1 = this.clock[1].toFixed(1);
        const text = `&nbsp;${clock0}/${clock1}&nbsp;`;
        return text;
    } // PlayerClock.to_str()

    /**
     *
     */
    update_start_clock() {
        this.start_clock = [this.clock[0], this.clock[1]];
        this.start_time = Date.now();
    }

    update() {
        this.msec = Date.now() - this.start_time;

        if ( this.active && this.board.clock_sw ) {
            this.clock[1] = (this.start_clock[1] * 1000.0 - this.msec) / 1000;

            if ( this.clock[1] < 0 ) {
                this.clock[0] = this.start_clock[0] + this.clock[1];
                this.clock[1] = 0;
            }

            if ( this.clock[1] > 0 ) {
                this.set_color("#0FF");
            } else if ( this.clock[0] > 10 ) {
                this.set_color("#FF0");
            } else {
                this.set_color("#F00");
            }
        } else {
            this.update_start_clock();
            this.set_color("#888");
        }
        this.el.innerHTML = this.to_str();

        this.set_bg();
    } // PlayerClock.update()

    /**
     * クロックの動作を再開して、アクティブにする
     */
    resume() {
        log(`PlayerClock.resume():player=${this.player},clock[1]=${this.clock[1]}`);
        this.update_start_clock();
        this.active = true;
    } // PlayerClock.start()

    /**
     * 猶予時間をリセットして、クロックをリジューム
     */
    start() {
        this.clock[1] = this.board.clock_limit.limit[1];
        this.resume();
    }

    /**
     * 
     */
    stop() {
        log(`PlayerClock.stop():player=${this.player}`);
        this.active = false;
    } // PlayerClock.stop()

    /**
     * 
     */
    change_turn() {
        this.emit_stop();
        this.emit();

        this.board.player_clock[1-this.player].emit_start();
    } // PlayerClock.change_turn()

    /**
     * 
     */
    pause_resume() {
        if ( this.active ) {
            this.emit_stop();
        } else if ( this.board.clock_sw ) {
            this.emit_resume();
        }
        this.emit();
    } // PlayerClock.push()

    /**
     * @param {number} player
     * @param {number[]} clock - [clock0, clock1]
     * @param {boolean} [add_hist=true]
     */
    emit(add_hist=false) {
        emit_msg("set_player_clock", { player: this.player,
                                       clock: this.clock }, add_hist);
    } // PlayerClock.emit()

    /**
     * @param {boolean} [add_hist=true]
     */
    emit_resume(add_hist=false) {
        emit_msg("resume_clock", { player: this.player }, add_hist);
    } // PlayerClock.emit_start()

    /**
     * @param {boolean} [add_hist=true]
     */
    emit_start(add_hist=false) {
        emit_msg("start_clock", { player: this.player }, add_hist);
    } // PlayerClock.emit_start()

    /**
     * @param {boolean} [add_hist=true]
     */
    emit_stop(add_hist=false) {
        emit_msg("stop_clock", { player: this.player }, add_hist);
    } // PlayerClock.emit_pause()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        this.pause_resume();
    } // PlayerClock.on_mouse_down_xy()
} // class PlayerClock
