import { log } from "./log.js";
import { emit_msg } from "./ws.js";
import { BX, BY } from "./layout.js";
import { CookieBase, QueryStringBase } from "./settings.js";
import { SoundBase, GlobalSoundSwitch, set_global_sound_switch,
         SOUND_ROLL, SOUND_PUT, SOUND_HIT,
         SOUND_TURN_CHANGE } from "./sound.js";
import { BgImage } from "./ui/base.js";
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

        this.free_move = false;
        this.disp_pip = false;
        
        // 座標は layout.js にある (書き換えても元は汚さないよう複製する)
        this.bx = [...BX];
        this.by = [...BY];

        this.resign = -1;

        // server ID
        this.svr_id = document.getElementById("server-id").innerHTML;
        log(`Board> svr_id=${this.svr_id}`);

        // Cookie
        this.cookie = new CookieBase();
        this.cookie_board_player = `board${this.svr_id}_player`;
        this.cookie_sound = `board${this.svr_id}_sound`;

        // sound setup
        this.el_sound = document.getElementById("sound-switch");
        this.sound = true;
        this.load_sound_switch();
        this.sound_turn_change = new SoundBase(this, SOUND_TURN_CHANGE);
        this.sound_roll = new SoundBase(this, SOUND_ROLL);
        this.sound_put = new SoundBase(this, SOUND_PUT);
        this.sound_hit = new SoundBase(this, SOUND_HIT);

        // Player
        if ( this.load_player() === undefined ) {
            this.set_player(0);
        }

        this.score = [0, 0];
        
        this.turn = -1;

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

        // PlayerScore
        let [sw, sh] = [22, 53];

        let sx1 = this.bx[0] + 2;
        let sx2 = sx1 + sw + 2;

        let sy_offset = 27;
        let sy1 = this.by[2] + sy_offset;
        let sy2 = this.by[7] - sy_offset - sh;

        let psx = sx1 + 3;
        let psy1 = sy1 + sh - 4;
        let psy2 = sy2 + sh - 4;

        this.score = [];
        this.score[1] = new PlayerScore("p1score", this, 1, psx, psy1, -90);
        this.score[0] = new PlayerScore("p0score", this, 0, psx, psy2, -90);

        // Score buttons
        this.score_btn = [{}, {}];

        this.score_btn[1].up = new ScoreButton(
            "score_up1",   this, 0, sx1, sy1, sw, sh, this.score[1], +1);
        this.score_btn[1].down = new ScoreButton(
            "score_down1", this, 0, sx2, sy1, sw, sh, this.score[1], -1);

        this.score_btn[0].up = new ScoreButton(
            "score_up0",   this, 0, sx1, sy2, sw, sh,
            this.score[0], +1);
        this.score_btn[0].down = new ScoreButton(
            "score_down0", this, 0, sx2, sy2, sw, sh,
            this.score[0], -1);

        // PlayerName
        this.player_name = [];
        this.player_name.push(new PlayerName(
            "p0name", this, 0, this.bx[3], this.by[9]+2,   0));
        this.player_name.push(new PlayerName(
            "p1name", this, 1, this.bx[4], this.by[0]-2, 180));

        for (let p=0; p < 2; p++) {
            this.player_name[p].set("");
            this.player_name[p].on();
        }

        // Clock
        this.clock_limit = new ClockLimit(this.board);

        this.player_clock = [];
        this.player_clock.push(new PlayerClock(
            "p0clock", this, 0, this.bx[3] + 200, this.by[9]+3,   0));
        this.player_clock.push(new PlayerClock(
            "p1clock", this, 1, this.bx[4] - 200, this.by[0]-3, 180));

        this.clock_sw = false;
        this.apply_clock_sw();
        /*
        this.player_clock[0].update();
        this.player_clock[1].update();
        */

        const update_clock = () => {
            this.player_clock[0].update();
            this.player_clock[1].update();
        };
        setInterval(update_clock, 200);

        // Pip count XXX
        this.pip = [];
        let py_offset = 14;
        this.pip.push(new PlayerPipCount("p0pip", this, 0,
                                         (this.bx[6] + this.bx[7]) / 2 - 5,
                                         this.h - py_offset,
                                         0));
        this.pip.push(new PlayerPipCount("p1pip", this, 1,
                                         (this.bx[6] + this.bx[7]) / 2 - 5,
                                         py_offset,
                                         180));

        // Checkers
        this.checker = [Array(15), Array(15)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + player + ("0" + i).slice(-2);
                this.checker[player][i] = new Checker(c_id, this, player);
            } // for(i)
        } // for(player)

        this.moving_checker = undefined;

        // Cube
        this.cube = new Cube("cube", this);

        // Points
        this.point = [];
        
        for ( let p=0; p < 28; p++ ) {
            let cn = 5;
            let pw = (this.bx[3] - this.bx[2]) / 6;
            let ph = this.h / 2 - this.by[0];
            let x0, y0, xn, x;

            if ( p == 0 ) {
                x0 = this.bx[6];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 1 && p <= 6 ) {
                x0 = this.bx[4];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                xn = 6 - p;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 7 && p <= 12 ) {
                x0 = this.bx[2];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                xn = 12 - p;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, -1, cn));
            }
            if ( p >= 13 && p <= 18 ) {
                x0 = this.bx[2];
                y0 = this.by[0];
                xn = p - 13;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p >= 19 && p <= 24 ) {
                x0 = this.bx[4];
                y0 = this.by[0];
                xn = p - 19;
                x = x0 + pw * xn;
                this.point.push(new BoardPoint("", this, x, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 25 ) {
                x0 = this.bx[6];
                y0 = this.by[0];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 26 ) {
                x0 = this.bx[3];
                y0 = this.by[0] + (this.by[9] - this.by[0]) / 2;
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, 1, cn));
            }
            if ( p == 27 ) {
                x0 = this.bx[3];
                y0 = this.by[0];
                let pw = this.bx[4] - this.bx[3];
                this.point.push(new BoardPoint("", this, x0, y0, pw, ph,
                                               p, -1, cn));
            }
        } // for (p)

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
            this.player_clock[btn.player].change_turn();
            this.emit_turn(1 - btn.player, -1, true);
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

        /*
        // Dice histogram
        this.dice_histogram = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
        log("Board.constructor>"
                    + `dice_histogram=${JSON.stringify(this.dice_histogram)}`);
        */

        if ( this.player == 1 ) {
            this.player = 0;
            this.inverse(0);
        }
    } // Board.constructor()

    /**
     * 
     */
    clock_on() {
        this.clock_sw = true;
    }

    /**
     * 
     */
    clock_off() {
        this.clock_sw = false;
    }

    /**
     * @return {boolean} sound
     */
    load_sound_switch() {
        log("Board.load_sound_switch>"
                    + `cookie_sound=${this.cookie_sound}`);

        const s = this.cookie.get(this.cookie_sound);
        // log(`Board.load_sound_switch>s=${s}`);
        if ( s === undefined ) {
            this.sound = true;
        } else {
            this.sound = JSON.parse(s);
        }
        log(`Board.load_sound_switch>sound=${this.sound}`);
        this.el_sound.checked = this.sound;
        //this.apply_sound_switch();

        return this.sound;
    } // Board.load_sound_switch()
        
    /**
     * @return {boolean} sound
     */
    apply_sound_switch() {
        log("Board.apply_sound_switch>"
                    + `cookie_sound=${this.cookie_sound}`);

        const q_str = new QueryStringBase();
        set_global_sound_switch(q_str.get("sound"));
        log(`GlobalSoundSwitch=${GlobalSoundSwitch}`);

        if ( GlobalSoundSwitch !== undefined ) {
            const board_num = q_str.get("board");
            log(`board_num=${board_num}`);

        }
        this.sound = document.getElementById("sound-switch").checked;
        this.cookie.set(this.cookie_sound, this.sound);
        this.el_sound.checked = this.sound;

        log(`Board.apply_sound_switch>sound=${this.sound}`);
        return this.sound;
    } // Board.apply_sound_switch()

    /**
     * @return {boolean} free_move
     */
    apply_free_move() {
        log(`Board.apply_free_move()`);

        this.free_move = document.getElementById("free-move").checked;
        log(`Board.apply_free_move>free_move=${this.free_move}`);

        return this.free_move;
    } // Board.apply_free_move()

    /**
     * @return {boolean} disp_pip
     */
    apply_disp_pip() {
        log(`Board.apply_disp_pip()`);

        this.disp_pip = document.getElementById("disp-pip").checked;
        log(`Board.apply_disp_pip>disp_pip=${this.disp_pip}`);

        if ( this.disp_pip ) {
            this.pip[0].on();
            this.pip[1].on();
        } else {
            this.pip[0].off();
            this.pip[1].off();
        }

        return this.disp_pip;
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
     *
     */
    apply_clock_sw() {
        this.clock_sw = document.getElementById("clock_sw").checked;
        emit_msg("set_clock_switch", { switch: this.clock_sw }, false);
        this.player_clock[0].emit_stop();
        this.player_clock[1].emit_stop();
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

        this.player_clock[0].emit_stop();
        this.player_clock[1].emit_stop();

        this.clock_limit.emit_set(index, limit, true);
    } // Board.apply_clock_limit()

    /**
     * load player number from cookie
     */
    load_player() {
        this.player = this.cookie.get(this.cookie_board_player);
        return this.player;
    } // Board.load_player()

    /**
     * set player number and save to cookie
     *
     * @param {number} player
     */
    set_player(player) {
        this.player = player;
        this.cookie.set(this.cookie_board_player, this.player);
    } // board.set_player()

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
     * @param {number} turn
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     * @param {boolean} add_hist
     */
    emit_turn(turn, resign=-1, add_hist=false) {
        log(`Boad.emit_turn(turn=${turn},resign=${resign},add_hist=${add_hist})`);
        // this.turn = turn;
        emit_msg("set_turn", { turn: turn,
                               resign: resign }, add_hist);
    } // Board.emit_turn()

    /**
     * ターンを設定
     *
     * @param {number} turn
     *   <= -1 : all off
     *       0 : player 0
     *       1 : player 1
     *   >=  2 : all on
     * @param {number} resign
     * @param {boolean} sound - sound switch
     */
    set_turn(turn, resign=-1, sound=true) {
        const prev_turn = this.turn;
        /*
        log(`Board.set_turn(`
                    + `turn=${turn},`
                    + `resign=${resign})>prev_turn=${prev_turn}`);
        */
        this.turn = turn;
        this.resign = resign;
        
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
                // 動いているときだけ止める (TODO-015)
                //
                // set_turn() は load_gameinfo() から毎回呼ばれる。
                // 無条件に emit_stop() を送ると、サーバが返す gameinfo で
                // また load_gameinfo() が走り、stop_clock を送り直す。
                // stop_clock は turn も resign も変えないので、止まる条件が
                // 無いまま回り続ける (実測: 5 秒で 606 通)。
                // active を見れば 1 巡で収まる。サーバが Clock.active を
                // false にすると、次の clock_state で resume() されなくなり、
                // active が false のままになるため
                if ( this.player_clock[winner].active ) {
                    this.player_clock[winner].emit_stop();
                }
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
        if ( turn != prev_turn && sound ) {
            let playpromise = this.sound_turn_change.play();
        }

        if ( this.closeout(1 - this.turn) ) {
            this.pass_btn[turn].on();
        } else {
            this.roll_btn[turn].update();
        }

        // player name --> on
        this.player_name[turn].on();
        
        log(`Board.set_turn():turn=${turn}`);
    } // Board.set_turn()

    /**
     * calcurate pip count
     *
     * @param {number} player
     */
    pip_count(player) {
        let count = 0;
        for (let ch of this.checker[player]) {
            count += ch.get_pip();
            // log(`count=${count}`);
            if ( isNaN(count) ) {
                count = undefined;
                break;
            }
        } // for(ch)
        // log(`Board.pip_count>count=${count}`);

        this.pip[player].set(count);
        return count;
    } // Board.pip_count()

    /**
     * plyaer の勝利が確定していることが前提で、
     * ノーマル/ギャモン/バックギャモン の判定
     * Cubeのポイントも掛けた結果を返す
     *
     * @param {number} player
     * @return {number} point - 1:normal, 2:gammon, 3:backgammon
     */
    calc_gammon(player) {
        let cube_val = this.cube.value;
        if ( ! this.cube.accepted ) {
            // ダブルを掛けられて、受理してない場合
            cube_val /= 2;
        }

        const g_checkers = this.point[this.goal_point(1 - player)].checkers;
        if ( ! this.cube.accepted || g_checkers.length > 0 ) {
            log(`Board.calc_gammon(${player})>${cube_val}`);
            return cube_val;
        }

        let points = [];
        if ( 1 - player == 0 ) {
            points = [19, 20, 21, 22, 23, 24, this.bar_point(0)];
        } else {
            points = [1, 2, 3, 4, 5, 6, this.bar_point(1)];
        }
        for (let p of points) {
            const checkers = this.point[p].checkers;
            if ( checkers.length > 0 && checkers[0].player == 1 - player) {
                // backgammon !
                log(`Board.calc_gammon(${player})>p=${p},${cube_val * 3}`);
                return (cube_val * 3);
            }
        } // for (p)

        // gammon !
        log(`Board.calc_gammon(${player})>${cube_val*2}`);
        return (cube_val * 2);
    } // Board.calc_gammon()

    /**
     * @param {number} player
     * @return {number} points
     */
    winner_is(player) {
        // log(`Board.winner_is>resign=${this.resign}`);
        if ( this.resign == 1 - player ) {
            this.resign = -1;
            return this.calc_gammon(player);
        }

        const pip_count = this.pip_count(player);
        // log(`Board.winner_is>pip_count=${pip_count}`);
        if ( pip_count == 0 ) {
            return this.calc_gammon(player);
        }
        return 0;
    } // Board.winner_is()
    
    /**
     * @param {number} player
     * @return {boolean}
     */
    all_inner(player) {
        for (let i=0; i < 15; i++) {
            if ( ! this.checker[player][i].is_inner() ) {
                return false;
            }
        }
        return true;
    } // Board.all_inner()

    /**
     * クローズアウトしている？
     *
     * @param {number} player
     */
    closeout(player) {
        // log(`Board.closeout(player=${player})`);
        if ( player != 0 && player != 1 ) {
            return false;
        }
        if (this.point[this.bar_point(1-player)].checkers.length == 0) {
            return false;
        }

        let [from_p, to_p] = [1, 6];
        if ( player == 1 ) {
            [from_p, to_p] = [19, 24];
        }

        for (let p=from_p; p <= to_p; p++) {
            const checkers = this.point[p].checkers;
            if ( checkers.length < 2 ) {
                log(`Board.closeout(player=${player}) ==> false`);
                return false;
            }
            if ( checkers[0].player != player ) {
                log(`Board.closeout(player=${player}) ==> false`);
                return false;
            }
        }
        log(`Board.closeout(player=${player}) ==> true`);
        return true;
    } // Board.closeout()

    /**
     * 使えるダイスを取得
     * @return {number[]}
     */
    get_active_dice(player) {
        return this.roll_btn[player].get_active_dice();
    } // Board.get_active_dice

    /**
     * 移動可能なポイントの取得
     * @param {number} player
     * @param {number} src_p
     * @param {number[]} dice_vals
     * @return {number[]} - distination points
     */
    get_dst_points(player, src_p, dice_vals) {
        log(`Board.get_dst_points(`
                    + `player=${player},src_p=${src_p},`
                    + `dice_vals=${JSON.stringify(dice_vals)}`
                    + `)`);

        let dst_p = [];

        if ( dice_vals.length == 0 ) {
            return [];
        }

        for (let dice_val of dice_vals) {
            const dst_p1 = this.get_dst_point1(player, src_p, dice_val);
            if ( dst_p1 === undefined ) {
                continue;
            }
            dst_p.push(dst_p1);
        } // for(dice_val)

        // log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);

        if ( dst_p.length == 0 ) {
            return [];
        }

        // 重複削除
        let dst_p2 = [];
        let prev_p = undefined;
        for ( let p of dst_p ) {
            if ( p != prev_p ) {
                dst_p2.push(p);
                prev_p = p;
            }
        }
        dst_p = dst_p2;
        // log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);

        let dst_p1 = undefined;
        let dice_val = undefined;

        if ( dice_vals.length >= 2 ) {
            // サイコロの目を足した場合も確認
            dice_val = dice_vals[0] + dice_vals[1];
            log(`Board.get_dst_points>dice_val=${dice_val}`);
            dst_p1 = this.get_dst_point1(player, src_p, dice_val);
            if ( dst_p1 !== undefined ) {
                dst_p.push(dst_p1);
            }

            if ( dice_vals.length >= 3 && dst_p1 !== undefined ) {
                // ぞろ目の場合
                dice_val += dice_vals[2];
                log(`Board.get_dst_points>dice_val=${dice_val}`);
                dst_p1 = this.get_dst_point1(player, src_p, dice_val);
                if ( dst_p1 !== undefined ) {
                    dst_p.push(dst_p1);
                }
                 
                if ( dice_vals.length == 4 && dst_p1 !== undefined ) {
                    dice_val += dice_vals[3];
                    log(`Board.get_dst_points>dice_val=${dice_val}`);
                    dst_p1 = this.get_dst_point1(player, src_p, dice_val);
                    if ( dst_p1 !== undefined ) {
                        dst_p.push(dst_p1);
                    }
                }
            }
        }

        log(`Board.get_dst_points>dst_p=${JSON.stringify(dst_p)}`);
        return dst_p;
    } // Board.get_dst_points()

    /**
     *
     */
    get_dst_point1(player, src_p, dice_val) {
        let dst_p1 = this.calc_dst_point(player, src_p, dice_val);
        // log(`Board.get_dst_point1>dst_p1=${dst_p1}`);

        let checkers;
        
        if ( player == 0 && dst_p1 <= 0 ) {
            if ( ! this.all_inner(player) ) {
                return undefined;
            }
            // すべてインナー
            if ( dst_p1 < 0 ) {
                // src_p以降のポイントにCheckerが存在するか確認
                for (let p=src_p+1; p <= 6; p++) {
                    checkers = this.point[p].checkers;
                    if ( checkers.length > 0 && checkers[0].player == player) {
                        return undefined;
                    }
                } // for(p)
                dst_p1 = 0;
            }
        }
        if ( player == 1 && dst_p1 >= 25 ) {
            if ( ! this.all_inner(player) ) {
                return undefined;
            }
            // すべてインナー
            if ( dst_p1 > 25 ) {
                // src_p以降のポイントにCheckerが存在するか確認
                for (let p=src_p-1; p >= 19; p--) {
                    checkers = this.point[p].checkers;
                    if ( checkers.length > 0 && checkers[0].player == player) {
                        return undefined;
                    }
                } // for(p)
                dst_p1 = 25;
            }
        }

        checkers = this.point[dst_p1].checkers;
        if ( checkers.length >= 2 && checkers[0].player != player ) {
            return undefined;
        }

        return dst_p1;
    }

    /**
     * load all game information
     *
     * 演出 (音と dice の回転) は last_op から出す (TODO-015)。
     * サーバから届くのは gameinfo だけになったので、盤面は gameinfo で
     * 作り直し、「何が起きたか」でしか決められないものだけを
     * last_op で補う。
     *
     * @param {Object} gameinfo - game information object
     * @param {number} [sec=2]
     * @param {boolean} [history_flag=false]
     * @param {Object} clock_state - {sw, active, clock, limit} (TODO-024)
     * @param {Object} [last_op] - 直前の操作 {type, data, ..}。無ければ null
     */
    load_gameinfo(gameinfo, sec=2, history_flag=false,
                  clock_state=undefined, last_op=undefined) {
        /*
        log(`Board.load_gameinfo(`
                    + `gameinfo=${JSON.stringify(gameinfo)},sec=${sec})`);
        */
        this.gameinfo = gameinfo;

        // last_op は無いこともある (履歴の再生、接続時)。
        // サーバは JSON の null で送ってくるので、真偽で見る
        const op_type = last_op ? last_op.type : undefined;

        // put / hit の音は動かす前の位置で決まるので、チェッカーを
        // 配り直す前に控えておく (TODO-015)
        let put_ch = undefined;
        let put_prev_p = undefined;
        if ( op_type == "put_checker" ) {
            const ch_id = "p" + ("000" + last_op.data.ch).slice(-3);
            put_ch = this.search_checker(ch_id);
            if ( put_ch !== undefined ) {
                put_prev_p = put_ch.cur_point;
            }
        }
        
        // clear points
        // log(`Board.load_gameinfo> clear points`);
        for (let i=0; i < this.point.length; i++) {
            this.point[i].checkers = [];
        } // for(i)

        // put checkers (TODO-017)
        //
        // 退避させずに配り直すので、動いて見えるのは位置が変わった
        // チェッカーだけになる。hidden (display:none) の間に座標を動かすと
        // CSS の transition が効かず、sec を渡しても一瞬で切り替わる。
        //
        // point の中の積み順と重なり順は add() が checkers の長さから
        // 決めるので、idx (ch_point[p][c][1]) の小さい順に呼ぶ。
        // add() が cur_point も設定するので put_checker() は通さない
        // (pip count と closeout の判定が 30 回走る。どちらもこのあと
        // pip_count() と set_turn() がまとめて行う)。
        //
        // idx で回すループにはしない。idx はその point に既にある
        // 両プレーヤーぶんの枚数なので、free move で 1 つの point に
        // 16 枚以上乗ると 15 以上になる。0〜14 だけを拾うループだと、
        // そのチェッカーがどの point にも入らないまま画面に残り、
        // put_checker() の splice(-1, 1) が無関係な駒を配列から外す。
        const ch_point = gameinfo.board.checker;
        /*
        log(
            `Board.load_gameinfo> ch_point=${JSON.stringify(ch_point)}`);
        */
        let ch_list = [];
        for (let p=0; p < 2; p++) {
            for (let c=0; c < 15; c++) {
                ch_list.push({ ch: this.checker[p][c],
                               point: ch_point[p][c][0],
                               idx: ch_point[p][c][1] });
            } // for (c)
        } // for (p)

        // 同じ idx が並んだときの順番は、Array.sort が安定なので
        // 積んだ順 (player, checker の順) のまま
        ch_list.sort((a, b) => a.idx - b.idx);

        // 掴んでいるチェッカーは、手元の座標へ戻す (TODO-015)
        //
        // 配り直しは point.add() が座標も z も決めるので、ドラッグ中の
        // 駒まで定位置へ飛ぶ。gameinfo は操作のたびに届くので、他人が
        // 名前を変えただけでも掴んでいる駒が一瞬戻ってしまう。
        // checkers の並びと cur_point は gameinfo どおりに作らせたまま、
        // 見えている位置と重なり順だけを戻す
        const mv_ch = this.moving_checker;
        let mv_pos = undefined;
        if ( mv_ch !== undefined ) {
            mv_pos = { x: mv_ch.x, y: mv_ch.y, z: mv_ch.z };
        }

        for (let e of ch_list) {
            e.ch.el.hidden = false;
            this.point[e.point].add(e.ch, sec);
        } // for (e)

        if ( mv_pos !== undefined ) {
            mv_ch.move(mv_pos.x, mv_pos.y, true, 0);
            mv_ch.set_z(mv_pos.z);
        }

        // score
        this.score[0].set(gameinfo.score[0]);
        this.score[1].set(gameinfo.score[1]);
        log(`Board.load_gameinfo>score[]=[`
                    + `${this.score[0].score},`
                    + `${this.score[1].score}]`);

        // resign
        this.resign = gameinfo.resign;

        // clock
        //
        // クロックは gameinfo の外にあるので、limit も残り時間も
        // すべて clock_state から読む (TODO-024)。
        // clock_limit.set() を history_flag の外で呼ぶのはそのまま
        // (クロックは履歴の対象外なので、再生中でも今の値でよい)
        log(`clock_state=${JSON.stringify(clock_state)}`);
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

        // player name
        this.player_name[0].set(gameinfo.board.playername[0]);
        this.player_name[1].set(gameinfo.board.playername[1]);

        // cube
        const c = gameinfo.board.cube;
        // log(`Board.load_gameinfo> cube=${JSON.stringify(c)}`);
        this.cube.set(c.value, c.side, c.accepted, false);

        // dice
        //
        // 振ったときだけ、そのプレーヤーの dice を回して音を鳴らす
        // (TODO-015)。turn == -1 (操作不可) では演出しない
        const d = gameinfo.board.dice;
        // log(`Board.load_gameinfo> dice=${JSON.stringify(d)}`);
        let roll_player = -1;
        if ( op_type == "dice" && last_op.data.roll && gameinfo.turn != -1 ) {
            roll_player = last_op.data.player;
        }
        this.roll_btn[0].set(d[0], roll_player == 0);
        this.roll_btn[1].set(d[1], roll_player == 1);

        // 注：順番が重要
        //
        // turn
        //
        // turn_change の音は set_turn が鳴らす。turn が変わったときだけ
        // 鳴るので、set_turn の操作で来たときだけ許す (TODO-015)
        log(`Board.load_gameinfo>turn=${gameinfo.turn}`);
        this.set_turn(gameinfo.turn, this.resign, op_type == "set_turn");

        // pip count
        this.pip_count(0);
        this.pip_count(1);

        // put / hit の音 (TODO-015)
        //
        // 盤面はもう gameinfo で揃っているので、ここで出すのは音だけ。
        // turn == -1 (操作不可) では鳴らさない
        if ( put_ch !== undefined && this.turn != -1 ) {
            if ( last_op.data.p >= 26 && put_prev_p < 26 ) {
                this.sound_hit.play();
            } else {
                this.sound_put.play();
            }
        }
    } // Board.load_gameinfo()

    /**
     * @param {number} sec
     */
    inverse(sec) {
        log(`Board.inverse(sec=${sec})`);
        
        this.set_player(1 - this.player);
        
        if ( this.player == 0 ) {
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
     * @param {Checker} ch
     * @param {number} p - point index
     * @param {boolean} [add_hist=true]
     */
    emit_put_checker(ch, p, add_hist) {
        const idx = this.point[p].checkers.length;
        log("Board.emit_put_checker("
                    + `cd.id=${ch.id},`
                    + `p=${p},`
                    + `add_hist=${add_hist})`);

        emit_msg("put_checker", { ch: parseInt(ch.id.slice(1)),
                                  p:  p,
                                  idx: idx }, add_hist);
    } // Board.emit_put_checker()

    /**
     * @param {Checker} ch - Checker
     * @param {number} p - point index
     * @param {number} [sec=0]
     * @param {boolean} [sound=true]
     */
    put_checker(ch, p, sec=0, sound=true) {
        const prev_p = ch.cur_point;

        if (prev_p !== undefined ) {
            //
            // chがあったポイントからチェッカーを削除
            //
            // 前提: chは、ポイントの先端のチェッカー
            //
            const checkers = this.point[prev_p].checkers;
            const ch_i = checkers.indexOf(ch);
            checkers.splice(ch_i, 1);
        }

        // 移動先ポイントに chを加える
        const idx = this.point[p].add(ch, sec);
        ch.cur_point = p;

        // move sound
        if ( sound ) {
            if ( p >= 26 && prev_p < 26 ) {
                this.sound_hit.play();
            } else {
                this.sound_put.play();
            }
        }

        // pip count
        this.pip_count(ch.player);

        // check closeout
        if ( this.closeout(1 - this.turn) ) {
            this.pass_btn[this.turn].on();
            this.roll_btn[this.turn].off();
            this.roll_btn[1 - this.turn].off();
        }
    } // Board.put_checker()

    /**
     * @param {number} x
     * @param {number} y
     */
    on_mouse_move_xy(x, y) {
        if ( this.moving_checker !== undefined ) {
            this.moving_checker.move(x, y, true);
        }
        if ( this.cube.moving ) {
            this.cube.move(x, y, true);
        }
    } // Board.on_mouse_move_xy()
} // class Board
