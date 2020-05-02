/**
 *=====================================================
 * BackgammonBase .. have (x, y)
 *   |
 *   +- BackgammonArea .. have (w, h) / without image
 *        |
 *        +- ImageItem .. have image
 *        |    |
 *        |    +- BoardItem .. on board
 *        |    |    |
 *        |    |    +- BoardButton
 *        |    |    |    +- InverseButton
 *        |    |    |    +- EmitButton
 *        |    |    |         +- BackButton
 *        |    |    |         +- FwdButton
 *        |    |    +- Cube
 *        |    |    |
 *        |    |    +- PlayerItem .. owned by player
 *        |    |         +- OnBoardText
 *        |    |         +- Dice
 *        |    |         +- Checker
 *        |    +- Board
 *        |         
 *        +- BoardArea .. on board
 *             +- BoardPoint
 *             +- DiceArea
 *=====================================================
 */
const MY_NAME = "ytBackgammon Client";
const VERSION = "0.19";

/**
 * base class for backgammon
 */
class BackgammonBase {
    /**
     * @param {number} x
     * @param {number} y
     */
    constructor(x, y) {
        [this.x, this.y] = [x, y];
    }

    emit_msg(type, data, history=true) {
        if ( this.board ) {
            this.board.emit_msg(type, data, history);
        }
    }

    goal_point(player) {
        return (25 * player);
    }
} // class BackgammonBase

/**
 *
 */
class BackgammonArea extends BackgammonBase {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    constructor(x, y, w, h) {
        super(x, y);
        [this.w, this.h] = [w, h];
    }

    /**
     * @param {number} x
     * @param {number} y
     * @return {boolean}
     */
    in_this(x, y) {
        return (x >= this.x) && (x < this.x + this.w)
            && (y >= this.y) && (y < this.y + this.h);
    }
} // BackgammonArea

/**
 * <div id="${id}"><image src="${image_dir}/.."></div>
 */
class ImageItem extends BackgammonArea {
    constructor(id, x, y) {
        super(x, y, 0, 0);
        this.id = id;

        this.image_dir = "/static/images/";
        this.file_suffix = ".png";

        this.el = document.getElementById(this.id);

        this.image_el = this.el.firstChild;

        this.w = this.image_el.width;
        this.h = this.image_el.height;

        this.el.style.width = `${this.w}px`;
        this.el.style.height = `${this.h}px`;
  
        this.el.hidden = false;
        this.el.draggable = false;

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);
        this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.ontouchend = this.on_mouse_up.bind(this);
        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.null_handler.bind(this);

        this.move(this.x, this.y, false);

        this.e = undefined; // MouseEvent
    }

    /**
     * move to (x, y)
     * @param {number} x
     * @param {number} y
     * @param {boolean} center - center flag
     */
    move(x, y, center=false) {
        [this.x, this.y] = [x, y];

        this.el.style.left = this.x + "px";
        this.el.style.top = this.y + "px";
        if ( center ) {
            this.el.style.left = (this.x - this.w / 2) + "px";
            this.el.style.top = (this.y - this.h / 2) + "px";
        }
    }

    /**
     * @param {number} deg
     */
    rotate(deg, center=false) {
        console.log(`rotate(deg=${deg}, center=${center})`);
        this.el.style.transformOrigin = "top left";
        if ( center ) {
            this.el.style.transformOrigin = "center center";
        }
        this.el.style.transform = `rotate(${deg}deg)`;
    }

    /**
     * touch event to mouse event
     * @param {MouseEvent} e
     */
    touch2mouse(e) {
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        return e;
    }
    
    /**
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
    }

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
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        this.e = this.touch2mouse(e);
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_up(e) {
        this.e = this.touch2mouse(e);
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_move(e) {
        this.e = this.touch2mouse(e);
    }

    /**
     * @param {MouseEvent} e
     */
    null_handler(e) {
        return false;
    }
} // class ImageItem

/**
 * item on board
 */
class BoardItem extends ImageItem {
    constructor(id, board, x, y) {
        super(id, x, y);
        this.board = board;
    }
} // class BoardItem

/**
 * button on board
 */
class BoardButton extends BoardItem {
    constructor(id, board, x, y) {
        super(id, board, x, y);
    }
} // class BoardButton

/**
 *
 */
class InverseButton extends BoardButton {
    constructor(id, board, x, y) {
        super(id, board, x, y);
    }

    on_mouse_down(e) {
        const [x, y] = this.get_xy(e);
        this.board.inverse();
    }
} // class InverseButton

/**
 *
 */
class EmitButton extends BoardButton {
    constructor(id, board, type, x, y) {
        super(id, board, x, y);

        this.type = type;
    }

    on_mouse_down(e) {
        const [x, y] = this.get_xy(e);
        this.emit_msg(this.type, {});
    }
} // class EmitButton

/**
 *
 */
class BackButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back", x, y);
    }
} // BackButton

/**
 *
 */
class Back2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back2", x, y);
    }
} // Back2Button

