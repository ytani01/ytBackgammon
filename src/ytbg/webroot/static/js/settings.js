import { log } from "./log.js";

/**
 *
 */
export class QueryStringBase {
    constructor() {
        this.querystring = '';
        this.data = [];
        this.load();
    } // constructor()

    load() {
        this.querystring = window.location.search || '';
        this.querystring = this.querystring.substr(
            1, this.querystring.length);
        log(`QueryStringBase.load>querystring=${this.querystring}`);

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
