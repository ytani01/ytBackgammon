import { log } from "./log.js";
import { emit_msg, ws_connect } from "./ws.js";
import { QueryStringBase } from "./settings.js";
import { set_global_sound_switch } from "./sound.js";
import { Board } from "./board.js";

// メニュー (ハンバーガー) のチェックボックス。項目を押したら閉じる
const nav = document.getElementById("nav-input");

let board = undefined;

/**
 * New game
 */
const new_game = () => {
    nav.checked=false;
    log("new_game()");
    if (! confirm("New Game を始めます。\n"
                  + "全員の盤面が初期配置に戻ります。")) {
        return;
    }
    emit_msg("new", {}, false);
};

/**
 * Backward history
 *
 * @param {number} [n=1]
 */
const backward_hist = (n=1) => {
    nav.checked=false;
    log(`backward_hist(n=${n})`);
    emit_msg("back", {n: n}, false);
};

/**
 * 
 */
const back2 = () => {
    nav.checked=false;
    log("back2");
    emit_msg("back2", {}, false);
};

/**
 *
 */
const back_all = () => {
    nav.checked=false;
    log("back_all()");
    emit_msg("back_all", {}, false);
};

/**
 * Forward history
 *
 * @param {number} [n=1]
 */
const forward_hist = (n=1) => {
    nav.checked=false;
    log(`forward_hist(n=${n})`);
    emit_msg("fwd", {n: n}, false);
};

/**
 *
 */
const fwd2 = () => {
    nav.checked=false;
    log("fwd2");
    emit_msg("fwd2", {}, false);
};

/**
 *
 */
const fwd_all = () => {
    nav.checked=false;
    log("fwd_all()");
    emit_msg("fwd_all", {}, false);
};

/**
 * 履歴を削除して、今の盤面だけを残す (TODO-019)
 *
 * 1 枚のボードを全員で共有しているので、消すと全員の履歴が消え、
 * 元に戻せない。押した人の画面で確認を取る。
 */
const clear_hist = () => {
    nav.checked=false;
    log("clear_hist()");
    if (! confirm("履歴を削除します。\n"
                  + "全員の履歴が消え、元に戻せません。")) {
        return;
    }
    emit_msg("clear_hist", {}, false);
};
    
/**
 *
 */
const board_inverse = () => {
    nav.checked=false;
    board.inverse(0.5);
};

/**
 * @param {number} player
 */
const emit_playername = (player) => {
    const el = document.getElementById(`p${player}name-input`);
    const name = el.value;

    const player_name = board.player_name[player];
    const cur_name = player_name.get();
    const def_name = player_name.default_text;

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
const apply_sound_switch = () => {
    board.apply_sound_switch();
};

/**
 *
 */
const apply_free_move = () => {
    board.apply_free_move();
};

/**
 *
 */
const apply_disp_pip = () => {
    board.apply_disp_pip();
};

/**
 * @param {number} index
 */
const apply_clock_sw = index => {
    board.apply_clock_sw();
};

/**
 * @param {number} index
 */
const apply_clock_limit = index => {
    board.apply_clock_limit(index);
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
    const dice = roll_btn.dice[0];

    if ( e.ctrlKey ) {
        if ( e.key == 'z' ) {
            backward_hist();
            return;
        }
        if ( e.key == 'y' ) {
            forward_hist();
            return;
        }
    }

    if ( e.key == " " ) {
        if ( roll_btn.active ) {
            roll_btn.on_mouse_down_xy(0, 0);
            return;
        }
        /*
        if ( roll_btn.dice_active ) {
            dice.on_mouse_down_xy(0, 0);
            return;
        }
        */
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
window.onload = () => {
    log(`window.onload()>start`);

    // sound switch
    const q_str = new QueryStringBase();
    const sound_switch = q_str.get("sound");
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
// index.html の onClick / onChange 属性から呼ばれる関数を window に載せる。
// ES Modules はスコープが閉じるので、この橋渡しが無いとヘッダのボタンと
// メニューの項目が効かなくなる。
//
// TODO-029 で addEventListener に移したら、この橋渡しごと消す。
//
Object.assign(window, {
    apply_clock_limit,
    apply_clock_sw,
    apply_disp_pip,
    apply_free_move,
    apply_sound_switch,
    back2,
    back_all,
    backward_hist,
    board_inverse,
    clear_hist,
    emit_playername,
    forward_hist,
    fwd2,
    fwd_all,
    new_game,
});
