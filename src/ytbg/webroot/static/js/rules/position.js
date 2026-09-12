/**
 * 盤面を単純なデータで表す Position と、ポイント番号の計算 (TODO-027)。
 *
 * **ここは DOM も Board も見ない。** 受け取るのは Position と player と
 * 出目のような単純な値だけ。import してよいのは rules/ の中だけ。
 */

/**
 * ポイントの数。0〜25 が盤上 (0 と 25 がゴール)、26・27 がバー。
 */
export const N_POINT = 28;

/**
 * ゴールのポイント番号
 *
 * @param {number} player - 0 or 1
 * @return {number}
 */
export const goal_point = (player) => {
    return (25 * player);
}; // goal_point()

/**
 * バーのポイント番号
 *
 * @param {number} player - 0 or 1
 * @return {number}
 */
export const bar_point = (player) => {
    return (26 + player);
}; // bar_point()

/**
 * 指定したポイントの PIP カウントを取得
 *
 * バー (26, 27) は 25 として数える。
 *
 * 注: 移す前の `BgBase.get_pip()` は、引数の player ではなく
 * `this.player` を見ていた。呼び出しは `Checker.get_pip()` の
 * 1 か所だけで、そこは `this.player` を渡していたので結果は変わらない
 * (TODO-027)。
 *
 * @param {number} player - 0 or 1
 * @param {number} point
 * @return {number|undefined} - pip count
 */
export const get_pip = (player, point) => {
    if ( point === undefined ) {
        return undefined;
    }

    if ( point > 25 ) {
        return 25;
    }

    if ( player == 0 ) {
        return point;
    }
    // player == 1
    return (25 - point);
}; // get_pip()

/**
 * 盤面 (チェッカーの配置) だけを持つ型。
 *
 * pt[p] には、そのポイントに積まれたチェッカーの **プレーヤー番号を
 * 積んだ順に並べた配列**が入る (p = 0..27)。
 *
 * 設計 (docs/design.md) の下書きは `{player, n}` だったが、free move では
 * 1 つのポイントに両プレーヤーのチェッカーが乗る。`{player, n}` だと
 * その枚数を分けられず、PIP カウントがずれる。積んだ順の配列にすれば、
 * `checkers[0].player` を見ていた今までの判定 (`owner()`) も、
 * プレーヤーごとの枚数も、どちらも同じ答えになる (TODO-027)。
 *
 * **Position は変更しない。** `with_move()` は新しい Position を返す。
 */
export class Position {
    /**
     * @param {number[][]} pt - pt[p] = プレーヤー番号の配列 (積んだ順)
     */
    constructor(pt) {
        if ( pt.length != N_POINT ) {
            throw new RangeError(
                `Position: pt.length=${pt.length} != ${N_POINT}`);
        }
        this.pt = pt.map((players) => [...players]);
    } // Position.constructor()

    /**
     * ポイントごとのプレーヤー番号の配列から作る。
     *
     * Board の `this.point[p].checkers` をそのまま写すための入口。
     *
     * @param {number[][]} points - points[p] = プレーヤー番号の配列
     * @return {Position}
     */
    static from_points(points) {
        return new Position(points);
    } // Position.from_points()

    /**
     * gameinfo から作る。
     *
     * `gameinfo.board.checker[player][i] = [point, idx]`。
     * 積み順は `Board.apply()` と同じで、idx の昇順
     * (同じ idx なら player, i の順) に積む。
     *
     * @param {Object} gameinfo
     * @return {Position}
     */
    static from_gameinfo(gameinfo) {
        const ch_point = gameinfo.board.checker;

        let ch_list = [];
        for (let p=0; p < 2; p++) {
            for (let i=0; i < ch_point[p].length; i++) {
                ch_list.push({ player: p,
                               point: ch_point[p][i][0],
                               idx: ch_point[p][i][1] });
            } // for (i)
        } // for (p)

        // Array.sort は安定なので、同じ idx の並びは積んだ順のまま
        ch_list.sort((a, b) => a.idx - b.idx);

        let pt = Array.from({length: N_POINT}, () => []);
        for (let e of ch_list) {
            if ( ! Number.isInteger(e.point)
                 || e.point < 0 || e.point >= N_POINT ) {
                throw new RangeError(
                    `Position.from_gameinfo: point=${e.point}`);
            }
            pt[e.point].push(e.player);
        } // for (e)

        return new Position(pt);
    } // Position.from_gameinfo()

