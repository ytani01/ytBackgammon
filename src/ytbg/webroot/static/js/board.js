import { log } from "./log.js";
import { end_turn as action_end_turn,
         set_clock_switch as action_set_clock_switch,
         set_clock_limit as action_set_clock_limit } from "./actions.js";
import { BX, BY, label_geometry, point_geometry,
         score_geometry } from "./layout.js";
import { Drag } from "./drag.js";
import { Settings, get_server_id } from "./settings.js";
import { SoundBase, SOUND_ROLL, SOUND_PUT, SOUND_HIT,
         SOUND_TURN_CHANGE } from "./sound.js";
import { BgImage } from "./ui/base.js";
import { Position, N_POINT, copy_gameinfo } from "./rules/position.js";
import { all_inner as rule_all_inner,
         disable_unusable as rule_disable_unusable,
         dst_point as rule_dst_point,
         dst_points as rule_dst_points } from "./rules/move.js";
import { closeout as rule_closeout,
         pip_count as rule_pip_count,
         winner_is as rule_winner_is } from "./rules/judge.js";
import { InverseButton, ResignButton, EmitButton, ScoreButton,
         BannerButton } from "./ui/button.js";
import { ClockLimit, PlayerClock } from "./ui/clock.js";
import { PlayerName, PlayerPipCount,
         PlayerScore } from "./ui/label.js";
import { Cube } from "./ui/cube.js";
import { Dice, RollButton } from "./ui/dice.js";
import { Checker } from "./ui/checker.js";
import { BoardPoint } from "./ui/point.js";

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
 *
 */
export class Board extends BgImage {
    /*
     * @param {string} id - div tag id
     * @param {number} x - 
     * @param {number} y - 
     * @param {number} player - 0 or 1
     */
    constructor(id, x, y) {
        log(`Board(id=${id},x=${x},y=${y})`);
        super(id, x, y, 0);

        // 座標は layout.js にある (書き換えても元は汚さないよう複製する)
        this.bx = [...BX];
        this.by = [...BY];

        // server ID
        this.svr_id = get_server_id();
        log(`Board> svr_id=${this.svr_id}`);

        // 音・free move・PIP・プレーヤー番号 (TODO-053)
        this.settings = new Settings(this.svr_id);

        // 掴んでいるチェッカーとキューブ (TODO-053)
        this.drag = new Drag(this);

        // sound setup
        this.sound_turn_change = new SoundBase(this, SOUND_TURN_CHANGE);
        this.sound_roll = new SoundBase(this, SOUND_ROLL);
        this.sound_put = new SoundBase(this, SOUND_PUT);
        this.sound_hit = new SoundBase(this, SOUND_HIT);

        // 盤面の状態はこれだけ。判定もここを読む (TODO-052)。
        // サーバから届くまでは undefined で、何も操作できない
        this.gameinfo = undefined;

        // Buttons
        const bx0 = this.x + this.w + 30;

        this.button_resign = new ResignButton(
            "button-resign", this, bx0, 20);

        this.button_back = new EmitButton(
            "button-back", this, "back", {n: 1}, bx0, this.h);
        this.button_back.move(bx0, this.y + this.h - this.button_back.h - 60);

        this.button_fwd = new EmitButton(
            "button-fwd",
            this, "fwd", {n: 1}, bx0,
            this.button_back.y - this.button_back.h - 40);
        
        this.button_inverse = new InverseButton(
            "button-inverse", this, bx0, 0);
        this.button_inverse.move(
            bx0, this.h / 2 - this.button_inverse.h / 2);
        
        // <body>
        let body_el = document.body;
        body_el.style.width = (this.button_back.x
                               + this.button_back.w) + 30 + "px";
        body_el.style.height = (this.y + this.h + 15) + "px";

        // 座標は layout.js にある (TODO-046)
        const score_geo = score_geometry(this.bx, this.by);
        const label_geo = label_geometry(this.bx, this.by, this.h);

        // PlayerScore
        const score_at = (p) => score_geo[p].label;
        this.score = [];
        this.score[1] = new PlayerScore("p1score", this, 1,
                                        score_at(1).x, score_at(1).y,
                                        score_at(1).deg);
        this.score[0] = new PlayerScore("p0score", this, 0,
                                        score_at(0).x, score_at(0).y,
                                        score_at(0).deg);

        // Score buttons
        const score_btn = (id, p, key, offset) => {
            const g = score_geo[p][key];
            return new ScoreButton(id, this, g.x, g.y, g.w, g.h,
                                   this.score[p], offset);
        };
        this.score_btn = [{}, {}];
        this.score_btn[1].up   = score_btn("score_up1",   1, "up",   +1);
        this.score_btn[1].down = score_btn("score_down1", 1, "down", -1);
        this.score_btn[0].up   = score_btn("score_up0",   0, "up",   +1);
        this.score_btn[0].down = score_btn("score_down0", 0, "down", -1);

        // PlayerName
        this.player_name = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.name[p];
            this.player_name.push(new PlayerName(
                `p${p}name`, this, p, g.x, g.y, g.deg));
        }

