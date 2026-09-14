/**
 * 盤面の状態・操作・時計の計算。
 *
 * **盤面の状態 (gameinfo) とクロックの基準を持つのはここだけ。**
 * View と送信関数と Settings は外から受け取り、DOM は触らない。
 * 操作の判定と送る内容・予測は rules/actions.js に任せ、ここは
 * 返った message を送り、予測を反映する。rules へ渡す値は数に直す
 * (サーバが型を確かめて弾くため。cookie から読んだプレーヤー番号は
 * 文字列のことがある)。
 *
 * 受け取ったら、変更前の盤面を控え、返事を反映し、View を描画してから
 * 演出 (音とダイスの回転) を行う。予測も同じ描画を使うが、クロックの
 * 基準と演出には触れない。
 */
import { log } from "./log.js";
import { checkers_at, has_dice } from "./rules/position.js";
import { can_hold_cube as rule_can_hold_cube,
         can_pick_checker as rule_can_pick_checker,
         plan_cube_drop, plan_dice_click, plan_move as rule_plan_move,
         plan_put_checker, plan_resign, plan_roll,
         plan_score } from "./rules/actions.js";

/** 時計の表示を更新する間隔 [msec] */
const CLOCK_INTERVAL_MSEC = 200;

/** Roll を押してから、先手決めでダイスを自動で押すまで [msec] */
const OPENING_CLICK_MSEC = 2000;

/**
 * 受け取った gameinfo の、鳴らす音と回すダイス
 *
 * - roll: 振ったプレーヤーのダイスを回して、振る音。turn が -1 では演出しない
 * - opening / end_turn: 新しい turn が 0 / 1 なら手番が変わる音
 *   (turn が変わったかは見ない)
 * - put_checker: 変更前の盤面の位置で put / hit を決める。turn が -1 では鳴らさない
 * - move: turn を見ずに鳴らす (勝ちになる move では turn がもう -1)。
 *   moves にバー (26 以上) への移動があれば hit (先行実行した画面では
 *   駒がもうバーにあるので、動かす前の位置では見分けられない)
 *
 * @param {Object|undefined} previous - 変更前の gameinfo
 * @param {Object} next - 受け取った gameinfo
 * @param {Object|null|undefined} last_op - 直前の操作 {type, data, ..}。
 *     サーバは JSON の null で送ってくるので、真偽で見る
 * @return {{sounds: string[], roll_player: number}} - sounds は
 *     "sound_roll" / "sound_turn_change" / "sound_put" / "sound_hit" を
 *     鳴らす順に。roll_player はダイスを回すプレーヤー (無ければ -1)
 */
export const effects_for = (previous, next, last_op) => {
    const op_type = last_op ? last_op.type : undefined;
    const sounds = [];

    let roll_player = -1;
    if ( op_type == "roll" && next.turn != -1 ) {
        if ( last_op.data.player == 0 || last_op.data.player == 1 ) {
            roll_player = last_op.data.player;
            sounds.push("sound_roll");
        }
    }

    if ( (op_type == "opening" || op_type == "end_turn")
         && next.turn >= 0 && next.turn < 2 ) {
        sounds.push("sound_turn_change");
    }

    if ( op_type == "put_checker" && next.turn != -1 ) {
        // ID は player * 100 + num。範囲外なら鳴らさない
        const id = last_op.data.ch;
        const player = Math.floor(id / 100);
        const num = id % 100;
        if ( (player == 0 || player == 1) && Number.isInteger(num)
             && num >= 0 && num < 15 ) {
            const prev_p = previous?.board.checker[player]?.[num]?.[0];
            if ( last_op.data.p >= 26 && prev_p < 26 ) {
                sounds.push("sound_hit");
            } else {
                sounds.push("sound_put");
            }
        }
    }

    if ( op_type == "move" ) {
        if ( last_op.data.moves.some((mv) => mv.p >= 26) ) {
            sounds.push("sound_hit");
        } else {
            sounds.push("sound_put");
        }
    }

    return { sounds: sounds, roll_player: roll_player };
}; // effects_for()

