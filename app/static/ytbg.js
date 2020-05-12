/**
 *=====================================================
 * [Class tree]
 *
 * CookieBase
 *
 * SoundBase
 *
 * BackgammonBase .. have (x, y)
 *   |
 *   +- BackgammonArea .. have (w, h) / without image
 *        |
 *        +- ImageItem .. have image, mouse handler
 *        |    |
 *        |    +- BoardItem .. on board
 *        |    |    |
 *        |    |    +- BoardButton
 *        |    |    |    +- InverseButton
 *        |    |    |    +- EmitButton
 *        |    |    |         +- BackButton
 *        |    |    |         +- Back2Button
 *        |    |    |         +- BackAllButton
 *        |    |    |         +- FwdButton 
 *        |    |    |         +- Fwd2Button 
 *        |    |    |         +- FwdAllButton 
 *        |    |    +- Cube
 *        |    |    |
 *        |    |    +- PlayerItem .. owned by player
 *        |    |         +- OnBoardText
 *        |    |         +- BannerText
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
const VERSION = "0.56";
const GAMEINFO_FILE = "gameinfo.json";

let ws = undefined;
let board = undefined;
const nav = document.getElementById("nav-input");

sound1 = "/static/sounds/computerbeep_12.mp3";
sound2 = "/static/sounds/computerbeep_43.mp3";
sound3 = "/static/sounds/computerbeep_58.mp3";

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
        console.log(`CookieBase.load> allcookie="${allcookie}"`);

        if ( allcookie.length == 0 ) {
            return {};
        }

        for (let ent of allcookie.split("; ")) {
            let [k, v] = ent.split('=');
            console.log(`k=${k},v=${v}`);
            this.data[k] = v;
        } // for(i)

        return this.data;
    } // CookieBase.load()

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

    set(key, value) {
        document.cookie = `${key}=${encodeURIComponent(value)};`;
    }
    
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
        console.log(`SoundBase(board.svr_id=${board.svr_id},soundfile=${soundfile}`);
        this.board = board;
        this.soundfile = soundfile;
        this.audio = new Audio(this.soundfile);
    } // SoundBase.constructor()

    play() {
        console.log(`SoundBase.play>soundfile=${this.soundfile}`);
        console.log(`SoundBase.play>sound=${this.board.sound}`);
        if ( this.board.sound ) {
            return this.audio.play();
        } else {
            return false;
        }
    } // SoundBase.play()
} // class SoundBase

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

    goal_point(player) {
        return (25 * player);
    }

    /**
     * ポイントとダイスの目から行き先のポイントを計算
     * @param {number} player
     * @param {number} src_p
     * @param {number} dice_val
     * @return {number} - destination point
     */
    calc_dst_point(player, src_p, dice_val) {
        let dst_p = undefined;
        
        if ( player == 0 ) {
            if ( src_p == 26 ) {
                src_p = 25;
            }
            dst_p = src_p - dice_val;
            if ( dst_p < 0 ) {
                dst_p = 0;
            }
        } else { // player1
            if ( src_p == 27 ) {
                src_p = 0;
            }
            dst_p = src_p + dice_val;
            if ( dst_p > 25 ) {
                dst_p = 25;
            }
        }
        return dst_p;
    } // BackgammonBase.calc_dst_point()

    /**
     * @param {number} player
     * @param {number} point
     * @return {number} - pip count
     */
    pip(player, point) {
        if ( point === undefined ) {
            return undefined;
        }

        if ( point > 25 ) {
            point = 25;
        }
        
        if ( this.player == 0 ) {
            return point;
        }
        // player == 1
        return (25 - point);
    }

    bar_point(player) {
        let bar_p = 26;
        if ( player == 1 ) {
            bar_p = 27;
        }
        return bar_p;
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
} // class BackgammonArea

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
        this.el.ontouchmove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.null_handler.bind(this);

        this.move(this.x, this.y, false);

        this.e = undefined; // MouseEvent
    } // ImageItem.constructor()

    on() {
        this.el.hidden = false;
    } // ImageItem.on()

    off() {
        this.el.hidden = true;
    } // ImageItem.off()

    /**
     * move to (x, y)
     * @param {number} x
     * @param {number} y
     * @param {boolean} center - center flag
     */
    move(x, y, center=false, sec=0) {
        [this.x, this.y] = [x, y];

        this.el.style.transitionTimingTunction = "liner";
        this.el.style.transitionDuration = sec + "s";
        this.el.style.left = this.x + "px";
        this.el.style.top = this.y + "px";
        if ( center ) {
            this.el.style.left = (this.x - this.w / 2) + "px";
            this.el.style.top = (this.y - this.h / 2) + "px";
        }
    } // ImageItem.move()

    /**
     * @param {number} deg
     */
    rotate(deg, center=false, sec=0) {
        console.log(`rotate(deg=${deg}, center=${center}, sec=${sec})`);
        this.el.style.transformOrigin = "top left";
        if ( center ) {
            this.el.style.transformOrigin = "center center";
        }
        this.el.style.transitionDuration = sec + "s";
        this.el.style.transform = `rotate(${deg}deg)`;
    } // ImageItem.rotate()

    /**
     * touch event to mouse event
     * only for get_xy() function
     *
     * @param {MouseEvent} e
     */
    touch2mouse(e) {
        // console.log(`ImageItem.touch2mouse()`);
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        return e;
    } // ImageItem.touch2mouse()
    
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
    } // ImageItem.inverse_xy()

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
    } // ImageItem.get_xy()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
    } // ImageItem.on_mouse_down()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_up(e) {
        let [x, y] = this.get_xy(e);
    } // ImageItem.on_mouse_up()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_move(e) {
        let [x, y] = this.get_xy(e);
    } // ImageItem.on_mouse_move()

    /**
     * @param {MouseEvent} e
     */
    null_handler(e) {
        return false;
    } // ImageItem.null_handler()
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
 *
 * T.B.D. この中間クラスはいらないかも？
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
        this.board.inverse(0.5);
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
        emit_msg(this.type, {});
    }
} // class EmitButton

