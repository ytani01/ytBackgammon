import { log } from "../log.js";
import { emit_msg } from "../ws.js";
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
     * @param {number} x
     * @param {number} y
     */
    on_mouse_down_xy(x, y) {
        log(`Dice.on_mouse_down_xy(${x},${y})`);

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

            // if ( this.baord.is_double() ) {
            //   
            // }
            
            roll_btn.emit_dice(roll_btn.get(), false, true);
            return false;
        }

        if ( this.board.turn < 0 ) {
            log(
                `Dice.on_mouse_down_xy>turn=${this.board.turn} .. ignored`);
            return false;
        }

        if ( this.board.turn >= 2 ) {
            log(`Dice.on_mouse_down_xy>turn=${this.board.turn}`);
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
export class RollButton extends BannerButton {
    constructor(id, board, player, x, y, deg=0) {
        super(id, board, player, x, y, deg);
        /*
        log(`RollButton(id=${id},player=${this.player},`
                    + `x=${this.x},y=${this.y})`);
        */

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
        const dice = this.get();
        // log(`RollButton.update>dice=${JSON.stringify(dice)}`);

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
        log(`RollButton[${this.player}].set(`
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
        log("RollButton.get_active_dice>"
                    +`active_dice=${JSON.stringify(active_dice)}`);
        */
        return active_dice;
    } // RollButton.get_active_dice()
    
    /**
     * 使えないダイスを確認してdisable()する
     * @return {boolean} - modified
     */
    check_disable() {
        // log(`RollButton.check_disable()`);
        let modified = false;
        const board = this.board;
        const player = this.player;
        const bar_p = this.bar_point(player);
        const active_d = this.get_active_dice();
        
        if ( this.board.point[bar_p].checkers.length > 0 ) {
            // ヒットされている場合は、復活できるか確認
            const dst_p = this.board.get_dst_points(player, bar_p, active_d);
            log(`RollButton.check_disable>`
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
                const ch = this.board.point[p].checkers;
                if ( ch.length == 0 ) {
                    continue;
                }
                if ( ch[0].player != player ) {
                    continue;
                }

                const dst = this.board.get_dst_point1(player, p, dice_val);
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
                    const dst2 = this.board.get_dst_point1(player, p, dice_val2);
                    if ( dst2 === undefined ) {
                        continue;
                    }

                    // もう一つのダイスが使える場合、出目を足して確認
                    // 足した目で利用可能なら、dice[i] を利用可とする
                    const dst3 = this.board.get_dst_point1(player, p,
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
                log(`RollButton.set>dice[${i}]: disable`);
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
        // log(`RollButton.roll()`);
        this.clear();

        let d1 = Math.floor(Math.random()  * 4);
        let d2 = d1;
        while ( d1 == d2 ) {
            d2 = Math.floor(Math.random()  * 4);
        }
        log(`RollButton.roll> [d1, d2]=[${d1}, ${d2}]`);

        this.dice_active = true;

        const value1 = Math.floor(Math.random() * 6) + 1;
        const value2 = Math.floor(Math.random() * 6) + 1;

        /*
        // Dice histogram
        const histo = this.board.dice_histogram;
        histo[this.player][value1 - 1]++;
        histo[this.player][value2 - 1]++;
        // log(`RollButton.roll>histo=${JSON.stringify(histo)}`);
        let histogram_str = "";
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 6; i++) {
                let a = 0;
                a = histo[p][i];
                histogram_str += a + " ";
            } // for (i)
            histogram_str += "<br />";
        } // for(p)
        // log(`histogram_str=${histogram_str}`);
        document.getElementById("dice-histogram").innerHTML = histogram_str;
        */

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
        log("RollButton.roll()>"
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
        // log(`RollButton.clear(emit=${emit})`);

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
        log(`RollButton.on_mouse_down_xy>player=${this.player}`);

        if ( ! this.board.cube.accepted ) {
            return;
        }

        this.off();

        this.roll();

        if ( this.another().dice_active ) {
            log(`settimeout`);
            const click_dice = this.dice[0].on_mouse_down_xy.bind(this);
            setTimeout(click_dice, 2000);
        }
    } // RollButton.on_mouse_down_xy()
} // class RollButton