export class BoardController {
    /**
     * @param {BoardView} view
     * @param {function(string, Object): void} send - サーバへ 1 通送る
     * @param {Settings} settings
     * @param {{sw: boolean, limit: number[]}} clock_init - 最初の返事が
     *     届く前のクロックの設定 (ヘッダの HTML の初期値)。limit は秒
     */
    constructor(view, send, settings, clock_init) {
        this.view = view;
        this.send = send;
        this.settings = settings;

        // 盤面の状態はこれだけ。判定もここを読む (TODO-052)。
        // サーバから届くまでは undefined で、盤面を読む操作はできない
        this.gameinfo = undefined;
        this.hist_i = undefined;
        this.hist_n = undefined;

        // クロック。サーバから届いた clock_state だけから作る。
        // base は基準の残り時間 [持ち時間, 猶予]、base_time はその時刻 [msec]
        const now = Date.now();
        this.clock = {
            sw: clock_init.sw,
            active: [false, false],
            limit: [...clock_init.limit],
            base: [[0, 0], [0, 0]],
            base_time: [now, now],
        };

        // 時計の表示の更新。ページを閉じるまで止めない
        setInterval(() => this.tick(Date.now()), CLOCK_INTERVAL_MSEC);
        this.view.render_clock(this.snapshot(now).clock);
    } // BoardController.constructor()

    /**
     * 今の状態を、読むだけの値にまとめる
     *
     * @param {number} now - Date.now()
     * @return {{gameinfo: Object|undefined, hist_i: number|undefined,
     *           hist_n: number|undefined,
     *           clock: {sw: boolean, active: boolean[], limit: number[],
     *                   clock: number[][]}}}
     */
    snapshot(now) {
        const c = this.clock;
        const clock = [0, 1].map((p) => {
            const base = c.base[p];
            if ( ! (c.active[p] && c.sw) ) {
                return [base[0], base[1]];
            }
            const msec = now - c.base_time[p];
            let clock0 = base[0];
            let clock1 = (base[1] * 1000.0 - msec) / 1000;
            if ( clock1 < 0 ) {
                clock0 = base[0] + clock1;
                clock1 = 0;
            }
            return [clock0, clock1];
        });
        return {
            gameinfo: this.gameinfo,
            hist_i: this.hist_i,
            hist_n: this.hist_n,
            clock: { sw: c.sw, active: [...c.active], limit: [...c.limit],
                     clock: clock },
        };
    } // BoardController.snapshot()

    /**
     * 時計の表示の更新 (interval から呼ぶ)。盤面全体の描画や演出はしない
     *
     * 動いていない間は、基準の時刻を今にする (止まっていた時間を
     * あとから差し引かない)。
     *
     * @param {number} now
     */
    tick(now) {
        const c = this.clock;
        for (let p=0; p < 2; p++) {
            if ( ! (c.active[p] && c.sw) ) {
                c.base_time[p] = now;
            }
        }
        this.view.render_clock(this.snapshot(now).clock);
    } // BoardController.tick()

    /**
     * サーバから届いた gameinfo の入口
     *
     * @param {Object} data - サーバの返事の data 全体
     *     {gameinfo, sec, hist_i, hist_n, clock_state, last_op}
     */
    receive(data) {
        const previous = this.gameinfo;
        const now = Date.now();

        this.gameinfo = data.gameinfo;
        this.hist_i = data.hist_i;
        this.hist_n = data.hist_n;

        // クロックは gameinfo の外にあるので、すべて clock_state から読む。
        // 履歴の返事でも反映する (クロックは履歴の対象外なので巻き戻らない)
        const cs = data.clock_state;
        if ( cs !== undefined ) {
            this.clock.sw = cs.sw;
            this.clock.limit = [cs.limit[0], cs.limit[1]];
            for (let p=0; p < 2; p++) {
                this.clock.active[p] = Boolean(cs.active[p]);
                this.clock.base[p] = [cs.clock[p][0], cs.clock[p][1]];
                this.clock.base_time[p] = now;
            }
        }

        const sec = data.sec === undefined ? 2 : data.sec;
        this.view.render(this.snapshot(now),
                         { sec: sec, clock: cs !== undefined });
        this.view.play_effects(
            effects_for(previous, data.gameinfo, data.last_op));
    } // BoardController.receive()

    /**
     * 予測した gameinfo を反映する。クロックの基準と演出には触れない
     *
     * 予測した gameinfo はそのまま this.gameinfo になり、次の予測の土台になる。
     *
     * @param {Object} gameinfo
     * @param {{sec?: number}} [opts]
     */
    predict(gameinfo, {sec=0} = {}) {
        this.gameinfo = gameinfo;
        this.view.render(this.snapshot(Date.now()),
                         { sec: sec, clock: false });
    } // BoardController.predict()

    /**
     * plan の message を送る
     *
     * @param {{message: {type: string, data: Object}}} plan
     */
    send_plan(plan) {
        this.send(plan.message.type, plan.message.data);
    } // BoardController.send_plan()

    // -----------------------------------------------------------------
    // ダイス
    // -----------------------------------------------------------------

