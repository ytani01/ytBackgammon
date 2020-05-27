/**
 *=====================================================
 * [Class tree]
 *
 * BgBase .. have (x, y, w, h), without image
 *    |
 *    +- BgText .. have a text
 *    |    |
 *    |    +- BoardText .. on board
 *    |         |
 *    |         +- ClockLimit
 *    |         |
 *    |         +- PlayerText .. owned by player
 *    |              |
 *    |              +- PlayerClock
 *    |              +- PlayerName
 *    |              +- PlayerPipCount
 *    |              +- PlayerScore
 *    |
 *    +- BgImage .. have a image, mouse handlers
 *    |    |
 *    |    +- OnBoardImage .. on board
 *    |    |    |
 *    |    |    +- OnBoardButton
 *    |    |    |    |
 *    |    |    |    +- InverseButton
 *    |    |    |    +- ResignButton
 *    |    |    |    |
 *    |    |    |    +- EmitButton
 *    |    |    |         |
 *    |    |    |         +- BackButton
 *    |    |    |         +- Back2Button
 *    |    |    |         +- BackAllButton
 *    |    |    |         +- FwdButton 
 *    |    |    |         +- Fwd2Button 
 *    |    |    |         +- FwdAllButton 
 *    |    |    +- Cube
 *    |    |    |
 *    |    |    +- PlayerItem .. owned by player
 *    |    |         |
 *    |    |         +- ScoreButton
 *    |    |         |
 *    |    |         +- BannerButton
 *    |    |         |    |
 *    |    |         |    +- RollButton
 *    |    |         |    +- PassButton
 *    |    |         |    +- ResignBannerButton
 *    |    |         |    +- WinButton
 *    |    |         |
 *    |    |         +- Dice
 *    |    |         +- Checker
 *    |    +- Board
 *    |         
 *    +- BoardArea .. on board
 *         |
 *         +- BoardPoint
 *
 * QueryStringBase .. querystring manupilation
 *
 * CookieBase .. cookie manupilation
 *
 * SoundBase .. play audio
 *
 *=====================================================
 */
const MY_NAME = "ytBackgammon Client";
const VERSION = "0.89";

const GAMEINFO_FILE = "gameinfo.json";

let ws = undefined;
let board = undefined;
const nav = document.getElementById("nav-input");

let GlobalSoundSwitch = true;
const SOUND_ROLL = "/static/sounds/roll1.mp3";
const SOUND_PUT = "/static/sounds/put1.mp3";
const SOUND_HIT = "/static/sounds/hit1.mp3";
const SOUND_TURN_CHANGE = "/static/sounds/turn_change1.mp3";

/**
 * Emit message to server
 *
 * @param {string} type
 * @param {Object} data
 * @param {boolean} [history=false]
 */
const emit_msg = (type, data, history=false) => {
    console.log(`emit_msg> type=${type}, data=${JSON.stringify(data)}`);
    ws.emit("json", {src: "client", type: type, data: data, history: history});
};

/**
 * base class for ytBackgammon
 */
class BgBase {
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     */
    constructor(id, x, y, deg=0, w=undefined, h=undefined) {
        [this.x, this.y] = [x, y];
        [this.w, this.h] = [w, h];
        this.deg = deg;
        this.id = id;
        
        if ( this.id !== undefined && this.id.length > 0 ) {
            this.el = document.getElementById(this.id);
        } else {
            this.el = undefined;
        }

        if ( w === undefined && this.el ) {
            this.w = this.el.clientWidth;
        }
        if ( h === undefined && this.el ) {
            this.h = this.el.clientHeight;
        }

        if ( this.el ) {
            this.el.onmousedown = this.on_mouse_down.bind(this);
            this.el.ontouchstart = this.on_mouse_down.bind(this);
            this.el.onmouseup = this.on_mouse_up.bind(this);
            this.el.ontouchend = this.on_mouse_up.bind(this);
            this.el.onmousemove = this.on_mouse_move.bind(this);
            this.el.ontouchmove = this.on_mouse_move.bind(this);
            this.el.ondragstart = this.null_handler.bind(this);
        }
    } // BgBase.constructor()

    /**
     * @param {number} x
     * @param {number} y
     * @return {boolean}
     */
    in_this(x, y) {
        return (x >= this.x) && (x < this.x + this.w)
            && (y >= this.y) && (y < this.y + this.h);
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {boolean} center - center flag
     */
    move(x, y, center=false, sec=0) {
        [this.x, this.y] = [x, y];

        this.el.style.transitionTimingFunction = "linear";
        this.el.style.transitionDuration = sec + "s";
        if ( center ) {
            this.el.style.left = (this.x - this.w / 2) + "px";
            this.el.style.top = (this.y - this.h / 2) + "px";
        } else {
            this.el.style.left = this.x + "px";
            this.el.style.top = this.y + "px";
        }
    } // BgBase.move()

    /**
     * @param {number} z
     */
    set_z(z) {
        this.z = z;
        this.el.style.zIndex = this.z;
    } // BgBase.set_z()

    /**
     * @param {number} deg
     */
    rotate(deg, center=false, sec=0) {
        //console.log(`rotate(deg=${deg}, center=${center}, sec=${sec})`);
        this.deg = deg;
        if ( center ) {
            this.el.style.transformOrigin = "center center";
        } else {
            this.el.style.transformOrigin = "top left";
        }
        this.el.style.transitionTimingFunction = "linear";
        this.el.style.transitionDuration = sec + "s";
        this.el.style.transform = `rotate(${this.deg}deg)`;
    } // BgBase.rotate()

    /**
     * @param {number} player
     */
    goal_point(player) {
        return (25 * player);
    } // BgBase.goal_point()

    /**
     * @param {number} player
     */
    bar_point(player) {
        return (26 + player);
    } // BgBase.bar_point()
    
    /**
     * ポイントとダイスの目から行き先のポイントを計算
     *
     * 注1: 実際に移動できるかどうかは判断しない。
     * 注2: ゴールを行き過ぎても、補正しない。
     *
     * @param {number} player
     * @param {number} src_p
     * @param {number} dice_val
     * @return {number} - destination point
     */
    calc_dst_point(player, src_p, dice_val) {
        let dst_p = undefined;
        
        if ( player == 0 ) {
            if ( src_p == this.bar_point(player) ) {
                src_p = 25;
            }
            dst_p = src_p - dice_val;
            /*
            if ( dst_p < 0 ) {
                dst_p = 0;
            }
            */
        } else { // player1
            if ( src_p == this.bar_point(player) ) {
                src_p = 0;
            }
            dst_p = src_p + dice_val;
            /*
            if ( dst_p > 25 ) {
                dst_p = 25;
            }
            */
        }
        return dst_p;
    } // BgBase.calc_dst_point()

    /**
     * 指定したポイントのPIPカウントを取得
     *
     * @param {number} player
     * @param {number} point
     * @return {number} - pip count
     */
    get_pip(player, point) {
        // console.log(`get_pip(player=${player},point=${point}`);
        if ( point === undefined ) {
            return undefined;
        }

        if ( point > 25 ) {
            return 25;
        }
        
        if ( this.player == 0 ) {
            return point;
        }
        // player == 1
        return (25 - point);
    } // BgBase.get_pip()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        // to be overridden
    } // BgBase.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        // to be overridden
    } // BgBase.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        // to be overridden
    } // BgBase.on_mouse_down_xy()

    /**
     * touch event to mouse event
     * only for get_xy() function
     *
     * @param {MouseEvent} e
     */
    touch2mouse(e) {
        // console.log(`BgBase.touch2mouse()`);
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        return e;
    } // BgBase.touch2mouse()
    
    /**
     * only for get_xy() function
     *
     * @param {MouseEvent} e
     */
    inverse_xy(e) {
        let [origin_x, origin_y] = [this.x, this.y];
        let [w, h] = [this.w, this.h];
        if ( this.board ) {
            [origin_x, origin_y] = [this.board.x, this.board.y];
            [w, h] = [this.board.w, this.board.h];
        }
        
        return [w - e.pageX + origin_x, h - e.pageY + origin_y];
    } // BgBase.inverse_xy()

    /**
     * @param {MouseEvent} e
     */
    get_xy(e) {
        e = this.touch2mouse(e);
        let [origin_x, origin_y] = [this.x, this.y];
        if ( this.board ) {
            [origin_x, origin_y] = [this.board.x, this.board.y];
        }
        
        let [x, y] = [e.pageX - origin_x, e.pageY - origin_y];

        let player = this.player;
        if ( this.board) {
            player = this.board.player;
        }
        if ( player == 1 ) {
            [x, y] = this.inverse_xy(e);
        }
        return [x, y];
    } // BgBase.get_xy()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        this.on_mouse_down_xy(x, y);
    } // BgBase.on_mouse_down()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_up(e) {
        let [x, y] = this.get_xy(e);
        this.on_mouse_up_xy(x, y);
    } // BgBase.on_mouse_up()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_move(e) {
        let [x, y] = this.get_xy(e);
        this.on_mouse_move_xy(x, y);
    } // BgBase.on_mouse_move()

    /**
     * @param {MouseEvent} e
     */
    null_handler(e) {
        return false;
    } // BgBase.null_handler()
} // class BgBase

/**
 * <div id="${id}">some text</div>
 */
class BgText extends BgBase {
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     * @param {string} [text=""]
     */
    constructor(id, x, y, deg, text="") {
        super(id, x, y, deg, undefined, undefined);

        // set text
        this.text = text;

        if ( this.el ) {
            this.el.innerHTML = this.text;
            this.w = this.el.clientWidth;
            this.h = this.el.clientHeight;
            this.el.style.left = this.x + "px";
            this.el.style.top = this.y + "px";
            this.el.style.transformOrigin = "top left";
            this.el.style.transform = `rotate(${this.deg}deg)`;
        }
    } // BgText.constructor()

    /**
     * @return {string} this.text
     */
    get() {
        if ( this.el === undefined ) {
            return "";
        }

        this.text = this.el.innerHTML;
        return this.text;
    } // BgText.get()
    
    /**
     * @param {string} txt
     */
    set(txt) {
        if ( this.el === undefined ) {
            return;
        }

        this.el.innerHTML = "";
        if ( txt.length > 0 ) {
            this.text = txt;
            this.el.innerHTML = this.text;
        }
        this.w = this.el.clientWidth;
        this.h = this.el.clientHeight;
        this.move(this.x, this.y);
        this.rotate(this.deg);
    } // BgText.set()

    /**
     * 
     */
    on() {
        if ( this.el ) {
            this.el.style.opacity = 1;
        }
    } // BgText.on()

    /**
     * 
     */
    off() {
        if ( this.el ) {
            this.el.style.opacity = 0;
        }
    } // BgText.off()
} // class BgText

/**
 * <div id="${id}">some text</div>
 */
class BoardText extends BgText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, x, y, deg) {
        super(id, x, y, deg, "");
        this.board = board;
        
    } // BoardText.constructor()
} // class BoardText

/**
 *
 */
class ClockLimit extends BoardText {
    /**
     * @param {Board} board
     */
    constructor(id, board) {
        super(undefined, board, undefined, undefined, undefined);

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
        console.log(`ClockLimit.set(${index}, ${limit})`);
        this.limit[index] = limit;

        if ( index == 0 ) {
            this.el_limit[index].value = `${this.limit[index] / 60}`;
        } else {
            this.el_limit[index].value = `${this.limit[index]}`;
        }
    } // ClockLimit.set()

    /**
     * @param {number} index
     * @param {number} limit - sec
     * @param {boolean} [add_hist=true]
     */
    emit_set(index, limit, add_hist=true) {
        emit_msg("set_clock_limit",
                 { index: index, clock_limit: limit },
                 add_hist);
    } // ClockLimit.emit_set()
} // class ClockLimit

