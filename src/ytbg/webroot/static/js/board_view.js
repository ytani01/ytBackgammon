/**
 * 盤面の表示: DOM の部品・入力・layout・ドラッグ・演出。
 *
 * **盤面の状態は持たない。** render() は BoardController が渡した
 * snapshot をその場で描画するだけで、保存も書き換えもしない。
 * 入力は connect() で受け取った相手 (BoardController) のメソッドを、
 * ID・値・盤面の座標で呼ぶ。サーバへは何も送らない。
 *
 * BoardController は import しない。
 */
import { log } from "./log.js";
import { BX, BY, checker_geometry, label_geometry, point_at, point_geometry,
         score_geometry } from "./layout.js";
import { SoundBase, SOUND_ROLL, SOUND_PUT, SOUND_HIT,
         SOUND_TURN_CHANGE } from "./sound.js";
import { Position, checker_order, has_dice } from "./rules/position.js";
import { closeout, pip_count, winner_is } from "./rules/judge.js";
import { BgImage } from "./ui/base.js";
import { BannerButton, RollButton, ScoreButton } from "./ui/button.js";
import { PlayerClock } from "./ui/clock.js";
import { PlayerName, PlayerPipCount, PlayerScore } from "./ui/label.js";
import { Cube } from "./ui/cube.js";
import { Dice } from "./ui/dice.js";
import { Checker } from "./ui/checker.js";

/** 表示する駒の枚数 (プレーヤーごと) */
const N_CHECKER = 15;

/**
 * チェッカーの ID (player * 100 + num)
 *
 * @param {Checker} ch
 * @return {number}
 */
const checker_id = (ch) => ch.player * 100 + ch.num;

/**
 * チェッカーとキューブを「掴む・動かす・離す」 (TODO-053)。
 *
 * 掴んでいるもの (チェッカー 1 枚か、キューブ) と、掴んだときの位置は
 * ここだけが持つ。**行き先の判定と送信は BoardController** で、ここは
 * 離したときにそれを呼び、キャンセルなら元の位置へ戻す。
 */
class Drag {
    /**
     * @param {BoardView} view
     */
    constructor(view) {
        this.view = view;

        /** @type {Checker|undefined} 掴んでいるチェッカー */
        this.checker = undefined;
        /** @type {boolean} キューブを掴んでいるか */
        this.cube = false;

        // 掴んだときの位置。**チェッカーとキューブで別に持つ**
        // (free move ならマルチタッチで両方を同時に掴める)
        /** @type {number[]|undefined} チェッカーの [x, y]。キャンセルで戻す先 */
        this.checker_src = undefined;
        /** @type {number|undefined} キューブの y。離したときの判定に使う */
        this.cube_src_y = undefined;
    } // Drag.constructor()

    /**
     * 掴んでいるものを両方ともカーソルへ動かす (盤面のマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
        this.move_checker(x, y);
        this.move_cube(x, y);
    } // Drag.move()

    /**
     * 掴んでいるチェッカーだけを動かす (チェッカーのマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move_checker(x, y) {
        if ( this.checker !== undefined ) {
            this.checker.move(x, y, true);
        }
    } // Drag.move_checker()

    /**
     * 掴んでいるキューブだけを動かす (キューブのマウス移動)
     *
     * @param {number} x
     * @param {number} y
     */
    move_cube(x, y) {
        if ( this.cube ) {
            this.view.cube.move(x, y, true);
        }
    } // Drag.move_cube()

    /**
     * チェッカーを掴む。
     *
     * **押した駒を掴めるか確かめてから、そのポイントの先端の駒へ持ち替える。**
     *
     * @param {Checker} ch - 押されたチェッカー
     * @param {number} x
     * @param {number} y
     */
    pick_checker(ch, x, y) {
        if ( ! this.view.input.can_pick_checker(checker_id(ch)) ) {
            return;
        }

        // クリックされたポイントの先端のチェッカーに持ち換える
        if ( ch.cur_point !== undefined ) {
            ch = this.view.top_checker(ch.cur_point);
            log(`Drag.pick_checker>ch.id=${ch.id}`);
        }
        this.checker = ch;

        this.checker_src = [ch.x, ch.y];

        ch.move(x, y, true);
        ch.set_z(1000);
    } // Drag.pick_checker()