/**
 *
 */
class BackAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back_all", x, y);
    }
} // BackAllButton

/**
 *
 */
class FwdButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "forward", x, y);
    }
} // FwdButton

/**
 *
 */
class Fwd2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd2", x, y);
    }
} // FwdButton

/**
 *
 */
class FwdAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd_all", x, y);
    }
} // FwdAllButton

/**
 *                    x0
 *                    |
 *                    v
 *            y ->+-----------------------------------------------------
 *                |       13 14 15 16 17 18     19 20 21 22 23 24       |
 *        by[0] ->|  -------------------------------------------------  |
 *                | |   ||p0          p1   |   |p1             p0||   | |
 * y2[1] ------------>  ||p0          p1   |   |p1 tx     dx   p0||   | |
 *                | |   ||p0          p1   |27 |p1 |      |      ||25 | |
 * y1[1] ------------>  ||p0               |   |p1 |      v      ||   | |
 *                | |   ||p0               |   |p1 v      +------+<-------dy
 *                | |   ||         ty ------------>+------| Dice ||   | |
 * y0 --------------->  ||                 |---|   |Text  | Area ||---| |
 *                | |   ||                 |   |    ------|      ||   | |
 *                | |   ||p1               |   |p0         ------||   | |
 * y1[0] ------------>  ||p1               |   |p0               ||   | |
 *                | |   ||p1          p0   |26 |p0               || 0 | |
 * y2[0] ------------>  ||p1          p0   |   |p0             p1||   | |
 *                | |   ||p1          p0   |   |p0             p1||   | |
 *        by[1] ->|  -------------------------------------------------  |
 *                |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *                 ----------------------------------------------------- 
 */
class Cube extends BoardItem {
    constructor(id, board) {
        super(id, board, 0, 0);

        this.player = undefined;
        this.value = 1;
        this.accepted = false;
        
        this.x0 = (this.board.bx[0] + this.board.bx[1]) / 2;
        this.y0 = this.board.h / 2;
        this.y2 = [this.board.by[1] - this.h / 2,
                   this.board.by[0] + this.h / 2];
        this.y1 = [(this.y2[0] + this.board.h / 2) / 2,
                   (this.y2[1] + this.board.h / 2) / 2];
        
        this.file_prefix = this.image_dir + "cube";

        this.el.style.cursor = "pointer";

        this.move(this.x0,
                  this.board.h / 2,
                  true);
    }

    /**
     * 
     */
    set(val, player=undefined, accepted=false, emit=true) {
        console.log("Cube.set(val=" + val
                    + ", player=" + player
                    + ", accepted=" + accepted + ")");
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

        this.el.firstChild.src = filename;

        if ( this.player === undefined ) {
            this.move(this.x0, this.y0, true);
        } else if ( accepted ) {
            this.player = player;
            this.move(this.x0, this.y2[this.player], true);
        } else {
            this.player = player;
            this.move(this.x0, this.y1[this.player], true);
        }

        if ( emit ) {
            let side = this.player;
            if ( side === undefined ) {
                side = -1;
            }

            this.emit_msg('cube', {side: side,
                                         value: this.value,
                                         accepted: this.accepted});
        }
    }

    /**
     * 
     */
    double(player=undefined) {
        console.log("Cube.double(player=" + player + ")");
        if ( player === undefined ) {
            if ( this.player !== undefined ) {
                player = 1 - this.player;
            }
        } else {
            player = 1 - player;
        }
        console.log("Cube.double> player=" + player);

        this.value *= 2;
        /*
        if ( this.value > 64 ) {
            this.value = 64;
        }
        */

        this.accepted = false;
        this.set(this.value, player, false);
    }

    /**
     *
     */
    double_accept() {
        console.log("Cube.double_accept()");

        this.set(this.value, this.player, true);
    }

    /**
     *
     */
    double_cancel() {
        console.log("Cube.double_cancel()");
        
        let value = this.value / 2;
        let player = 1 - this.player;
        if ( value == 1 ) {
            player = undefined;
        }
        this.set(value, player, true);
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        const [x, y] = this.get_xy(e);
        console.log("Cube.on_mouse_down> this.player=" + this.player
                   + ", this.board.player=" + this.board.player);

        if ( this.player !== undefined && this.player != this.board.player ) {
            this.double_cancel();
            return;
        }

        if ( this.player === undefined || this.accepted == true ) {
            this.double(this.board.player);
        } else {
            this.double_accept();
        }
    }
} // class Cube

/**
 *
 */
class PlayerItem extends BoardItem {
    constructor(id, board, player, x, y) {
        super(id, board, x, y);
        this.player = player;
    }
} // class PlayerItem

/**
 *
 */
class OnBoardText extends PlayerItem {
    constructor(id, board, player, x, y,) {
        super(id, board, player, x, y);

        this.el.style.removeProperty('width');
        this.el.style.removeProperty('height');

        this.player_name = `Player ${player + 1}`;
    }