/**
 * <div id="${id}">${text}</div>
 */
class PlayerText extends BoardText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, board, x, y, deg);
        this.player = player;
    } // PlayerText.constructor()
} // class PlayerText

/**
 *
 */
class PlayerClock extends PlayerText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, board, player, x, y, deg);

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
        this.bg_width = (this.clock[0] + this.clock[1]) /
            (limit[0] + limit[1]) * this.bg_width0;
        if ( this.bg_width < 1 ) {
            this.bg_width = 1;
        }
        this.el_bg.style.width = this.bg_width + "px";
    }

    /**
     * @param {number[]} clock - sec
     */
    set(clock) {
        console.log(`PlayerClock.set([${clock[0]},${clock[1]}])`);
        this.clock = [clock[0], clock[1]];
        console.log(`PlayerClock.set():clock=${JSON.stringify(this.clock)}`);
        this.update_start_clock();

        this.update();
    } // PlayerClock.set()

    to_str() {
        const clock0 = this.clock[0].toFixed(1);
        const clock1 = this.clock[1].toFixed(1);
        const text = `&nbsp;${clock0}/${clock1}&nbsp;`;
        return text;
    } // PlayerClock.to_str()

    update_start_clock() {
        this.start_clock = [this.clock[0], this.clock[1]];
        this.start_time = Date.now();
    }

    update() {
        this.msec = Date.now() - this.start_time;

        if ( this.active && this.board.clock_sw ) {
            this.clock[1] = (this.start_clock[1] * 1000 - this.msec) / 1000;

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
     * 
     */
    resume() {
        console.log(`PlayerClock.resume():player=${this.player},clock[1]=${this.clock[1]}`);
        this.update_start_clock();
        this.active = true;
    } // PlayerClock.start()

    /**
     * 
     */
    start() {
        this.clock[1] = this.board.clock_limit.limit[1];
        this.resume();
    }

    /**
     * 
     */
    stop() {
        console.log(`PlayerClock.stop():player=${this.player}`);
        this.active = false;
    } // PlayerClock.stop()

    /**
     * 
     */
    reset() {
        const limit = this.board.clock_limit.limit;
        console.log(`PlayerClock.reset():player=${this.player},limit=[${limit[0]},${limit[1]}]`);
        this.set(limit);
        this.stop();
    }
    
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
     * @param {boolean} [add_hist=true]
     */
    emit_reset(add_hist=false) {
        emit_msg("reset_clock", { player: this.player }, add_hist);
    } // PlayerClock.emit_reset()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        this.pause_resume();
    } // PlayerClock.on_mouse_down_xy()
} // class PlayerClock

/**
 * <div id="${id}">${name}</div>
 */
class PlayerName extends PlayerText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, board, player, x, y, deg);

        // this.def_name = `Player ${this.player}`;
        this.def_name = "[Click and input name]";
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
        console.log(`x0=${x0},y0=${y0},deg0=${deg0}`);
        const dx0 = x0 - this.board.x - this.board.w / 2;
        const dy0 = y0 - this.board.y - this.board.h / 2;
        console.log(`dx0=${dx0},dy0=${dy0}`);
        const x1 = this.board.x + this.board.w / 2 - dx0;
        const y1 = this.board.y + this.board.h / 2 - dy0;
        const deg1 = (deg0 + 180) % 360;
        console.log(`x1=${x1},y1=${y1},deg1=${deg1}`);
        this.el_input.style.left = x1 + "px";
        this.el_input.style.top = y1 + "px";
        this.el_input.style.transform = `rotate(${deg1}deg)`;
    }

    /**
     * @param {string} name
     */
    set(name) {
        this.name = name.trim();
        //console.log(`name=${JSON.stringify(this.name)},length=${this.name.length}`);
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
        console.log('PlayerName.on_mouse_down_xy');
        this.el_input.value = "";
        this.el_input.style.zIndex = 10;
        this.el_input.focus();
    }
} // class PlayerName

/**
 * <div id="${id}">Pip: ${pip_count}</div>
 */
class PlayerPipCount extends PlayerText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg) {
        super(id, board, player, x, y, deg);

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
class PlayerScore extends PlayerText {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     */
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);

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
        console.log(`PlayerScore[${this.player}].on_mouse_down_xy()`);
        if ( this.board.score_btn[this.player].up.in_this(x, y) ) {
            this.up(1);
        } else if ( this.board.score_btn[this.player].down.in_this(x, y) ) {
            this.clear();
        }
    }
} // class PlayerScore

/**
 * <div id="${id}"><image src="${image_dir}/..${image_suffix}"></div>
 */
class BgImage extends BgBase {
    constructor(id, x, y, deg=0, w=undefined, h=undefined) {
        super(id, x, y, deg, w, h);

        this.image_dir = "/static/images/";
        this.file_suffix = ".png";

        this.image_el = this.el.children[0];

        if ( w === undefined ) {
            this.w = this.image_el.width;
        }
        if ( h === undefined ) {
            this.h = this.image_el.height;
        }

        this.el.style.width = `${this.w}px`;
        this.el.style.height = `${this.h}px`;
  
        this.active = true;
        this.el.hidden = false;
        this.el.draggable = false;

        this.move(this.x, this.y, false);

        this.e = undefined; // MouseEvent
    } // BgImage.constructor()

    /**
     * @param {number} w
     * @param {number} h
     */
    set_wh(w, h) {
        this.w = w;
        this.h = h;

        this.el.style.width = `${this.w}px`;
        this.el.style.height = `${this.h}px`;
    } // BgImage.set_wh()

    /**
     * 
     */
    on() {
        this.active = true;
        this.el.hidden = false;
    } // BgImage.on()

    /**
     * 
     */
    off() {
        this.active = false;
        this.el.hidden = true;
    } // BgImage.off()
} // class BgImage

/**
 * item on board
 */
class OnBoardImage extends BgImage {
    constructor(id, board, x, y, deg=0) {
        super(id, x, y, deg, undefined, undefined);
        this.board = board;
    }
} // class OnBoardImage

/**
 * button on board
 */
class OnBoardButton extends OnBoardImage {
    constructor(id, board, x, y, deg=0) {
        super(id, board, x, y, deg);
    }
} // class OnBoardButton

/**
 *
 */
class InverseButton extends OnBoardButton {
    constructor(id, board, x, y) {
        super(id, board, x, y);
    } // InverseButton.constructor()

    on_mouse_down_xy(x, y) {
        this.board.inverse(0.5);
    } // InverseButton.on_mouse_down_xy()
} // class InverseButton

/**
 *
 */
class ResignButton extends OnBoardButton {
    constructor(id, board, x, y) {
        super(id, board, x, y);
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
        console.log(`ResignButton.on_mouse_down_xy>score=${score}`);
        this.board.player_clock[0].emit_stop();
        this.board.player_clock[1].emit_stop();
        this.board.emit_turn(-1, this.board.player, false);
        this.board.score[1 - this.board.player].up(score);
    } // ResignButton.on_mouse_down_xy()
} // class ResignButton

/**
 *
 */
class EmitButton extends OnBoardButton {
    constructor(id, board, type, data, x, y) {
        super(id, board, x, y);

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
class BackButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back", {n: 1}, x, y);
    } // BackButton.constructor()
} // class BackButton

/**
 *
 */
class Back2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back2", {}, x, y);
    } // Back2Button.constructor()
} // class Back2Button

/**
 *
 */
class BackAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back_all", {}, x, y);
    } // BackAllButton.constructor()
} // class BackAllButton

/**
 *
 */
class FwdButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd", {n: 1}, x, y);
    } // FwdButton.constructor()
} // class FwdButton

/**
 *
 */
class Fwd2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd2", x, y);
    } // Fwd2Button.constructor()
} // class FwdButton

/**
 *
 */
class FwdAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd_all", x, y);
    } // FwdAllButton.constructor()
} // class FwdAllButton

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
class Cube extends OnBoardImage {
    constructor(id, board) {
        super(id, board, 0, 0, 0);

        this.player = undefined;
        this.value = 1;
        this.accepted = false;

        this.move_sec = 0.3;
        
        this.x0 = (this.board.bx[0] + this.board.bx[1]) / 2;
        this.x1 = (this.board.bx[2] + this.board.bx[3]) / 2;
        this.y0 = this.board.h / 2;
        this.y2 = [this.board.by[9] - this.h / 2,
                   this.board.by[0] + this.h / 2];
        this.y1 = [(this.y2[0] + this.board.h / 2) / 2,
                   (this.y2[1] + this.board.h / 2) / 2];
        
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
        console.log("Cube.set("
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
        filename += this.file_suffix;

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
            this.move(this.x1, this.y1[this.player], true, this.move_sec);
        }
    } // Cube.set()

    /**
     * 
     */
    double(player=undefined) {
        console.log(`Cube.double(player=${player})`);

        if ( player === undefined ) {
            if ( this.player !== undefined ) {
                player = 1 - this.player;
            }
        } else {
            player = 1 - player;
        }
        console.log("Cube.double> player=" + player);

        let val = this.value * 2;
        if ( val > 64 ) {
            val = 64;
        }

        this.board.player_clock[1-player].change_turn();
        this.emit(val, player, false);
    } // Cube.double()

    /**
     *
     */
    accept_double() {
        console.log("Cube.accept_double()");

        this.board.player_clock[this.player].change_turn();
        this.emit(this.value, this.player, true);
    } // Cube.accept_double()

    /**
     *
     */
    cancel_double() {
        console.log("Cube.cancel_double()");
        
        let val = this.value / 2;
        let player = 1 - this.player;
        if ( val == 1 ) {
            player = undefined;
        }
        this.board.player_clock[1-player].change_turn();
        this.emit(val, player, true);
    } // Cube.cancel_double()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        console.log(`Cube.on_mouse_down_xy>this.player=${this.player},`
                    + `this.board.player=${this.board.player}`);

        if ( this.board.turn >= 2 || this.board.turn < 0 ) {
            // ゲーム開始時、修了時は、振れられない
            return false;
        }

        if ( this.accepted && this.board.turn != this.board.player ) {
            // 自分の番にしかダブルを掛けられない
            return false;
        }

        for (let rb of this.board.roll_btn) {
            // ダイスがアクティブのときは、キューブに触れられない
            if ( rb.dice_active ) {
                return false;
            }
        }

        if ( ! this.accepted ) {
            // ダブルが掛けられた状態
            if ( this.player == this.board.player ) {
                this.accept_double();
                return false;
            }
            this.cancel_double();
            return false;
        }

        // this.accepted == true
        if (this.player === undefined || this.player == this.board.player) {
            this.double(this.board.player);
        }
        return false;
    } // Cube.on_mouse_down_xy()
} // class Cube

/**
 * Item owned by player
 */
class PlayerItem extends OnBoardImage {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, x, y, deg);
        this.player = player;
    } // PlayerItem.constructor()
} // class PlayerItem

/**
 *
 */
class ScoreButton extends PlayerItem {
    constructor(id, board, player, x, y, w, h, score_obj, offset) {
        super(id, board, player, x, y, 0);
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
        console.log(`ScoreButton.on_mouse_down_xy()`);
        console.log(`ScoreButton.on_mouse_down_xy>offset=${this.offset}`);
        if ( this.offset > 0 ) {
            this.score_obj.up(1);
        } else {
            this.score_obj.clear();
        }
    } // ScoreButton.on_mouse_down_xy()
} // class ScoreButton

/**
 * Banner button
 */
class BannerButton extends PlayerItem {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} player
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     */
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);

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
} // class BannerButton

/**
 *
 */
class RollButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);
        /*
        console.log(`RollButton(id=${id},player=${this.player},`
                    + `x=${this.x},y=${this.y})`);
        */

        [this.x1, this.y1] = [this.x, this.y];
        // console.log(`(x1,y1)=(${this.x1},${this.y1})`);

        if ( this.player == 0 ) {
            this.x0 = this.board.w - this.w;
            this.y0 = this.board.h - this.h;
        } else {
            this.x0 = this.w;
            this.y0 = this.h;
        }
        // console.log(`(x0,y0)=(${this.x0},${this.y0})`);

        this.dice_active = false;

        const dice_prefix = "dice" + this.player;

        this.dice = [];
        for (let i=0; i < 4; i++) {
            /*
            let xd = this.w / 4 * ( i * 2 + 1 );
            xd += this.x - this.w / 2;

            let yd = this.h / 8 * ((i * 2 + 1) % 4);
            yd += this.y - this.h / 2;
            */
            let xd = this.x1 + 60 * (i - 1.5);
            console.log(`x1=${this.x1},xd=${xd}`);
            let yd = this.y1 + 20 * (i % 2 - 0.5);

            this.dice.push(new Dice(dice_prefix + i,
                                    this.board, this.player,
                                    xd, yd,
                                    dice_prefix));
        } // for(i)

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

    /**
     * 
     */
    update() {
        const dice = this.get();
        // console.log(`RollButton.update>dice=${JSON.stringify(dice)}`);

        if ( this.board.turn != this.player && this.board.turn < 2 ) {
            this.off();
            return;
        }
        
        for (let d of this.dice) {
            if ( d.value != 0 ) {
                this.off();
                return;
            }
        } // for(i)

        this.board.pass_btn[1 - this.player].off();
        this.on();
    } // RollButton.on()

    /**
     *
     */
    another() {
        return this.board.roll_btn[1 - this.player];
    } // RollButton.another()

    /**
     * Set dice values
     * @param {number[][]} dice_value
     * @param {boolean} [roll_flag=false] 
     */
    set(dice_value, roll_flag=false) {
        /*
        console.log(`RollButton[${this.player}].set(`
                    + `dive_value=${JSON.stringify(dice_value)},`
                    + `roll_flag=${roll_flag})`);
        */
        if ( roll_flag ) {
            this.board.sound_roll.play();
        }

        this.clear();
        this.off();
        
        for (let i=0; i < 4; i++) {
            if ( dice_value[i] > 0 ) {
                this.dice_active = true;
            }
            this.dice[i].set(dice_value[i], roll_flag);
        } // for(i)

        if ( ! this.dice_active ) {
            if ( this.board.closeout(1 - this.player) ) {
                this.board.pass_btn[1 - this.player].on();
            }
        }
        
    } // RollButton.set()

    /**
     * Get dice values list
     * @return {number[]} - dice values
     */
    get() {
        let values = [];
        for (let i=0; i < this.dice.length; i++) {
            values.push(this.dice[i].value);
        }
        return values;
    } // RollButton.get()

    /**
     * 使えるダイスを取得
     * @return {number[]}
     */
    get_active_dice() {
        let active_dice = [];
        
        for (let d of this.dice) {
            let val = d.value;
            if ( val >= 1 && val <=6 ) {
                active_dice.push(val);
            }
        }
        /*
        console.log("RollButton.get_active_dice>"
                    +`active_dice=${JSON.stringify(active_dice)}`);
        */
        return active_dice;
    } // RollButton.get_active_dice()
    
    /**
     * 使えないダイスを確認してdisable()する
     * @return {boolean} - modified
     */
    check_disable() {
        // console.log(`RollButton.check_disable()`);
        let modified = false;
        const board = this.board;
        const player = this.player;
        const bar_p = this.bar_point(player);
        const active_d = this.get_active_dice();
        
        if ( board.point[bar_p].checkers.length > 0 ) {
            // ヒットされている場合は、復活できるか確認
            const dst_p = board.get_dst_points(player, bar_p, active_d);
            console.log(`RollButton.check_disable>`
                        + `dst_p=${JSON.stringify(dst_p)}`);
            if ( dst_p.length == 0 ) {
                // 復活できない
                for (let d=0; d < 4; d++) {
                    this.dice[d].disable();
                }
                modified = true;
                return modified;
            }

            // T.B.D. 復活できる場合、もう一つのダイスが使えるか確認?

            return modified;
        }

        // 全ての持ち駒について、移動できるかのチェック
        for (let i=0; i < 4; i++) {
            let can_use = false;

            const dice_val = this.dice[i].value;
            if ( dice_val < 1 || dice_val > 6) {
                continue;
            }

            for (let p=1; p <= 24; p++) {
                const ch = board.point[p].checkers;
                if ( ch.length == 0 ) {
                    continue;
                }
                if ( ch[0].player != player ) {
                    continue;
                }

                const dst = board.get_dst_point1(player, p, dice_val);
                if ( dst !== undefined ) {
                    can_use = true;
                    break;
                }

                // 使えない場合は、もう一つのダイスが使えるか確認後
                // 足した場合も確認
                for (let i2=0; i2 < 4; i2++) {
                    if ( i2 == i ) {
                        continue;
                    }
                    const dice_val2 = this.dice[i2].value;
                    if ( dice_val2 < 1 || dice_val2 > 6 ) {
                        continue;
                    }
                    const dst2 = board.get_dst_point1(player, p, dice_val2);
                    if ( dst2 === undefined ) {
                        continue;
                    }

                    // もう一つのダイスが使える場合、出目を足して確認
                    // 足した目で利用可能なら、dice[i] を利用可とする
                    const dst3 = board.get_dst_point1(player, p,
                                                      dice_val+dice_val2);
                    if ( dst3 !== undefined ) {
                        can_use = true;
                        break;
                    }
                } // for(i2)
                if ( can_use ) {
                    break;
                }
            } // for(p)

            if ( ! can_use ) {
                console.log(`RollButton.set>dice[${i}]: disable`);
                this.dice[i].disable();
                modified = true;
            }
        } // for(i)

        return modified;
    } // RollButton.check_disable()

    /**
     * Roll dices
     * @return {number[]} - dice values
     */
    roll() {
        // console.log(`RollButton.roll()`);
        this.clear();

        let d1 = Math.floor(Math.random()  * 4);
        let d2 = d1;
        while ( d1 == d2 ) {
            d2 = Math.floor(Math.random()  * 4);
        }
        console.log(`RollButton.roll> [d1, d2]=[${d1}, ${d2}]`);

        this.dice_active = true;

        const value1 = Math.floor(Math.random() * 6) + 1;
        const value2 = Math.floor(Math.random() * 6) + 1;

        // Dice histogram
        const histo = this.board.dice_histogram;
        histo[this.player][value1 - 1]++;
        histo[this.player][value2 - 1]++;
        // console.log(`RollButton.roll>histo=${JSON.stringify(histo)}`);
        let histogram_str = "";
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 6; i++) {
                let a = 0;
                a = histo[p][i];
                histogram_str += a + " ";
            } // for (i)
            histogram_str += "<br />";
        } // for(p)
        // console.log(`histogram_str=${histogram_str}`);
        document.getElementById("dice-histogram").innerHTML = histogram_str;

        let dice = [0, 0, 0, 0];

        if ( this.board.turn >= 2 ) {
            this.dice[d1].set(value1);
        } else if ( value1 != value2 ) {
            this.dice[d1].set(value1);
            this.dice[d2].set(value2);
        } else {
            for ( let d = 0; d < 4; d++ ) {
                this.dice[d].set(value1);
            }
        }
        
        const modified = this.check_disable();
        const dice_values = this.get();
        this.clear();
        /*
        console.log("RollButton.roll()>"
                    + `dice_value=${JSON.stringify(dice_values)}`);
        */
        this.emit_dice(dice_values, true, true);
        
        return dice_values;
    } // RollButton.roll()

    /**
     * @param {number[]} dice
     * @param {boolean} roll
     * @param {boolean} add_hist
     */
    emit_dice(dice, roll=false, add_hist=false) {
        emit_msg("dice", { player: this.player,
                           dice: dice,
                           roll: roll }, add_hist);
    } // RollButton.emit_dice

    /**
     * @param {boolean} emit
     * @param {boolean} add_hist
     */
    clear(emit=false, add_hist=false) {
        // console.log(`RollButton.clear(emit=${emit})`);

        this.dice_active = false;
        for ( let d=0; d < 4; d++ ) {
            this.dice[d].clear();
        }

        if ( emit ) {
            emit_msg("dice", { player: this.player,
                               dice: [0, 0, 0, 0],
                               roll: false }, add_hist);
        }
        return [];
    } // RollButton.clear()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        console.log(`RollButton.on_mouse_down_xy>player=${this.player}`);

        if ( ! this.board.cube.accepted ) {
            return;
        }

        this.off();

        this.roll();

        if ( this.another().dice_active ) {
            console.log(`settimeout`);
            const click_dice = this.dice[0].on_mouse_down_xy.bind(this);
            setTimeout(click_dice, 2000);
        }
    } // RollButton.on_mouse_down_xy()
} // class RollButton

/**
 *
 */
class PassButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);
    } // PassButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        console.log(`PassButton.on_mouse_down_xy>player=${this.player}`);

        this.off();
        this.board.player_clock[this.player].change_turn();
        this.board.emit_turn(1 - this.player, -1, true);
    } // PassButton.on_mouse_down_xy()
} // class PassButton

/**
 *
 */
class ResignBannerButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);
    } // ResignBannerButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        console.log(`WinButton.on_mouse_down>player=${this.player}`);
    } // ResignBannerButton.on_mouse_down_xy()
} // class ResignBannerButton

/**
 *
 */
class WinButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);
    } // WinButton.constructor()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        console.log(`WinButton.on_mouse_down>player=${this.player}`);
    } // WinButton.on_mouse_down_xy()
} // class WinButton

/**
 *
 */
class Dice extends PlayerItem {
    constructor(id, board, player, x1, y1, file_prefix) {
        super(id, board, player, x1, y1, 0);
        // console.log(`Dice> (x1,y1)=(${x1},${y1})`);
        this.file_prefix = file_prefix;

        [this.x1, this.y1] = [x1, y1];

        const offset0 = 5;
        
        if ( this.player == 0 ) {
            this.x0 = this.board.w - this.w / 2 - offset0;
            this.y0 = this.board.h - this.h / 2 - offset0;
        } else {
            this.x0 = this.w / 2 + offset0;
            this.y0 = this.h / 2 + offset0;
        }

        this.deg = 0;

        /**
         * ダイスの値
         * @type {number}
         *    0,10: 画面に表示されない
         *    1- 6: 有効な値
         *   11-16: 使えない(使い終わった)状態：暗くなる
         */
        this.value = 0;

        this.image_el = this.el.firstElementChild;

        // this.el.hidden = true;
        this.el.style.backgroundColor = "#000";
        this.el.style.cursor = "pointer";

        this.move0();
    } // Dice.constructor()

    /**
     *
     */
    enable() {
        this.value = this.value % 10;
        this.image_el.style.opacity = 1.0;
    } // Dice.enable()

    /**
     *
     */
    disable() {
        this.value = this.value % 10 + 10;
        this.image_el.style.opacity = 0.5;
    } // Dice.disable()

    /**
     *
     */
    get_filename(val) {
        val %= 10;
        return this.image_dir + this.file_prefix + val + this.file_suffix;
    } // Dice.get_filename()

    /**
     * 
     */
    clear() {
        this.set(0);
    } // Dice.clear()

