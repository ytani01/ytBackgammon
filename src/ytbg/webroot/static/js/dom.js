//
// (c) Yoichi Tanibayashi
//
// 盤面の要素を組み立てる (TODO-029)。
//
// もとは index.html にチェッカー 30 個・ダイス 8 個などの <div> が
// ベタ書きされていた。ここで作る形 (id・親子の並び・<img> の src /
// width / style) は、そのときの index.html と同じにしてある。
//
//  - build_dom() は作った要素を返し、main.js が BoardView へ渡す。
//    表示部品は id ではなく要素を受け取る (TODO-054)。id 属性は
//    tests/browser/ が要素を探すのに使うので残してある
//  - BgImage は el.children[0] を画像として読む
//    (だから各 <div> の最初の子が <img> でなければならない)
//  - 絶対配置の要素は、z-index が同じなら DOM の並び順で重なりが決まる
//    (だから並べる順も元のまま)
//
import { get_image_dir } from "./settings.js";

/** チェッカーの枚数 (プレーヤーごと) */
const N_CHECKER = 15;

/** ダイスの数 (プレーヤーごと) */
const N_DICE = 4;

/**
 * <img src="${dir}${file}">
 *
 * @param {string} dir - 画像ディレクトリ ("/static/images1a/"。プレフィクスが付けば "/foo/static/images1a/")
 * @param {string} file - ファイル名
 * @param {Object} [opts]
 * @param {string} [opts.width] - width 属性 ("120px" など)
 * @param {string} [opts.transform] - style の transform
 * @return {HTMLImageElement}
 */
function create_img(dir, file, {width=undefined, transform=undefined}={}) {
    const el = document.createElement("img");
    el.src = `${dir}${file}`;
    if ( width !== undefined ) {
        // HTML に width="120px" と書いたときと同じにする
        el.setAttribute("width", width);
    }
    if ( transform !== undefined ) {
        el.style.transform = transform;
    }
    return el;
} // create_img()

/**
 * <div id="${id}">...</div>
 *
 * @param {string} id - id 属性 (tests/browser/ が要素を探すのに使う)
 * @param {Object} [opts]
 * @param {string} [opts.cls] - class 属性
 * @param {string} [opts.text] - 中の文字
 * @param {Object} [opts.style] - style に入れる値
 * @param {HTMLElement} [opts.img] - 中に入れる <img>
 * @return {HTMLDivElement}
 */
function create_div(id, {cls=undefined, text=undefined,
                        style=undefined, img=undefined}={}) {
    const el = document.createElement("div");
    el.id = id;
    if ( cls !== undefined ) {
        el.className = cls;
    }
    if ( style !== undefined ) {
        Object.assign(el.style, style);
    }
    if ( text !== undefined ) {
        el.textContent = text;
    }
    if ( img !== undefined ) {
        el.appendChild(img);
    }
    return el;
} // create_div()

/**
 * 名前の <input>。
 *
 * #board の外 (<body> の直下) に置く。
 *
 * @param {number} player
 * @return {HTMLInputElement}
 */
function create_name_input(player) {
    const el = document.createElement("input");
    el.id = `p${player}name-input`;
    el.className = "bordertext";
    el.type = "text";
    el.style.position = "absolute";
    el.style.border = "none";
    return el;
} // create_name_input()

/**
 * #board の中身を作る。
 *
 * @param {string} dir - 画像ディレクトリ
 * @param {HTMLElement} board_el
 * @param {Object} els - 作った要素をここへ入れる
 */