    set_text(txt) {
        this.el.innerHTML = this.player_name + "<br />" + txt;
    }

    on() {
        this.el.style.borderColor = "rgba(255, 0, 255, 0.7)";
        this.el.style.color = "rgba(255, 0, 255, 0.7)";
    }

    off() {
        this.el.style.borderColor = "rgba(128, 128, 128, 0.5)";
        this.el.style.color = "rgba(128, 128, 128, 0.5)";
    }
} // class OnBoardText

/**
 *
 */
class Dice extends ImageItem {
    constructor(id, board, player, x, y, file_prefix) {
        super(id, board, player, x, y);
        console.log(`Dice> (x,y)=(${x},${y})`);
        this.file_prefix = file_prefix;

        /**
         * ダイスの値
         * @type {number}
         *    0,10: 画面に表示されない
         *    1- 6: 有効な値
         *   11-16: 使えない(使い終わった)状態：暗くなる
         */
        this.value = 0;

        this.image_el = this.el.firstElementChild;

        this.el.hidden = true;
        this.el.style.backgroundColor = "#000";
        this.el.style.cursor = "pointer";

        this.move(x, y, true);
    }

    /**
     *
     */
    enable() {
        this.image_el.style.opacity = 1.0;
        this.value = this.value % 10;
    }

    /**
     *
     */
    disable() {
        this.image_el.style.opacity = 0.5;
        this.value = this.value % 10 + 10;
    }

    /**
     *
     */
    get_filename(val) {
        val %= 10;
        return this.image_dir + this.file_prefix + val + this.file_suffix;
    }

    /**
     * @param {number} val - dice number, 11-16 .. disable
     */
    set(val) {
        console.log(`Dice.set(val=${val})>`);
        this.value = val;
        this.el.hidden = true;
        this.enable();

        if (val < 1) {
            return;
        }

        this.el.hidden = false;

        if (val > 10) {
            this.disable();
            this.value = val;
        }

        if ( val % 10 < 1 || val % 10 > 6 ) {
            return;
        }

        this.el.firstChild.src = this.get_filename(val);
    }
    
    /**
     *
     */
    roll() {
        this.set(Math.floor(Math.random() * 6) + 1);
        this.rotate(Math.floor(Math.random() * 90 - 45), true);
        return this.value;
    }
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
        super(id, board, player, 0, 0);

        [this.src_x, this.src_y] = [this.x, this.y];
        this.z = 0;
        
        this.el.style.cursor = "pointer";