    /**
     * ダイスを振って roll を送る。乱数はここで作る。
     * 送ったら Roll ボタンを隠し、相手のダイスが出ていれば (先手決め)
     * 2 秒後にダイスを押す
     *
     * @param {number} player
     * @return {boolean} - 送ったか
     */
    roll(player) {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return false;
        }
        player = parseInt(player);

        const d1 = Math.floor(Math.random() * 4);
        let d2 = d1;
        while ( d1 == d2 ) {
            d2 = Math.floor(Math.random() * 4);
        }
        const value1 = Math.floor(Math.random() * 6) + 1;
        const value2 = Math.floor(Math.random() * 6) + 1;

        const plan = plan_roll(gi, player, { d1: d1, d2: d2,
                                             value1: value1, value2: value2 });
        if ( plan === null ) {
            return false;
        }
        log(`roll> [d1, d2]=[${d1}, ${d2}], [${value1}, ${value2}]`);

        this.send_plan(plan);

        // 次の描画で、状態から表示し直される
        this.view.hide_roll_button(player);

        if ( has_dice(gi, 1 - player) ) {
            log(`roll> settimeout`);
            // 実行するときの最新の状態で判断する
            setTimeout(() => this.click_dice(player, 0), OPENING_CLICK_MSEC);
        }
        return true;
    } // BoardController.roll()

    /**
     * ダイスを押したとき。判定は rules/actions.js の plan_dice_click()。
     *
     * free move のときは、予測した盤面を先に表示してから送る
     * (続けて押したときに、サーバの返事の前でも目が進むように)。
     *
     * @param {number} player - ダイスのプレーヤー
     * @param {number} index - 何番目のダイスか
     */
    click_dice(player, index) {
        player = parseInt(player);
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return;
        }

        const plan = plan_dice_click(gi, player, index,
                                     this.settings.free_move);
        if ( plan === null ) {
            return;
        }
        if ( plan.predicted !== undefined ) {
            this.predict(plan.predicted, { sec: 0 });
        }
        this.send_plan(plan);
    } // BoardController.click_dice()

    /**
     * パスのバナー (とスペースキー)。バナーをその場で隠し、手番を渡す
     *
     * @param {number} player - 渡す側
     */
    pass_turn(player) {
        log(`pass_turn>player=${player}`);
        this.view.hide_pass_banner(player);
        this.send("end_turn", { player: parseInt(player) });
    } // BoardController.pass_turn()

    // -----------------------------------------------------------------
    // チェッカー
    // -----------------------------------------------------------------

    /**
     * そのチェッカーを掴んでよいか
     *
     * @param {number} id - チェッカーの ID (player * 100 + i)
     * @return {boolean}
     */
    can_pick_checker(id) {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return false;
        }
        return rule_can_pick_checker(gi, id, this.settings.free_move);
    } // BoardController.can_pick_checker()

    /**
     * そのポイントのチェッカーの ID (積んだ順)
     *
     * @param {number} point
     * @return {number[]} - gameinfo がまだ無いときは空
     */
    checkers_at(point) {
        if ( this.gameinfo === undefined ) {
            return [];
        }
        return checkers_at(this.gameinfo, point).map((e) => e.id);
    } // BoardController.checkers_at()

    /**
     * 駒を離したときの move と予測 (rules/actions.js の plan_move())。
     *
     * **予測の入口はこの 1 か所**で、ブラウザテストはここを差し替えて
     * 予測を外す・失敗させる。
     *
     * @param {number} id - 動かすチェッカーの ID
     * @param {number|undefined} point - 離した場所のポイント
     * @return {{message: {type: string, data: Object},
     *           predicted: Object}|null} - 動かせないときは null
     * @throws {Error} gameinfo がまだ無いとき、予測に失敗したとき
     */
    plan_move(id, point) {
        if ( this.gameinfo === undefined ) {
            throw new Error("BoardController.plan_move: gameinfo が無い");
        }
        return rule_plan_move(this.gameinfo, id, point);
    } // BoardController.plan_move()

    /**
     * 掴んでいたチェッカーを離したとき。
     *
     * free move なら put_checker を送る。そうでなければ plan_move() で
     * move を 1 通送ってから予測を表示する (先行実行)。
     * **予測に失敗したら何も送らない。** 予測が外れても、サーバから届く
     * gameinfo で表示は戻る。
     *
     * View は、掴んでいる状態を外してから呼ぶ (予測の描画で、掴んでいる駒は
     * 手元の座標に残されるため)。
     *
     * @param {number} id
     * @param {number|undefined} point - 離した場所のポイント
     * @return {boolean} - false なら何も送っていない (View が元の位置へ戻す)
     */
    drop_checker(id, point) {
        if ( this.settings.free_move ) {
            this.put_checker(id, point);
            return true;
        }

        let plan = null;
        try {
            plan = this.plan_move(id, point);
        } catch (e) {
            log(`drop_checker>${e}`);
            return false;
        }
        if ( plan === null ) {
            return false;
        }
        log(`drop_checker>move=${JSON.stringify(plan.message.data)}`);

        this.send_plan(plan);
        this.predict(plan.predicted, { sec: 0.2 });
        return true;
    } // BoardController.drop_checker()

    /**
     * free move での移動。予測はしない
     *
     * @param {number} id
     * @param {number|undefined} point
     */
    put_checker(id, point) {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return;
        }
        this.send_plan(plan_put_checker(gi, id, point));
    } // BoardController.put_checker()

    // -----------------------------------------------------------------
    // キューブ
    // -----------------------------------------------------------------

    /**
     * キューブを掴んでよいか
     *
     * @return {boolean}
     */
    can_hold_cube() {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return false;
        }
        return rule_can_hold_cube(gi, this.settings.player);
    } // BoardController.can_hold_cube()

    /**
     * 掴んでいたキューブを離したとき。ダブル・テイク・取り消しのどれを
     * 送るかは rules/actions.js の plan_cube_drop() が決める
     *
     * @param {{src_y: number, y: number, y0: number, y1: number[]}} geometry
     */
    drop_cube(geometry) {
        // 掴めたなら gameinfo は届いている (can_hold_cube())
        const plan = plan_cube_drop(this.gameinfo, this.settings.player,
                                    geometry);
        if ( plan !== null ) {
            this.send_plan(plan);
        }
    } // BoardController.drop_cube()

    // -----------------------------------------------------------------
    // 投了・得点・名前
    // -----------------------------------------------------------------

    /**
     * 投了。相手に足す点数は rules/actions.js の plan_resign()
     */
    resign() {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return;
        }
        const plan = plan_resign(gi, parseInt(this.settings.player));
        log(`resign>score=${plan.message.data.score}`);
        this.send_plan(plan);
    } // BoardController.resign()

    /**
     * 得点の ▲ (up) / ▼ (clear)。変えた盤面を先に表示してから送る
     * (続けて押したときに、サーバの返事の前でも足されるように)
     *
     * @param {number} player
     * @param {"up"|"clear"} operation
     */
    score(player, operation) {
        const gi = this.gameinfo;
        if ( gi === undefined ) {
            return;
        }
        const plan = plan_score(gi, parseInt(player), operation);
        this.predict(plan.predicted, { sec: 0 });
        this.send_plan(plan);
    } // BoardController.score()

    /**
     * @param {number} player
     * @param {string} name
     */
    set_playername(player, name) {
        this.send("set_playername", { player: parseInt(player), name: name });
    } // BoardController.set_playername()

    // -----------------------------------------------------------------
    // クロック・履歴
    // -----------------------------------------------------------------

    /**
     * クロックを押したとき。動いていれば止め、止まっていれば再開する
     *
     * @param {number} player
     */
    toggle_clock(player) {
        player = parseInt(player);
        if ( this.clock.active[player] ) {
            this.send("stop_clock", { player: player });
        } else if ( this.clock.sw ) {
            this.send("resume_clock", { player: player });
        }
    } // BoardController.toggle_clock()

    /**
     * クロック機能の ON/OFF。**送るだけ。** 計算も表示も返事の
     * clock_state で変わる。両方のクロックはサーバが止める
     *
     * @param {boolean} sw
     */
    set_clock_switch(sw) {
        this.send("set_clock_switch", { switch: Boolean(sw) });
    } // BoardController.set_clock_switch()

    /**
     * 持ち時間 (index 0、分) か猶予 (index 1、秒) の入力を、秒に直して送る。
     * 両方のクロックはサーバが止める
     *
     * @param {number} index
     * @param {string} value - 入力欄の値
     */
    set_clock_limit(index, value) {
        log(`set_clock_limit(${index}):value=${value}`);
        let limit = parseFloat(value);
        if ( index == 0 ) {
            limit *= 60;
        }
        this.send("set_clock_limit", { index: parseInt(index),
                                       clock_limit: Number(limit) });
    } // BoardController.set_clock_limit()

    /**
     * 履歴の操作 (back / back2 / back_all / fwd / fwd2 / fwd_all /
     * clear_hist / new)
     *
     * @param {string} type
     * @param {Object} [data={}] - back / fwd は {n}
     */
    history(type, data={}) {
        this.send(type, data);
    } // BoardController.history()
} // class BoardController