        for (let p=0; p < 2; p++) {
            this.player_name[p].set("");
            this.player_name[p].on();
        }

        // Clock
        this.clock_limit = new ClockLimit();

        this.player_clock = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.clock[p];
            this.player_clock.push(new PlayerClock(
                `p${p}clock`, this, p, g.x, g.y, g.deg));
        }

        // 表示の更新なので送らない (TODO-051)。つないだあとは
        // サーバから届く clock_state で合わせる
        this.clock_sw = document.getElementById("clock_sw").checked;

        const update_clock = () => {
            this.player_clock[0].update();
            this.player_clock[1].update();
        };
        setInterval(update_clock, 200);

        // Pip count
        this.pip = [];
        for (let p=0; p < 2; p++) {
            const g = label_geo.pip[p];
            this.pip.push(new PlayerPipCount(
                `p${p}pip`, this, p, g.x, g.y, g.deg));
        }

        // Checkers
        this.checker = [Array(15), Array(15)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + player + ("0" + i).slice(-2);
                this.checker[player][i] = new Checker(c_id, this, player);
            } // for(i)
        } // for(player)

        // Cube
        this.cube = new Cube("cube", this);

        // Points
        this.point = point_geometry(this.bx, this.by, this.h).map(
            (g, p) => new BoardPoint("", this, g.x, g.y, g.w, g.h,
                                     p, g.direction, g.max_n));

        // RollButton
        const bx1 = 160;

        this.roll_btn = [];
        this.roll_btn.push(new RollButton(
            "rollbutton0", this, 0, this.bx[4] + bx1, this.h / 2));
        this.roll_btn.push(new RollButton(
            "rollbutton1", this, 1, this.bx[3] - bx1, this.h / 2));

        const dy1 = 200;

        // 投了・パス・勝ちのバナー。押したときの動作だけが違う
        const on_resign_banner = (btn) => {
            log(`resign banner.on_click>player=${btn.player}`);
        };
        const on_pass = (btn) => {
            log(`pass banner.on_click>player=${btn.player}`);

            btn.off();
            action_end_turn(this, btn.player);
        };
        const on_win = (btn) => {
            log(`win banner.on_click>player=${btn.player}`);
        };

        // ResignBanner
        this.resign_banner_btn = [];
        this.resign_banner_btn.push(new BannerButton(
            "resignbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1,
            0, on_resign_banner));
        this.resign_banner_btn.push(new BannerButton(
            "resignbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1,
            0, on_resign_banner));

        // Pass
        this.pass_btn = [];
        this.pass_btn.push(new BannerButton(
            "passbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1,
            0, on_pass));
        this.pass_btn.push(new BannerButton(
            "passbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1,
            0, on_pass));

        // Win
        this.win_btn = [];
        this.win_btn.push(new BannerButton(
            "winbutton0", this, 0, this.bx[4] + bx1, this.h / 2 + dy1,
            0, on_win));
        this.win_btn.push(new BannerButton(
            "winbutton1", this, 1, this.bx[3] - bx1, this.h / 2 - dy1,
            0, on_win));

        if ( this.settings.player == 1 ) {
            this.settings.player = 0;
            this.inverse(0);
        }
    } // Board.constructor()

    /**
     * ヘッダの Pip を切り替えたとき。値は Settings に持たせ、
     * 表示はここで切り替える (TODO-053)
     *
     * @return {boolean} disp_pip
     */
    apply_disp_pip() {
        const disp_pip = this.settings.apply_disp_pip();

        if ( disp_pip ) {
            this.pip[0].on();
            this.pip[1].on();
        } else {
            this.pip[0].off();
            this.pip[1].off();
        }

        return disp_pip;
    } // Board.apply_disp_pip()

    /**
     * @param {boolean} value
     */
    set_clock_switch(value) {
        log(`Board.set_clock_switch(${value})`);
        document.getElementById("clock_sw").checked = value;
        this.clock_sw = value;

        if ( this.clock_sw ) {
            this.player_clock[0].on();
            this.player_clock[1].on();
        } else {
            this.player_clock[0].off();
            this.player_clock[1].off();
        }
    } // Board.set_clock_switch()

    /**
     * ヘッダの Clock を切り替えたとき。両方のクロックはサーバが止める
     * (TODO-050)
     */
    apply_clock_sw() {
        this.clock_sw = document.getElementById("clock_sw").checked;
        action_set_clock_switch(this, this.clock_sw);
    } // Board.apply_clock_sw()
    
    /**
     *
     */
    apply_clock_limit(index) {
        const id = `clock_limit${index}`;
        const value = document.getElementById(id).value;
        log(`Board.apply_clock_limit(${index}):value=${value}`);
        let limit = parseFloat(value);
        if ( index == 0 ) {
            limit *= 60;
        }
        log(`Board.apply_clock_limit(${index}):limit=${limit}`);

        // 両方のクロックはサーバが止める (TODO-050)
        action_set_clock_limit(this, index, limit);
    } // Board.apply_clock_limit()

    /**
     * search checker object by checker id
     *
     * @param {string} ch_id - checker id
     * @return {Checker | undefined} - checker object or undefined
     */
    search_checker(ch_id) {
        log(`Board.search_checker(ch_id=${ch_id})`);
        let player = parseInt(ch_id[1]);

        for (let i=0; i < 15; i++) {
            let ch = this.checker[player][i];
            if ( ch.id == ch_id ) {
                return ch;
            }
        }
        return undefined;
    } // Board.search_checker()

    /**
     * ターンを設定
     *
     * @param {number} turn
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     * @param {number} resign
     * @param {boolean} sound - 手番が変わる音を鳴らすか
     *
     * **サーバへは何も送らない** (TODO-051)。勝負がついたときに
     * クロックを止めるのはサーバ (TODO-050)。
     */
    set_turn(turn, resign=-1, sound=true) {
        for (let p=0; p < 2; p++) {
            this.roll_btn[p].off();
            this.pass_btn[p].off();
            this.win_btn[p].off();
            this.resign_banner_btn[p].off();
            this.player_name[p].off();
        } // for(p)

        if ( turn < 0 ) {
            let score = 0;
            let winner = -1;

            if ( resign >= 0 ) {
                winner = 1 - resign;
                this.resign_banner_btn[resign].on();
            } else {
                for (let p=0; p < 2; p++) {
                    score = this.winner_is(p);
                    if ( score ) {
                        winner = p;
                    }
                } // for(p)
            }

            if ( winner >= 0 ) {
                log(`Board.set_turn>plyaer${winner} win ${score}!`);
                this.win_btn[winner].on();
                this.player_name[winner].on();
            }
            return;
        }

        if ( turn >= 2 ) {
            this.roll_btn[0].update();
            this.roll_btn[1].update();

            this.player_name[0].on();
            this.player_name[1].on();
            return;
        }
            
        // turn == 0 or 1
        if ( sound ) {
            let playpromise = this.sound_turn_change.play();
        }

        if ( this.closeout(1 - turn) ) {
            this.pass_btn[turn].on();
        } else {
            this.roll_btn[turn].update();
        }

        // player name --> on
        this.player_name[turn].on();
        
        log(`Board.set_turn():turn=${turn}`);
    } // Board.set_turn()

    /**
     * 今の盤面を Position にする (TODO-027、TODO-044)
     *
     * 盤面の状態は gameinfo 1 つなので、そこから作る。
     * apply() を 1 度も通る前は空の盤面を返す。
     *
     * @return {Position}
     */
    position() {
        if ( this.gameinfo === undefined ) {
            return Position.from_points(
                Array.from({length: N_POINT}, () => []));
        }
        return Position.from_gameinfo(this.gameinfo);
    } // Board.position()

    /**
     * gameinfo のチェッカーを、積んだ順に並べる (TODO-044)
     *
     * `gameinfo.board.checker[player][i] = [point, idx]` を idx の
     * 昇順に並べる。Array.sort は安定なので、同じ idx の並びは
     * (player, i) の順のまま。
     *
     * **積み順を決めているのはここだけ**で、apply() の配り直しと
     * checkers_at() の両方がこれを使う (2 か所にあるとずれる)。
     *
     * @return {{ch: Checker, point: number, idx: number}[]}
     */
    checker_order() {
        if ( this.gameinfo === undefined ) {
            return [];
        }

        const ch_point = this.gameinfo.board.checker;
        let ch_list = [];
        for (let p=0; p < 2; p++) {
            // 15 固定。gameinfo の checker[p] が 15 と違う長さでも、
            // this.checker[p] は 15 枚しか無い (壊れた .jsonl を
            // 読んだときに、盤面の更新が途中で止まらないように)
            for (let c=0; c < 15; c++) {
                ch_list.push({ ch: this.checker[p][c],
                               point: ch_point[p][c][0],
                               idx: ch_point[p][c][1] });
            } // for (c)
        } // for (p)

        ch_list.sort((a, b) => a.idx - b.idx);
        return ch_list;
    } // Board.checker_order()

    /**
     * そのポイントのチェッカー (積んだ順、両プレーヤーぶん) (TODO-044)
     *
     * @param {number} p - point index
     * @return {Checker[]}
     */
    checkers_at(p) {
        return this.checker_order()
            .filter((e) => e.point == p).map((e) => e.ch);
    } // Board.checkers_at()

    /**
     * そのポイントの先端のチェッカー (TODO-044)
     *
     * @param {number} p - point index
     * @return {Checker|undefined}
     */
    top_checker(p) {
        return this.checkers_at(p).slice(-1)[0];
    } // Board.top_checker()

    /**
     * PIP カウントを計算して、表示も更新する。
     *
     * 計算そのものは rules/judge.js にあり、表示を変えるのはここだけ
     * (TODO-027)。
     *
     * @param {number} player
     * @return {number|undefined} - pip count
     */
    pip_count(player) {
        const count = rule_pip_count(this.position(), player);
        this.pip[player].set(count);
        return count;
    } // Board.pip_count()

    /**
     * player の勝ちなら、その点数を返す。
     *
     * 判定は rules/judge.js。**判定するだけで、状態は書き換えない**
     * (TODO-051。以前は投了による勝ちのときに resign を戻していた)。
     *
     * @param {number} player
     * @return {number} points - 0 なら勝ちではない
     */
    winner_is(player) {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return 0;
        }
        return rule_winner_is(this.position(), player, {
            resign: gi.resign,
            cube_value: gi.board.cube.value,
            cube_accepted: gi.board.cube.accepted,
        }).score;
    } // Board.winner_is()

    /**
     * チェッカーが全てインナーに入っているか？
     *
     * 判定は rules/move.js (TODO-043)
     *
     * @param {number} player
     * @return {boolean}
     */
    all_inner(player) {
        return rule_all_inner(this.position(), player);
    } // Board.all_inner()

    /**
     * クローズアウトしている？
     *
     * 判定は rules/judge.js (TODO-027)
     *
     * @param {number} player
     * @return {boolean}
     */
    closeout(player) {
        return rule_closeout(this.position(), player);
    } // Board.closeout()

    /**
     * 使えるダイス (1〜6) の目。gameinfo から求める (TODO-052)
     *
     * @param {number} player
     * @return {number[]} - gameinfo がまだ無いときは空
     */
    get_active_dice(player) {
        if ( this.gameinfo === undefined ) {
            return [];
        }
        return this.gameinfo.board.dice[player].filter(
            (v) => v >= 1 && v <= 6);
    } // Board.get_active_dice

    /**
     * ダイスが出ているか (使い終わった 11〜16 も含む)。
     * gameinfo から求める (TODO-052。以前は RollButton.dice_active)
     *
     * @param {number} player
     * @return {boolean} - gameinfo がまだ無いときは false
     */
    has_dice(player) {
        if ( this.gameinfo === undefined ) {
            return false;
        }
        return this.gameinfo.board.dice[player].some((v) => v > 0);
    } // Board.has_dice()

    /**
     * 移動可能なポイントの取得
     * @param {number} player
     * @param {number} src_p
     * @param {number[]} dice_vals
     * @return {number[]} - distination points
     */
    get_dst_points(player, src_p, dice_vals) {
        const dst_p = rule_dst_points(this.position(), player,
                                      src_p, dice_vals);
        log(`Board.get_dst_points(`
                    + `player=${player},src_p=${src_p},`
                    + `dice_vals=${JSON.stringify(dice_vals)}`
                    + `)>dst_p=${JSON.stringify(dst_p)}`);
        return dst_p;
    } // Board.get_dst_points()

    /**
     * 1 つの目での行き先 (判定は rules/move.js)
     *
     * @param {number} player
     * @param {number} src_p
     * @param {number} dice_val
     * @return {number|undefined} - destination point
     */
    get_dst_point1(player, src_p, dice_val) {
        return rule_dst_point(this.position(), player, src_p, dice_val);
    } // Board.get_dst_point1()

    /**
     * gameinfo を表示に反映する。**表示を変えるのはここだけ** (TODO-030)。
     *
     * 渡すのは、サーバから届いた gameinfo か、
     * predict_gameinfo() で作った予測のどちらか。
     *
     * 演出 (音と dice の回転) は last_op から出す (TODO-015)。
     * サーバから届くのは gameinfo だけになったので、盤面は gameinfo で
     * 作り直し、「何が起きたか」でしか決められないものだけを
     * last_op で補う。
     *
     * @param {Object} gameinfo - game information object
     * @param {Object} [opts]
     * @param {number} [opts.sec=2]
     * @param {boolean} [opts.history_flag=false]
     * @param {Object} [opts.clock_state] - {sw, active, clock, limit}
     *     (TODO-024)。**予測のときは渡さない** (渡すと、動いている
     *     クロックが古い残り時間から数え直しになる)
     * @param {Object} [opts.last_op] - 直前の操作 {type, data, ..}。
     *     無ければ null。**予測のときは渡さない** (音は、サーバから
     *     gameinfo が届いたときに鳴らす)
     *
     * **サーバへは何も送らない** (TODO-051)。
     */
    apply(gameinfo, {sec=2, history_flag=false, clock_state=undefined,
                     last_op=undefined} = {}) {
        this.gameinfo = gameinfo;

        // last_op は無いこともある (履歴の再生、接続時)。
        // サーバは JSON の null で送ってくるので、真偽で見る
        const op_type = last_op ? last_op.type : undefined;

        // put_checker の put / hit の音は動かす前の位置で決まるので、
        // チェッカーを配り直す前に控えておく (TODO-015)
        let put_ch = undefined;
        let put_prev_p = undefined;
        if ( op_type == "put_checker" ) {
            const ch_id = "p" + ("000" + last_op.data.ch).slice(-3);
            put_ch = this.search_checker(ch_id);
            if ( put_ch !== undefined ) {
                put_prev_p = put_ch.cur_point;
            }
        }
        
        // put checkers (TODO-017)
        //
        // 退避させずに配り直すので、動いて見えるのは位置が変わった
        // チェッカーだけになる。hidden (display:none) の間に座標を動かすと
        // CSS の transition が効かず、sec を渡しても一瞬で切り替わる。
        //
        // point の中の積み順と重なり順は、ポイントごとに数えた枚数を
        // add() へ渡して決める。並べる順 (idx の昇順) は
        // checker_order() が持つ (TODO-044)。cur_point もここで設定する
        // ので put_checker() は通さない (pip count と closeout の判定が
        // 30 回走る。どちらもこのあと pip_count() と set_turn() が
        // まとめて行う)。
        //
        // idx で回すループにはしない。idx はその point に既にある
        // 両プレーヤーぶんの枚数なので、free move で 1 つの point に
        // 16 枚以上乗ると 15 以上になる。0〜14 だけを拾うループだと、
        // そのチェッカーがどの point にも入らないまま画面に残る。
        const ch_list = this.checker_order();

        // 掴んでいるチェッカーは、手元の座標へ戻す (TODO-015)
        //
        // 配り直しは point.add() が座標も z も決めるので、ドラッグ中の
        // 駒まで定位置へ飛ぶ。gameinfo は操作のたびに届くので、他人が
        // 名前を変えただけでも掴んでいる駒が一瞬戻ってしまう。
        // 積み順と cur_point は gameinfo どおりに作らせたまま、
        // 見えている位置と重なり順だけを戻す
        const mv_ch = this.drag.checker;
        let mv_pos = undefined;
        if ( mv_ch !== undefined ) {
            mv_pos = { x: mv_ch.x, y: mv_ch.y, z: mv_ch.z };
        }

        let n_at = new Array(this.point.length).fill(0);
        for (let e of ch_list) {
            e.ch.el.hidden = false;
            e.ch.cur_point = e.point;
            this.point[e.point].add(e.ch, n_at[e.point], sec);
            n_at[e.point] += 1;
        } // for (e)

        if ( mv_pos !== undefined ) {
            mv_ch.move(mv_pos.x, mv_pos.y, true, 0);
            mv_ch.set_z(mv_pos.z);
        }

        // score
        this.score[0].set(gameinfo.score[0]);
        this.score[1].set(gameinfo.score[1]);
        log(`Board.apply>score[]=${JSON.stringify(gameinfo.score)}`);

        // clock
        //
        // クロックは gameinfo の外にあるので、limit も残り時間も
        // すべて clock_state から読む (TODO-024)。
        // clock_limit.set() を history_flag の外で呼ぶのはそのまま
        // (クロックは履歴の対象外なので、再生中でも今の値でよい)
        // 予測 (clock_state が無い) のときは、クロックには触らない。
        // 触ると、動いているクロックが最後にサーバから届いた
        // 残り時間から数え直しになる (TODO-030)
        log(`clock_state=${JSON.stringify(clock_state)}`);
        if ( clock_state !== undefined ) {
            this.clock_limit.set(0, clock_state.limit[0]);
            this.clock_limit.set(1, clock_state.limit[1]);

            if ( ! history_flag ) {
                // サーバが持っている状態から戻す (TODO-016)。
                // 動作中の残り時間も clock_state.clock に入っている
                this.set_clock_switch(clock_state.sw);
                for (let p=0; p < 2; p++) {
                    this.player_clock[p].stop();
                    this.player_clock[p].set(clock_state.clock[p]);
                    if ( clock_state.active[p] ) {
                        this.player_clock[p].resume();
                    }
                }
            }
        }

        // player name
        this.player_name[0].set(gameinfo.board.playername[0]);
        this.player_name[1].set(gameinfo.board.playername[1]);

        // cube
        const c = gameinfo.board.cube;
        // log(`Board.apply> cube=${JSON.stringify(c)}`);
        this.cube.set(c.value, c.side, c.accepted, false);

        // dice
        //
        // 振ったとき (roll) だけ、そのプレーヤーの dice を回して音を
        // 鳴らす (TODO-015、TODO-051)。turn == -1 (操作不可) では演出しない
        const d = gameinfo.board.dice;
        // log(`Board.apply> dice=${JSON.stringify(d)}`);
        let roll_player = -1;
        if ( op_type == "roll" && gameinfo.turn != -1 ) {
            roll_player = last_op.data.player;
        }
        this.roll_btn[0].set(d[0], roll_player == 0);
        this.roll_btn[1].set(d[1], roll_player == 1);

        // 注：順番が重要
        //
        // turn
        //
        // turn_change の音は set_turn が鳴らす。手番が変わる操作
        // (opening と end_turn) で来たときだけ許す。turn が変わったかは
        // 見ない (TODO-051。どちらの操作でも turn は変わる)
        log(`Board.apply>turn=${gameinfo.turn}`);
        this.set_turn(gameinfo.turn, gameinfo.resign,
                      op_type == "opening" || op_type == "end_turn");

        // pip count
        this.pip_count(0);
        this.pip_count(1);

        // put / hit の音 (TODO-015)
        //
        // 盤面はもう gameinfo で揃っているので、ここで出すのは音だけ。
        // put_checker (free move) は turn == -1 (操作不可) では鳴らさない
        if ( put_ch !== undefined && gameinfo.turn != -1 ) {
            if ( last_op.data.p >= 26 && put_prev_p < 26 ) {
                this.sound_hit.play();
            } else {
                this.sound_put.play();
            }
        }

        // move は turn を見ずに鳴らす (TODO-051)。勝ちになる move では、
        // 届いた gameinfo の turn がもう -1 になっている。
        // ヒットは moves にバーへの移動があるかで決める。動かす前の位置を
        // 見ると、先行実行した画面では駒がもうバーにあるので見分けられない
        if ( op_type == "move" ) {
            if ( last_op.data.moves.some((mv) => mv.p >= 26) ) {
                this.sound_hit.play();
            } else {
                this.sound_put.play();
            }
        }
    } // Board.apply()

    /**
     * サーバから届いた gameinfo の入口。
     *
     * ws のメッセージは並びで届くので、名前付きに直して apply() へ
     * 渡すだけ。**表示を変える中身は apply() にしかない** (TODO-030)。
     *
     * @param {Object} gameinfo - game information object
     * @param {number} [sec=2]
     * @param {boolean} [history_flag=false]
     * @param {Object} clock_state - {sw, active, clock, limit} (TODO-024)
     * @param {Object} [last_op] - 直前の操作 {type, data, ..}。無ければ null
     */
    load_gameinfo(gameinfo, sec=2, history_flag=false,
                  clock_state=undefined, last_op=undefined) {
        this.apply(gameinfo, { sec: sec,
                               history_flag: history_flag,
                               clock_state: clock_state,
                               last_op: last_op });
    } // Board.load_gameinfo()

    /**
     * チェッカーを動かしたあとの gameinfo を予測して作る (TODO-030)。
     *
     * サーバの応答を待たずに表示を変えるための「予測」。土台は
     * this.gameinfo (apply() が最後に受け取ったもの) で、動かした
     * チェッカーの [point, idx] を書き換える。
     *
     * - **sn は書き換えない。** 予測はサーバの通し番号を進めない
     * - **動かせるかを Position.with_move() で確かめる。**
     *   駒が無ければ例外になる (TODO-027)
     * - idx は、そのポイントに既にある枚数。move で送る idx も、
     *   この予測から取る
     * - player を渡すと、そのプレーヤーのダイスも書き換える (TODO-051)。
     *   used_dice の目を 11〜16 にし、動かしたあとの盤面で使えなく
     *   なった目も 11〜16 にする。move で送る dice はこれ
     *
     * @param {{ch: Checker, p: number}[]} moves - 動かす順に並べる
     * @param {number} [player] - ダイスを書き換えるプレーヤー
     * @param {number[]} [used_dice=[]] - 使ったダイスの目
     * @return {Object} - 新しい gameinfo (this.gameinfo は変えない)
     * @throws {Error} gameinfo がまだ無いとき、動かせないとき
     */
    predict_gameinfo(moves, player=undefined, used_dice=[]) {
        if ( this.gameinfo === undefined ) {
            throw new Error("Board.predict_gameinfo: gameinfo が無い");
        }

        const gameinfo = copy_gameinfo(this.gameinfo);
        let pos = Position.from_gameinfo(gameinfo);

        for (let mv of moves) {
            const ch = mv.ch;
            const idx = pos.count(mv.p);

            // 動かせるか確かめる (駒が無ければ例外)
            pos = pos.with_move(ch.cur_point, mv.p, ch.player);

            const ch_i = parseInt(ch.id.slice(1)) % 100;
            gameinfo.board.checker[ch.player][ch_i] = [mv.p, idx];
        } // for (mv)

        if ( player !== undefined ) {
            const dice = gameinfo.board.dice[player];
            for (let d1 of used_dice) {
                const i = dice.indexOf(d1);
                if ( i >= 0 ) {
                    dice[i] += 10;
                }
            } // for (d1)
            gameinfo.board.dice[player] = rule_disable_unusable(
                pos, player, dice);
        }

        return gameinfo;
    } // Board.predict_gameinfo()

    /**
     * @param {number} sec
     */
    inverse(sec) {
        log(`Board.inverse(sec=${sec})`);
        
        this.settings.set_player(1 - this.settings.player);

        if ( this.settings.player == 0 ) {
            this.rotate(0, true, sec);
        } else {
            this.rotate(180, true, sec);
        }

        this.player_name[0].inverse();
        this.player_name[1].inverse();
    } // Board.inverse()

    /**
     * checker position(x, y) to  piont index
     * @param {Checker} ch - checker object
     */
    chpos2point(ch) {
        let point = undefined;

        for ( let i=0; i < this.point.length; i++ ) {
            if ( this.point[i].in_this(ch.x, ch.y) ) {
                return i;
            }
        }
        return undefined;
    } // Board.chpos2point()

    /**
     * チェッカーを 1 枚動かして、表示を更新する。
     *
     * 予測した gameinfo を作って apply() に渡すだけ (TODO-030)。
     * **配置・pip・バナーの更新は apply() にしかない。**
     *
     * @param {Checker} ch - Checker
     * @param {number} p - point index
     * @param {number} [sec=0]
     * @param {boolean} [sound=true]
     */
    put_checker(ch, p, sec=0, sound=true) {
        const gameinfo = this.predict_gameinfo([{ch: ch, p: p}]);

        // 音は last_op から出る (apply() が put と hit を見分ける)
        let last_op = undefined;
        if ( sound ) {
            last_op = { type: "put_checker",
                        data: { ch: parseInt(ch.id.slice(1)), p: p } };
        }

        this.apply(gameinfo, {sec: sec, last_op: last_op});
    } // Board.put_checker()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        this.drag.move(x, y);
    } // Board.on_mouse_move_xy()
} // class Board