        this.cur_point = undefined;
    }

    /**
     * @param {number} z
     */
    set_z(z) {
        this.z = z;
        this.el.style.zIndex = this.z;
    }

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
                        console.log(`Checker.calc_z> d=${d}, z=${z}`);
                    }
                }
            } // for (i)
        } // for (p)

        this.set_z(z);
    }

    /**
     * calcurate distance
     * @param {Checker} ch - distination checker object
     * @return {number} - distance
     */
    distance(ch) {
        let [dx, dy] = [ch.x - this.x, ch.y - this.y];
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * @return {number} - pip count
     */
    pip() {
        if ( this.cur_point === undefined ) {
            return undefined;
        }
        
        if ( this.player == 0 ) {
            return this.cur_point;
        }
        return (25 - this.cur_point);
    }

    /**
     * @return {boolean}
     */
    is_last_man() {
        const pip = this.pip();
        for (let i=0; i < 15; i++) {
            const pip2 = this.board.checker[this.player][i].pip();
            if ( pip2 > pip ) {
                return false;
            }
        } // for(i)
        return true;
    }

    /**
     * @return {boolean}
     */
    is_inner() {
        if ( this.player == 0 ) {
            return (this.cur_point <= 6);
        } else {
            return (this.cur_point >= 19 && this.cur_point <= 25);
        }
    }

    /**
     * 移動に使用するダイスの目を取得する
     *
     * @param {number} player
     * @param {number[]} active_dice
     * @param {number} from_p
     * @param {number} to_p
     * @return {number} - 使用するダイスの目
     *                    0: そこには移動できない
     */
    dice_check(active_dice, from_p, to_p) {
        console.log(`dice_check(active_dice=${JSON.stringify(active_dice)}, `
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
        console.log(`dice_check> ${from_p} ==> ${to_p}`);
        
        let diff_p = from_p - to_p;

        let dice_val = 0;
        const dice_idx = active_dice.indexOf(diff_p);
        if ( dice_idx >= 0 ) {
            dice_val = active_dice[dice_idx];
        }

        if ( dice_val == 0 ) {
            if ( this.board.all_inner(this.player) ) {
                // bearing off
                // XXX T.B.D. XXX
            }
        }

        console.log(`dice_check> dice_val=${dice_val}`);
        return dice_val;
    }

    /**
     * 元の位置に戻して、移動をキャンセルする
     *
     * @param {Checker} ch
     */
    cancel_move(ch) {
        console.log(`Checker.cancel_move(ch.id=${ch.id})`);
        ch.move(ch.src_x, ch.src_y, true);
        ch.board.moving_checker = undefined;
    }

    /**
     *
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);

        console.log(`Checker.on_mouse_down> this.id=${this.id}, (x,y)=${x},${y})`);
        
        // check player
        if ( this.player == 1 - this.board.player ) {
            return;
        }

        // check active dices
        const active_dice = this.board.get_active_dice(this.player);
        if ( active_dice.length == 0 ) {
            return;
        }

        // ヒットされている場合は、バーのポイントしか動かせない
        let bar_p = 26;
        if ( this.player == 1 ) {
            bar_p = 27;
        }
        if ( this.board.point[bar_p].checkers.length > 0 ) {
            if ( this.cur_point != bar_p ) {
                return;
            }
        }

        if ( this.board.all_inner(this.player) ) {
            // bearing off の場合
            const pip = this.pip();
            const dice_idx = active_dice.indexOf(pip);
            if ( dice_idx < 0 ) {
                if ( pip < Math.min(...active_dice) ) {
                    if ( ! this.is_last_man() ) {
                        return;
                    }
                }
            }
        }

        // クリックされたポイントの先端のチェッカーに持ち換える
        let ch = this;
        if ( ch.cur_point !== undefined ) {
            let point = ch.board.point[ch.cur_point];
            ch = point.checkers.slice(-1)[0];
            console.log(`Checker.on_mouse_down> ch.id=${ch.id}`);
        }
        ch.board.moving_checker = ch;

        [ch.src_x, ch.src_y] = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_up(e) {
        let [x, y] = this.get_xy(e);
        console.log("Checker.on_mouse_up> ");

        let ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }

        console.log("Checker.on_mouse_up> ch.id=" + ch.id
                    + ", (x,y)=(" + x + "," + y + ")");

        ch.move(x, y, true);

        const dst_p = ch.board.chpos2point(ch);
        console.log(`Checker.on_mouse_up> dst_p=${dst_p}`);

        if ( dst_p == ch.cur_point ) {
            this.cancel_move(ch);
            return;
        }

        /**
         * ダイスの目による判定
         */
        let active_dice = this.board.get_active_dice(this.player);
        console.log(`Checker.on_mouse_up> active_dice=${JSON.stringify(active_dice)}`);

        let dice_value = this.dice_check(active_dice, ch.cur_point, dst_p);
        if ( dice_value == 0 ) {
            // bearing off の確認

            let cancel_flag = true;

            if ( dst_p == this.goal_point(ch.player) ) {
                if ( this.board.all_inner(ch.player) ) {
                    dice_value = Math.min(...active_dice);
                    if ( ch.pip() < dice_value ) {
                        if ( ch.is_last_man() ) {
                            cancel_flag = false;
                        }
                    }
                }
            }

            if ( cancel_flag ) {
                this.cancel_move(ch);
                return;
            }
        }

        /**
         * 移動先ポイントの状態に応じた判定
         */
        let can_move = false;
        let hit_ch = undefined;
        let checkers = undefined;

        if ( dst_p >= 0 && dst_p <= ch.board.point.length) {
            checkers = ch.board.point[dst_p].checkers;
            if ( dst_p == this.goal_point(ch.player) ) {
                if ( this.board.all_inner(ch.player) ) {
                    can_move = true;
                }
            } else if ( dst_p == 26 || dst_p == 27 ) {
                // cannnot move
            } else if ( checkers.length == 0 ) {
                can_move = true;
            } else if ( checkers[0].player == ch.player ) {
                can_move = true;
            } else if ( checkers.length == 1 ) {
                /**
                 * hit
                 */
                can_move = true;
                hit_ch = checkers[0];
            }
        }
            
        if ( ! can_move ) {
            this.cancel_move(ch);
            return;
        }

        // 移動OK. 以降、移動後の処理

        const da = this.board.dice_area[this.player];

        // 使ったダイスを使用済みする
        for (let i=0; i < 4; i++) {
            if ( da.dice[i].value == dice_value ) {
                da.dice[i].disable();
                break;
            }
        } // for(i)

        // emit dice values to server
        // const dice_values = this.board.dice_area[this.player].get();
        this.emit_msg('dice', { turn: this.board.turn,
                                player: this.player,
                                dice: da.get() }, false);

        if ( hit_ch !== undefined ) {
            // hit
            console.log(`Checker.on_mouse_up> hit_ch.id=${hit_ch.id}`);

            let bar_p = 27;
            if ( hit_ch.player == 0 ) {
                bar_p = 26;
            }
            ch.board.put_checker(hit_ch, bar_p);
            hit_ch.calc_z();
        }

        // move_checker
        ch.board.put_checker(this, dst_p);
        ch.calc_z();

        ch.board.moving_checker = undefined;

        if ( this.board.game_is_finished(this.player) ) {
            /**
             * ゲーム終了処理
             *
             * XXX T.B.D XXX
             */
            // ダイスを全て使用済みにする
            for (let i=0; i < 4; i++) {
                if ( da.dice[i].value > 0 ) {
                    da.dice[i].disable();
                }
            } // for(i)

            this.board.set_turn(-1);

            this.emit_msg('dice', { turn: this.board.turn,
                                    player: this.player,
                                    dice: da.get() }, true);
        }
        
    } // on_mouse_up()

    /**
     *
     */
    on_mouse_move(e) {
        let [x, y] = this.get_xy(e);

        let ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }
        
        ch.move(x, y, true);
    }
} // class Checker

