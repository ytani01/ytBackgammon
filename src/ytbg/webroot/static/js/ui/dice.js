import { log } from "../log.js";
import { click_dice, roll } from "../actions.js";
import { BgImage } from "./base.js";
import { BannerButton } from "./button.js";

/**
 *
 */
export class Dice extends BgImage {
    constructor(id, board, player, x1, y1, file_prefix) {
        super(id, x1, y1, 0, {board: board, player: player});
        // log(`Dice> (x1,y1)=(${x1},${y1})`);
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

        // 目は持たない。表示は apply() が gameinfo から毎回作り、
        // 判定は gameinfo.board.dice を読む (TODO-052)

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
        val %= 10;
        return this.image_dir + this.file_prefix + val + this.image_suffix;
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
        this.set_z(10);
        super.move(this.x1, this.y1, true, sec);
        if ( this.player == 1 ) {
            deg += 180;
        }
        this.rotate(deg, true, sec);
    } // Dice.move1()

    /**
     * @param {number} val - dice number 1-6:active, 11-16:inactive, 0:no dice
     * @param {boolean} [roll_flag=false]
     */
    set(val, roll_flag=false) {
        // log(`Dice.set(val=${val},roll_flag=${roll_flag})>`);
        this.enable();

        if (val % 10 < 1) {
            this.move0();
            return;
        }

        if (val > 10) {
            this.disable();
        }

        this.image_el.src = this.get_filename(val % 10);

        if ( roll_flag ) {
            this.deg = Math.floor(Math.random() * 720 - 360);
            this.move1(this.deg, 0.5);
        } else {
            this.move1(this.deg, 0);
        }
    } // Dice.set()

    /**
     * 押したときの判定と送信は actions.js の click_dice() (TODO-051)
     *
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`Dice.on_mouse_down_xy(${x},${y})`);
        click_dice(this.board, this.player,
                   this.board.roll_btn[this.player].dice.indexOf(this));
        return false;
    } // Dice.on_mouse_down_xy()
} // class Dice

/**
 *
 */
export class RollButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);

        [this.x1, this.y1] = [this.x, this.y];
        // log(`(x1,y1)=(${this.x1},${this.y1})`);

        if ( this.player == 0 ) {
            this.x0 = this.board.w - this.w;
            this.y0 = this.board.h - this.h;
        } else {
            this.x0 = this.w;
            this.y0 = this.h;
        }
        // log(`(x0,y0)=(${this.x0},${this.y0})`);

        const dice_prefix = "dice" + this.player;

        this.dice = [];
        for (let i=0; i < 4; i++) {
            let xd = this.x1 + 60 * (i - 1.5);
            log(`x1=${this.x1},xd=${xd}`);
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
        // apply() の中から呼ばれるので、gameinfo は届いている (TODO-052)
        const gi = this.board.gameinfo;

        if ( gi.turn != this.player && gi.turn < 2 ) {
            this.off();
            return;
        }

        if ( this.board.has_dice(this.player) ) {
            this.off();
            return;
        }

        this.board.pass_btn[1 - this.player].off();
        this.on();
    } // RollButton.on()

    /**
     * Set dice values
     * @param {number[][]} dice_value
     * @param {boolean} [roll_flag=false] 
     */
    set(dice_value, roll_flag=false) {
        if ( roll_flag ) {
            this.board.sound_roll.play();
        }

        this.clear();
        this.off();
        
        for (let i=0; i < 4; i++) {
            this.dice[i].set(dice_value[i], roll_flag);
        } // for(i)

        if ( ! dice_value.some((v) => v > 0) ) {
            if ( this.board.closeout(1 - this.player) ) {
                this.board.pass_btn[1 - this.player].on();
            }
        }
        
    } // RollButton.set()

    /**
     *
     */
    clear() {
        for ( let d=0; d < 4; d++ ) {
            this.dice[d].clear();
        }
        return [];
    } // RollButton.clear()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`RollButton.on_mouse_down_xy>player=${this.player}`);

        // 振ってよいかの判定と送信は actions.js (TODO-051)
        if ( ! roll(this.board, this.player) ) {
            return;
        }

        this.off();

        if ( this.board.has_dice(1 - this.player) ) {
            log(`settimeout`);
            const click0 = this.dice[0].on_mouse_down_xy.bind(this.dice[0]);
            setTimeout(click0, 2000);
        }
    } // RollButton.on_mouse_down_xy()
} // class RollButton