/**
 *
 */
class BackButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back", x, y);
    }
} // class BackButton

/**
 *
 */
class Back2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back2", x, y);
    }
} // class Back2Button

/**
 *
 */
class BackAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "back_all", x, y);
    }
} // class BackAllButton

/**
 *
 */
class FwdButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd", x, y);
    }
} // class FwdButton

/**
 *
 */
class Fwd2Button extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd2", x, y);
    }
} // class FwdButton

/**
 *
 */
class FwdAllButton extends EmitButton {
    constructor(id, board, x, y) {
        super(id, board, "fwd_all", x, y);
    }
} // class FwdAllButton

/**
 *                    x0
 *                    |
 *                    |
 *            y ->+---|-------------------------------------------------
 *                |   v   13 14 15 16 17 18     19 20 21 22 23 24       |
 *        by[0] --->+-+-----------------------------------------------  |
 *                | |   ||p0          p1   |   |p1             p0||   | |
 * y2[1] ------------>+ ||p0          p1   |   |p1 tx     dx   p0||   | |
 *                | |   ||p0          p1   |27 |p1 |      |      ||25 | |
 * y1[1] ------------>+ ||p0               |   |p1 |      v      ||   | |
 *                | |   ||p0               |   |p1 v      +------+<-------dy
 *                | |   ||         ty ------------>+------| Dice ||   | |
 * y0 --------------->+ ||                 |---|   |Text  | Area ||---| |
 *                | |   ||                 |   |    ------|      ||   | |
 *                | |   ||p1               |   |p0         ------||   | |
 * y1[0] ------------>+ ||p1               |   |p0               ||   | |
 *                | |   ||p1          p0   |26 |p0               || 0 | |
 * y2[0] ------------>+ ||p1          p0   |   |p0             p1||   | |
 *                | |   ||p1          p0   |   |p0             p1||   | |
 *        by[1] --->+-------------------------------------------------  |
 *                |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *                 ----------------------------------------------------- 
 */
class Cube extends BoardItem {
    constructor(id, board) {
        super(id, board, 0, 0);

        this.player = undefined;
        this.value = 1;
        this.accepted = false;

        this.move_sec = 0.3;
        
        this.x0 = (this.board.bx[0] + this.board.bx[1]) / 2;
        this.y0 = this.board.h / 2;
        this.y2 = [this.board.by[1] - this.h / 2,
                   this.board.by[0] + this.h / 2];
        this.y1 = [(this.y2[0] + this.board.h / 2) / 2,
                   (this.y2[1] + this.board.h / 2) / 2];
        
        this.file_prefix = this.image_dir + "cube";

        this.el.style.cursor = "pointer";

        this.move(this.x0, this.board.h / 2, true);
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
            this.move(this.x0, this.y0, true, this.move_sec);
        } else if ( accepted ) {
            this.player = player;
            this.move(this.x0, this.y2[this.player], true, this.move_sec);
        } else {
            this.player = player;
            this.move(this.x0, this.y1[this.player], true, this.move_sec);
        }

        if ( emit ) {
            let side = this.player;
            if ( side === undefined ) {
                side = -1;
            }

            emit_msg("cube",
                     { side: side,
                       value: this.value,
                       accepted: this.accepted },
                     true);
        }
    } // Cube.set()

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
    } // Cube.double()

    /**
     *
     */
    double_accept() {
        console.log("Cube.double_accept()");

        this.set(this.value, this.player, true);
    } // Cube.double_accept()

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
    } // Cube.double_cancel()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        const [x, y] = this.get_xy(e);
        console.log("Cube.on_mouse_down> this.player=" + this.player
                   + ", this.board.player=" + this.board.player);

        if ( this.player !== undefined && this.player != this.board.player ) {
            if ( ! this.accepted ) {
                this.double_cancel();
            }
            return false;
        }

        if ( this.player === undefined || this.accepted == true ) {
            this.double(this.board.player);
        } else {
            this.double_accept();
        }
        return false;
    } // Cube.on_mouse_down
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
    constructor(id, board, player, x, y) {
        super(id, board, player, x, y);

        this.el.style.removeProperty("width");
        this.el.style.removeProperty("height");

        this.default_text = `Player ${player + 1}`;
    }

    get_text() {
        return this.el.innerHTML;
    } // OnBoardText.get_text()
    
    set_text(txt) {
        this.el.innerHTML = this.default_text;
        if ( txt.length > 0 ) {
            this.el.innerHTML = txt;
        }
    } // OnBoardText.set_text()

    on() {
        this.el.style.borderColor = "rgba(0, 128, 255, 0.8)";
        this.el.style.color = "rgba(0, 128, 255, 0.8)";
    }

    red() {
        this.el.style.borderColor = "rgba(255, 0, 0, 0.8)";
        this.el.style.color = "rgba(255, 0, 0, 0.8)";
    }

    off() {
        this.el.style.borderColor = "rgba(128, 128, 128, 0.5)";
        this.el.style.color = "rgba(128, 128, 128, 0.5)";
    }
} // class OnBoardText

/**
 *
 */
class BannerText extends OnBoardText {
    constructor(id, board, player, x, y) {
        super(id, board, player, x, y);
        console.log(`BannerText(id=${id},player=${player},x=${x},y=${y})`);

        this.el.style.fontFamily = "sans-serif";
        this.el.style.fontStyle = "italic";
        this.el.style.fontSize = "50px";
        this.el.style.fontWeight = "900";

        this.el.style.opacity = 0.8;
        this.el.style.color = "red";
        this.el.style.backgroundColor = "lightsteelblue";

        this.default_text = "";
        this.set_text("");
    }