    /**
     * 
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
        this.set_z(0);
        super.move(this.x1, this.y1, true, sec);
        this.rotate(deg, true, sec);
    } // Dice.move1()

    /**
     * @param {number} val - dice number 1-6:active, 11-16:inactive, 0:no dice
     * @param {boolean} [roll_flag=false]
     */
    set(val, roll_flag=false) {
        // console.log(`Dice.set(val=${val},roll_flag=${roll_flag})>`);
        this.value = val;

        this.enable();

        if (val % 10 < 1) {
            this.move0();
            return;
        }

        if (val > 10) {
            this.disable();
        }

        this.el.children[0].src = this.get_filename(val % 10);

        if ( roll_flag ) {
            this.deg = Math.floor(Math.random() * 720 - 360);
            this.move1(this.deg, 0.5);
        } else {
            this.move1(this.deg, 0);
        }
    } // Dice.set()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down_xy(x, y) {
        console.log(`Dice.on_mouse_down_xy(${x},${y})`);

        const roll_btn = this.board.roll_btn[this.player];
        const roll_btn1 = this.board.roll_btn[1-this.player];

        if ( this.board.free_move ) {

            if ( this.value < 1 ) {
                return false;
            }
            if ( this.value > 6 ) {
                this.set(this.value % 10);
                roll_btn.emit_dice(roll_btn.get(), false, true);
                return false;
            }
            let val = this.value + 1;
            if ( val > 6 ) {
                val = 1;
            }
            this.set(val);
            roll_btn.emit_dice(roll_btn.get(), false, true);
            return false;
        }

        if ( this.board.turn < 0 ) {
            console.log(
                `Dice.on_mouse_down_xy>turn=${this.board.turn} .. ignored`);
            return false;
        }

        if ( this.board.turn >= 2 ) {
            console.log(`Dice.on_mouse_down_xy>turn=${this.board.turn}`);
            // Opening roll
            if ( ! roll_btn1.dice_active ) {
                return false;
            }

            // 双方が振った後、数値が大きい方が先手
            const d0 = roll_btn.get_active_dice()[0];
            const d1 = roll_btn1.get_active_dice()[0];

            if ( d0 > d1 ) {
                roll_btn1.clear(true, false);
                roll_btn.emit_dice([d0, 0, 0, d1], false);
                this.board.emit_turn(this.player, -1, true);
                return false;
            }
            if ( d0 < d1 ) {
                roll_btn.clear(true, false);
                roll_btn1.emit_dice([d0, 0, 0, d1], false);
                this.board.emit_turn(1-this.player, -1, true);
                return false;
            }

            // 同じ目だった場合は、もう一度
            roll_btn.clear(true, false);
            roll_btn1.clear(true, false);
            this.board.emit_turn(2, -1, true);
            return false;
        }

        if ( roll_btn.get_active_dice().length > 0 ) {
            return false;
        }

        roll_btn.clear(true, false);

        this.board.player_clock[this.player].change_turn();
        this.board.emit_turn(1 - this.player, -1, true);

        return false;
    } // Dice.on_mouse_down_xy()
} // class Dice

/**
 *
 */
class Checker extends PlayerItem {
    /**
     * @param {string} id - div tag id
     * @param {number} player - 0 or 1
     * @param {Board} board - board object
     */
    constructor(id, board, player) {
        super(id, board, player, 0, 0, 0);

        [this.src_x, this.src_y] = [this.x, this.y];
        this.z = 0;
        
        this.el.style.cursor = "pointer";

        this.cur_point = undefined;
    } // Checker.constructor()

    /**
     * @return {number} z座標
     */
    calc_z() {
        let z = 0;

        for (let p=0; p < 2; p++) {
            for (let i=0; i < 15; i++) {
                let ch = this.board.checker[p][i];

                if (ch !== this) {
                    let d = this.distance(ch);
                    if ( d < this.w ) {
                        let z1 = ch.z + 1;
                        z = Math.max(z, z1);
                        // console.log(`Checker.calc_z> d=${d}, z=${z}`);
                    }
                }
            } // for (i)
        } // for (p)

        this.set_z(z);
    } // Checker.calc_z()

    /**
     * calcurate distance
     * @param {Checker} ch - distination checker object
     * @return {number} - distance
     */
    distance(ch) {
        let [dx, dy] = [ch.x - this.x, ch.y - this.y];
        return Math.sqrt(dx * dx + dy * dy);
    } // Checker.distance()
    
    /**
     * @return {number} - pip count
     */
    get_pip() {
        return super.get_pip(this.player, this.cur_point);
    } // Checker.get_pip()

    /**
     * @return {boolean}
     */
    is_last_man() {
        const pip = this.get_pip();
        for (let i=0; i < 15; i++) {
            const pip2 = this.board.checker[this.player][i].get_pip();
            if ( pip2 > pip ) {
                return false;
            }
        } // for(i)
        return true;
    } // Checker.is_last_man()

    /**
     * @return {boolean}
     */
    is_inner() {
        if ( this.player == 0 ) {
            return (this.cur_point <= 6);
        } else {
            return (this.cur_point >= 19 && this.cur_point <= 25);
        }
    } // Checker.is_inner()

    /**
     * 移動に使用するダイスの目の組み合わせを取得する
     *
     * @param {number} player
     * @param {number[]} active_dice
     * @param {number} from_p
     * @param {number} to_p
     * @return {number} - 使用するダイスの目
     *                    0: そこには移動できない
     */
    dice_check(active_dice, from_p, to_p) {
        console.log(`Checker.dice_check(`
                    + `active_dice=${JSON.stringify(active_dice)},`
                    + `from_p=${from_p}, to_p=${to_p}`);

        if ( from_p >= 26 ) {
            // バーから移動の場合の調整
            if ( this.player == 0 ) {
                from_p = 25;
            } else {
                from_p = 0;
            }
        }

        if ( this.player == 1 ) {
            from_p = 25 - from_p;
            to_p = 25 - to_p;
        }
        // console.log(`Checker.dice_check>from_p=${from_p} ==> to_p=${to_p}`);
        
        let diff_p = from_p - to_p;
        console.log(`Checker.dice_check>diff_p=${diff_p}`);

        let dice_vals = [];
        if ( diff_p == active_dice[0] ) {
            dice_vals = [active_dice[0]];
        } else if ( diff_p == active_dice[1] ) {
            dice_vals = [active_dice[1]];
        } else if ( diff_p == active_dice[0] + active_dice[1] ) {
            dice_vals = [active_dice[0], active_dice[1]];
        }

        if ( active_dice.length >= 3 ) {
            let sum_d = active_dice[0] * 3;
            if ( diff_p == sum_d ) {
                dice_vals = [active_dice[0], active_dice[0], active_dice[0]];
            }
            if ( active_dice.length == 4 ) {
                sum_d += active_dice[0];
                if ( diff_p == sum_d ) {
                    dice_vals = [ active_dice[0], active_dice[0],
                                  active_dice[0], active_dice[0] ];
                }
            }
        }

        if ( dice_vals.length == 0 && to_p == 0 ) {
            // bearing off
            // 移動可能かどうかは、事前に確認済と仮定
            // 該当するダイスが無い場合は、大きい方を使用する。
            dice_vals = [ Math.max(...active_dice) ];
        }

        console.log(
            `Checker.dice_check>dice_vals=${JSON.stringify(dice_vals)}`);
        return dice_vals;
    } // Checker.dice_check()

    /**
     * 元の位置に戻して、移動をキャンセルする
     *
     * @param {Checker} ch
     */
    cancel_move(ch) {
        console.log(`Checker.cancel_move(ch.id=${ch.id})`);
        ch.move(ch.src_x, ch.src_y, true);
        ch.board.moving_checker = undefined;
    } // Checker.cancel_move()

    /**
     * 移動可能なポイントの取得
     *
     * @param {Checker} ch
     * @param {number[]} available_dice
     * @return {number[]} points
     */
    get_available_points(ch, available_dice) {
        console.log(``);
        // T.B.D.
        // see get_dst_points()

        return [];
    } // Checker.get_available_points()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        console.log("Checker.on_mouse_down_xy>"
                    + `this.id=${this.id},(x,y)=${x},${y})`);
        
        if ( ! board.free_move ) {
            // check turn
            if ( this.board.turn >= 2 || this.board.turn < 0 ) {
                return;
            }

            if ( this.board.turn != this.player ) {
                return;
            }

            // check active dices
            const active_dice = this.board.get_active_dice(this.player);
            console.log(`Checker.on_mouse_down_xy>active_dice=${active_dice}`);
            if ( active_dice.length == 0 ) {
                return;
            }

            // ヒットされている場合は、バーのポイントしか動かせない
            const bar_p = this.bar_point(this.player);
            if ( this.board.point[bar_p].checkers.length > 0 ) {
                if ( this.cur_point != bar_p ) {
                    return;
                }
            }

            // 移動可能か確認
            // const dice_vals = this.board.get_active_dice(this.player);
            const dst_p = this.board.get_dst_points(this.player,
                                                    this.cur_point,
                                                    active_dice);
            console.log(`dst_p=${JSON.stringify(dst_p)}`);
            if ( dst_p.length == 0 ) {
                return;
            }
        } // if (!free_move)

        // クリックされたポイントの先端のチェッカーに持ち換える
        let ch = this;
        if ( ch.cur_point !== undefined ) {
            ch = this.board.point[ch.cur_point].checkers.slice(-1)[0];
            console.log(`Checker.on_mouse_down_xy>ch.id=${ch.id}`);
        }
        this.board.moving_checker = ch;

        [ch.src_x, ch.src_y] = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    } // Checker.on_mouse_down_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_up_xy(x, y) {
        console.log("Checker.on_mouse_up_xy>"
                    + `this.id=${this.id},(x,y)=(${x},${y})`);
        const ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }

        console.log(`Checker.on_mouse_up_xy>ch.id=${ch.id}`);

        ch.move(x, y, true);

        let dice_value = [];

        let dst_p = ch.board.chpos2point(ch);
        console.log(`Checker.on_mouse_up_xy>dst_p=${dst_p}`);

        if ( board.free_move ) {
            ch.board.emit_put_checker(ch, dst_p, true);
            this.board.moving_checker = undefined;
            return;
        }

        let active_dice = this.board.get_active_dice(ch.player);

        // 降順にsort
        const koujun = (a, b) => {
            return b - a;
        };
        active_dice.sort(koujun);
        console.log("Checker.on_mouse_up_xy>"
                    + `active_dice=${JSON.stringify(active_dice)}`);

        let available_p = this.board.get_dst_points(ch.player,
                                                    ch.cur_point,
                                                    active_dice);
        console.log("Checker.on_mouse_up_xy>"
                    + `available_p=${JSON.stringify(available_p)}`);

        if ( dst_p == ch.cur_point ) {
            //
            // ワンタッチでのムーブ
            //
            if ( available_p.length == 0 ) {
                this.cancel_move(ch);
                return;
            }

            dst_p = available_p[0];
        }
        
        console.log("Checker.on_mouse_up_xy>"
                    + `dst_p=${JSON.stringify(dst_p)}`);

        if ( available_p.indexOf(dst_p) < 0 ) {
            this.cancel_move(ch);
            return;
        }

        /**
         * 移動先ポイントの状態に応じた判定
         */
        let hit_ch = undefined;
        let checkers = ch.board.point[dst_p].checkers;

        if ( checkers.length == 1 && checkers[0].player != ch.player ) {
            hit_ch = checkers[0];
            console.log(`Checker.on_mouse_up_xy>hit_ch.id=${hit_ch.id}`);
        }
        
        /**
         * 移動OK. 以降、移動後の処理
         */
        if ( hit_ch !== undefined ) {
            // hit
            console.log(`Checker.on_mouse_up_xy>hit_ch.id=${hit_ch.id}`);

            let bar_p = 26;
            if ( hit_ch.player == 1 ) {
                bar_p = 27;
            }

            ch.board.emit_put_checker(hit_ch, bar_p, false);
            /**
             * 上でemitしたメッセージ受信後に、put_checker()が 実行されるが、
             * この後のダイスチェックなどのために、先行して、
             * ここで put_checker() を実行する。
             * このため、ここでは効果音は鳴らさない。
             */
            ch.board.put_checker(hit_ch, bar_p, 0.2, false);
        }

        // move_checker
        ch.board.emit_put_checker(ch, dst_p, false);
        
        // 使ったダイスの組み合わせを取得
        dice_value = this.dice_check(active_dice, ch.cur_point, dst_p);
        console.log(`Checker.on_mouse_up_xy>`
                    + `dice_value=${JSON.stringify(dice_value)}`);

        const roll_btn = this.board.roll_btn[ch.player];
        
        // 使ったダイスを使用済みする
        for (let d1 of dice_value) {
            for (let d of roll_btn.dice ) {
                if ( d1 == d.value ) {
                    d.disable();
                    break;
                }
            }
        } // for(d)

        /**
         * 上でemitしたメッセージ受信後に、put_checker()が 実行されるが、
         * この後のダイスチェックなどのために、先行して、
         * ここで put_checker() を実行する。
         * このため、ここでは効果音は鳴らさない。
         */
        ch.board.put_checker(ch, dst_p, 0.2, false);

        roll_btn.check_disable();

        dice_value = roll_btn.get();
        console.log(`Checker.on_mouse_up_xy>`
                    + `dice_value=${JSON.stringify(dice_value)}`);

        const score = this.board.winner_is(ch.player);
        if ( score > 0 ) {
            emit_msg("dice", { player: this.player,
                               dice: dice_value,
                               roll: false }, false);
            this.board.emit_turn(-1, -1, false);
            this.board.score[ch.player].up(score);
        } else {
            emit_msg("dice", { player: this.player,
                               dice: dice_value,
                               roll: false }, true);
        }

        ch.board.moving_checker = undefined;
    } // Checker.on_mouse_up_xy()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        let ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }
        ch.move(x, y, true);
    } // Checker.on_mouse_move_xy()
} // class Checker

