//
// (c) Yoichi Tanibayashi
//
// 盤面の要素を組み立てる (TODO-029)。
//
// もとは index.html にチェッカー 30 個・ダイス 8 個などの <div> が
// ベタ書きされていた。ここで作る形 (id・親子の並び・<img> の src /
// width / style) は、そのときの index.html と同じにしてある。
//
//  - BgBase は document.getElementById(id) で要素を拾う
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
 * @param {string} dir - 画像ディレクトリ ("/static/images1a/")
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
 * @param {string} id
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
 */
function build_board(dir, board_el) {
    // 盤の下地。Board 自身が BgImage なので、children[0] はこれ
    board_el.appendChild(create_img(dir, "board-base.png"));

    // クロック
    for (let p=0; p < 2; p++) {
        board_el.appendChild(create_div(`p${p}clock-bg`));
        board_el.appendChild(create_div(`p${p}clock`, {cls: "bordertext"}));
    } // for(p)

    // PIP カウント
    for (let p=0; p < 2; p++) {
        board_el.appendChild(
            create_div(`p${p}pip`, {cls: "bordertext", text: "167"}));
    } // for(p)

    // プレーヤー名
    for (let p=0; p < 2; p++) {
        board_el.appendChild(
            create_div(`p${p}name`, {
                cls: "bordertext",
                img: create_img(dir, `checker${p}.png`),
            }));
    } // for(p)

    // スコアの増減ボタン
    for (let p=0; p < 2; p++) {
        for (const dir_name of ["up", "down"]) {
            board_el.appendChild(
                create_div(`score_${dir_name}${p}`, {
                    img: create_img(dir, "cube01.png"),
                }));
        } // for(dir_name)
    } // for(p)

    // スコア
    for (let p=0; p < 2; p++) {
        board_el.appendChild(
            create_div(`p${p}score`, {
                style: {fontWeight: "bold", color: "#333"},
                img: create_img(dir, `checker${p}.png`),
            }));
    } // for(p)

    // チェッカー (id は p + player + 2 桁の通し番号)
    for (let p=0; p < 2; p++) {
        for (let i=0; i < N_CHECKER; i++) {
            const c_id = "p" + p + ("0" + i).slice(-2);
            board_el.appendChild(
                create_div(c_id, {img: create_img(dir, `checker${p}.png`)}));
        } // for(i)
    } // for(p)

    // キューブ
    board_el.appendChild(
        create_div("cube", {img: create_img(dir, "cube01.png")}));

    // ダイス
    for (let p=0; p < 2; p++) {
        for (let i=0; i < N_DICE; i++) {
            board_el.appendChild(
                create_div(`dice${p}${i}`, {
                    img: create_img(dir, `dice${p}1.png`),
                }));
        } // for(i)
    } // for(p)

    // Roll ボタン (dicecup)
    for (let p=0; p < 2; p++) {
        board_el.appendChild(
            create_div(`rollbutton${p}`, {
                img: create_img(dir, "dicecup.png", {
                    width: "120px",
                    transform: `rotate(${-10 + 180 * p}deg)`,
                }),
            }));
    } // for(p)

    // バナー (パス・勝ち・投了)
    for (const [id, file, width] of [["passbutton", "pass.png", "180px"],
                                     ["winbutton", "win.png", "180px"],
                                     ["resignbutton", "button-resign.png",
                                      "100px"]]) {
        for (let p=0; p < 2; p++) {
            board_el.appendChild(
                create_div(`${id}${p}`, {
                    img: create_img(dir, file, {
                        width: width,
                        transform: `rotate(${180 * p}deg)`,
                    }),
                }));
        } // for(p)
    } // for(id)
} // build_board()

/**
 * #board の外に置くもの (名前の <input> 2 つと #buttons) を作る。
 *
 * @param {string} dir - 画像ディレクトリ
 * @param {HTMLElement} body_el
 */
function build_side(dir, body_el) {
    for (let p=0; p < 2; p++) {
        body_el.appendChild(create_name_input(p));
    } // for(p)

    const buttons_el = document.createElement("div");
    buttons_el.id = "buttons";
    for (const [id, file] of [["button-resign", "button-resign.png"],
                              ["button-inverse", "button-inverse.png"],
                              ["button-fwd", "button-fwd.png"],
                              ["button-back", "button-bak.png"]]) {
        buttons_el.appendChild(
            create_div(id, {img: create_img(dir, file, {width: "70px"})}));
    } // for(id, file)
    body_el.appendChild(buttons_el);
} // build_side()

/**
 * 盤面の要素を作る。
 *
 * index.html にあるのは <header> と空の <div id="board"> だけ。
 */
export function build_dom() {
    const dir = get_image_dir();

    build_board(dir, document.getElementById("board"));
    build_side(dir, document.body);
} // build_dom()

/**
 * 画像がすべて読み込み終わるのを待つ。
 *
 * BgImage のコンストラクタは <img> の width / height を読んで大きさを
 * 決めるので、読み込み前に Board を組むと幅が 0 になって配置が崩れる。
 *
 * 読めない画像があっても止めない (allSettled)。
 *
 * @return {Promise<PromiseSettledResult<void>[]>}
 */
export function wait_images() {
    const imgs = Array.from(document.querySelectorAll("img"));
    return Promise.allSettled(imgs.map(el => el.decode()));
} // wait_images()
