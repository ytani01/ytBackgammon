import { get_image_dir } from "../settings.js";

/**
 *=====================================================
 * [Class tree] (TODO-028)
 *
 * board と player は、中間クラスではなくコンストラクタの options で渡す
 * (BgBase が this.board / this.player に入れる)。
 *
 * BgBase .. (x, y, w, h), mouse handlers, board / player   ui/base.js
 *    |
 *    +- BgText .. have a text                               ui/base.js
 *    |    +- PlayerClock                                    ui/clock.js
 *    |    +- PlayerName                                     ui/label.js
 *    |    +- PlayerPipCount                                 ui/label.js
 *    |    +- PlayerScore                                    ui/label.js
 *    |
 *    +- BgImage .. have an image                            ui/base.js
 *    |    +- Board                                          board.js
 *    |    +- Cube                                           ui/cube.js
 *    |    +- Checker                                        ui/checker.js
 *    |    +- Dice                                           ui/dice.js
 *    |    +- InverseButton                                  ui/button.js
 *    |    +- ResignButton                                   ui/button.js
 *    |    +- EmitButton .. type と data を生成時に渡す      ui/button.js
 *    |    +- ScoreButton                                    ui/button.js
 *    |    +- BannerButton .. 押したときの動作を on_click で  ui/button.js
 *    |         |            渡す (投了・パス・勝ちのバナー)
 *    |         +- RollButton                                ui/dice.js
 *    |
 *    +- BoardPoint                                          ui/point.js
 *
 * CookieBase .. cookie                                      settings.js
 * SoundBase .. sound                                        sound.js
 *=====================================================
 */

/**
 * base class for ytBackgammon
 */
export class BgBase {
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {Object} [opts]
     * @param {number} [opts.w] - 省略すると要素の clientWidth
     * @param {number} [opts.h] - 省略すると要素の clientHeight
     * @param {Board} [opts.board] - 盤面に置く部品のとき
     * @param {number} [opts.player] - プレーヤーの持ち物のとき (0 or 1)
     */
    constructor(id, x, y, deg=0,
                {w=undefined, h=undefined,
                 board=undefined, player=undefined}={}) {
        [this.x, this.y] = [x, y];
        [this.w, this.h] = [w, h];
        this.deg = deg;
        this.id = id;
        this.board = board;
        this.player = player;
        
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
        //log(`rotate(deg=${deg}, center=${center}, sec=${sec})`);
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
        // log(`BgBase.touch2mouse()`);
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
export class BgText extends BgBase {
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     * @param {Object} [opts]
     * @param {string} [opts.text=""]
     * @param {Board} [opts.board]
     * @param {number} [opts.player]
     */
    constructor(id, x, y, deg, {text="", board=undefined,
                                player=undefined}={}) {
        super(id, x, y, deg, {board: board, player: player});

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
 * <div id="${id}"><image src="${image_dir}/..${image_suffix}"></div>
 */
export class BgImage extends BgBase {
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {Object} [opts]
     * @param {number} [opts.w] - 省略すると画像の幅
     * @param {number} [opts.h] - 省略すると画像の高さ
     * @param {Board} [opts.board]
     * @param {number} [opts.player]
     */
    constructor(id, x, y, deg=0, opts={}) {
        super(id, x, y, deg, opts);
        const {w=undefined, h=undefined} = opts;

        this.image_suffix = ".png";

        this.image_el = this.el.children[0];
        // 画像ディレクトリは <body data-image-dir="..."> から読む
        // (src の文字列から逆算しない。TODO-029)
        this.image_dir = get_image_dir();

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