    /**
     * @param {string} txt
     */
    set_text(txt) {
        super.set_text(txt);
        if ( txt.length == 0 ) {
            this.off();
        }
    } // BannerText.set_text()

    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        console.log(`BannerText.on_mouse_down>(x,y)=(${x},${y})`);
        
        this.board.emit_banner(this.player, "", true);
        return false;
    } // BannerText.on_mouse_down()
} // class BannerText

/**
 *
 */
class Dice extends PlayerItem {
    constructor(id, board, player, x, y, file_prefix) {
        super(id, board, player, x, y);
        console.log(`Dice> (x,y)=(${x},${y})`);
        this.file_prefix = file_prefix;

        [this.x1, this.y1] = [this.x, this.y];
        console.log(`Dice> x1=${this.x1}, y1=${this.y1}`);
        [this.x0, this.y0] = [0, 0];
        
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

        this.move(this.x0, this.y0, true);
    }

    /**
     *
     */
    enable() {
        this.value = this.value % 10;
        this.image_el.style.opacity = 1.0;
    }

    /**
     *
     */
    disable() {
        this.value = this.value % 10 + 10;
        this.image_el.style.opacity = 0.5;
    }

    /**
     *
     */
    get_filename(val) {
        val %= 10;
        return this.image_dir + this.file_prefix + val + this.file_suffix;
    }

    /**
     * 
     */
    clear() {
        this.set(0);
    }

    /**
     * @param {number} val - dice number, 11-16 .. disable
     * @param {boolean} [roll_flag=false]
     */
    set(val, roll_flag=false) {
        console.log(`Dice.set(val=${val},roll_flag=${roll_flag})>`);
        this.value = val;

        this.enable();

        if (val % 10 < 1) {
            this.move(this.x0, this.y0, 1);
            this.el.hidden = true;
            return;
        }

        if (val > 10) {
            this.disable();
        }

        this.el.firstChild.src = this.get_filename(val % 10);
        this.el.hidden = false;

        if ( roll_flag ) {
            //this.move(this.x0, this.y0, true, 0);
            this.rotate(Math.floor(Math.random() * 720 - 360), true, .5);
            this.move(this.x1, this.y1, true, 1);
        } else {
            this.move(this.x1, this.y1, true, 0);
        }
    } // Dice.set()

    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        console.log(`Dice.on_mouse_down> x=${x},y=${y}`);

        this.board.set_turn(1 - this.player);
        this.board.emit_turn(1 - this.player, false);

        const da = this.board.dice_area[this.player];

