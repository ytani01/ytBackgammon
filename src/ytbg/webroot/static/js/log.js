/**
 * ログ出力
 *
 * 中身は console.log。**`?debug` を付けて開いたときだけ出す** (TODO-048)。
 * 既定では出さない。クエリはモジュールを読み込んだときに 1 度だけ見る。
 */

import { get_debug_query } from "./settings.js";

const DEBUG = get_debug_query();

/**
 * @param {...*} args
 */
export const log = (...args) => {
    if ( DEBUG ) {
        console.log(...args);
    }
};