/**
 *           bx[0]                  bx[3]                 bx[5]
 *           |   bx[1]              |   bx[4]             |bx[6]
 *         x |   |bx[2]             |   |                 ||   bx[7]
 *         | |   ||                 |   |                 ||   |
 *         v |   vv                 |   |                 ||   |
 *     y ->+-|----------------------|---|-----------------||---|-
 *         | v     13 14 15 16 17 18v   v19 20 21 22 23 24vv   v |
 * by[0] --->+----------------------+---+-----------------++---+ |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 * by[1] --->+---||p0          p1   |   |p1 tx          p0||   | |
 * by[2] --->+---||p0          p1   |27 |p1 |             ||25 | |
 *         | |   ||p0               |   |p1 |             ||   | |
 * by[3] --->+---||p0               |   |p1 v             ||   | |
 * by[4] --->+---||         ty ------------>+------       ||   | |
 *         | |   ||                 |---|   |      |      ||---| |
 * by[5] --->+---||                 |   |    ------       ||   | |
 * by[6] --->+---||p1               |   |p0               ||   | |
 *         | |   ||p1               |   |p0               ||   | |
 * by[7] --->+---||p1          p0   |26 |p0               || 0 | |
 * by[8] --->+---||p1          p0   |   |p0             p1||   | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 * by[9] --->+-------------------------------------------------  |
 *         |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *          ----------------------------------------------------- 
 *
 */
class Board extends BgImage {
    /*
     * @param {string} id - div tag id
     * @param {number} x - 
     * @param {number} y - 
     * @param {number} player - 0 or 1
     * @param {io.connect} ws - websocket
     */
    constructor(id, x, y, ws) {
        console.log(`Board(id=${id},x=${x},y=${y})`);
        super(id, x, y, 0, undefined, undefined);

        this.ws = ws;

        this.free_move = false;
        this.disp_pip = false;
        
        this.bx = [27, 81, 108, 432, 495, 819, 846, 900];
        this.by = [30, 83, 124, 208, 249, 302, 243, 425, 466, 520];

        this.resign = -1;

        // server ID
        this.svr_id = document.getElementById("server-id").innerHTML;
        console.log(`Board> svr_id=${this.svr_id}`);

        // Cookie
        this.cookie = new CookieBase();
        this.cookie_board_player = `board${this.svr_id}_player`;
        this.cookie_sound = `board${this.svr_id}_sound`;

        // sound setup
        this.el_sound = document.getElementById("sound-switch");
        this.sound = false;
        this.load_sound_switch();
        this.sound_turn_change = new SoundBase(this, SOUND_TURN_CHANGE);
        this.sound_roll = new SoundBase(this, SOUND_ROLL);
        this.sound_put = new SoundBase(this, SOUND_PUT);
        this.sound_hit = new SoundBase(this, SOUND_HIT);

        // Player
        if ( this.load_player() === undefined ) {
            this.set_player(0);
        }

        this.score = [0, 0];
        
        this.turn = -1;

        this.gameinfo = undefined;

        // Title
        const name_el = document.getElementById("name");
        const ver_el = document.getElementById("version");
        ver_el.innerHTML = `<strong>Client</strong> Ver. ${VERSION}`;

        // Buttons
        const bx0 = this.x + this.w + 30;

        this.button_resign = new ResignButton(
            "button-resign", this, bx0, 10);

        this.button_back = new BackButton(
            "button-back", this, bx0, this.h);
        this.button_back.move(bx0, this.y + this.h - this.button_back.h - 50);

        this.button_fwd = new FwdButton(
            "button-fwd",
            this, bx0,
            this.button_back.y - this.button_back.h - 40);
        
        this.button_inverse = new InverseButton(
            "button-inverse", this, bx0, 0);
        this.button_inverse.move(
            bx0, this.y + this.h / 2 - this.button_inverse.h);
        
        // <body>
        let body_el = document.body;
        body_el.style.width = (this.button_back.x
                               + this.button_back.w + 50) + "px";
        body_el.style.height = (this.y + this.h + 10) + "px";

        // PlayerScore
        let [sw, sh] = [23, 53];

        let sx1 = this.bx[0] + 3;
        let sx2 = sx1 + sw + 2;

        let sy_offset = 27;
        let sy1 = this.by[2] + sy_offset;
        let sy2 = this.by[7] - sy_offset - sh;

        let psx = sx1 + 3;
        let psy1 = sy1 + sh - 4;
        let psy2 = sy2 + sh - 4;

        this.score = [];
        this.score[1] = new PlayerScore("p1score", this, 1, psx, psy1, -90);
        this.score[0] = new PlayerScore("p0score", this, 0, psx, psy2, -90);

        // Score buttons
        this.score_btn = [{}, {}];

        this.score_btn[1].up = new ScoreButton(
            "score_up1",   this, 0, sx1, sy1, sw, sh, this.score[1], +1);
        this.score_btn[1].down = new ScoreButton(
            "score_down1", this, 0, sx2, sy1, sw, sh, this.score[1], -1);

        this.score_btn[0].up = new ScoreButton(
            "score_up0",   this, 0, sx1, sy2, sw, sh,
            this.score[0], +1);
        this.score_btn[0].down = new ScoreButton(
            "score_down0", this, 0, sx2, sy2, sw, sh,
            this.score[0], -1);

        // PlayerName
        this.player_name = [];
        this.player_name.push(new PlayerName(
            "p0name", this, 0, this.bx[3], this.by[9]+2,   0));
        this.player_name.push(new PlayerName(
            "p1name", this, 1, this.bx[4], this.by[0]-2, 180));

        for (let p=0; p < 2; p++) {
            this.player_name[p].set("");
            this.player_name[p].on();
        }

        // Clock
        this.clock_limit = new ClockLimit(this.board);

        this.player_clock = [];
        this.player_clock.push(new PlayerClock(
            "p0clock", this, 0, this.bx[3] + 240, this.by[9]+3,   0));
        this.player_clock.push(new PlayerClock(
            "p1clock", this, 1, this.bx[4] - 240, this.by[0]-3, 180));

        this.clock_sw = false;
        this.apply_clock_sw();
        /*
        this.player_clock[0].update();
        this.player_clock[1].update();
        */

        const update_clock = () => {
            this.player_clock[0].update();
            this.player_clock[1].update();
        };
        setInterval(update_clock, 200);

        // Pip count XXX
        this.pip = [];
        let py_offset = 14;
        this.pip.push(new PlayerPipCount("p0pip", this, 0,
                                         (this.bx[6] + this.bx[7]) / 2,
                                         this.h - py_offset,
                                         0));
        this.pip.push(new PlayerPipCount("p1pip", this, 1,
                                         (this.bx[6] + this.bx[7]) / 2,
                                         py_offset,
                                         180));

        // Checkers
        this.checker = [Array(15), Array(15)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + player + ("0" + i).slice(-2);
                this.checker[player][i] = new Checker(c_id, this, player);
            } // for(i)
        } // for(player)

        this.moving_checker = undefined;

        // Cube
        this.cube = new Cube("cube", this);

        // Points
        this.point = [];
        
