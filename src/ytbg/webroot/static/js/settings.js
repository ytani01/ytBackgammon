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
        this.cookie = undefined;
        this.data = {};
        this.load();
    }

    /**
     * @return {Object} data
     */
    load() {
        const allcookie = document.cookie;
        // log(`CookieBase.load>allcookie="${allcookie}"`);

        if ( allcookie.length == 0 ) {
            return {};
        }

        for (let ent of allcookie.split("; ")) {
            let [k, v] = ent.split('=');
            // log(`CookieBase.load>k=${k},v=${v}`);
            this.data[k] = v;
        } // for(i)

        return this.data;
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
 *
 * @return {string} - 例: "/static/images1a/"
 */
export function get_image_dir() {
    return `/static/${document.body.dataset.imageDir}/`;
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
