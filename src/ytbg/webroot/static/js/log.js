/**
 * ログ出力
 *
 * 中身は console.log。**`?debug` を付けて開いたときだけ出す** (TODO-048)。
 * 既定では出さない。クエリはモジュールを読み込んだときに 1 度だけ見る。
 * `?debug` / `?debug=1` / `?debug=` のどれでも出す (値は見ない)。
 *
 * 何も import しない (settings.js を import していた頃は循環していた)。
 */

// location が無いところ (Node で board_controller.js を読むテスト) では出さない
const DEBUG = new URLSearchParams(globalThis.location?.search).has("debug");

/**
 * @param {...*} args
 */
export const log = (...args) => {
    if ( DEBUG ) {
        console.log(...args);
    }
};
