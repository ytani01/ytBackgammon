//
// (c) 2026 Yoichi Tanibayashi
//
// 一覧ページ (TODO-063)。ボードを iframe で並べ、選んだ 1 面を大きく出す。
// 状態は数秒おきに {prefix}/api/boards から読み直す。
//
// iframe は作り直さない (作り直すと読み込み直しになる)。大きく出す
// ボードは class と CSS の order だけで入れ替える。音を出すのは大きい
// ボードだけなので、切り替わった 2 面だけは読み込み直す (TODO-072)。
//
const POLL_MSEC = 3000;
const MAIN_KEY = "ytbg_lobby_main";

/** server_id -> {el, iframe, status, start, stop, board, listening} */
const cards = new Map();

/**
 * lobby の API の URL。このモジュール ({prefix}/static/js/lobby.js) からの
 * 相対で組み立てるので、lobby の URL のプレフィクスが付いても同じ
 */
const api_url = (path) => new URL(`../../api/${path}`, import.meta.url);

/**
 * ボードの URL。prefix があれば、一覧ページと同じホスト・ポートのパス
 * (lobby がそのパスを受けたらボード自身のポートへリダイレクトする)。
 * prefix が無ければ、一覧ページを開いたホスト名にボードのポートを付ける
 */
function board_url(b) {
    return b.prefix
        ? new URL(`${b.prefix}/`, location.href).href
        : `${location.protocol}//${location.hostname}:${b.port}${b.prefix}/`;
}

/**
 * iframe にボードを読み込む。音が重ならないように、大きいボード以外には
 * ?sound=off を付ける
 */
function load(c) {
    const u = new URL(board_url(c.board));
    if (!c.el.classList.contains("main")) {
        u.searchParams.set("sound", "off");
    }
    c.iframe.src = u.href;
}

/** 覚えている選択 (無ければ先頭) のボードを大きく出す */
function show_main() {
    const saved = localStorage.getItem(MAIN_KEY);
    const main_id = cards.has(saved) ? saved : cards.keys().next().value;
    for (const [id, c] of cards) {
        const was_main = c.el.classList.contains("main");
        c.el.classList.toggle("main", id === main_id);
        // listen する前は読み込まない (update() が listen し始めたら読む)
        if (was_main !== (id === main_id) && c.listening) {
            load(c);
        }
    }
    fit_main();
}

/**
 * 大きいボードの倍率を、見出しとボタンの行を含めたカードが
 * ウィンドウの幅と高さの両方に収まる最大の値にする。
 * ページを一番上までスクロールした状態で収まるように、カードより上の
 * 見出し (h1) の分も引く
 */
function fit_main() {
    const main = document.querySelector(".board.main");
    if (main === null) {
        return;
    }
    const frame = main.querySelector(".frame");
    // transform の前の大きさ (lobby.html の .frame iframe)
    const iframe = main.querySelector("iframe");
    const root = document.documentElement;
    const cs = getComputedStyle(main);
    const avail_w = document.getElementById("boards").clientWidth
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const avail_h = root.clientHeight
          - (main.getBoundingClientRect().top + window.scrollY)
          - (main.offsetHeight - frame.offsetHeight)
          // ボードが 1 面だけのとき、body の下の余白でスクロールしないように
          - parseFloat(getComputedStyle(document.body).marginBottom);
    const scale = Math.min(avail_w / iframe.offsetWidth,
                           avail_h / iframe.offsetHeight);
    // 端数で 1px はみ出さないように切り捨てる。極端に狭くても潰さない
    root.style.setProperty(
        "--main-scale", String(Math.max(Math.floor(scale * 1000) / 1000, 0.1)));
}

function select_main(server_id) {
    localStorage.setItem(MAIN_KEY, server_id);
    show_main();
}

async function post(server_id, action) {
    try {
        await fetch(
            api_url(`boards/${encodeURIComponent(server_id)}/${action}`),
            { method: "POST" });
    } catch {
        // lobby に届かない。状態は次の読み直しで出る
    }
    await refresh();
}

function make_card(b) {
    const el = document.createElement("div");
    el.className = "board";
    el.dataset.serverId = b.server_id;
    el.innerHTML = `
      <h3><a target="_blank"></a>
        <span class="status"></span>
        <button class="start">起動</button>
        <button class="stop">停止</button>
        <button class="select">大きく表示</button></h3>
      <div class="frame"><iframe allow="autoplay"></iframe></div>`;

    const a = el.querySelector("a");
    a.href = board_url(b);
    a.textContent = `Board ${b.server_id}`;

    const c = {
        el,
        iframe: el.querySelector("iframe"),
        status: el.querySelector(".status"),
        start: el.querySelector(".start"),
        stop: el.querySelector(".stop"),
        board: b,
        listening: false,
    };
    c.start.onclick = () => post(b.server_id, "start");
    c.stop.onclick = () => post(b.server_id, "stop");
    el.querySelector(".select").onclick = () => select_main(b.server_id);
    return c;
}

function update(c, b) {
    const [text, cls] = b.listening ? ["動作中", "running"]
          : b.running ? ["起動中", "starting"] : ["停止中", "stopped"];
    c.status.textContent = text;
    c.status.className = `status ${cls}`;
    c.start.disabled = b.running;
    c.stop.disabled = !b.running;
    // listen し始めたら読み込む (最初の読み込みも同じ)。listen する前に
    // 読みに行くと、iframe が接続エラーの画面のまま戻らない
    if (!c.listening && b.listening) {
        load(c);
    }
    c.listening = b.listening;
}

async function refresh() {
    let boards;
    try {
        boards = await (await fetch(api_url("boards"))).json();
    } catch {
        return;  // lobby が止まっている。次の読み直しで戻る
    }
    const root = document.getElementById("boards");
    const had_cards = cards.size > 0;
    for (const b of boards) {
        if (!cards.has(b.server_id)) {
            const c = make_card(b);
            cards.set(b.server_id, c);
            root.append(c.el);
        }
    }
    // 最初の読み込みに失敗しても、カードを作った読み直しで選ぶ。
    // update() が iframe を読み込む前に選ぶ (音の有無を決めてから読む)
    if (!had_cards) {
        show_main();
    }
    for (const b of boards) {
        update(cards.get(b.server_id), b);
    }
    // 見出しの行の高さは状態の文字で変わるので、入れたあとで計算し直す
    fit_main();
}

window.addEventListener("resize", fit_main);
await refresh();
setInterval(refresh, POLL_MSEC);
