import { log } from "./log.js";
import { emit_msg, ws_connect } from "./ws.js";
import { Settings, get_server_id, get_sound_query } from "./settings.js";
import { set_global_sound_switch } from "./sound.js";
import { build_dom, wait_images } from "./dom.js";
import { BoardController } from "./board_controller.js";
import { BoardView } from "./board_view.js";

// 盤面の要素を作る (TODO-029)。
// ES Modules は defer と同じ扱いなので、この時点で <body> はできている。
// ここで作った <img> の読み込みは window.onload の中で待つ。
// 作った要素は BoardView へ渡す (TODO-054)
const els = build_dom();

// メニュー (ハンバーガー) のチェックボックス。項目を押したら閉じる
const nav = document.getElementById("nav-input");

// ヘッダのクロックの設定
const header = {
    clock_sw: document.getElementById("clock_sw"),
    clock_limit: [document.getElementById("clock_limit0"),
                  document.getElementById("clock_limit1")],
};

let settings = undefined;
let view = undefined;
let controller = undefined;

/**
 * メニューの項目の共通処理 (TODO-038)。
 *
 * 押したらメニューを閉じ、type を送る。confirm_msg があるものは、
 * 押した人の画面で確認を取ってから送る (共有ボードなので、全員の
 * 盤面や履歴が変わる)。
 *
 * @param {string} type
 * @param {Object} [data={}]
 * @param {string} [confirm_msg] - 確認を取るときのメッセージ
 */
const menu_emit = (type, data={}, confirm_msg=undefined) => {
    nav.checked = false;
    log(`menu_emit(${type})`);
    if ( confirm_msg !== undefined && ! confirm(confirm_msg) ) {
        return;
    }
    controller.history(type, data);
};

/**
 * @param {number} player
 */
const emit_playername = (player) => {
    const el = els.name_input[player];
    const name = el.value;

    log(`emit_playername>player=${player},name=${name}`);

    controller.set_playername(player, name);

    el.style.zIndex = -2;
};

/**
 *
 */
const on_key_down = (e) => {
    log(`e.key=${e.key},e.ctrlKey=${e.ctrlKey},e.shiftKey=${e.shiftKey}`);

    const player = settings.player;

    if ( e.ctrlKey ) {
        if ( e.key == 'z' ) {
            menu_emit("back", {n: 1});
            return;
        }
        if ( e.key == 'y' ) {
            menu_emit("fwd", {n: 1});
            return;
        }
    }

    // Roll / Pass が出ているときだけ
    if ( e.key == " " ) {
        if ( view.roll_btn[player].active ) {
            controller.roll(player);
            return;
        }
        if ( view.pass_btn[player].active ) {
            log(`pass_btn.active=${view.pass_btn[player].active}`);
            controller.pass_turn(player);
            return;
        }
    }
};

/**
 *
 */
document.body.onkeydown = e => {
    if ( e.key.length == 1 ) {
        on_key_down(e);
    }
};

/**
 * 起動
 *
 * ES Modules は defer と同じ扱いなので、この時点で DOM はできている。
 */
window.onload = async () => {
    log(`window.onload()>start`);

    // BgImage は <img> の width / height を読んで大きさを決めるので、
    // 読み込みが終わる前に BoardView を組むと配置が崩れる (TODO-029)
    await wait_images();

    // sound switch
    const sound_switch = get_sound_query();
    set_global_sound_switch(sound_switch);
    log(`GlobalSoundSwitch=${sound_switch}`);

    // menu
    const nav_el = document.getElementById("nav-drawer");

    // 音・free move・PIP・プレーヤー番号 (TODO-053)
    const svr_id = get_server_id();
    log(`svr_id=${svr_id}`);
    settings = new Settings(svr_id);

    // initialize board
    view = new BoardView(els, header, settings,
                         nav_el.offsetWidth  + 20,
                         nav_el.offsetHeight + 40);

    // 最初の返事が届く前のクロックは、ヘッダの HTML の初期値から作る
    const clock_init = {
        sw: header.clock_sw.checked,
        limit: [parseFloat(header.clock_limit[0].value) * 60,
                parseFloat(header.clock_limit[1].value)],
    };
    controller = new BoardController(view, emit_msg, settings, clock_init);
    view.connect(controller);

    // デバッグ用。ブラウザのコンソールから盤面を触るために置いている。
    // index.html に <div id="board"> があり、id を持つ要素は window の
    // 名前付きプロパティになるので、これを消しても、宣言していない素の
    // board は ReferenceError にならず DIV を掴む。各モジュールでは
    // 素の board を書かないこと (TODO-028)
    window.board = { controller: controller, view: view };

    ws_connect((msg) => {
        // サーバから届くのは gameinfo だけ (TODO-015)。
        // 操作系の type はクライアントからサーバへ送るときだけ使う。
        // 盤面は gameinfo で作り直し、音と dice の回転は
        // data.last_op (直前の操作) から出す
        if ( msg.type == "gameinfo" ) {
            controller.receive(msg.data);
            return;
        } // "gameinfo"

        log("ws.onmessage>msg.type=???");
    });
}; // window.onload

//
// index.html に書いていた onClick / onChange / onFocusOut 属性の
// 付け替え先 (TODO-029)。ES Modules はスコープが閉じるので、
// HTML の属性からはこれらの関数が見えない。
//
// メニューの <a href="#"> は preventDefault() しない
// (押すと URL に "#" が付く。属性で呼んでいたときと同じ)。
//
for (const [id, handler] of [
    ["menu-inverse", () => { nav.checked = false; view.inverse(0.5); }],
    ["menu-back", () => menu_emit("back", {n: 1})],
    ["menu-back2", () => menu_emit("back2")],
    ["menu-back-all", () => menu_emit("back_all")],
    ["menu-fwd", () => menu_emit("fwd", {n: 1})],
    ["menu-fwd2", () => menu_emit("fwd2")],
    ["menu-fwd-all", () => menu_emit("fwd_all")],
    ["menu-clear-hist", () => menu_emit(
        "clear_hist", {},
        "履歴を削除します。\n全員の履歴が消え、元に戻せません。")],
    ["menu-new-game", () => menu_emit(
        "new", {},
        "New Game を始めます。\n全員の盤面が初期配置に戻ります。")],
]) {
    document.getElementById(id).addEventListener("click", handler);
} // for(id, handler)

for (const [id, handler] of [
    ["sound-switch", () => {
        // ?sound をここで読み直す (TODO-053 より前は apply_sound_switch() の中)
        set_global_sound_switch(get_sound_query());
        settings.apply_sound_switch();
    }],
    ["free-move", () => settings.apply_free_move()],
    ["disp-pip", () => view.apply_disp_pip()],
    // 送るだけ。計算も表示も返事の clock_state で変わる
    ["clock_sw", () => controller.set_clock_switch(header.clock_sw.checked)],
    ["clock_limit0",
     () => controller.set_clock_limit(0, header.clock_limit[0].value)],
    ["clock_limit1",
     () => controller.set_clock_limit(1, header.clock_limit[1].value)],
]) {
    document.getElementById(id).addEventListener("change", handler);
} // for(id, handler)

// 名前の <input> は focusout と change の両方から送る (元の属性と同じ)
for (let player=0; player < 2; player++) {
    const el = els.name_input[player];
    for (const ev of ["focusout", "change"]) {
        el.addEventListener(ev, () => emit_playername(player));
    } // for(ev)
} // for(player)
