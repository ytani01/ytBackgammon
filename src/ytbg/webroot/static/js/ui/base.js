import { get_image_dir } from "../settings.js";

/**
 *=====================================================
 * [Class tree]
 *
 * 表示部品は、DOM の移動・回転・表示だけを受け持つ。盤面の状態・
 * Settings・操作の関数は参照しない。入力のイベントは、要る部品にだけ
 * BoardView がつなぐ (board_view.js)。
 *
 * BgBase .. (x, y, w, h), move / rotate, 入力の座標変換   ui/base.js
 *    |
 *    +- BgText .. have a text                               ui/base.js
 *    |    +- PlayerClock                                    ui/clock.js
 *    |    +- PlayerName                                     ui/label.js
 *    |    +- PlayerPipCount                                 ui/label.js
 *    |    +- PlayerScore                                    ui/label.js
 *    |
 *    +- BgImage .. have an image                            ui/base.js
 *         +- Cube                                           ui/cube.js
 *         +- Checker                                        ui/checker.js
 *         +- Dice                                           ui/dice.js
 *         +- ScoreButton                                    ui/button.js
 *         +- BannerButton .. 投了・パス・勝ちのバナー       ui/button.js
 *              +- RollButton                                ui/button.js
 *
 * BoardController .. 状態・操作・時計の計算                board_controller.js
 * BoardView .. 部品・入力・layout・ドラッグ・演出          board_view.js
 * Settings .. 音・free move・PIP・プレーヤー番号            settings.js
 * CookieBase .. cookie                                      settings.js
 * SoundBase .. sound                                        sound.js
 *=====================================================
 */

/**
 * base class for ytBackgammon
 */
export class BgBase {
    /**
     * @param {HTMLElement} el - build_dom() が作った要素 (TODO-054)
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {Object} [opts]
     * @param {number} [opts.w] - 省略すると要素の clientWidth
     * @param {number} [opts.h] - 省略すると要素の clientHeight
     * @param {number} [opts.player] - プレーヤーの持ち物のとき (0 or 1)
     */
    constructor(el, x, y, deg=0, {w=undefined, h=undefined,
                                  player=undefined}={}) {
        [this.x, this.y] = [x, y];
        [this.w, this.h] = [w, h];
        this.deg = deg;
        this.el = el;
        this.player = player;

        if ( w === undefined && this.el ) {
            this.w = this.el.clientWidth;
        }
        if ( h === undefined && this.el ) {
            this.h = this.el.clientHeight;
        }
    } // BgBase.constructor()

    /**
     * 要素の id 属性。ログとブラウザのテストのためだけにある (TODO-054)
     *
     * @return {string|undefined}
     */
    get id() {
        return this.el ? this.el.id : undefined;
    } // BgBase.id

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
     * @param {number|undefined} z - undefined なら重なり順を指定しない
     */
    set_z(z) {
        this.z = z;
        this.el.style.zIndex = z === undefined ? "" : z;
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
     * touch event to mouse event
     * only for get_xy() function
     *
     * @param {MouseEvent|TouchEvent} e
     * @return {MouseEvent|Touch}
     */
    touch2mouse(e) {
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        return e;
    } // BgBase.touch2mouse()

    /**
     * イベントの位置を盤面の座標にする
     *
     * @param {MouseEvent|TouchEvent} e
     * @param {function(MouseEvent|Touch): number[]} to_xy - ページ座標
     *     (pageX / pageY) を盤面の座標 [x, y] に直す関数。盤面の位置と
     *     向きは BoardView が持つので、呼ぶ側が渡す
     * @return {number[]} [x, y]
     */
    get_xy(e, to_xy) {
        return to_xy(this.touch2mouse(e));
    } // BgBase.get_xy()
} // class BgBase

/**
 * <div>some text</div>
 */
export class BgText extends BgBase {
    /**
     * @param {HTMLElement} el
     * @param {number} x
     * @param {number} y
     * @param {number} deg
     * @param {Object} [opts]
     * @param {string} [opts.text=""]
     * @param {number} [opts.player]
     */
    constructor(el, x, y, deg, {text="", player=undefined}={}) {
        super(el, x, y, deg, {player: player});

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
 * <div><image src="${image_dir}/..${image_suffix}"></div>
 */
export class BgImage extends BgBase {
    /**
     * @param {HTMLElement} el
     * @param {number} x
     * @param {number} y
     * @param {number} [deg=0]
     * @param {Object} [opts]
     * @param {number} [opts.w] - 省略すると画像の幅
     * @param {number} [opts.h] - 省略すると画像の高さ
     * @param {number} [opts.player]
     */
    constructor(el, x, y, deg=0, opts={}) {
        super(el, x, y, deg, opts);
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