/**
 *
 *           bx[0]                  bx[3]                 bx[5]
 *           |   bx[1]              |   bx[4]             |bx[6]
 *         x |   |bx[2]             |   |                 ||   bx[7]
 *         | |   ||                 |   |                 ||   |
 *         v v   vv                 v   v                 vv   v
 *     y ->+-----------------------------------------------------
 *         |       13 14 15 16 17 18     19 20 21 22 23 24       |
 * by[0] ->|  -------------------------------------------------  |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 *         | |   ||p0          p1   |   |p1 tx     dx   p0||   | |
 *         | |   ||p0          p1   |27 |p1 |      |      ||25 | |
 *         | |   ||p0               |   |p1 |      v      ||   | |
 *         | |   ||p0               |   |p1 v      +------+<---------dy
 *         | |   ||         ty ------------>+------| Dice ||   | |
 *         | |   ||                 |---|   |Text  | Area ||---| |
 *         | |   ||                 |   |    ------|      ||   | |
 *         | |   ||p1               |   |p0         ------||   | |
 *         | |   ||p1               |   |p0               ||   | |
 *         | |   ||p1          p0   |26 |p0               || 0 | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 * by[1] ->|  -------------------------------------------------  |
 *         |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *          ----------------------------------------------------- 
 *
 */
class Board extends ImageItem {
    /*
     * @param {string} id - div tag id
     * @param {number} x - 
     * @param {number} y - 
     * @param {number} player - 0 or 1
     * @param {io.connect} ws - websocket
     */
    constructor(id, x, y, player, ws) {
        super(id, x, y);

        this.player = player;
        this.ws = ws;
        
        this.turn = -1;

        this.bx = [27, 81, 108, 432, 540, 864, 891, 945];
        this.by = [46, 535];
        [this.tx, this.ty] = [570, 270];
        [this.dx, this.dy] = [620, 267];

        // Title
        const name_el = document.getElementById("name");
        name_el.style.width = this.w + "px";
        const ver_el = document.getElementById("version");
        ver_el.innerHTML = `<strong>${MY_NAME}</strong>, Version ${VERSION}`;

        // Buttons
        const bx0 = this.x + this.w + 20;
        this.button_back_all = new BackAllButton(
            "button-back_all", this, bx0, 20);

        this.button_back2 = new Back2Button(
            "button-back2", this, bx0,
            this.button_back_all.y + this.button_back_all.h);

        this.button_fwd_all = new FwdAllButton(
            "button-fwd_all", this, bx0,
            this.button_back2.y + this.button_back2.h);

        this.button_fwd2 = new Fwd2Button(
            "button-fwd2", this, bx0,
            this.button_fwd_all.y + this.button_fwd_all.h);

        this.button_back = new BackButton("button-back", this, bx0, this.h);
        this.button_back.move(bx0, this.y + this.h - this.button_back.h - 25);

        this.button_fwd = new FwdButton(
            "button-fwd", this, bx0,
            this.button_back.y - this.button_back.h - 20);
        
        this.button_inverse = new InverseButton(
            "button-inverse", this, bx0, 0);
        this.button_inverse.move(bx0,
                                 this.y + this.h / 2 - this.button_inverse.h / 2);
        
        // <body>
        let body_el = document.body;
        body_el.style.width = (this.button_back.x + this.button_back.w + 100) + "px";
        body_el.style.height = (this.y + this.h + 10) + "px";

        // OnBoardText
        this.txt = [];
        this.txt.push(new OnBoardText(
            "p0text", this, 0, this.tx, this.ty));
        this.txt.push(new OnBoardText(
            "p1text", this, 1, this.w - this.tx, this.h - this.ty));
        this.txt[1].rotate(180);

        for ( let p=0; p < 2; p++ ) {
            this.txt[p].set_text("");
            this.txt[p].on();
        }

        // Checkers
        this.checker = [Array(15), Array(15)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + player + ("0" + i).slice(-2);
                this.checker[player][i] = new Checker(c_id, this, player);
            }
        }

        this.moving_checker = undefined;

        // Cube
        this.cube = new Cube("cube", this);

        // Points
        this.point = [];
        
