//
// (c) 2026 Yoichi Tanibayashi
//
// 一覧ページ (TODO-063)。ボードを iframe で並べ、選んだ 1 面を大きく出す。
// 状態は数秒おきに {prefix}/api/boards から読み直す。
//
// iframe は作り直さない (作り直すと読み込み直しになる)。大きく出す
// ボードは class と CSS の order だけで入れ替える。
//
const POLL_MSEC = 3000;
const MAIN_KEY = "ytbg_lobby_main";

/** server_id -> {el, iframe, status, start, stop, url, listening} */
const cards = new Map();

/**
 * lobby の API の URL。このモジュール ({prefix}/static/js/lobby.js) からの
 * 相対で組み立てるので、lobby の URL のプレフィクスが付いても同じ
 */
const api_url = (path) => new URL(`../../api/${path}`, import.meta.url);

/**
 * ボードの URL。設定に url があればそれ (パスだけなら一覧ページと同じ
 * ホスト)、無ければ一覧ページを開いたホスト名にボードのポートと
 * ボードのプレフィクスを付ける
 */
function board_url(b) {
    return b.url != null ? new URL(b.url, location.href).href
        : `${location.protocol}//${location.hostname}:${b.port}${b.prefix}/`;
}

/** iframe に出す URL。全面の音が重ならないように ?sound=off を付ける */
function frame_url(b) {
    const u = new URL(board_url(b));
    u.searchParams.set("sound", "off");
    return u.href;
}

/** 覚えている選択 (無ければ先頭) のボードを大きく出す */
function show_main() {
    const saved = localStorage.getItem(MAIN_KEY);
    const main_id = cards.has(saved) ? saved : cards.keys().next().value;
    for (const [id, c] of cards) {
        c.el.classList.toggle("main", id === main_id);
    }
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
      <div class="frame"><iframe></iframe></div>`;

    const a = el.querySelector("a");
    a.href = board_url(b);
    a.textContent = `Board ${b.server_id}`;

    const c = {
        el,
        iframe: el.querySelector("iframe"),
        status: el.querySelector(".status"),
        start: el.querySelector(".start"),
        stop: el.querySelector(".stop"),
        url: frame_url(b),
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
        c.iframe.src = c.url;
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
        update(cards.get(b.server_id), b);
    }
    // 最初の読み込みに失敗しても、カードを作った読み直しで選ぶ
    if (!had_cards) {
        show_main();
    }
}

await refresh();
setInterval(refresh, POLL_MSEC);
