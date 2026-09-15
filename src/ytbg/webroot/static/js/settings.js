import { log } from "./log.js";

/**
 * URL のクエリ文字列から "sound" を読む。
 *
 * 値があるときだけ音を止めるので (sound.js の GlobalSoundSwitch)、
 * 値が無い `?sound` は undefined を返す。`URLSearchParams.get()` は
 * `?sound` にも `?sound=` にも空文字を返して区別できないので、
 * **`?sound=` も「値が無い」扱いになる** (TODO-039。手書きの
 * パーサだった頃は鳴らない側だった)。
 *
 * @return {string|undefined}
 */
export function get_sound_query() {
    return new URLSearchParams(window.location.search).get("sound")
        || undefined;
} // get_sound_query()

/**
 *
 */
export class CookieBase {
    constructor() {
        this.data = {};
        this.load();
    }

    /**
     *
     */
    load() {
        const allcookie = document.cookie;
        // log(`CookieBase.load>allcookie="${allcookie}"`);

        if ( allcookie.length == 0 ) {
            return;
        }

        for (let ent of allcookie.split("; ")) {
            let [k, v] = ent.split('=');
            // log(`CookieBase.load>k=${k},v=${v}`);
            this.data[k] = v;
        } // for(i)
    } // CookieBase.load()

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
 * 画像ディレクトリ (TODO-029)。
 *
 * index.html の <body data-image-dir="..."> から読む。
 * ここが唯一の読み口で、<img> の src から逆算しない。
 * static/ の場所は、このモジュールからの相対で決める (URL のプレフィクス)。
 *
 * @return {string} - 例: "/static/images1a/" (プレフィクスが /foo なら "/foo/static/images1a/")
 */
export function get_image_dir() {
    return new URL(`../${document.body.dataset.imageDir}/`, import.meta.url).pathname;
} // get_image_dir()

/**
 * サーバ ID (TODO-029)。
 *
 * index.html の <body data-server-id="..."> から読む。
 *
 * @return {string}
 */
export function get_server_id() {
    return document.body.dataset.serverId;
} // get_server_id()

/**
 * 画面ごとの設定 (TODO-053)。
 *
 * 音の ON/OFF・free move・PIP を表示するか・cookie に保存する
 * プレーヤー番号を持つ。どれもサーバへは送らない。
 * クロックの ON/OFF と持ち時間はサーバから届く値を表示するものなので、
 * ここではなく BoardController が持つ。
 *
 * ヘッダのチェックボックスを読んで値を持つ。PIP の表示は変えない
 * (切り替えるのは BoardView.apply_disp_pip())。
 */
export class Settings {
    /**
     * @param {string} svr_id - server ID (cookie の名前に使う)
     */
    constructor(svr_id) {
        this.cookie = new CookieBase();
        this.cookie_player = `board${svr_id}_player`;
        this.cookie_sound = `board${svr_id}_sound`;

        this.el_sound = document.getElementById("sound-switch");
        this.sound = true;
        this.load_sound_switch();

        // free move は今までどおり false で始める。PIP は、以前
        // PlayerPipCount がチェックボックスを直接読んで表示を決めていた
        // ので、同じ値から始める (ブラウザがチェックを復元したときに
        // 表示と値がずれないように)
        this.free_move = false;
        this.disp_pip = document.getElementById("disp-pip").checked;

        if ( this.load_player() === undefined ) {
            this.set_player(0);
        }
    } // Settings.constructor()

    /**
     * cookie から音の ON/OFF を読み、チェックボックスに反映する
     *
     * @return {boolean} sound
     */
    load_sound_switch() {
        const s = this.cookie.get(this.cookie_sound);
        this.sound = s === undefined ? true : JSON.parse(s);
        log(`Settings.load_sound_switch>sound=${this.sound}`);
        this.el_sound.checked = this.sound;
        return this.sound;
    } // Settings.load_sound_switch()

    /**
     * ヘッダの Sound を切り替えたとき。cookie に保存する
     *
     * @return {boolean} sound
     */
    apply_sound_switch() {
        this.sound = this.el_sound.checked;
        this.cookie.set(this.cookie_sound, this.sound);

        log(`Settings.apply_sound_switch>sound=${this.sound}`);
        return this.sound;
    } // Settings.apply_sound_switch()

    /**
     * @return {boolean} free_move
     */
    apply_free_move() {
        this.free_move = document.getElementById("free-move").checked;
        log(`Settings.apply_free_move>free_move=${this.free_move}`);
        return this.free_move;
    } // Settings.apply_free_move()

    /**
     * @return {boolean} disp_pip
     */
    apply_disp_pip() {
        this.disp_pip = document.getElementById("disp-pip").checked;
        log(`Settings.apply_disp_pip>disp_pip=${this.disp_pip}`);
        return this.disp_pip;
    } // Settings.apply_disp_pip()

    /**
     * load player number from cookie
     *
     * cookie の値は文字列なので数に直す (TODO-050)。直さないと "0" の
     * まま残り、投了で resign の player に文字列を送ってしまう
     * (サーバは data の型を確かめて弾く)。値が無ければ undefined のまま
     *
     * @return {number|undefined}
     */
    load_player() {
        const player = this.cookie.get(this.cookie_player);
        this.player = player === undefined ? undefined : parseInt(player);
        return this.player;
    } // Settings.load_player()

    /**
     * set player number and save to cookie
     *
     * @param {number} player
     */
    set_player(player) {
        this.player = player;
        this.cookie.set(this.cookie_player, this.player);
    } // Settings.set_player()
} // class Settings