    /**
     * チェッカーを離す
     *
     * **掴んでいる状態を外してから BoardController を呼ぶ。** 予測の描画は
     * 掴んでいるチェッカーを手元の座標へ戻すので、逆にすると先行実行の
     * 表示で駒が動かない。
     *
     * @param {number} x
     * @param {number} y
     */
    drop_checker(x, y) {
        const ch = this.checker;
        if ( ch === undefined ) {
            return;
        }
        this.checker = undefined;
        log(`Drag.drop_checker>ch.id=${ch.id}`);

        ch.move(x, y, true);

        const drop_p = point_at(this.view.points, ch.x, ch.y);
        log(`Drag.drop_checker>drop_p=${drop_p}`);

        if ( ! this.view.input.drop_checker(checker_id(ch), drop_p) ) {
            // 元の位置に戻して、移動をキャンセルする
            ch.move(...this.checker_src, true);
        }
    } // Drag.drop_checker()

    /**
     * キューブを掴む
     *
     * @param {number} x
     * @param {number} y
     */
    hold_cube(x, y) {
        if ( ! this.view.input.can_hold_cube() ) {
            return;
        }

        const cube = this.view.cube;
        this.cube = true;
        this.cube_src_y = cube.y;
        cube.move(x, y, true);
    } // Drag.hold_cube()

    /**
     * キューブを離す。ダブル・テイク・取り消しのどれを送るかは、
     * 掴んだ位置と、最後に動かしたキューブの位置で決まる
     *
     * @param {number} x
     * @param {number} y
     */
    drop_cube(x, y) {
        if ( ! this.cube ) {
            return;
        }
        this.cube = false;

        const cube = this.view.cube;
        this.view.input.drop_cube({ src_y: this.cube_src_y, y: cube.y,
                                    y0: cube.y0, y1: cube.y1 });
    } // Drag.drop_cube()
} // class Drag

/**
 *           bx[0]                  bx[3]                 bx[5]
 *           |   bx[1]              |   bx[4]             |bx[6]
 *         x |   |bx[2]             |   |                 ||   bx[7]
 *         | |   ||                 |   |                 ||   |
 *         v |   vv                 |   |                 ||   |
 *     y ->+-|----------------------|---|-----------------||---|-
 *         | v     13 14 15 16 17 18v   v19 20 21 22 23 24vv   v |
 * by[0] --->+----------------------+---+-----------------++---+ |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 * by[1] --->+---||p0          p1   |   |p1 tx          p0||   | |
 * by[2] --->+---||p0          p1   |27 |p1 |             ||25 | |
 *         | |   ||p0               |   |p1 |             ||   | |
 * by[3] --->+---||p0               |   |p1 v             ||   | |
 * by[4] --->+---||         ty ------------>+------       ||   | |
 *         | |   ||                 |---|   |      |      ||---| |
 * by[5] --->+---||                 |   |    ------       ||   | |
 * by[6] --->+---||p1               |   |p0               ||   | |
 *         | |   ||p1               |   |p0               ||   | |
 * by[7] --->+---||p1          p0   |26 |p0               || 0 | |
 * by[8] --->+---||p1          p0   |   |p0             p1||   | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 * by[9] --->+-------------------------------------------------  |
 *         |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *          -----------------------------------------------------
 */