    /**
     * そのポイントの持ち主 (いちばん下のチェッカーのプレーヤー)
     *
     * @param {number} p - point index
     * @return {number|null} - 0, 1, または null (空)
     */
    owner(p) {
        const players = this.pt[p];
        if ( players.length == 0 ) {
            return null;
        }
        return players[0];
    } // Position.owner()

    /**
     * そのポイントのチェッカーの枚数
     *
     * @param {number} p - point index
     * @return {number}
     */
    count(p) {
        return this.pt[p].length;
    } // Position.count()

    /**
     * 指定したプレーヤーのチェッカーがあるポイントの一覧
     *
     * チェッカー 1 枚につき 1 つ。2 枚あるポイントは 2 回出る。
     *
     * @param {number} player - 0 or 1
     * @return {number[]} - point index の配列 (昇順)
     */
    points_of(player) {
        let points = [];
        for (let p=0; p < N_POINT; p++) {
            for (let i=0; i < this.pt[p].length; i++) {
                if ( this.pt[p][i] == player ) {
                    points.push(p);
                }
            } // for (i)
        } // for (p)
        return points;
    } // Position.points_of()

    /**
     * 1 枚動かしたあとの Position を返す (自分は変更しない)。
     *
     * from_p から動かすのは、そのポイントにある **player の**
     * チェッカーのいちばん上の 1 枚。to_p には上に積む。
     *
     * **UI とは、混在ポイントで食い違う。** `ui/checker.js` の
     * `on_mouse_down_xy()` は `checkers.slice(-1)[0]` で、プレーヤーを
     * 問わずポイントの先端のチェッカーを掴む。free move で 1 つの
     * ポイントに両プレーヤーのチェッカーが乗っていると、UI が動かす
     * 駒と `with_move()` が動かす駒は別になる。**TODO-030 でここを
     * 「UI と同じ」と見なさないこと** (TODO-027 のレビューでの指摘)。
     *
     * **ヒットの処理はしない。** 相手のチェッカーをバーへ送るのは、
     * 呼んだ側が別の `with_move()` として行う (`ui/checker.js` の
     * `on_mouse_up_xy()` が `moves` に 2 手ぶん積む。TODO-030)。
     *
     * **from_p に player の駒が無ければ例外を投げる。** 呼ぶ側は
     * 「掴んでいる駒」を渡す前提で、駒が無いことは起きない。黙って
     * to_p に積むと、そのプレーヤーの駒が 15 枚から増え、**盤面が
     * 静かに壊れる** (TODO-027 のレビューでの指摘)。
     *
     * @param {number|undefined} from_p - undefined ならどこからでもない
     * @param {number} to_p
     * @param {number} player - 0 or 1
     * @return {Position} - 新しい Position
     * @throws {Error} from_p に player の駒が無いとき
     */
    with_move(from_p, to_p, player) {
        let pt = this.pt.map((players) => [...players]);

        if ( from_p !== undefined && from_p !== null ) {
            const i = pt[from_p].lastIndexOf(player);
            if ( i < 0 ) {
                throw new Error(
                    `Position.with_move: point ${from_p} に`
                        + ` player${player} のチェッカーが無い`
                        + ` (players=${JSON.stringify(pt[from_p])})`);
            }
            pt[from_p].splice(i, 1);
        }
        pt[to_p].push(player);

        return new Position(pt);
    } // Position.with_move()
} // class Position