        if ( this.board.closeout(this.player) ) {
            console.log(`Dice.on_mouse_down>close out!`);
            this.board.txt[1 - this.player].red();
            this.board.emit_banner(1 - this.player, "Close out");
        }
        da.clear(true);
        console.log(`Dice.on_mouse_down:return false;`);
        return false;
    } // Dice.on_mouse_down()
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
    } // Checker.distance()
    
    /**
     * @return {number} - pip count
     */
    pip() {
        return super.pip(this.player, this.cur_point);
    } // Checker.pip()

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
     *
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        console.log(`Checker.on_mouse_down> this.id=${this.id},(x,y)=${x},${y})`);
        
        // check active dices
        const active_dice = this.board.get_active_dice(this.player);
        console.log(`Checker.on_mouse_down> active_dice=${active_dice}`);
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

        // 移動可能か確認
        const dst_p = this.board.get_dst_points(this.player, this.cur_point);
        console.log(`dst_p=${JSON.stringify(dst_p)}`);
        if ( dst_p.length == 0 ) {
            return;
        }

        // クリックされたポイントの先端のチェッカーに持ち換える
        let ch = this;
        if ( ch.cur_point !== undefined ) {
            ch = this.board.point[ch.cur_point].checkers.slice(-1)[0];
            console.log(`Checker.on_mouse_down> ch.id=${ch.id}`);
        }
        this.board.moving_checker = ch;

        [ch.src_x, ch.src_y] = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    } // Checker.on_mosue_down()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_up(e) {
        let [x, y] = this.get_xy(e);
        console.log(`Checker.on_mouse_up> this.id=${this.id},x=${x},y=${y}`);

        const ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }

        console.log(`Checker.on_mouse_up> ch.id=${ch.id}`);

        ch.move(x, y, true);

        let dst_p = ch.board.chpos2point(ch);
        console.log(`Checker.on_mouse_up> dst_p=${dst_p}`);

        const active_dice = this.board.get_active_dice(ch.player);
        console.log(`Checker.on_mouse_up> active_dice=${JSON.stringify(active_dice)}`);

        if ( dst_p == ch.cur_point ) {
            //
            // XXX T.B.D. ワンタッチでのムーブ??
            //
            const available_p = this.board.get_dst_points(ch.player, ch.cur_point);
            if ( available_p.length == 0 ) {
                this.cancel_move(ch);
                return;
            }
            console.log(`Checker.on_mouse_up>available_p=${JSON.stringify(available_p)}`);
            if ( ch.player == 0 ) {
                dst_p = Math.min(...available_p);
            } else {
                dst_p = Math.max(...available_p);
            }
        }

        /**
         * ダイスの目による判定
         */
        let dice_value = this.dice_check(active_dice, ch.cur_point, dst_p);
        if ( dice_value == 0 ) {
            // ダイスの目と一致しない場合
            // bearing off の確認

            let cancel_flag = true;

            if ( dst_p == this.goal_point(ch.player) ) {
                // dst_p がゴールポイント
                if ( this.board.all_inner(ch.player) ) {
                    // 全てがインナーにある
                    dice_value = Math.max(...active_dice);
                    if ( ch.pip() < dice_value ) {
                        // 大きい方の目よりゴールに近い
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
        let checkers = ch.board.point[dst_p].checkers;

        if ( dst_p == this.goal_point(ch.player) ) {
            if ( this.board.all_inner(ch.player) ) {
                can_move = true;
            }
        } else if ( dst_p >= 26 ) {
            // bar point: cannnot move
        } else if ( checkers.length == 0 ) {
            can_move = true;
        } else if ( checkers[0].player == ch.player ) {
            can_move = true;
        } else if ( checkers.length == 1 ) {
            /**
             * hit !
             */
            can_move = true;
            hit_ch = checkers[0];
            console.log(`Checker.on_mouse_up()> hit_ch.id=${hit_ch.id}`);
        }
            
        if ( ! can_move ) {
            console.log(`Checker.on_mouse_up()> cancel`);
            this.cancel_move(ch);
            return;
        }

        // 移動OK. 以降、移動後の処理

        const da = this.board.dice_area[ch.player];

        if ( hit_ch !== undefined ) {
            // hit
            console.log(`Checker.on_mouse_up> hit_ch.id=${hit_ch.id}`);

            let bar_p = 26;
            if ( hit_ch.player == 1 ) {
                bar_p = 27;
            }

            ch.board.put_checker(hit_ch, bar_p, 0.3, true, false);
            hit_ch.calc_z();
        }

        // move_checker
        ch.board.put_checker(ch, dst_p, 0.3, true, false);
        ch.calc_z();

        // 使ったダイスを使用済みする
        //for (let i=0; i < 4; i++) {
        for (let d of da.dice) {
            if ( d.value == dice_value ) {
                d.disable();
                break;
            }
        } // for(i)

        // まだ、バーポイントに残っている場合、もう一つのダイスが使えるか確認
        let bar_p = this.bar_point(ch.player);
        if ( this.board.point[bar_p].checkers.length > 0 ) {
            console.log(`Checker.on_mouse_up> T.B.D.`);
            let ch2 = this.board.point[bar_p].checkers[0];
            if ( this.board.get_dst_points(ch2.player, bar_p).length == 0 ) {
                for (let d of da.dice) {
                    d.disable();
                }
            }
        }

        // emit dice values to server
        // const dice_values = this.board.dice_area[this.player].get();
        emit_msg("dice", { player: this.player,
                           dice: da.get(),
                           roll: false}, true);

        ch.board.moving_checker = undefined;

    } // Checker.on_mouse_up()

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
 *         v |   vv                 |   |                 ||   |
 *     y ->+-|----------------------|---|-----------------||---|-
 *         | v     13 14 15 16 17 18v   v19 20 21 22 23 24vv   v |
 * by[0] --->+----------------------+---+-----------------++---+ |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 *         | |   ||p0          p1   |   |p1 tx     dx   p0||   | |
 *         | |   ||p0          p1   |27 |p1 |      |      ||25 | |
 *         | |   ||p0               |   |p1 |      v      ||   | |
 *         | |   ||p0               |   |p1 v      +------+<---------dy
 *         | |   ||         ty ------------>+------| Dice ||   | |
 *         | |   ||                 |---|   |      | Area ||---| |
 *         | |   ||                 |   |    ------|      ||   | |
 *         | |   ||p1               |   |p0         ------||   | |
 *         | |   ||p1               |   |p0               ||   | |
 *         | |   ||p1          p0   |26 |p0               || 0 | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 * by[1] --->+-------------------------------------------------  |
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
    constructor(id, x, y, ws) {
        console.log(`Board(id=${id},x=${x},y=${y})`);
        super(id, x, y);

        this.ws = ws;
        
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
        this.sound_turn_change = new SoundBase(this, sound2);

        // Player name
        if ( this.load_player() === undefined ) {
            this.set_player(0);
        }

        this.turn = -1;

        this.bx = [27, 81, 108, 432, 540, 864, 891, 945];
        this.by = [20, 509];
        [this.tx, this.ty] = [this.bx[4]+5, 246];
        [this.tx2, this.ty2] = [this.bx[4]+20, this.by[0]+205];
        [this.dx, this.dy] = [620, 245];

        this.gameinfo = undefined;

        // Title
        const name_el = document.getElementById("name");
        /*
        name_el.style.width = this.w + "px";
        name_el.style.left = this.x + "px";
        name_el.style.top = this.y + this.h + "px";
        */
        const ver_el = document.getElementById("version");
        ver_el.innerHTML = `<strong>Client</strong>, Ver. ${VERSION}`;

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
        this.button_inverse.move(
            bx0, this.y + this.h / 2 - this.button_inverse.h / 2);
        
        // <body>
        let body_el = document.body;
        body_el.style.width = (
            this.button_back.x + this.button_back.w + 100) + "px";
        body_el.style.height = (this.y + this.h + 10) + "px";

        // OnBoardText
        this.txt = [];
        this.txt.push(new OnBoardText(
            "p0text", this, 0, this.tx, this.ty));
        this.txt.push(new OnBoardText(
            "p1text", this, 1, this.w - this.tx, this.h - this.ty));
        this.txt[1].rotate(180);

        for (let p=0; p < 2; p++) {
            this.txt[p].set_text("");
            this.txt[p].on();
        }

        // BannerText
        this.banner = [];
        this.banner.push(new BannerText(
            "p0banner", this, 0, this.tx2, this.ty2));
        this.banner.push(new BannerText(
            "p1banner", this, 1, this.w - this.tx2, this.h - this.ty2));
        this.banner[1].rotate(180);
        /*
        for (let p=0; p < 2; p++) {
            this.banner[p].set_text("");
        }
        */

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
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, p, -1, cn));
            }
            if ( p >= 1 && p <= 6 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 6 - p;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, p, -1, cn));
            }
            if ( p >= 7 && p <= 12 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 12 - p;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, p, -1, cn));
            }
            if ( p >= 13 && p <= 18 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0];
                let xn = p - 13;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, p, 1, cn));
            }
            if ( p >= 19 && p <= 24 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0];
                let xn = p - 19;
                let x = x0 + pw * xn;
                this.point.push(new BoardPoint(this, x, y0, pw, ph, p, 1, cn));
            }
            if ( p == 25 ) {
                let x0 = this.bx[6];
                let y0 = this.by[0];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, p, 1, cn));
            }
            if ( p == 26 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, p, 1, cn));
            }
            if ( p == 27 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0];
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint(this, x0, y0, pw, ph, p, -1, cn));
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

        //this.rotate(360, true, 0.5);
        if ( this.player == 1 ) {
            this.player = 0;
            this.inverse(0);
        }
    } // Board.constructor()

    /**
     * @return {boolean} sound
     */
    load_sound_switch() {
        console.log(`Board.load_sound_switch>cookie_sound=${this.cookie_sound}`);

        const s = this.cookie.get(this.cookie_sound);
        console.log(`Board.load_sound_switch>s=${s}`);
        if ( s === undefined ) {
            this.sound = false;
        } else {
            this.sound = JSON.parse(s);
        }
        console.log(`Board.load_sound_switch>sound=${this.sound}`);
        this.el_sound.checked = this.sound;

        return this.sound;
    } // Board.load_sound_switch()
        
    /**
     * @return {boolean} sound
     */
    apply_sound_switch() {
        console.log(`Board.apply_sound_switch>cookie_sound=${this.cookie_sound}`);

        this.sound = document.getElementById("sound-switch").checked;
        console.log(`Board.apply_sound_switch>sound=${this.sound}`);

        this.cookie.set(this.cookie_sound, this.sound);
        this.el_sound.checked = this.sound;
        return this.sound;
    } // Board.apply_sound_switch()

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
    emit_turn(turn, add_hist=false) {
        console.log(`Boad.emit_turn(turn=${turn},add_hist=${add_hist})`);
        emit_msg("set_turn", { turn: turn }, add_hist);
    } // Board.emit_turn()

    /**
     * @param {number} turn
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
    } // Board.set_turn()

    /**
     * cals pip count
     *
     * @param {number} player
     */
    pip_count(player) {
        let count = 0;
        for (let ch of this.checker[player]) {
            count += ch.pip();
        } // for(ch)
        console.log(`Board.pip_count>count=${count}`);
        return count;
    } // Board.pip_count()

    /**
     * @param {number} player
     * @return {boolean}
     */
    game_is_finished(player) {
        const pip_count = this.pip_count(player);
        console.log(`Board.game_is_finished(player=${player})>pip_count=${pip_count}`);

        if ( pip_count == 0 ) {
            return true;
        }
        return false;
    } // Board.game_is_finished()

    /**
     * @param {number} player - winner
     */
    finish_game(player, emit=false) {
        console.log(`Board.finish_game(player=${player},emit=${emit})`);
        // ダイスを全て使用済みにする
        const da = this.dice_area[player];
        for (let i=0; i < 4; i++) {
            if ( da.dice[i].value > 0 ) {
                da.dice[i].disable();
            }
        } // for(i)
        
        this.emit_turn(-1);
        if ( emit ) {
            emit_msg("dice", { player: player,
                               dice:   da.get(),
                               roll:   false }, false);
        }

        this.emit_banner(player, "Win !");
    }
    
    /**
     * @param {number} player
     */
    pass(player) {
        this.emit_banner(player, "Pass");
    } // Board.pass()
    
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
     */
    closeout(player) {
        console.log(`Board.closeout(player=${player})`);

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
                return false;
            }
            if ( checkers[0].player != player ) {
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
        return this.dice_area[player].get_active_dice();
    } // Board.get_active_dice

    /**
     * 移動可能なポイントの取得
     * @param {number} player
     * @param {number} src_p
     * @return {number[]} - distination points
     */
    get_dst_points(player, src_p) {
        console.log(`Board.get_dst_points(player=${player},src_p=${src_p})`);

        let dst_p = [];

        let dice_vals = this.get_active_dice(player);
        if ( dice_vals.length == 0 ) {
            return [];
        }

        if ( dice_vals.length == 4 ) {
            dice_vals = [dice_vals[0]];
        }
        console.log(`Board.get_dst_points>dice_vals=${JSON.stringify(dice_vals)}`);
        for (let dice_val of dice_vals) {
            const dst_p1 = this.calc_dst_point(player, src_p, dice_val);
            console.log(`Board.get_dst_points> dst_p1=${dst_p1}`);

            if ( player == 0 && dst_p1 == 0 ) {
                if ( ! this.all_inner(player) ) {
                    continue;
                }
            }
            if ( player == 1 && dst_p1 == 25 ) {
                if ( ! this.all_inner(player) ) {
                    continue;
                }
            }

            const checkers = this.point[dst_p1].checkers;
            if ( checkers.length >= 2 && checkers[0].player != player) {
                continue;
            }

            dst_p.push(dst_p1);
        }

        console.log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);
        return dst_p;
    } // Board.get_dst_points()

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
            text: [ "", "" ],
            board: {
                cube: {
                    side: cube_side,
                    value: this.cube.value,
                    accepted: this.cube.accepted
                },
                dice: [
                    this.dice_area[0].get(),
                    this.dice_area[1].get()
                ],
                point: point
            }
        };
        
        return gameinfo;
    }

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
        
    }

    /**
     *
     */
    read_gameinfo() {
        let file = document.getElementById("read_gameinfo").files[0];
        console.log(`Board.read_gameinfo> file.name=${file.name}`);

        const reader = new FileReader();
        reader.onloadend = (e) => {
            const gameinfo = JSON.parse(e.target.result);
            console.log(`Board.read_gameinfo> gameinfo=${gameinfo}`);
            this.load_gameinfo(gameinfo);
            emit_msg("set_gameinfo", gameinfo);
        };
        reader.readAsText(file);
    }

    /**
     * load all game information
     * @param {Object} gameinfo - game information object
     */
    load_gameinfo(gameinfo, sec=0) {
        console.log(`Board.load_gameinfo(gameinfo=${JSON.stringify(gameinfo)},sec=${sec})`);

        this.gameinfo = gameinfo;
        
        // escape checkers
        console.log(`Board.load_gameinfo> escape checkers`);
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let ch = this.checker[player][i];
                ch.el.hidden = true;
                ch.cur_point = undefined;
                ch.move(0, 0);
            }
        }

        // clear points
        console.log(`Board.load_gameinfo> clear points`);
        for (let i=0; i < this.point.length; i++) {
            this.point[i].checkers = [];
        } // for(i)

        // put checkers
        const ch_point = gameinfo.board.checker;
        console.log(
            `Board.load_gameinfo> ch_point=${JSON.stringify(ch_point)}`);
        for (let i=0; i < 15; i++) {
            for (let p=0; p < 2; p++) {
                for (let c=0; c < 15; c++) {
                    const ch = this.checker[p][c];
                    if ( ch_point[p][c][1] == i ) {
                        this.put_checker(ch, ch_point[p][c][0], sec, false, false);
                        ch.el.hidden = false;
                    }
                } // for (c)
            } // for (p)
        } // for(i)

        // turn
        console.log(`Board.load_gameinfo> set turn`);
        this.set_turn(gameinfo.turn);

        // dice
        let d = gameinfo.board.dice;
        console.log(`Board.load_gameinfo> dice=${JSON.stringify(d)}`);
        this.dice_area[0].set(d[0], false);
        this.dice_area[1].set(d[1], false);

        // cube
        let c = gameinfo.board.cube;
        console.log(`Board.load_gameinfo> cube=${JSON.stringify(c)}`);
        this.cube.set(c.value, c.side, c.accepted, false);

        // banner
        console.log(`Board.load_gameinfo> banner=${JSON.stringify(gameinfo.board.banner)}`);
        this.set_banner(0, gameinfo.board.banner[0]);
        this.set_banner(1, gameinfo.board.banner[1]);

        // player name
        this.set_playername(0, gameinfo.text[0]);
        this.set_playername(1, gameinfo.text[1]);
    } // Board.load_gameinfo()

    /**
     *
     */
    inverse(sec) {
        console.log(`Board.inverse(sec=${sec})`);
        
        this.set_player(1 - this.player);
        
        if ( this.player == 0 ) {
            this.rotate(0, true, sec);
        } else {
            this.rotate(180, true, sec);
        }
    }

    /**
     * @param {MouseEvent} e
     */
    on_mouse_down(e) {
        let [x, y] = this.get_xy(e);
        console.log(`Board.on_mouse_down> (x,y)=(${x},${y})`);

        /*
        for (let p=0; p < 2; p++) {
            this.emit_banner(p, "");
        }
        */

        // dice area
        for (let p=0; p < 2; p++) {
            if ( this.dice_area[p].in_this(x, y) ) {
                this.dice_area[p].on_mouse_down(x, y);
            }
        } // for(p)
    } // Board.on_mouse_down()

    /**
     * @param {MouseEvent} e
     */
    on_mouse_move(e) {
        let [x, y] = this.get_xy(e);

        if ( this.moving_checker === undefined ) {
            return;
        }

        this.moving_checker.move(x, y, true);
    } // Board.on_mouse_move()

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
     * @param {number} sec
     * @param {boolean} [emit=true] - emit flag
     * @param {boolean} [add_hist=true] - add history flag
     */
    put_checker(ch, p, sec=0, emit=true, add_hist=true) {
        console.log(`Board.put_checker(ch.id=${ch.id},p=${p},sec=${sec},emit=${emit},add_hist=${add_hist})`);

        if (ch.cur_point !== undefined ) {
            // chがあったポイントからチェッカーを削除
            //
            // 前提: chは、ポイントの先端のチェッカー
            //
            const checkers = this.point[ch.cur_point].checkers;
            const ch_i = checkers.indexOf(ch);
            checkers.splice(ch_i, 1);
        }

        // 移動先ポイントに chを加える
        const idx = this.point[p].add(ch, sec);
        ch.cur_point = p;

        /*
        if ( p <= 25 ) { // ヒットされた移動の場合、ダイスチェックは不要
            if ( this.dice_area[ch.player].check_disable() ) {
                const dice_values = this.dice_area[ch.player].get();
                if ( emit ) {
                    emit_msg("dice", { turn:   this.turn,
                                       player: ch.player,
                                       dice:   dice_values,
                                       roll:   false }, false);
                }
            }
        }

        */
        
        if ( emit ) {
            if ( this.game_is_finished(ch.player) ) {
                this.finish_game(ch.player, true);
            }
            emit_msg("put_checker", { ch: parseInt(ch.id.slice(1)),
                                      p:  p,
                                      idx: idx }, add_hist);
        }
    } // Board.put_checker()

    /**
     * @param {number} player
     * @param {string} txt
     * @param {boolean} add_history
     */
    emit_banner(player, txt, add_hist=false) {
        console.log(`Board.emit_banner(player=${player},txt=${txt},add_hist=${add_hist})`);
        emit_msg("set_banner", { player: player,
                                 text: txt }, add_hist);
    } // Board.emit_banner()
    
    /**
     * @param {number} player
     * @param {string} txt
     */
    set_banner(player, txt) {
        console.log(`Board.set_banner(player=${player},txt=${txt})`);
        this.banner[player].set_text(txt);
        this.gameinfo['board']['banner'][player] = txt;

        if ( txt.length > 0 ) {
            this.banner[player].on();
        } else {
            this.banner[player].off();
        }
    } // Board.set_banner()

    /**
     * 
     */
    emit_playername(add_hist=true) {
        const el = document.getElementById("player-name");
        const name = el.value;
        const cur_name = this.txt[this.player].get_text();
        const def_name = this.txt[this.player].default_text;
        console.log(`Board.emit_playername(): this.player=${this.player},cur_name=${cur_name},name=${name}`);

        el.value = "";

        if ( name == cur_name ) {
            return;
        }
        if ( name == "" && cur_name == def_name ) {
            return;
        }
        emit_msg("set_playername", { player: parseInt(this.player),
                                     name: name }, add_hist);
    } // Board.emit_playername()

    /**
     * 
     */
    set_playername(player, name) {
        console.log(`Board.set_playername(player=${player},name=${name})`);
        if ( name == "" ) {
            name = `Player ${player+1}`;
            console.log(`Board.set_playername>name=${name}`);
        }
        this.txt[player].set_text(name);
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
    constructor(board, x, y, w, h, id, direction, max_n) {
        super(board, x, y, w, h);
        this.id = id;
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
        console.log(`BoardPoint.add(ch.id=${ch.id},sec=${sec})`);
        const n = this.checkers.length;
        const n2 = n % this.max_n;
        const n3 = Math.floor(n / this.max_n);
        const x = this.cx - ch.w * 0.05 * n3;
        const y = parseInt(Math.round(this.y0
                                      + ch.h * (0.5 + n2 * 0.75 + 0.1 * n3)
                                      * this.direction));
        console.log(`BoardPoint.add()> n=${n},y=${y}`);
        ch.move(x, y, true, sec);
        ch.set_z(n);
        ch.cur_point = this.id;
        this.checkers.push(ch);
        return n;
    } // BoardPoint.add()
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
     *
     */
    another_dicearea() {
        return this.board.dice_area[1 - this.player];
    }

    /**
     * Set dice values
     * @param {number[][]} dice_value
     * @param {boolean} [emit=true] - emit flag
     * @param {boolean} [roll_flag=false] 
     */
    set(dice_value, emit=true, roll_flag=false) {
        console.log(`DiceArea[${this.player}].set(dive_value=${JSON.stringify(dice_value)},emit=${emit},roll_flag=${roll_flag})`);
        
        this.clear();
        
        for (let i=0; i < 4; i++) {
            if ( dice_value[i] < 1 ) {
                continue;
            }
            this.dice[i].set(dice_value[i], roll_flag);
            this.active = true;
        } // for(i)

        if ( emit ) {
            emit_msg("dice", { player: this.player,
                               dice: dice_value,
                               roll: roll_flag}, true);
        }
    } // DiceArea.set()

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
    } // DiceArea.get()

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
        console.log(`DiceArea.get_active_dice> active_dice=${JSON.stringify(active_dice)}`);
        return active_dice;
    } // DiceArea.get_active_dice()
    
    /**
     * 使えないダイスを確認してdisable()する
     * @return {boolean} - modified
     */
    check_disable() {
        console.log(`DiceArea.check_disable()`);
        let modified = false;
        
        let bar_p = 26;
        if ( this.player == 1 ) {
            bar_p = 27;
        }
        if ( this.board.point[bar_p].checkers.length > 0 ) {
            // ヒットされている場合は、復活できるか確認
            for (let d=0; d < 4; d++) {
                this.dice[d].disable();
            }
            modified = true;
            for (let d=0; d < 4; d++) {
                const dice_value = this.dice[d].value % 10;
                if ( dice_value < 1 ) {
                    continue;
                }
                let dst_p = dice_value;
                if ( this.player == 0 ) {
                    dst_p = 25 - dice_value;
                }
                let checkers = this.board.point[dst_p].checkers;
                if (checkers.length <= 1 || checkers[0].player == this.player) {
                    modified = false;
                }
            } // for(d)
            if ( ! modified ) {
                for (let d=0; d < 4; d++) {
                    this.dice[d].enable();
                } // for(d)
            }
            return modified;
        }

        // 全てのチェッカーで、移動できるかのチェック
        // XXX T.B.D. XXX

        return modified;
    } // DiceArea.check_disable()

    /**
     * Roll dices
     * @return {number[]} - dice values
     */
    roll() {
        this.clear();
        console.log(`DiceArea.roll()> ${this.get()}`);

        let d1 = Math.floor(Math.random()  * 4);
        let d2 = d1;
        while ( d1 == d2 ) {
            d2 = Math.floor(Math.random()  * 4);
        }
        console.log(`DiceArea.roll> [d1, d2]=[${d1}, ${d2}]`);

        this.active = true;

        const value1 = Math.floor(Math.random() * 6) + 1;
        const value2 = Math.floor(Math.random() * 6) + 1;

        if ( value1 != value2 ) {
            this.dice[d1].set(value1);
            this.dice[d2].set(value2);
        } else {
            for ( let d = 0; d < 4; d++ ) {
                this.dice[d].set(value1);
            }
        }

        const modified = this.check_disable();
        console.log(`DiceArea.roll()> ${this.get()}`);

        const dice_values = this.get();

        /**
         * emit
         */
        emit_msg("dice", { player: this.player,
                           dice: this.get(),
                           roll: true }, true);

        return dice_values;
    } // DiceArea.roll()

    /**
     * @param {boolean} emit
     */
    clear(emit=false) {
        console.log(`DiceArea.clear(emit=${emit})`);

        this.active = false;
        for ( let d=0; d < 4; d++ ) {
            this.dice[d].clear();
        }

        if ( emit ) {
            emit_msg("dice", { player: this.player,
                               dice: [0, 0, 0, 0],
                               roll: false }, true);
        }
        return [];
    } // DiceArea.clear()

    /**
     * called from Board.on_mouse_down()
     */
    on_mouse_down(x, y) {
        console.log(`DiceArea.on_mouse_down>this.player=${this.player},active=${this.active}`);

        if ( ! this.board.cube.accepted ) {
            console.log(`DiceArea.on_mouse_down> cube is not accepted .. return`);
            return;
        }

        if ( this.active ) {
            return;
        }

        if ( this.another_dicearea().active ) {
            return;
        }

        if ( this.board.closeout(1 - this.player) ) {
            console.log(`DiceArea.on_mouse_down> closed out`);
            this.board.emit_turn(1 - this.player);
            this.board.emit_banner(this.player, "Pass");
            emit_msg("dice", { player: (1 - this.player),
                               dice: [0, 0, 0, 0],
                               roll: false }, true);
            return;
        }

        console.log(`DiceArea.on_mouse_down>turn=${this.board.turn}`);
        if ( this.player != this.board.turn ) {
            if ( this.board.turn < 2 ) {
                return;
            }
            this.board.emit_turn(this.player);
        }

        this.board.emit_banner(0, "");
        this.board.emit_banner(1, "");
        this.roll();
        let dice_value = this.get();
        console.log(`DiceArea.on_mouse_down> player=${this.player},dice_value=${JSON.stringify(dice_value)}`);
        
    } // DiceArea.on_mouse_down()
} // DiceArea