        for ( let p=0; p < 28; p++ ) {
            let cn = 5;
            let pw = (this.bx[3] - this.bx[2]) / 6;
            let ph = this.h / 2 - this.by[0];

            if ( p == 0 ) {
                let x0 = this.bx[6];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, -1, cn));
            }
            if ( p >= 1 && p <= 6 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 6 - p;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, -1, cn));
            }
            if ( p >= 7 && p <= 12 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 12 - p;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, -1, cn));
            }
            if ( p >= 13 && p <= 18 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0];
                let xn = p - 13;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, 1, cn));
            }
            if ( p >= 19 && p <= 24 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0];
                let xn = p - 19;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, 1, cn));
            }
            if ( p == 25 ) {
                let x0 = this.bx[6];
                let y0 = this.by[0];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, 1, cn));
            }
            if ( p == 26 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, 1, cn));
            }
            if ( p == 27 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0];
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, -1, cn));
            }
        } // for

        // DiceArea
        let da_w = this.bx[5] - this.dx;
        let da_h = this.h - this.dy * 2;
        this.dice_area = [];
        this.dice_area.push(new DiceArea(this, this.dx, this.dy,
                                         da_w, da_h, 0));
        this.dice_area.push(new DiceArea(this, this.bx[2], this.dy,
                                         da_w, da_h, 1));

        // Event handlers
        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);

        this.el.onmouseup = this.null_handler.bind(this);
        this.el.ontouchend = this.null_handler.bind(this);

        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ontouchmove = this.on_mouse_move.bind(this);

        this.el.ondragstart = this.null_handler.bind(this);

        if ( this.player == 1 ) {
            this.player = 0;
            this.inverse();
        }
    }

    /**
     * search checker object by checker id
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
    }

    /**
     * emit message to server
     * @param {string} type - message type
     * @param {Object} data - message data
     * @param {boolean} hist_flag
     */
    emit_msg(type, data, hist_flag=true) {
        console.log(`Board.emit_msg(type=${type}, data=${JSON.stringify(data)}), hist_flag=${hist_flag}`);
        this.ws.emit('json', {
            src: this.player,
            type: type,
            data: data,
            history: hist_flag
        });
    }

    /**
     * set turn
     * @param {number} player
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     */
    set_turn(turn) {
        console.log(`Board.set_turn(turn=${turn})`);
        this.turn = turn;
        
        this.txt[0].off();
        this.txt[1].off();

        if ( turn < 0 ) {
            return;
        }

        if ( turn >= 2 ) {
            this.txt[0].on();
            this.txt[1].on();
            return;
        }
            
        // turn == 0 or 1
        this.txt[turn].on();
    }

    /**
     * @param {number} player
     * @return {boolean}
     */
    game_is_finished(player) {
        console.log(`Board.game_is_finished(player=${player})`);
        for (let i=0; i < 15; i++) {
            const pip = this.checker[player][i].pip();
            console.log(`Board.game_is_finished()> i=${i}, pip=${pip}`);
            if ( pip != 0 ) {
                return false;
            }
        } // for(i)
        return true;
    }
    
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
    }

    /**
     * 使えるダイスを取得
     * @return {number[]}
     */
    get_active_dice(player) {
        let active_dice = [];

        const dice_value = this.dice_area[player].get();
        for (let i=0; i < dice_value.length; i++) {
            let v = dice_value[i];
            if ( v >= 1 && v <= 6 ) {
                active_dice.push(v);
            }
        }

        console.log(`Board.get_active_dice()> active_dice=${JSON.stringify(active_dice)}`);
        return active_dice;
    }

    /**
     * load all game information
     * @param {Object} gameinfo - game information object
     */
    load_gameinfo(gameinfo) {
        console.log(`Board.load_info()`);

        // escape checkers
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let ch = this.checker[player][i];
                ch.el.hidden = true;
                ch.cur_point = undefined;
                ch.move(0, 0);
            }
        }

        // clear points
        for (let i=0; i < this.point.length; i++) {
            this.point[i].checkers = [];
        } // for(i)

        // put checkers
        let p = gameinfo.board.point;
        let p_idx = [0, 0];
        for (let i=0; i < p.length; i++) {
            if ( p[i].length == 0 ) {
                continue;
            }

            for (let j=0; j < p[i].length; j++) {
                let player = p[i][0];
                let ch = this.checker[player][p_idx[player]];
                this.put_checker(ch, i, false);
                ch.el.hidden = false;
                p_idx[player]++;
            } // for (j)
        } // for(i)

        // turn
        this.set_turn(gameinfo.turn);

        // cube
        let c = gameinfo.board.cube;
        console.log(`gameinfo.board.cube=${JSON.stringify(c)}`);
        this.cube.set(c.value, c.side, c.accepted, false);

        // dice
        let d = gameinfo.board.dice;
        console.log(`gameinfo.board.dice=${JSON.stringify(d)}`);
        this.dice_area[0].set(d[0], false);
        this.dice_area[1].set(d[1], false);
    }

    /**
     *
     */
    inverse() {
        console.log(`Board.inverse()`);
        
        this.player = 1 - this.player;

        this.el.style.transformOrigin = (this.w / 2) + "px "
            + (this.h / 2) + "px";
        if ( this.player == 0 ) {
            this.el.style.transform = "rotate(0deg)";
        } else {
            this.el.style.transform = "rotate(180deg)";
        }
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        console.log(`Board.on_mouse_down> (x,y)=(${x},${y})`);

        // dice area
        let da = this.dice_area[this.player];
        if ( da.in_this(x, y) ) {
            if ( ! this.cube.accepted ) {
                return;
            }
            if ( da.active ) {
                this.set_turn( 1 - this.player );
                da.clear(true);
                return;
            }

            if ( this.turn == this.player ) {
                da.roll();
            } else if ( this.turn >= 2 ) {
                this.set_turn(this.player);
                da.roll();
            }
            let dice_values = da.get();
            console.log(`Board.on_mouse_down> dice_values=${JSON.stringify(dice_values)}`);
        }
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_move(e) {
        let [x, y] = this.get_xy(e);

        if ( this.moving_checker === undefined ) {
            return;
        }

        this.moving_checker.move(x, y, true);
    }

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
    }

    /**
     * 
     * @param {Checker} ch - Checker
     * @param {number} p - point index
     * @param {boolean} [emit=true] - emit flag
     */
    put_checker(ch, p, emit=true) {
        console.log(`Board.put_checker(ch.id=${ch.id}, p=${p}, emit=${emit})`);

        let prev_p = undefined;
        if ( ch.cur_point !== undefined ) {
            prev_p = ch.cur_point;
            console.log(`Board.put_checker> prev_p=${prev_p}`);
            ch = this.point[prev_p].checkers.pop();
            console.log(`Board.put_checker> ch.id=${ch.id}`);
        }

        let po = this.point[p];
        let ch_n = po.checkers.length;
        let z = Math.floor(ch_n / po.max_n);
        let n = ch_n % po.max_n;
        let x = po.cx;
        let y = po.y0 + (ch.h / 2 + ch.h * n * 0.75 + ch.h / 5 * z) * po.direction;
        ch.move(x, y, true);
        ch.calc_z();
        ch.cur_point = p;

        po.checkers.push(ch);

        if ( this.dice_area[ch.player].check_disable() ) {
            const dice_values = this.dice_area[this.player].get();
            this.emit_msg('dice', { turn: this.turn,
                                    player: ch.player,
                                    dice: dice_values }, false);
        }

        if ( emit ) {
            this.emit_msg('put_checker', {ch: ch.id, p1: prev_p, p2: p});
        }
    }
} // class Board

