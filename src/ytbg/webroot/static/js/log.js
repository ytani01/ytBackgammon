/**
 * ログ出力
 *
 * 中身は console.log そのまま。呼び出し側を 1 か所に集めておくための
 * 入口で、水準での絞り込みはまだ持たない。
 */

/**
 * @param {...*} args
 */
export const log = (...args) => {
    console.log(...args);
};