        for ( let p=0; p < 28; p++ ) {
            let cn = 5;
            let pw = (this.bx[3] - this.bx[2]) / 6;
            let ph = this.h / 2 - this.by[0];
            let x0, y0, xn, x;

            if ( p == 0 ) {
                x0 = this.bx[6];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 1 && p <= 6 ) {
                x0 = this.bx[4];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                xn = 6 - p;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 7 && p <= 12 ) {
                x0 = this.bx[2];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                xn = 12 - p;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 13 && p <= 18 ) {
                x0 = this.bx[2];
                y0 = this.by[0];
                xn = p - 13;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p >= 19 && p <= 24 ) {
                x0 = this.bx[4];
                y0 = this.by[0];
                xn = p - 19;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 25 ) {
                x0 = this.bx[6];
                y0 = this.by[0];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 26 ) {
                x0 = this.bx[3];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 27 ) {
                x0 = this.bx[3];
                y0 = this.by[0];
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, -1, cn));
            }
        } // for (p)

        // RollButton
        const bx1 = 160;

        this.roll_btn = [];
        this.roll_btn.push(new RollButton(
            "rollbutton0", this, 0, this.bx[4] + bx1, this.h / 2));
        this.roll_btn.push(new RollButton(
            "rollbutton1", this, 1, this.bx[3] - bx1, this.h / 2));

        const dy1 = 200;

        // ResignBannerButton
        this.resign_banner_btn = [];
        this.resign_banner_btn.push(new ResignBannerButton(
            "resignbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1));
        this.resign_banner_btn.push(new ResignBannerButton(
            "resignbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1));

        // PassButton
        this.pass_btn = [];
        this.pass_btn.push(new PassButton(
            "passbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1));
        this.pass_btn.push(new PassButton(
            "passbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1));

        // WinButton
        this.win_btn = [];
        this.win_btn.push(new WinButton(
            "winbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1));
        this.win_btn.push(new WinButton(
            "winbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1));

        // Dice histogram
        this.dice_histogram = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
        console.log("Board.constructor>"
                    + `dice_histogram=${JSON.stringify(this.dice_histogram)}`);

        if ( this.player == 1 ) {
            this.player = 0;
            this.inverse(0);
        }
    } // Board.constructor()

    /**
     * 
     */
    clock_on() {
        this.clock_sw = true;
    }

    /**
     * 
     */
    clock_off() {
        this.clock_sw = false;
    }

    /**
     * @return {boolean} sound
     */
    load_sound_switch() {
        console.log("Board.load_sound_switch>"
                    + `cookie_sound=${this.cookie_sound}`);

        const s = this.cookie.get(this.cookie_sound);
        // console.log(`Board.load_sound_switch>s=${s}`);
        if ( s === undefined ) {
            this.sound = true;
        } else {
            this.sound = JSON.parse(s);
        }
        console.log(`Board.load_sound_switch>sound=${this.sound}`);
        this.el_sound.checked = this.sound;
        this.apply_sound_switch();

        return this.sound;
    } // Board.load_sound_switch()
        
    /**
     * @return {boolean} sound
     */
    apply_sound_switch() {
        console.log("Board.apply_sound_switch>"
                    + `cookie_sound=${this.cookie_sound}`);
        console.log(`GlobalSoundSwitch=${GlobalSoundSwitch}`);

        this.sound = document.getElementById("sound-switch").checked;
        if ( ! GlobalSoundSwitch ) {
            this.sound = false;
        }
        console.log(`Board.apply_sound_switch>sound=${this.sound}`);

        this.cookie.set(this.cookie_sound, this.sound);
        this.el_sound.checked = this.sound;
        return this.sound;
    } // Board.apply_sound_switch()

    /**
     * @return {boolean} free_move
     */
    apply_free_move() {
        console.log(`Board.apply_free_move()`);

        this.free_move = document.getElementById("free-move").checked;
        console.log(`Board.apply_free_move>free_move=${this.free_move}`);

        return this.free_move;
    } // Board.apply_free_move()

    /**
     * @return {boolean} disp_pip
     */
    apply_disp_pip() {
        console.log(`Board.apply_disp_pip()`);

        this.disp_pip = document.getElementById("disp-pip").checked;
        console.log(`Board.apply_disp_pip>disp_pip=${this.disp_pip}`);

        if ( this.disp_pip ) {
            this.pip[0].on();
            this.pip[1].on();
        } else {
            this.pip[0].off();
            this.pip[1].off();
        }

        return this.disp_pip;
    } // Board.apply_disp_pip()

    /**
     * @param {boolean} value
     */
    set_clock_switch(value) {
        console.log(`Board.set_clock_switch(${value})`);
        document.getElementById("clock_sw").checked = value;
        this.clock_sw = value;

        if ( this.clock_sw ) {
            this.player_clock[0].on();
            this.player_clock[1].on();
        } else {
            this.player_clock[0].off();
            this.player_clock[1].off();
        }
    } // Board.set_clock_switch()

    /**
     *
     */
    apply_clock_sw() {
        this.clock_sw = document.getElementById("clock_sw").checked;
        emit_msg("set_clock_switch", { switch: this.clock_sw }, false);
        this.player_clock[0].emit_stop();
        this.player_clock[1].emit_stop();
    } // Board.apply_clock_sw()
    
    /**
     *
     */
    apply_clock_limit(index) {
        const id = `clock_limit${index}`;
        const value = document.getElementById(id).value;
        console.log(`Board.apply_clock_limit(${index}):value=${value}`);
        let limit = parseFloat(value);
        if ( index == 0 ) {
            limit *= 60;
        }
        console.log(`Board.apply_clock_limit(${index}):limit=${limit}`);

        this.player_clock[0].emit_stop();
        this.player_clock[1].emit_stop();

        this.clock_limit.emit_set(index, limit, true);
    } // Board.apply_clock_limit()

    /**
     * load player number from cookie
     */
    load_player() {
        this.player = this.cookie.get(this.cookie_board_player);
        return this.player;
    } // Board.load_player()

    /**
     * set player number and save to cookie
     *
     * @param {number} player
     */
    set_player(player) {
        this.player = player;
        this.cookie.set(this.cookie_board_player, this.player);
    } // board.set_player()

    /**
     * search checker object by checker id
     *
     * @param {string} ch_id - checker id
     * @return {Checker | undefined} - checker object or undefined
     */
    search_checker(ch_id) {
        console.log(`Board.search_checker(ch_id=${ch_id})`);
        let player = parseInt(ch_id[1]);

        for (let i=0; i < 15; i++) {
            let ch = this.checker[player][i];
            if ( ch.id == ch_id ) {
                return ch;
            }
        }
        return undefined;
    } // Board.search_checker()

    /**
     * @param {number} turn
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     * @param {boolean} add_hist
     */
    emit_turn(turn, resign=-1, add_hist=false) {
        console.log(`Boad.emit_turn(turn=${turn},resign=${resign},add_hist=${add_hist})`);
        // this.turn = turn;
        emit_msg("set_turn", { turn: turn,
                               resign: resign }, add_hist);
    } // Board.emit_turn()

    /**
     * ターンを設定
     *
     * @param {number} turn
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     * @param {number} resign
     * @param {boolean} sound - sound switch
     */
    set_turn(turn, resign=-1, sound=true) {
        const prev_turn = this.turn;
        /*
        console.log(`Board.set_turn(`
                    + `turn=${turn},`
                    + `resign=${resign})>prev_turn=${prev_turn}`);
        */
        this.turn = turn;
        this.resign = resign;
        
        for (let p=0; p < 2; p++) {
            this.roll_btn[p].off();
            this.pass_btn[p].off();
            this.win_btn[p].off();
            this.resign_banner_btn[p].off();
            this.player_name[p].off();
        } // for(p)

        if ( turn < 0 ) {
            let score = 0;
            let winner = -1;

            if ( resign >= 0 ) {
                winner = 1 - resign;
                this.resign_banner_btn[resign].on();
            } else {
                for (let p=0; p < 2; p++) {
                    score = this.winner_is(p);
                    if ( score ) {
                        winner = p;
                    }
                } // for(p)
            }

            if ( winner >= 0 ) {
                console.log(`Board.set_turn>plyaer${winner} win ${score}!`);
                this.player_clock[winner].emit_stop();
                this.win_btn[winner].on();
                this.player_name[winner].on();
            }
            return;
        }

        if ( turn >= 2 ) {
            this.roll_btn[0].update();
            this.roll_btn[1].update();

            this.player_name[0].on();
            this.player_name[1].on();
            return;
        }
            
        // turn == 0 or 1
        if ( turn != prev_turn && sound ) {
            let playpromise = board.sound_turn_change.play();
        }

        if ( this.closeout(1 - this.turn) ) {
            this.pass_btn[turn].on();
        } else {
            this.roll_btn[turn].update();
        }

        // player name --> on
        this.player_name[turn].on();
        
        console.log(`Board.set_turn():turn=${turn}`);
    } // Board.set_turn()

    /**
     * calcurate pip count
     *
     * @param {number} player
     */
    pip_count(player) {
        let count = 0;
        for (let ch of this.checker[player]) {
            count += ch.get_pip();
            // console.log(`count=${count}`);
            if ( isNaN(count) ) {
                count = undefined;
                break;
            }
        } // for(ch)
        // console.log(`Board.pip_count>count=${count}`);

        this.pip[player].set(count);
        return count;
    } // Board.pip_count()

    /**
     * plyaer の勝利が確定していることが前提で、
     * ノーマル/ギャモン/バックギャモン の判定
     * Cubeのポイントも掛けた結果を返す
     *
     * @param {number} player
     * @return {number} point - 1:normal, 2:gammon, 3:backgammon
     */
    calc_gammon(player) {
        let cube_val = this.cube.value;
        if ( ! this.cube.accepted ) {
            // ダブルを掛けられて、受理してない場合
            cube_val /= 2;
        }

        const g_checkers = this.point[this.goal_point(1 - player)].checkers;
        if ( ! this.cube.accepted || g_checkers.length > 0 ) {
            console.log(`Board.calc_gammon(${player})>${cube_val}`);
            return cube_val;
        }

        let points = [];
        if ( 1 - player == 0 ) {
            points = [19, 20, 21, 22, 23, 24, this.bar_point(0)];
        } else {
            points = [1, 2, 3, 4, 5, 6, this.bar_point(1)];
        }
        for (let p of points) {
            const checkers = this.point[p].checkers;
            if ( checkers.length > 0 && checkers[0].player == 1 - player) {
                // backgammon !
                console.log(`Board.calc_gammon(${player})>p=${p},${cube_val * 3}`);
                return (cube_val * 3);
            }
        } // for (p)

        // gammon !
        console.log(`Board.calc_gammon(${player})>${cube_val*2}`);
        return (cube_val * 2);
    } // Board.calc_gammon()

    /**
     * @param {number} player
     * @return {number} points
     */
    winner_is(player) {
        // console.log(`Board.winner_is>resign=${this.resign}`);
        if ( this.resign == 1 - player ) {
            this.resign = -1;
            return this.calc_gammon(player);
        }

        const pip_count = this.pip_count(player);
        // console.log(`Board.winner_is>pip_count=${pip_count}`);
        if ( pip_count == 0 ) {
            return this.calc_gammon(player);
        }
        return 0;
    } // Board.winner_is()
    
    /**
     * @param {number} player
     * @return {boolean}
     */
    all_inner(player) {
        for (let i=0; i < 15; i++) {
            if ( ! this.checker[player][i].is_inner() ) {
                return false;
            }
        }
        return true;
    } // Board.all_inner()

    /**
     * クローズアウトしている？
     *
     * @param {number} player
     */
    closeout(player) {
        // console.log(`Board.closeout(player=${player})`);
        if ( player != 0 && player != 1 ) {
            return false;
        }
        if (this.point[this.bar_point(1-player)].checkers.length == 0) {
            return false;
        }

        let [from_p, to_p] = [1, 6];
        if ( player == 1 ) {
            [from_p, to_p] = [19, 24];
        }

        for (let p=from_p; p <= to_p; p++) {
            const checkers = this.point[p].checkers;
            if ( checkers.length < 2 ) {
                console.log(`Board.closeout(player=${player}) ==> false`);
                return false;
            }
            if ( checkers[0].player != player ) {
                console.log(`Board.closeout(player=${player}) ==> false`);
                return false;
            }
        }
        console.log(`Board.closeout(player=${player}) ==> true`);
        return true;
    } // Board.closeout()

    /**
     * 使えるダイスを取得
     * @return {number[]}
     */
    get_active_dice(player) {
        return this.roll_btn[player].get_active_dice();
    } // Board.get_active_dice

    /**
     * 移動可能なポイントの取得
     * @param {number} player
     * @param {number} src_p
     * @param {number[]} dice_vals
     * @return {number[]} - distination points
     */
    get_dst_points(player, src_p, dice_vals) {
        console.log(`Board.get_dst_points(`
                    + `player=${player},src_p=${src_p},`
                    + `dice_vals=${JSON.stringify(dice_vals)}`
                    + `)`);

        let dst_p = [];

        if ( dice_vals.length == 0 ) {
            return [];
        }

        for (let dice_val of dice_vals) {
            const dst_p1 = this.get_dst_point1(player, src_p, dice_val);
            if ( dst_p1 === undefined ) {
                continue;
            }
            dst_p.push(dst_p1);
        } // for(dice_val)

        // console.log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);

        if ( dst_p.length == 0 ) {
            return [];
        }

        // 重複削除
        let dst_p2 = [];
        let prev_p = undefined;
        for ( let p of dst_p ) {
            if ( p != prev_p ) {
                dst_p2.push(p);
                prev_p = p;
            }
        }
        dst_p = dst_p2;
        // console.log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);

        let dst_p1 = undefined;
        let dice_val = undefined;

        if ( dice_vals.length >= 2 ) {
            // サイコロの目を足した場合も確認
            dice_val = dice_vals[0] + dice_vals[1];
            console.log(`Board.get_dst_points>dice_val=${dice_val}`);
            dst_p1 = this.get_dst_point1(player, src_p, dice_val);
            if ( dst_p1 !== undefined ) {
                dst_p.push(dst_p1);
            }

            if ( dice_vals.length >= 3 && dst_p1 !== undefined ) {
                // ぞろ目の場合
                dice_val += dice_vals[2];
                console.log(`Board.get_dst_points>dice_val=${dice_val}`);
                dst_p1 = this.get_dst_point1(player, src_p, dice_val);
                if ( dst_p1 !== undefined ) {
                    dst_p.push(dst_p1);
                }
                 
                if ( dice_vals.length == 4 && dst_p1 !== undefined ) {
                    dice_val += dice_vals[3];
                    console.log(`Board.get_dst_points>dice_val=${dice_val}`);
                    dst_p1 = this.get_dst_point1(player, src_p, dice_val);
                    if ( dst_p1 !== undefined ) {
                        dst_p.push(dst_p1);
                    }
                }
            }
        }

        console.log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);
        return dst_p;
    } // Board.get_dst_points()

    /**
     *
     */
    get_dst_point1(player, src_p, dice_val) {
        let dst_p1 = this.calc_dst_point(player, src_p, dice_val);
        // console.log(`Board.get_dst_point1>dst_p1=${dst_p1}`);

        let checkers;
        
        if ( player == 0 && dst_p1 <= 0 ) {
            if ( ! this.all_inner(player) ) {
                return undefined;
            }
            // すべてインナー
            if ( dst_p1 < 0 ) {
                // src_p以降のポイントにCheckerが存在するか確認
                for (let p=src_p+1; p <= 6; p++) {
                    checkers = this.point[p].checkers;
                    if ( checkers.length > 0 && checkers[0].player == player) {
                        return undefined;
                    }
                } // for(p)
                dst_p1 = 0;
            }
        }
        if ( player == 1 && dst_p1 >= 25 ) {
            if ( ! this.all_inner(player) ) {
                return undefined;
            }
            // すべてインナー
            if ( dst_p1 > 25 ) {
                // src_p以降のポイントにCheckerが存在するか確認
                for (let p=src_p-1; p >= 19; p--) {
                    checkers = this.point[p].checkers;
                    if ( checkers.length > 0 && checkers[0].player == player) {
                        return undefined;
                    }
                } // for(p)
                dst_p1 = 25;
            }
        }

        checkers = this.point[dst_p1].checkers;
        if ( checkers.length >= 2 && checkers[0].player != player ) {
            return undefined;
        }

        return dst_p1;
    }

    /**
     * generate game information
     * @return {gameinfo} - game information object
     */
    gen_gameinfo() {
        console.log(`Board.gen_gameinfo()`);
        
        let cube_side = this.cube.player;
        if ( cube_side === undefined ) {
            cube_side = -1;
        }
        
        let point = [];
        for (let i=0; i < this.point.length; i++) {
            let ch = this.point[i].checkers;
            point[i] = Array(ch.length);
            if ( ch.length > 0 ) {
                point[i].fill(ch[0].player);
            }
        } // for(i)
        console.log(`point=${JSON.stringify(point)}`);

        let gameinfo = {
            server_version: this.gameinfo.server_version,
            game_num: this.gameinfo.game_num,
            match_score: this.gameinfo.match_score,
            score: this.gameinfo.score,
            turn: this.turn,
            resign: this.resign,
            clock_limit: this.gameinfo.clock_limit,
            board: {
                playername: this.gameinfo.board.player_name,
                clock: this.gameinfo.board.clock,
                cube: {
                    side: cube_side,
                    value: this.cube.value,
                    accepted: this.cube.accepted
                },
                dice: [
                    this.roll_btn[0].get(),
                    this.roll_btn[1].get()
                ],
                point: point
            }
        };
        
        return gameinfo;
    } // Board.gen_gameinfo()

    /**
     * write game information to file
     */
    write_gameinfo() {
        console.log(`Boad.write_gameinfo()`);

        const gameinfo_json = JSON.stringify(this.gen_gameinfo());
        console.log(`Board.write_gameinfo():gameinfo_json=${gameinfo_json}`);

        const blob_gameinfo = new Blob([gameinfo_json],
                                       {"type": "application/json"});
        document.getElementById("write_gameinfo").download = GAMEINFO_FILE;
        document.getElementById("write_gameinfo").href
            = window.URL.createObjectURL(blob_gameinfo);
    } // Board.write_gameinfo()

    /**
     *
     */
    read_gameinfo() {
        let file = document.getElementById("read_gameinfo").files[0];
        console.log(`Board.read_gameinfo>file.name=${file.name}`);

        const reader = new FileReader();
        reader.onloadend = (e) => {
            const gameinfo = JSON.parse(e.target.result);
            console.log(`Board.read_gameinfo>gameinfo=${gameinfo}`);
            this.load_gameinfo(gameinfo);
            emit_msg("set_gameinfo", gameinfo);
        };
        reader.readAsText(file);
    } // Board.read_gameinfo()

    /**
     * load all game information
     * @param {Object} gameinfo - game information object
     */
    load_gameinfo(gameinfo, sec=2, history_flag=false) {
        /*
        console.log(`Board.load_gameinfo(`
                    + `gameinfo=${JSON.stringify(gameinfo)},sec=${sec})`);
        */
        this.gameinfo = gameinfo;
        
        // escape checkers
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let ch = this.checker[player][i];
                ch.el.hidden = true;
                ch.cur_point = undefined;
                ch.move(0, 0, false, 0);
            }
        }

        // clear points
        // console.log(`Board.load_gameinfo> clear points`);
        for (let i=0; i < this.point.length; i++) {
            this.point[i].checkers = [];
        } // for(i)

        // put checkers
        const ch_point = gameinfo.board.checker;
        /*
        console.log(
            `Board.load_gameinfo> ch_point=${JSON.stringify(ch_point)}`);
        */
        for (let i=0; i < 15; i++) {
            for (let p=0; p < 2; p++) {
                for (let c=0; c < 15; c++) {
                    const ch = this.checker[p][c];
                    if ( ch_point[p][c][1] == i ) {
                        this.put_checker(ch, ch_point[p][c][0], sec, false);
                        ch.el.hidden = false;
                    }
                } // for (c)
            } // for (p)
        } // for(i)

        // score
        this.score[0].set(gameinfo.score[0]);
        this.score[1].set(gameinfo.score[1]);
        console.log(`Board.load_gameinfo>score[]=[`
                    + `${this.score[0].score},`
                    + `${this.score[1].score}]`);

        // resign
        this.resign = gameinfo.resign;

        // clock
        console.log(`clock_limit=${JSON.stringify(gameinfo.clock_limit)}`);
        this.clock_limit.set(0, gameinfo.clock_limit[0]);
        this.clock_limit.set(1, gameinfo.clock_limit[1]);

        if ( ! history_flag ) {
            this.player_clock[0].stop();
            this.player_clock[1].stop();
            this.player_clock[0].set(gameinfo.board.clock[0]);
            this.player_clock[1].set(gameinfo.board.clock[1]);
        }

        // player name
        this.player_name[0].set(gameinfo.board.playername[0]);
        this.player_name[1].set(gameinfo.board.playername[1]);

        // cube
        const c = gameinfo.board.cube;
        // console.log(`Board.load_gameinfo> cube=${JSON.stringify(c)}`);
        this.cube.set(c.value, c.side, c.accepted, false);

        // dice
        const d = gameinfo.board.dice;
        // console.log(`Board.load_gameinfo> dice=${JSON.stringify(d)}`);
        this.roll_btn[0].set(d[0], false);
        this.roll_btn[1].set(d[1], false);

        // 注：順番が重要
        //
        // turn
        console.log(`Board.load_gameinfo>turn=${gameinfo.turn}`);
        this.set_turn(gameinfo.turn, this.resign, false);

        // pip count
        this.pip_count(0);
        this.pip_count(1);
    } // Board.load_gameinfo()

    /**
     * @param {number} sec
     */
    inverse(sec) {
        console.log(`Board.inverse(sec=${sec})`);
        
        this.set_player(1 - this.player);
        
        if ( this.player == 0 ) {
            this.rotate(0, true, sec);
        } else {
            this.rotate(180, true, sec);
        }

        this.player_name[0].inverse();
        this.player_name[1].inverse();
    } // Board.inverse()

    /**
     * checker position(x, y) to  piont index
     * @param {Checker} ch - checker object
     */
    chpos2point(ch) {
        let point = undefined;

        for ( let i=0; i < this.point.length; i++ ) {
            if ( this.point[i].in_this(ch.x, ch.y) ) {
                return i;
            }
        }
        return undefined;
    } // Board.chpos2point()

    /**
     * @param {Checker} ch
     * @param {number} p - point index
     * @param {boolean} [add_hist=true]
     */
    emit_put_checker(ch, p, add_hist) {
        const idx = this.point[p].checkers.length;
        console.log("Board.emit_put_checker("
                    + `cd.id=${ch.id},`
                    + `p=${p},`
                    + `add_hist=${add_hist})`);

        emit_msg("put_checker", { ch: parseInt(ch.id.slice(1)),
                                  p:  p,
                                  idx: idx }, add_hist);
    } // Board.emit_put_checker()

    /**
     * @param {Checker} ch - Checker
     * @param {number} p - point index
     * @param {number} [sec=0]
     * @param {boolean} [sound=true]
     */
    put_checker(ch, p, sec=0, sound=true) {
        const prev_p = ch.cur_point;

        if (prev_p !== undefined ) {
            //
            // chがあったポイントからチェッカーを削除
            //
            // 前提: chは、ポイントの先端のチェッカー
            //
            const checkers = this.point[prev_p].checkers;
            const ch_i = checkers.indexOf(ch);
            checkers.splice(ch_i, 1);
        }

        // 移動先ポイントに chを加える
        const idx = this.point[p].add(ch, sec);
        ch.cur_point = p;

        // move sound
        if ( sound ) {
            if ( p >= 26 && prev_p < 26 ) {
                this.sound_hit.play();
            } else {
                this.sound_put.play();
            }
        }

        // pip count
        this.pip_count(ch.player);

        // check closeout
        if ( this.closeout(1 - this.turn) ) {
            this.pass_btn[this.turn].on();
            this.roll_btn[this.turn].off();
            this.roll_btn[1 - this.turn].off();
        }
    } // Board.put_checker()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        if ( this.moving_checker === undefined ) {
            return;
        }

        this.moving_checker.move(x, y, true);
    } // Board.on_mouse_move_xy()
} // class Board

/**
 *
 */
class BoardArea extends BgBase {
    constructor(id, board, x, y, w, h) {
        super(id, x, y, 0, w, h);
        this.board = board;
    } // BoardArea.constructor()
} // class BoardArea

/**
 * 
 */
class BoardPoint extends BoardArea {
    /**
     * @param {string} id
     * @param {Board} board
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} idx - point index number
     * @param {number} direction - -1: 上から下, 1: 下から上
     * @param {number} max_n
     */
    constructor(id, board, x, y, w, h, idx, direction, max_n) {
        super(id, board, x, y, w, h);
        this.idx = idx;
        this.direction = direction; // up: +1, down: -1
        this.max_n = max_n;

        this.cx = this.x + this.w / 2;

        if ( this.direction > 0 ) {
            this.y0 = this.y;
        } else {
            this.y0 = this.y  + this.h;
        }

        this.checkers = [];
    } // BoardPoint.constructor()

    /**
     * @param {Checker} ch
     * @param {number} sec
     * @return {number} - position index
     */
    add(ch, sec=0) {
        // console.log(`BoardPoint.add(ch.id=${ch.id},sec=${sec})`);
        const n = this.checkers.length;
        const n2 = n % this.max_n;
        const n3 = Math.floor(n / this.max_n);
        const x = this.cx - ch.w * 0.05 * n3;
        const y = parseInt(Math.round(this.y0
                                      + ch.h * (0.5 + n2 * 0.75 + 0.1 * n3)
                                      * this.direction));
        // console.log(`BoardPoint.add()> n=${n},y=${y}`);
        ch.move(x, y, true, sec);
        ch.set_z(n);
        ch.cur_point = this.idx;
        this.checkers.push(ch);

        return n;
    } // BoardPoint.add()
} // class BoardPoint

/**
 *
 */
class QueryStringBase {
    constructor() {
        this.querystring = '';
        this.data = [];
        this.load();
    } // constructor()

    load() {
        this.querystring = window.location.search || '';
        this.querystring = this.querystring.substr(
            1, this.querystring.length);
        console.log(`QueryStringBase.load>querystring=${this.querystring}`);

        if ( this.querystring.length == 0 ) {
            return {};
        }

        for (let ent of this.querystring.split("&")) {
            let [k, v] = ent.split("=");
            this.data[k] = v;
        } // for(ent)

        return this.data;
    } // QueryStringBase.load()

    /**
     * @param {string} key
     */
    get(key) {
        if ( this.data[key] === undefined ) {
            return undefined;
        }
        return decodeURIComponent(this.data[key]);
    } // QueryStringBase.get()
} // class QueryStringBase

/**
 *
 */
class CookieBase {
    constructor() {
        this.cookie = undefined;
        this.data = {};
        this.load();
    }

    /**
     * @return {Object} data
     */
    load() {
        const allcookie = document.cookie;
        // console.log(`CookieBase.load>allcookie="${allcookie}"`);

        if ( allcookie.length == 0 ) {
            return {};
        }

        for (let ent of allcookie.split("; ")) {
            let [k, v] = ent.split('=');
            // console.log(`CookieBase.load>k=${k},v=${v}`);
            this.data[k] = v;
        } // for(i)

        return this.data;
    } // CookieBase.load()

    /**
     * 
     */
    save() {
        if ( Object.keys(this.data) ) {
            return;
        }

        let allcookie = "";
        for (let key in this.data) {
            allcookie += `${key}=${this.data[key]};`;
        } // for (key)

        document.cookie = allcookie;
    }

    /**
     * @param {string} key
     * @param {string} value
     */
    set(key, value) {
        document.cookie = `${key}=${encodeURIComponent(value)};`;
    }
    
    /**
     * @param {string} key
     */
    get(key) {
        if ( this.data[key] === undefined ) {
            return undefined;
        }
        return decodeURIComponent(this.data[key]);
    } // CookieBase.get()
} // class CookieBase

/**
 *
 */
class SoundBase {
    constructor(board, soundfile) {
        console.log("SoundBase("
                    + `board.svr_id=${board.svr_id},`
                    + `soundfile=${soundfile}`);
        this.board = board;
        this.soundfile = soundfile;
        this.audio = new Audio(this.soundfile);
    } // SoundBase.constructor()

    /**
     * 
     */
    play() {
        console.log(`SoundBase.play>`
                    + `GlobalSoundSwitch=${GlobalSoundSwitch}`);
        if ( this.board.sound && GlobalSoundSwitch ) {
            console.log(`soundfile=${this.soundfile}`);
            return this.audio.play();
        } else {
            return false;
        }
    } // SoundBase.play()
} // class SoundBase

/**
 * New game
 */
const new_game = () => {
    nav.checked=false;
    console.log("new_game()");
    emit_msg("new", {}, false);
};

/**
 * Backward history
 *
 * @param {number} [n=1]
 */
const backward_hist = (n=1) => {
    nav.checked=false;
    console.log(`backward_hist(n=${n})`);
    emit_msg("back", {n: n}, false);
};

/**
 * 
 */
const back2 = () => {
    nav.checked=false;
    console.log("back2");
    emit_msg("back2", {}, false);
};

/**
 *
 */
const back_all = () => {
    nav.checked=false;
    console.log("back_all()");
    emit_msg("back_all", {}, false);
};

/**
 * Forward history
 *
 * @param {number} [n=1]
 */
const forward_hist = (n=1) => {
    nav.checked=false;
    console.log(`forward_hist(n=${n})`);
    emit_msg("fwd", {n: n}, false);
};

/**
 *
 */
const fwd2 = () => {
    nav.checked=false;
    console.log("fwd2");
    emit_msg("fwd2", {}, false);
};

/**
 *
 */
const fwd_all = () => {
    nav.checked=false;
    console.log("fwd_all()");
    emit_msg("fwd_all", {}, false);
};
    
/**
 *
 */
const board_inverse = () => {
    nav.checked=false;
    board.inverse(0.5);
};

/**
 *
 */
const write_gameinfo = () => {
    nav.checked=false;
    board.write_gameinfo();
};

const read_gameinfo = () => {
    nav.checked=false;
    board.read_gameinfo();
};

/**
 *
 */
const clear_filename = () => {
    document.getElementById("read_gameinfo").value="";
};

/**
 * @param {number} player
 */
const emit_playername = (player) => {
    const el = document.getElementById(`p${player}name-input`);
    const name = el.value;

    const player_name = board.player_name[player];
    const cur_name = player_name.get();
    const def_name = player_name.default_text;

    console.log(`emit_playername2>player=${player},`
                + `cur_name=${cur_name},`
                + `name=${name}`
                + ")");
    
    player_name.emit(name, true);

    el.style.zIndex = -2;
};

/**
 *
 */
const apply_sound_switch = () => {
    board.apply_sound_switch();
};

/**
 *
 */
const apply_free_move = () => {
    board.apply_free_move();
};

/**
 *
 */
const apply_disp_pip = () => {
    board.apply_disp_pip();
};

/**
 * @param {number} index
 */
const apply_clock_sw = index => {
    board.apply_clock_sw();
};

/**
 * @param {number} index
 */
const apply_clock_limit = index => {
    board.apply_clock_limit(index);
};

/**
 *
 */
const on_key_down = (e, board) => {
    console.log(`on_key_down(board.svr_id=${board.svr_id}`);
    console.log(`e.key=${e.key},e.ctrlKey=${e.ctrlKey},e.shiftKey=${e.shiftKey}`);
    console.log(`e.keyCode=${e.keyCode}`);

    const player = board.player;
    const roll_btn = board.roll_btn[player];
    const pass_btn = board.pass_btn[player];
    const dice = roll_btn.dice[0];

    if ( e.ctrlKey ) {
        if ( e.key == 'z' ) {
            backward_hist();
            return;
        }
        if ( e.key == 'y' ) {
            forward_hist();
            return;
        }
    }

    if ( e.key == " " ) {
        if ( roll_btn.active ) {
            roll_btn.on_mouse_down_xy(0, 0);
            return;
        }
        /*
        if ( roll_btn.dice_active ) {
            dice.on_mouse_down_xy(0, 0);
            return;
        }
        */
        if ( pass_btn.active ) {
            console.log(`pass_btn.active=${pass_btn.active}`);
            pass_btn.on_mouse_down_xy(0, 0);
            return;
        }
    }
};

/**
 *
 */
document.body.onkeydown = e => {
    if ( e.key.length === undefined ) {
        return;
    }
    if ( e.key.length == 1 ) {
        on_key_down(e, board);
    }
};

/**
 *
 */
window.onload = () => {
    console.log(`window.onload()>start`);

    // sound switch
    const q_str = new QueryStringBase();
    GlobalSoundSwitch = q_str.get("sound") || true;
    // "on"/"off" used in old version .. deprecated
    if ( GlobalSoundSwitch == "off" ) {
        GlobalSoundSwitch = false;
    }
    if ( GlobalSoundSwitch == "on" ) {
        GlobalSoundSwitch = true;
    }
    console.log(`GlobalSoundSwitch=${GlobalSoundSwitch}`);

    // menu
    const nav_el = document.getElementById("nav-drawer");

    // connect to server
    const url = "http://" + document.domain + ":" + location.port + "/";
    ws = io.connect(url);

    // initialize board
    board = new Board("board",
                      nav_el.offsetWidth  + 20,
                      nav_el.offsetHeight + 30,
                      ws);

    ws.on("connect", function() {
        console.log("ws.on(connected)");
    });

    ws.on("disconnect", function() {
        console.log("ws.on(disconnected)");
    });

    /**
     * msg := {
     *   type: str,
     *   data: Object
     * }
     */
    ws.on("json", function(msg) {
        console.log(`ws.on(json):msg=${JSON.stringify(msg)}`);

        if ( msg.type == "gameinfo" ) {
            board.load_gameinfo(msg.data.gameinfo,
                                msg.data.sec,
                                msg.data.history_flag);
            return;
        } // "gameinfo"

        if ( msg.type == "put_checker" ) {
            if ( board.turn == -1 ) {
                console.log(`ws.on(json)put_checker>`
                            + `turn=${board.turn}..ignored`);
                return;
            }
            const ch_id = "p" + ("000" + msg.data.ch).slice(-3);
            console.log(`ws.on(json)put_checker)> ch_id=${ch_id}`);
            let ch = board.search_checker(ch_id);

            board.put_checker(ch, msg.data.p, 0.2);
            return;
        } // "put_checker"

        if ( msg.type == "cube" ) {
            board.cube.set(msg.data.value, msg.data.side, msg.data.accepted);
            return;
        } // "cube"

        if ( msg.type == "dice" ) {
            console.log(`ws.on(json)>type=dice,turn=${board.turn}`);
            if ( board.turn == -1 ) {
                return;
            }
            if ( JSON.stringify(msg.data.dice) == JSON.stringify([0,0,0,0]) ) {
                // let playpromise = board.sound_turn_change.play();
            }

            board.roll_btn[msg.data.player].set(msg.data.dice,
                                                   msg.data.roll);
            if ( board.turn < 0 ) {
                board.player_name[0].off();
                board.player_name[1].off();
            }
            return;
        } // "dice"

        if ( msg.type == "set_turn" ) {
            board.set_turn(msg.data.turn, msg.data.resign);
            return;
        } // set_turn

        if ( msg.type == "set_playername" ) {
            board.player_name[msg.data.player].set(msg.data.name);
            return;
        } // set_playername
        
        if ( msg.type == "set_score" ) {
            board.score[msg.data.player].set(msg.data.score);
            return;
        } // set_score
        
        if ( msg.type == "set_clock_switch" ) {
            board.set_clock_switch(msg.data.switch);
            console.log(`clock_sw=${board.clock_sw}`);
            return;
        } // set_clock_switch

        if ( msg.type == "set_clock_limit" ) {
            board.clock_limit.set(msg.data.index, msg.data.clock_limit);
            board.player_clock[0].reset();
            board.player_clock[1].reset();
            return;
        } // set_clock_limit
        
        if ( msg.type == "set_player_clock" ) {
            board.player_clock[msg.data.player].set(msg.data.clock);
            return;
        } // set_player_clock
        
        if ( msg.type == "resume_clock" ) {
            board.player_clock[msg.data.player].resume();
            return;
        } // set_player_clock
        
        if ( msg.type == "start_clock" ) {
            board.player_clock[msg.data.player].start();
            return;
        } // set_player_clock
        
        if ( msg.type == "stop_clock" ) {
            board.player_clock[msg.data.player].stop();
            return;
        } // set_player_clock
        
        if ( msg.type == "reset_clock" ) {
            board.player_clock[msg.data.player].reset();
            return;
        } // set_player_clock
        
        console.log("ws.on(json)>msg.type=???");
    }); // ws.on(json)
}; // window.onload