/**
 *
 */
class BoardArea extends BackgammonArea {
    constructor(board, x, y, w, h) {
        super(x, y, w, h);
        this.board = board;
    }
} // class BoardArea

/**
 * 
 */
class BoardPoint extends BoardArea {
    constructor(board, x, y, w, h, direction, max_n) {
        super(board, x, y, w, h);
        this.direction = direction; // up: +1, down: -1
        this.max_n = max_n;

        this.cx = this.x + this.w / 2;

        if ( this.direction > 0 ) {
            this.y0 = this.y;
        } else {
            this.y0 = this.y  + this.h;
        }

        this.checkers = [];
    }
} // class BoardPoint

/**
 *
 */
class DiceArea extends BoardArea {
    constructor(board, x, y, w, h, player) {
        super(board, x, y, w, h);
        this.player = player;

        this.active = false;

        let prefix = "dice" + this.player;

        this.dice = [];
        for (let i=0; i < 4; i++) {
            const x1 = this.w / 20 * (i * 4 + 1);
            let x2 = this.x + x1;
            if ( this.player == 1 ) {
                x2 = this.x + this.w - x1;
            }
            this.dice.push(new Dice(prefix + i,
                                    this.board, this.player,
                                    x2,
                                    this.y + this.h / 4 * ((i * 2 + 1) % 4),
                                    prefix));
        } // for(i)
    }

    /**
     * Set dice values
     * @param {number[][]} dice_value
     * @param {boolean} [emit=true] - emit flag
     */
    set(dice_value, emit=true) {
        console.log(`DiceArea[${this.player}].set(dive_value=${JSON.stringify(dice_value)}, emit=${emit})`);
        
        this.clear();
        
        for (let i=0; i < 4; i++) {
            if ( dice_value[i] < 1 ) {
                continue;
            }
            this.dice[i].set(dice_value[i]);
            this.active = true;
        } // for(i)

        if ( emit ) {
            this.emit_msg('dice', { turn: this.board.turn,
                                    player: this.player,
                                    dice: dice_value }, true);
        }
    }

    /**
     * Get dice values list
     * @return {number[]} - dice values
     */
    get() {
        let values = [];
        for (let i=0; i < this.dice.length; i++) {
            values.push(this.dice[i].value);
        }
        console.log(`DiceArea.get> values=${JSON.stringify(values)}`);
        return values;
    }