/**
 * @param {string} type
 * @param {Object} data
 * @param {boolean} [history=false]
 */
const emit_msg = (type, data, history=false) => {
    console.log(`emit_msg> type=${type}, data=${JSON.stringify(data)}`);
    ws.emit("json", {src: "client", type: type, data: data, history: history});
};

const new_game = () => {
    nav.checked=false;
    console.log("new_game()");
    board.set_banner(0, "");
    board.set_banner(1, "");
    emit_msg("new", {}, false);
};

const backward_hist = () => {
    nav.checked=false;
    console.log("backward_hist()");
    emit_msg("back", {}, false);
};

const back2 = () => {
    nav.checked=false;
    console.log("back2");
    emit_msg("back2", {}, false);
};

const back_all = () => {
    nav.checked=false;
    console.log("back_all()");
    emit_msg("back_all", {}, false);
};

const forward_hist = () => {
    nav.checked=false;
    console.log("forward_hist()");
    emit_msg("fwd", {}, false);
};

const fwd2 = () => {
    nav.checked=false;
    console.log("fwd2");
    emit_msg("fwd2", {}, false);
};

const fwd_all = () => {
    nav.checked=false;
    console.log("back_all()");
    emit_msg("fwd_all", {}, false);
};
    
const board_inverse = () => {
    nav.checked=false;
    board.inverse(0.5);
};