function build_board(dir, board_el, els) {
    // 盤の下地。BoardView の盤面の BgImage が、children[0] としてこれを読む
    board_el.appendChild(create_img(dir, "board-base.png"));

    // クロック
    for (let p=0; p < 2; p++) {
        els.clock_bg[p] = board_el.appendChild(create_div(`p${p}clock-bg`));
        els.clock[p] = board_el.appendChild(
            create_div(`p${p}clock`, {cls: "bordertext"}));
    } // for(p)

    // PIP カウント
    for (let p=0; p < 2; p++) {
        els.pip[p] = board_el.appendChild(
            create_div(`p${p}pip`, {cls: "bordertext", text: "167"}));
    } // for(p)

    // プレーヤー名
    for (let p=0; p < 2; p++) {
        els.name[p] = board_el.appendChild(
            create_div(`p${p}name`, {
                cls: "bordertext",
                img: create_img(dir, `checker${p}.png`),
            }));
    } // for(p)

    // スコアの増減ボタン
    for (let p=0; p < 2; p++) {
        for (const dir_name of ["up", "down"]) {
            els.score_btn[p][dir_name] = board_el.appendChild(
                create_div(`score_${dir_name}${p}`, {
                    img: create_img(dir, "cube01.png"),
                }));
        } // for(dir_name)
    } // for(p)

    // スコア
    for (let p=0; p < 2; p++) {
        els.score[p] = board_el.appendChild(
            create_div(`p${p}score`, {
                style: {fontWeight: "bold", color: "#333"},
                img: create_img(dir, `checker${p}.png`),
            }));
    } // for(p)

    // チェッカー (id は p + player + 2 桁の通し番号)
    for (let p=0; p < 2; p++) {
        for (let i=0; i < N_CHECKER; i++) {
            const c_id = "p" + p + ("0" + i).slice(-2);
            els.checker[p][i] = board_el.appendChild(
                create_div(c_id, {img: create_img(dir, `checker${p}.png`)}));
        } // for(i)
    } // for(p)

    // キューブ
    els.cube = board_el.appendChild(
        create_div("cube", {img: create_img(dir, "cube01.png")}));

    // ダイス
    for (let p=0; p < 2; p++) {
        for (let i=0; i < N_DICE; i++) {
            els.dice[p][i] = board_el.appendChild(
                create_div(`dice${p}${i}`, {
                    img: create_img(dir, `dice${p}1.png`),
                }));
        } // for(i)
    } // for(p)

    // Roll ボタン (dicecup)
    for (let p=0; p < 2; p++) {
        els.roll_btn[p] = board_el.appendChild(
            create_div(`rollbutton${p}`, {
                img: create_img(dir, "dicecup.png", {
                    width: "120px",
                    transform: `rotate(${-10 + 180 * p}deg)`,
                }),
            }));
    } // for(p)

    // バナー (パス・勝ち・投了)
    for (const [id, key, file, width] of [
        ["passbutton", "pass_btn", "pass.png", "180px"],
        ["winbutton", "win_btn", "win.png", "180px"],
        ["resignbutton", "resign_banner_btn", "button-resign.png", "100px"],
    ]) {
        els[key] = [];
        for (let p=0; p < 2; p++) {
            els[key][p] = board_el.appendChild(
                create_div(`${id}${p}`, {
                    img: create_img(dir, file, {
                        width: width,
                        transform: `rotate(${180 * p}deg)`,
                    }),
                }));
        } // for(p)
    } // for(id, key, file, width)
} // build_board()

/**
 * #board の外に置くもの (名前の <input> 2 つと #buttons) を作る。
 *
 * @param {string} dir - 画像ディレクトリ
 * @param {HTMLElement} body_el
 * @param {Object} els - 作った要素をここへ入れる
 */
function build_side(dir, body_el, els) {
    for (let p=0; p < 2; p++) {
        els.name_input[p] = body_el.appendChild(create_name_input(p));
    } // for(p)

    const buttons_el = document.createElement("div");
    buttons_el.id = "buttons";
    for (const [id, key, file] of [
        ["button-resign", "button_resign", "button-resign.png"],
        ["button-inverse", "button_inverse", "button-inverse.png"],
        ["button-fwd", "button_fwd", "button-fwd.png"],
        ["button-back", "button_back", "button-bak.png"],
    ]) {
        els[key] = buttons_el.appendChild(
            create_div(id, {img: create_img(dir, file, {width: "70px"})}));
    } // for(id, key, file)
    body_el.appendChild(buttons_el);
} // build_side()

/**
 * 盤面の要素を作る。
 *
 * index.html にあるのは <header> と空の <div id="board"> だけ。
 *
 * 作った要素を返す (TODO-054)。キーは BoardView のフィールド名に近い名前にする
 * (name は player_name、clock は player_clock に渡す。name_input と clock_bg
 * は PlayerName と PlayerClock に渡すもので、BoardView に
 * 同じ名前のフィールドは無い)。プレーヤーごとのものは [0 の分, 1 の分] の
 * 配列にする。
 *
 * @return {{board: HTMLElement,
 *           clock: HTMLElement[], clock_bg: HTMLElement[],
 *           pip: HTMLElement[], name: HTMLElement[],
 *           name_input: HTMLInputElement[],
 *           score: HTMLElement[],
 *           score_btn: {up: HTMLElement, down: HTMLElement}[],
 *           checker: HTMLElement[][], cube: HTMLElement,
 *           dice: HTMLElement[][], roll_btn: HTMLElement[],
 *           pass_btn: HTMLElement[], win_btn: HTMLElement[],
 *           resign_banner_btn: HTMLElement[],
 *           button_resign: HTMLElement, button_inverse: HTMLElement,
 *           button_fwd: HTMLElement, button_back: HTMLElement}}
 *     checker は [[15 個], [15 個]]、dice は [[4 個], [4 個]]
 */
export function build_dom() {
    const dir = get_image_dir();

    const els = {
        board: document.getElementById("board"),
        clock: [], clock_bg: [], pip: [], name: [], name_input: [],
        score: [], score_btn: [{}, {}],
        checker: [[], []], dice: [[], []], roll_btn: [],
    };
    build_board(dir, els.board, els);
    build_side(dir, document.body, els);
    return els;
} // build_dom()

/**
 * 画像がすべて読み込み終わるのを待つ。
 *
 * BgImage のコンストラクタは <img> の width / height を読んで大きさを
 * 決めるので、読み込み前に BoardView を組むと幅が 0 になって配置が崩れる。
 *
 * 読めない画像があっても止めない (allSettled)。
 *
 * @return {Promise<PromiseSettledResult<void>[]>}
 */
export function wait_images() {
    const imgs = Array.from(document.querySelectorAll("img"));
    return Promise.allSettled(imgs.map(el => el.decode()));
} // wait_images()
