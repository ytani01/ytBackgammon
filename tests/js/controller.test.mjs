//
// (c) Yoichi Tanibayashi
//
// BoardController を DOM なしで動かす確認。
//
//   node --test tests/js/
//
// 偽の View (呼ばれたメソッドを貯めるだけ) と、偽の送信関数を渡す。
// BoardController はコンストラクタで 200 ms の setInterval を始めるので、
// node:test の mock.timers で setInterval と Date を差し替える
// (本物のタイマーが残ると、プロセスが終わらない)。
//
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { BoardController } from
    '../../src/ytbg/webroot/static/js/board_controller.js';
import { make_gameinfo } from './helper.mjs';

/** 偽の View。呼ばれたメソッドの名前を calls に貯める */
const fake_view = () => {
    const calls = [];
    const record = (name) => () => { calls.push(name); };
    return {
        calls: calls,
        render: record('render'),
        render_clock: record('render_clock'),
        play_effects: record('play_effects'),
        hide_roll_button: record('hide_roll_button'),
        hide_pass_banner: record('hide_pass_banner'),
    };
};

/**
 * @return {{controller: BoardController, view: Object, sent: Array}}
 */
const make_controller = () => {
    const view = fake_view();
    const sent = [];
    const send = (type, data) => { sent.push([type, data]); };
    const settings = { player: 0, free_move: false, sound: true };
    const controller = new BoardController(
        view, send, settings, { sw: true, limit: [120, 12] });
    return { controller, view, sent };
};

/**
 * サーバの返事の data
 *
 * @param {Object} clock_state
 * @return {Object}
 */
const reply = (clock_state) => ({
    gameinfo: make_gameinfo(), sec: 0, hist_i: 1, hist_n: 1,
    last_op: null, clock_state: clock_state,
});

describe('BoardController (DOM なし)', () => {
    beforeEach(() => {
        mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'],
                             now: 1000000 });
    });

    afterEach(() => {
        mock.timers.reset();
    });

    it('receive() の clock_state から、snapshot() が時刻どおりに残り時間を出す',
       () => {
           const { controller, view } = make_controller();
           controller.receive(reply({
               sw: true, active: [true, false],
               clock: [[120, 12], [100, 5]], limit: [120, 12],
           }));
           assert.ok(view.calls.includes('render'));
           assert.ok(view.calls.includes('play_effects'));
           assert.deepEqual(controller.snapshot(Date.now()).gameinfo,
                            make_gameinfo());

           // 猶予を 5 秒使う。止まっているプレーヤー 1 は減らない
           mock.timers.tick(5000);
           assert.deepEqual(controller.snapshot(Date.now()).clock, {
               sw: true, active: [true, false], limit: [120, 12],
               clock: [[120, 7], [100, 5]],
           });

           // 猶予を使い切ると、持ち時間から引く (マイナスにもなる)
           mock.timers.tick(10000);
           assert.deepEqual(controller.snapshot(Date.now()).clock.clock[0],
                            [117, 0]);
           mock.timers.tick(120000);
           assert.deepEqual(controller.snapshot(Date.now()).clock.clock[0],
                            [-3, 0]);
       });

    it('sw が無効なら、active でも残り時間は減らない', () => {
        const { controller } = make_controller();
        controller.receive(reply({
            sw: false, active: [true, false],
            clock: [[120, 12], [120, 12]], limit: [120, 12],
        }));
        mock.timers.tick(5000);
        assert.deepEqual(controller.snapshot(Date.now()).clock.clock[0],
                         [120, 12]);
    });

    it('set_clock_switch() は送るだけで、sw も表示も変えない', () => {
        const { controller, view, sent } = make_controller();
        controller.receive(reply({
            sw: true, active: [true, false],
            clock: [[120, 12], [120, 12]], limit: [120, 12],
        }));
        view.calls.length = 0;

        controller.set_clock_switch(false);

        assert.deepEqual(sent, [['set_clock_switch', { switch: false }]]);
        assert.deepEqual(view.calls, []);
        assert.equal(controller.snapshot(Date.now()).clock.sw, true);
        mock.timers.tick(1000);
        assert.deepEqual(controller.snapshot(Date.now()).clock.clock[0],
                         [120, 11]);
    });
});