export class BoardView {
    /**
     * @param {Object} els - build_dom() が作った要素 (TODO-054)
     * @param {{clock_sw: HTMLInputElement,
     *          clock_limit: HTMLInputElement[]}} header - ヘッダの要素
     * @param {Settings} settings - 画面の向き (プレーヤー番号) と PIP の表示
     * @param {number} x - 盤面の位置
     * @param {number} y
     */
    constructor(els, header, settings, x, y) {
        log(`BoardView(x=${x},y=${y})`);

        this.header = header;
        this.settings = settings;

        /** 入力を渡す相手。connect() で受け取る */
        this.input = undefined;

        // 座標は layout.js にある (書き換えても元は汚さないよう複製する)
        this.bx = [...BX];
        this.by = [...BY];

        // 盤面の画像
        this.board = new BgImage(els.board, x, y, 0);
        const [bw, bh] = [this.board.w, this.board.h];

        // 掴んでいるチェッカーとキューブ (TODO-053)
        this.drag = new Drag(this);

        // sound setup
        this.sound_turn_change = new SoundBase(settings, SOUND_TURN_CHANGE);
        this.sound_roll = new SoundBase(settings, SOUND_ROLL);
        this.sound_put = new SoundBase(settings, SOUND_PUT);
        this.sound_hit = new SoundBase(settings, SOUND_HIT);

        // Buttons
        const bx0 = this.board.x + bw + 30;

        this.button_resign = new BgImage(els.button_resign, bx0, 20);

        this.button_back = new BgImage(els.button_back, bx0, bh);
        this.button_back.move(bx0, this.board.y + bh - this.button_back.h - 60);

        this.button_fwd = new BgImage(
            els.button_fwd, bx0,
            this.button_back.y - this.button_back.h - 40);

        this.button_inverse = new BgImage(els.button_inverse, bx0, 0);
        this.button_inverse.move(
            bx0, bh / 2 - this.button_inverse.h / 2);

        // <body>
        let body_el = document.body;
        body_el.style.width = (this.button_back.x
                               + this.button_back.w) + 30 + "px";
        body_el.style.height = (this.board.y + bh + 15) + "px";

        // 座標は layout.js にある (TODO-046)
        const score_geo = score_geometry(this.bx, this.by);
        const label_geo = label_geometry(this.bx, this.by, bh);

        // PlayerScore
        const score_at = (p) => score_geo[p].label;
        this.score = [];
        // Score buttons
        const score_btn = (p, key) => {
            const g = score_geo[p][key];
            return new ScoreButton(els.score_btn[p][key], g.x, g.y, g.w, g.h);
        };
        this.score_btn = [{}, {}];
        for (const p of [1, 0]) {
            this.score[p] = new PlayerScore(els.score[p], p,
                                            score_at(p).x, score_at(p).y,
                                            score_at(p).deg);
            this.score_btn[p].up   = score_btn(p, "up");
            this.score_btn[p].down = score_btn(p, "down");
        } // for(p)

        // PlayerName
        const board_rect = { x: this.board.x, y: this.board.y, w: bw, h: bh };
        this.player_name = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.name[p];
            this.player_name.push(new PlayerName(
                els.name[p], els.name_input[p], p, g.x, g.y, g.deg,
                board_rect));
            this.player_name[p].set("");
            this.player_name[p].on();
        }

