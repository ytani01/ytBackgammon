/**
 * 盤面の座標
 *
 * 表示要素の位置は、すべてこの 2 つの配列を基準に組み立てる。
 * Board が複製して this.bx / this.by として持つ。
 */

// 横方向の区切り
export const BX = [20, 70, 90, 390, 440, 740, 760, 810];
// 縦方向の区切り
export const BY = [30, 80, 100, 235, 255, 305, 325, 460, 480, 530];

/**
 * ポイント 28 個ぶんの座標 (TODO-046)
 *
 * 0〜25 が盤上 (0 と 25 がゴール)、26・27 がバー。
 * direction は駒を積む向き (-1: 上から下, 1: 下から上)。
 *
 * @param {number[]} bx
 * @param {number[]} by
 * @param {number} board_h - 盤面の画像の高さ
 * @return {{x: number, y: number, w: number, h: number,
 *           direction: number, max_n: number}[]}
 */
export const point_geometry = (bx, by, board_h) => {
    const max_n = 5;
    const pw = (bx[3] - bx[2]) / 6;
    const ph = board_h / 2 - by[0];
    const bar_w = bx[4] - bx[3];
    const y_mid = by[0] + (by[9] - by[0]) / 2;

    const pt = (x, y, w, direction) => (
        { x: x, y: y, w: w, h: ph, direction: direction, max_n: max_n });

    let geo = [];
    for (let p=0; p < 28; p++) {
        if ( p == 0 ) {
            geo.push(pt(bx[6], y_mid, pw, -1));
        } else if ( p <= 6 ) {
            geo.push(pt(bx[4] + pw * (6 - p), y_mid, pw, -1));
        } else if ( p <= 12 ) {
            geo.push(pt(bx[2] + pw * (12 - p), y_mid, pw, -1));
        } else if ( p <= 18 ) {
            geo.push(pt(bx[2] + pw * (p - 13), by[0], pw, 1));
        } else if ( p <= 24 ) {
            geo.push(pt(bx[4] + pw * (p - 19), by[0], pw, 1));
        } else if ( p == 25 ) {
            geo.push(pt(bx[6], by[0], pw, 1));
        } else if ( p == 26 ) {
            geo.push(pt(bx[3], y_mid, bar_w, 1));
        } else {
            geo.push(pt(bx[3], by[0], bar_w, -1));
        }
    } // for (p)
    return geo;
}; // point_geometry()

/**
 * スコアの表示と、その上の ▲ / ▼ ボタンの座標 (TODO-046)
 *
 * 添字はプレーヤー番号。
 *
 * @param {number[]} bx
 * @param {number[]} by
 * @return {{label: {x: number, y: number, deg: number},
 *           up: {x: number, y: number, w: number, h: number},
 *           down: {x: number, y: number, w: number, h: number}}[]}
 */
export const score_geometry = (bx, by) => {
    const [w, h] = [22, 53];
    const x_up = bx[0] + 2;
    const x_down = x_up + w + 2;
    const offset = 27;
    // player 0 が下、player 1 が上
    const y = [by[7] - offset - h, by[2] + offset];

    return [0, 1].map((p) => ({
        label: { x: x_up + 3, y: y[p] + h - 4, deg: -90 },
        up:    { x: x_up,   y: y[p], w: w, h: h },
        down:  { x: x_down, y: y[p], w: w, h: h },
    }));
}; // score_geometry()

/**
 * 名前・クロック・PIP カウントの座標 (TODO-046)
 *
 * どれも添字はプレーヤー番号。player 1 は盤の向こう側なので 180 度回す。
 *
 * @param {number[]} bx
 * @param {number[]} by
 * @param {number} board_h - 盤面の画像の高さ
 * @return {{name: {x: number, y: number, deg: number}[],
 *           clock: {x: number, y: number, deg: number}[],
 *           pip: {x: number, y: number, deg: number}[]}}
 */
export const label_geometry = (bx, by, board_h) => {
    const pip_x = (bx[6] + bx[7]) / 2 - 5;
    const pip_offset = 14;

    return {
        name:  [{ x: bx[3],       y: by[9] + 2, deg: 0 },
                { x: bx[4],       y: by[0] - 2, deg: 180 }],
        clock: [{ x: bx[3] + 200, y: by[9] + 3, deg: 0 },
                { x: bx[4] - 200, y: by[0] - 3, deg: 180 }],
        pip:   [{ x: pip_x, y: board_h - pip_offset, deg: 0 },
                { x: pip_x, y: pip_offset,           deg: 180 }],
    };
}; // label_geometry()

