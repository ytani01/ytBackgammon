import { log } from "./log.js";
import { emit_msg, ws_connect } from "./ws.js";
import { get_sound_query } from "./settings.js";
import { set_global_sound_switch } from "./sound.js";
import { build_dom, wait_images } from "./dom.js";
import { Board } from "./board.js";

// 盤面の要素を作る (TODO-029)。
// ES Modules は defer と同じ扱いなので、この時点で <body> はできている。
// ここで作った <img> の読み込みは window.onload の中で待つ。
build_dom();

// メニュー (ハンバーガー) のチェックボックス。項目を押したら閉じる
const nav = document.getElementById("nav-input");

let board = undefined;

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
    emit_msg(type, data, false);
};

/**
 * @param {number} player
 */
const emit_playername = (player) => {
    const el = document.getElementById(`p${player}name-input`);
    const name = el.value;

    const player_name = board.player_name[player];
    const cur_name = player_name.get();

    log(`emit_playername2>player=${player},`
                + `cur_name=${cur_name},`
                + `name=${name}`
                + ")");
    
    player_name.emit(name, true);

    el.style.zIndex = -2;
};

/**
 *
 */
const on_key_down = (e, board) => {
    log(`on_key_down(board.svr_id=${board.svr_id}`);
    log(`e.key=${e.key},e.ctrlKey=${e.ctrlKey},e.shiftKey=${e.shiftKey}`);
    log(`e.keyCode=${e.keyCode}`);

    const player = board.player;
    const roll_btn = board.roll_btn[player];
    const pass_btn = board.pass_btn[player];

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

    if ( e.key == " " ) {
        if ( roll_btn.active ) {
            roll_btn.on_mouse_down_xy(0, 0);
            return;
        }
        if ( pass_btn.active ) {
            log(`pass_btn.active=${pass_btn.active}`);
            pass_btn.on_mouse_down_xy(0, 0);
            return;
        }
    }
};

/**
 *
 */
document.body.onkeydown = e => {
    if ( e.key.length === undefined ) {
        return;
    }
    if ( e.key.length == 1 ) {
        on_key_down(e, board);
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
    // 読み込みが終わる前に Board を組むと配置が崩れる (TODO-029)
    await wait_images();

    // sound switch
    const sound_switch = get_sound_query();
    set_global_sound_switch(sound_switch);
    log(`GlobalSoundSwitch=${sound_switch}`);

    // menu
    const nav_el = document.getElementById("nav-drawer");

    // initialize board
    board = new Board("board",
                      nav_el.offsetWidth  + 20,
                      nav_el.offsetHeight + 40);

    // デバッグ用。ブラウザのコンソールから盤面を触るために置いている。
    // index.html に <div id="board"> があり、id を持つ要素は window の
    // 名前付きプロパティになるので、これを消しても、宣言していない素の
    // board は ReferenceError にならず DIV を掴む。各クラスでは必ず
    // this.board か、受け取った board を使うこと (TODO-028)
    window.board = board;

    ws_connect((msg) => {
        // サーバから届くのは gameinfo だけ (TODO-015)。
        // 操作系の type はクライアントからサーバへ送るときだけ使う。
        // 盤面は gameinfo で作り直し、音と dice の回転は
        // data.last_op (直前の操作) から出す
        if ( msg.type == "gameinfo" ) {
            board.load_gameinfo(msg.data.gameinfo,
                                msg.data.sec,
                                msg.data.history_flag,
                                msg.data.clock_state,
                                msg.data.last_op);
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
    ["menu-inverse", () => { nav.checked = false; board.inverse(0.5); }],
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
    ["sound-switch", () => board.apply_sound_switch()],
    ["free-move", () => board.apply_free_move()],
    ["disp-pip", () => board.apply_disp_pip()],
    ["clock_sw", () => board.apply_clock_sw()],
    ["clock_limit0", () => board.apply_clock_limit(0)],
    ["clock_limit1", () => board.apply_clock_limit(1)],
]) {
    document.getElementById(id).addEventListener("change", handler);
} // for(id, handler)

// 名前の <input> は focusout と change の両方から送る (元の属性と同じ)
for (let player=0; player < 2; player++) {
    const el = document.getElementById(`p${player}name-input`);
    for (const ev of ["focusout", "change"]) {
        el.addEventListener(ev, () => emit_playername(player));
    } // for(ev)
} // for(player)