    /**
     * 使えないダイスを確認してdisable()する
     * @return {boolean} - modified
     */
    check_disable() {
        let modified = false;
        
        for (let i=0; i < 4; i++) {
            let dice_value = this.dice[i].value;
            if ( dice_value < 1 || dice_value > 6 ) {
                continue;
            }

            // ヒットされている場合は、復活できるか確認
            let bar_p = 26;
            if ( this.player == 1 ) {
                bar_p = 27;
            }
            if ( this.board.point[bar_p].checkers.length > 0 ) {
                let dst_p = dice_value;
                if ( this.player == 0 ) {
                    dst_p = 25 - dice_value;
                }

                let checkers = this.board.point[dst_p].checkers;
                if ( checkers.length > 1 && checkers[0].player != this.player ) {
                    this.dice[i].disable();
                    modified = true;
                    continue;
                }
            }

            // 全てのチェッカーで、移動できるかのチェック
            // XXX T.B.D. XXX
            
        } // for(i)

        return modified;
    }

    /**
     * Roll dices
     * @return {number[]} - dice values
     */
    roll() {
        console.log("DiceArea.roll()");
        this.clear();

        let d1 = Math.floor(Math.random()  * 4);
        let d2 = d1;
        while ( d1 == d2 ) {
            d2 = Math.floor(Math.random()  * 4);
        }
        console.log(`[d1, d2]=[${d1}, ${d2}]`);

        this.active = true;

        const value1 = this.dice[d1].roll();
        const value2 = this.dice[d2].roll();

        if ( value1 == value2 ) {
            for ( let d = 0; d < 4; d++ ) {
                this.dice[d].set(value1);
            }
        }

        if ( this.check_disable() ) {
            for (let i=0; i < 4; i++) {
                const dice_value = this.dice[i].value;
                if ( dice_value >= 1 && dice_value <= 6 ) {
                    for (let j=0; j < 4; j++) {
                        this.dice[j].enable();
                    } // for(j)
                    break;
                }
            } // for(i)
        }
        const dice_values = this.get();

        /**
         * emit
         */
        this.emit_msg('dice', { turn: this.board.turn,
                                player: this.player,
                                dice: dice_values }, true);

        return dice_values;
    }

    /**
     *
     */
    clear(emit=false) {
        console.log("DiceArea.clear()");
        for ( let d=0; d < 4; d++ ) {
            this.dice[d].set(0);
            this.dice[d].el.hidden = true;
            this.dice[d].enable();
        }
        this.active = false;

        if ( emit ) {
            this.emit_msg('dice', { turn: this.board.turn,
                                    player: this.player,
                                    dice: [0, 0, 0, 0] }, true);
        }
        return [];
    }
} // DiceArea

let ws = undefined;

/**
 *
 */
window.onload = function () {
    let url = "http://" + document.domain + ":" + location.port + "/";
    ws = io.connect(url);

    let player = 0;
    if ( location.pathname == "/p2" ) {
        player = 1;
    }

    let board = new Board("board", 0, 20, player, ws);

    ws.on('connect', function() {
        console.log('ws.on(connected)');

    });

    ws.on('disconnect', function() {
        console.log('ws.on(disconnected)');
    });

    ws.on('json', function(msg) {
        console.log(`ws.on(json):msg=${JSON.stringify(msg)}`);

        if ( msg.type == 'gameinfo' ) {
            board.load_gameinfo(msg.data);
            return;
        } // 'gameinfo'

        if ( msg.type == 'put_checker' ) {
            console.log(`board.turn=${board.turn}`);
            if ( board.turn == -1 ) {
                return;
            }
            let ch = board.search_checker(msg.data.ch);
            board.put_checker(ch, msg.data.p2, false);
            return;
        } // 'put_checker'

        if ( msg.type == 'cube' ) {
            board.cube.set(msg.data.value,
                           msg.data.side,
                           msg.data.accepted,
                           false);
            return;
        } // 'cube'

        if ( msg.type == 'dice' ) {
            console.log(`board.turn=${board.turn}`);
            if ( board.turn == -1 ) {
                return;
            }
            board.set_turn(msg.data.turn);
            board.dice_area[msg.data.player].set(msg.data.dice, false);
            if ( board.turn < 0 ) {
                board.txt[0].off();
                board.txt[1].off();
            }
            return;
        } // 'dice'
    });
}; // window.onload

const backward_hist = () => {
    console.log('backward_hist()');
};

const forward_hist = () => {
    console.log('forward_hist()');
};

const back2 = () => {
    console.log('back2');
    emit_msg('back2', {}, false);
};

const fwd2 = () => {
    console.log('fwd2');
    emit_msg('fwd2', {}, false);
};

const back_all = () => {
    console.log('back_all()');
    emit_msg('back_all', {}, false);
};

const fwd_all = () => {
    console.log('back_all()');
    emit_msg('fwd_all', {}, false);
};
    

/**
 *
 */
const emit_msg = (type, data, history=false) => {
    console.log(`emit_msg> type=${type}, data=${JSON.stringify(data)}`);
    ws.emit('json', {src: "player", type: type, data: data, history: history});        
};