const write_gameinfo = () => {
    nav.checked=false;
    board.write_gameinfo();
};

const read_gameinfo = () => {
    nav.checked=false;
    board.read_gameinfo();
};

const clear_filename = () => {
    document.getElementById("read_gameinfo").value="";
};

const emit_playername = () => {
    board.emit_playername();
};

const apply_sound_switch = () => {
    board.apply_sound_switch();
};

/**
 *
 */
window.onload = () => {
    console.log("window.onload>");
    
    let url = "http://" + document.domain + ":" + location.port + "/";
    ws = io.connect(url);

    console.log(`onload> location.pathname=${location.pathname}`);

    //setTimeout("location.reload()",5000);

    const nav_el = document.getElementById("nav-drawer");
    board = new Board("board",
                      nav_el.offsetWidth  + 20,
                      nav_el.offsetHeight + 10,
                      ws);

    ws.on("connect", function() {
        console.log("ws.on(connected)");
    });

    ws.on("disconnect", function() {
        console.log("ws.on(disconnected)");
    });

    ws.on("json", function(msg) {
        console.log(`ws.on(json):msg=${JSON.stringify(msg)}`);

        if ( msg.type == "gameinfo" ) {
            console.log(`ws.on(json)gameinfo>`);
            board.load_gameinfo(msg.data.gameinfo, msg.data.sec);
            return;
        } // "gameinfo"

        if ( msg.type == "put_checker" ) {
            console.log(`ws.on(json)put_checker> board.turn=${board.turn}`);
            if ( board.turn == -1 ) {
                return;
            }
            const ch_id = "p" + ("000" + msg.data.ch).slice(-3);
            console.log(`ws.on(json)put_checker)> ch_id=${ch_id}`);
            let ch = board.search_checker(ch_id);
            board.put_checker(ch, msg.data.p, 0.2, false);
            return;
        } // "put_checker"

        if ( msg.type == "cube" ) {
            console.log(`ws.on(json)cube>`);
            board.cube.set(msg.data.value,
                           msg.data.side,
                           msg.data.accepted,
                           false);
            return;
        } // "cube"

        if ( msg.type == "dice" ) {
            console.log(`ws.on(json)dice> board.turn=${board.turn}`);
            if ( board.turn == -1 ) {
                return;
            }
            if (JSON.stringify(msg.data.dice) == JSON.stringify([0,0,0,0]) ) {
                let playpromise = board.sound_turn_change.play();
            }

            board.dice_area[msg.data.player].set(msg.data.dice,
                                                 false, msg.data.roll);
            if ( board.turn < 0 ) {
                board.txt[0].off();
                board.txt[1].off();
            }
            return;
        } // "dice"

        if ( msg.type == "set_turn" ) {
            console.log(`ws.on(json)set_turn> turn=${msg.data.turn}`);
            board.set_turn(msg.data.turn);
            return;
        } // set_turn

        if ( msg.type == "set_banner" ) {
            console.log(`ws.on(json)set_banner> player=${msg.data.player},text=${msg.data.text}`);

            board.set_banner(msg.data.player, msg.data.text, false);
            return;
        } // set_banner

        if ( msg.type == "set_playername" ) {
            console.log(`ws.on(json)set_playername>player=${msg.data.player},name=${msg.data.name}`);
            board.set_playername(msg.data.player, msg.data.name);
            return;
        }
        
        console.log("ws.on(json)???");
    });
}; // window.onload