        // Clock
        this.player_clock = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.clock[p];
            this.player_clock.push(new PlayerClock(
                els.clock[p], els.clock_bg[p], p, g.x, g.y, g.deg));
        }

        // Pip count
        this.pip = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.pip[p];
            this.pip.push(new PlayerPipCount(els.pip[p], p, g.x, g.y, g.deg));
        }
        this.show_pip(settings.disp_pip);

        // Checkers
        this.checker = [Array(N_CHECKER), Array(N_CHECKER)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < N_CHECKER; i++) {
                this.checker[player][i] = new Checker(
                    els.checker[player][i], player, i);
            } // for(i)
        } // for(player)

        // Cube
        this.cube = new Cube(els.cube, this.bx, this.by, bh);

        // Points (座標だけ)
        this.points = point_geometry(this.bx, this.by, bh);

        // RollButton と、その横に出すダイス
        const bx1 = 160;

        this.roll_btn = [
            new RollButton(els.roll_btn[0], 0, this.bx[4] + bx1, bh / 2,
                           bw, bh),
            new RollButton(els.roll_btn[1], 1, this.bx[3] - bx1, bh / 2,
                           bw, bh),
        ];

        this.dice = [[], []];
        for (let p=0; p < 2; p++) {
            const btn = this.roll_btn[p];
            for (let i=0; i < 4; i++) {
                const xd = btn.x1 + 60 * (i - 1.5);
                const yd = btn.y1 + 20 * (i % 2 - 0.5);
                this.dice[p].push(new Dice(els.dice[p][i], p, xd, yd,
                                           "dice" + p, bw, bh));
            } // for(i)
        } // for(p)

        const dy1 = 200;

        // 投了・パス・勝ちのバナー。押したときの動作だけが違う
        const on_pass = (btn) => {
            log(`pass banner.on_click>player=${btn.player}`);
            this.input.pass_turn(btn.player);
        };
        const banner = (key, on_click) => [
            new BannerButton(els[key][0], 0, this.bx[4] + bx1, bh / 2 + dy1,
                             0, on_click),
            new BannerButton(els[key][1], 1, this.bx[3] - bx1, bh / 2 - dy1,
                             0, on_click),
        ];

        this.resign_banner_btn = banner("resign_banner_btn");
        this.pass_btn = banner("pass_btn", on_pass);
        this.win_btn = banner("win_btn");

        if ( this.settings.player == 1 ) {
            this.settings.player = 0;
            this.inverse(0);
        }
    } // BoardView.constructor()

    /**
     * ページ座標を盤面の座標にする。盤面が反転していれば、反転した座標
     *
     * @param {MouseEvent|Touch} e
     * @return {number[]} [x, y]
     */
    to_xy(e) {
        const b = this.board;
        if ( this.settings.player == 1 ) {
            return [b.w - e.pageX + b.x, b.h - e.pageY + b.y];
        }
        return [e.pageX - b.x, e.pageY - b.y];
    } // BoardView.to_xy()

    /**
     * 部品にマウスとタッチの入力をつなぐ。
     *
     * 押す・離す・動かすの 3 つとも登録し、使わないものも既定の動作
     * (スクロールや選択) を止める。
     *
     * @param {BgBase} part
     * @param {{down?: function(number, number): void,
     *          up?: function(number, number): void,
     *          move?: function(number, number): void}} handlers
     */
    listen(part, {down=undefined, up=undefined, move=undefined}) {
        const to_xy = (e) => this.to_xy(e);
        const on = (f) => (e) => {
            const [x, y] = part.get_xy(e, to_xy);
            if ( f ) {
                f(x, y);
            }
        };
        const el = part.el;
        el.onmousedown = on(down);
        el.ontouchstart = on(down);
        el.onmouseup = on(up);
        el.ontouchend = on(up);
        el.onmousemove = on(move);
        el.ontouchmove = on(move);
        el.ondragstart = () => false;
    } // BoardView.listen()

    /**
     * 入力を受ける相手 (BoardController) を受け取り、要る部品に入力をつなぐ
     *
     * @param {BoardController} input
     */
    connect(input) {
        this.input = input;
        const drag = this.drag;

        this.listen(this.board, { move: (x, y) => drag.move(x, y) });

        this.listen(this.button_resign, { down: () => input.resign() });
        this.listen(this.button_back,
                    { down: () => input.history("back", {n: 1}) });
        this.listen(this.button_fwd,
                    { down: () => input.history("fwd", {n: 1}) });
        this.listen(this.button_inverse, { down: () => this.inverse(0.5) });

        for (let p=0; p < 2; p++) {
            this.listen(this.score_btn[p].up,
                        { down: () => input.score(p, "up") });
            this.listen(this.score_btn[p].down,
                        { down: () => input.score(p, "clear") });

            const name = this.player_name[p];
            this.listen(name, { down: () => name.edit() });

            this.listen(this.player_clock[p],
                        { down: () => input.toggle_clock(p) });

            for (const ch of this.checker[p]) {
                this.listen(ch, {
                    down: (x, y) => drag.pick_checker(ch, x, y),
                    up: (x, y) => drag.drop_checker(x, y),
                    move: (x, y) => drag.move_checker(x, y),
                });
            } // for(ch)

            this.listen(this.roll_btn[p], { down: () => input.roll(p) });
            this.dice[p].forEach((d, i) => {
                this.listen(d, { down: () => input.click_dice(p, i) });
            });

            for (const btn of [this.resign_banner_btn[p], this.pass_btn[p],
                               this.win_btn[p]]) {
                this.listen(btn, { down: () => btn.click() });
            } // for(btn)
        } // for(p)

        this.listen(this.cube, {
            down: (x, y) => drag.hold_cube(x, y),
            up: (x, y) => drag.drop_cube(x, y),
            move: (x, y) => drag.move_cube(x, y),
        });
    } // BoardView.connect()

    /**
     * そのポイントの先端の駒
     *
     * @param {number} point
     * @return {Checker|undefined}
     */
    top_checker(point) {
        const id = this.input.checkers_at(point)
              .filter((id) => id % 100 < N_CHECKER).slice(-1)[0];
        if ( id === undefined ) {
            return undefined;
        }
        return this.checker[Math.floor(id / 100)][id % 100];
    } // BoardView.top_checker()

    /**
     * snapshot を描画する。**表示を変える入口はここ** (時計の毎回の更新と、
     * 一時的に隠す操作を除く)。
     *
     * サーバから届いた盤面も、先行実行の予測も、同じここを通る。
     * 掴んでいる駒とキューブは、見た目の座標と z を手元に残す。
     *
     * @param {Object} snapshot - BoardController.snapshot() の値
     * @param {{sec?: number, clock?: boolean}} [opts]
     *     clock が true なら (サーバから届いたとき) 時計の設定も描画する
     */
    render(snapshot, {sec=0, clock=false} = {}) {
        const gi = snapshot.gameinfo;

        // put checkers (TODO-017)
        //
        // 退避させずに配り直すので、動いて見えるのは位置が変わった
        // チェッカーだけになる。hidden (display:none) の間に座標を動かすと
        // CSS の transition が効かず、sec を渡しても一瞬で切り替わる。
        //
        // 並べる順 (idx の昇順) は checker_order() が持つ (TODO-044)。
        // 積む位置は、ポイントごとに数えた枚数。16 枚目より後は捨てる
        // (壊れた .jsonl を読んだときに、更新が途中で止まらないように)。
        //
        // idx で回すループにはしない。idx はその point に既にある
        // 両プレーヤーぶんの枚数なので、free move で 1 つの point に
        // 16 枚以上乗ると 15 以上になる。
        const order = checker_order(gi).filter((e) => e.id % 100 < N_CHECKER);

        // 掴んでいるチェッカーは、手元の座標へ戻す (TODO-015)。
        // 積み順と cur_point は gameinfo どおりに作らせたまま、
        // 見えている位置と重なり順だけを戻す
        const mv_ch = this.drag.checker;
        let mv_pos = undefined;
        if ( mv_ch !== undefined ) {
            mv_pos = { x: mv_ch.x, y: mv_ch.y, z: mv_ch.z };
        }

        let n_at = new Array(this.points.length).fill(0);
        for (const e of order) {
            const ch = this.checker[e.player][e.id % 100];
            ch.el.hidden = false;
            ch.cur_point = e.point;
            const g = checker_geometry(this.points[e.point], n_at[e.point],
                                       { w: ch.w, h: ch.h });
            ch.move(g.x, g.y, true, sec);
            ch.set_z(g.z);
            n_at[e.point] += 1;
        } // for (e)

        if ( mv_pos !== undefined ) {
            mv_ch.move(mv_pos.x, mv_pos.y, true, 0);
            mv_ch.set_z(mv_pos.z);
        }

        // score
        this.score[0].set(gi.score[0]);
        this.score[1].set(gi.score[1]);

        // clock (サーバから届いたときだけ。予測では触らない)
        if ( clock ) {
            const c = snapshot.clock;
            this.header.clock_limit[0].value = `${c.limit[0] / 60}`;
            this.header.clock_limit[1].value = `${c.limit[1]}`;
            this.header.clock_sw.checked = c.sw;
            this.render_clock(c);
        }

        // player name
        this.player_name[0].set(gi.board.playername[0]);
        this.player_name[1].set(gi.board.playername[1]);

        // cube。掴んでいれば、見た目の座標と z を手元に残す
        const cube = this.cube;
        let cube_pos = undefined;
        if ( this.drag.cube ) {
            cube_pos = { x: cube.x, y: cube.y, z: cube.z };
        }
        const c = gi.board.cube;
        cube.set(c.value, c.side, c.accepted);
        if ( cube_pos !== undefined ) {
            cube.move(cube_pos.x, cube_pos.y, true, 0);
            cube.set_z(cube_pos.z);
        }

        // バナーと名前の強調
        const pos = Position.from_gameinfo(gi);
        this.render_turn(gi, pos);

        // pip count
        for (let p=0; p < 2; p++) {
            this.pip[p].set(pip_count(pos, p));
        }

        // dice。**最後に置く。** 振ったときの回転 (play_effects()) を、
        // ここでの 0 秒の移動とスタイルが確定する前にまとめるため
        // (間に要素の大きさを読む処理が入ると、カップから出てくる動きが消える)
        const d = gi.board.dice;
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 4; i++) {
                this.dice[p][i].set(d[p][i]);
            }
        }
    } // BoardView.render()

    /**
     * 手番に合わせて、Roll ボタン・パス・勝ち・投了のバナーと、名前の強調を決める
     *
     * @param {Object} gi
     * @param {Position} pos
     */
    render_turn(gi, pos) {
        const turn = gi.turn;
        for (let p=0; p < 2; p++) {
            this.roll_btn[p].off();
            this.pass_btn[p].off();
            this.win_btn[p].off();
            this.resign_banner_btn[p].off();
            this.player_name[p].off();
        } // for(p)

        // Roll ボタンを出すか
        const update_roll = (player) => {
            if ( (gi.turn == player || gi.turn >= 2) && ! has_dice(gi, player) ) {
                this.pass_btn[1 - player].off();
                this.roll_btn[player].on();
            }
        };

        if ( turn < 0 ) {
            let score = 0;
            let winner = -1;

            if ( gi.resign >= 0 ) {
                winner = 1 - gi.resign;
                this.resign_banner_btn[gi.resign].on();
            } else {
                for (let p=0; p < 2; p++) {
                    score = winner_is(pos, p, {
                        resign: gi.resign,
                        cube_value: gi.board.cube.value,
                        cube_accepted: gi.board.cube.accepted,
                    }).score;
                    if ( score ) {
                        winner = p;
                    }
                } // for(p)
            }

            if ( winner >= 0 ) {
                log(`BoardView.render_turn>plyaer${winner} win ${score}!`);
                this.win_btn[winner].on();
                this.player_name[winner].on();
            }
            return;
        }

        if ( turn >= 2 ) {
            update_roll(0);
            update_roll(1);

            this.player_name[0].on();
            this.player_name[1].on();
            return;
        }

        // turn == 0 or 1
        if ( closeout(pos, 1 - turn) ) {
            this.pass_btn[turn].on();
        } else {
            update_roll(turn);
        }

        this.player_name[turn].on();
        log(`BoardView.render_turn():turn=${turn}`);
    } // BoardView.render_turn()

    /**
     * 時計を描画する (BoardController が 200 ms ごとに呼ぶ)
     *
     * @param {{sw: boolean, active: boolean[], limit: number[],
     *          clock: number[][]}} clock - snapshot の clock
     */
    render_clock(clock) {
        for (let p=0; p < 2; p++) {
            const pc = this.player_clock[p];
            if ( clock.sw ) {
                pc.on();
            } else {
                pc.off();
            }
            pc.show(clock.clock[p], clock.limit, clock.active[p] && clock.sw);
        }
    } // BoardView.render_clock()

    /**
     * 音を鳴らし、ダイスを回す。render() のすぐあとに呼ぶ
     *
     * @param {{sounds: string[], roll_player: number}} effects
     *     board_controller.js の effects_for() の値
     */
    play_effects(effects) {
        for (const name of effects.sounds) {
            this[name].play();
        }
        if ( effects.roll_player >= 0 ) {
            this.roll_dice(effects.roll_player);
        }
    } // BoardView.play_effects()

    /**
     * そのプレーヤーの、出ているダイスを回す
     *
     * @param {number} player
     */
    roll_dice(player) {
        for (const d of this.dice[player]) {
            d.animate_roll();
        }
    } // BoardView.roll_dice()

    /**
     * Roll ボタンを隠す (振った直後。次の描画で状態から表示し直す)
     *
     * @param {number} player
     */
    hide_roll_button(player) {
        this.roll_btn[player].off();
    } // BoardView.hide_roll_button()

    /**
     * パスのバナーを隠す (押した直後。次の描画で状態から表示し直す)
     *
     * @param {number} player
     */
    hide_pass_banner(player) {
        this.pass_btn[player].off();
    } // BoardView.hide_pass_banner()

    /**
     * @param {boolean} disp_pip
     */
    show_pip(disp_pip) {
        for (const pip of this.pip) {
            if ( disp_pip ) {
                pip.on();
            } else {
                pip.off();
            }
        }
    } // BoardView.show_pip()

    /**
     * ヘッダの Pip を切り替えたとき。値は Settings に持たせ、
     * 表示はここで切り替える (TODO-053)
     *
     * @return {boolean} disp_pip
     */
    apply_disp_pip() {
        const disp_pip = this.settings.apply_disp_pip();
        this.show_pip(disp_pip);
        return disp_pip;
    } // BoardView.apply_disp_pip()

    /**
     * 盤面を反転する
     *
     * @param {number} sec
     */
    inverse(sec) {
        log(`BoardView.inverse(sec=${sec})`);

        this.settings.set_player(1 - this.settings.player);

        this.board.rotate(180 * this.settings.player, true, sec);

        this.player_name[0].inverse();
        this.player_name[1].inverse();
    } // BoardView.inverse()
} // class BoardView
