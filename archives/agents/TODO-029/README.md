# TODO-029 の分担

DOM 生成を JS へ移し、`onClick` 属性をやめる項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— DOM 生成とイベント登録の移し替え
- **reviewer**（Opus 5 に上書き）— イベント登録の付け替えで、対象の要素や
  引数が変わっていないか。**生成した DOM が今の HTML と同じ形か**
- **verifier**（定義のまま Sonnet 5）— `tests/browser/` で全ボタンと
  チェックボックスが効くこと。`onClick` の付け替え漏れはテストでしか
  見つからない

**reviewer を先に、verifier を後に**回す（TODO-025〜028 と同じ）。

## main が決めたこと（実装の前提）

`docs/design.md` の「DOM 生成」に加えて、着手時に main が決めた分。
**迷ったらここに従う。**

### 1. 変える前と後で同じテストが通ること

TODO-028 で `tests/browser/` に**クリックでの確認**（メニュー・ヘッダ・
盤面のボタン・バナーを実際に押し、送られた type と data を見る）を足した。
**この項目で変わるのは「要素の作り方」と「イベントのつなぎ方」だけなので、
このテストを 1 行も変えずに通すこと。** テストのほうを直したくなったら、
それは挙動が変わった印なので、直さずに報告する。

### 2. `index.html` に残すもの

- `<header>`（メニューとチェックボックスと持ち時間の入力）。
  **マークアップは残し、`onClick` / `onChange` / `onFocusOut` 属性だけを消す**
- `<div id="board"></div>`（中身は空にする）
- `<body data-image-dir="{{image_dir}}" data-server-id="{{server_id}}">`
- `<body>` の背景画像の `style` はそのまま（要素の生成ではないので）

`<div id="server-id">` は消す。`#board` の中身、名前の `<input>` 2 つ、
`#buttons` は `dom.js` が作る。

### 3. `dom.js` が作る DOM は、今の HTML と同じ形にする

**id、親子の形、`<img>` の `src` / `width` / `style` を、今の
`index.html` と揃える。** `BgBase` は `getElementById(this.id)` で、
`BgImage` は `this.el.children[0]` で要素を拾っているので、形が同じなら
`ui/` の側はほぼ触らずに済む。`ytbg.css` のセレクタも、親子の形が
変わると外れる（先に `ytbg.css` を読んで確かめること）。

- 今の HTML の `<image>` はブラウザが `<img>` として扱っている。
  `dom.js` は `<img>` を作ればよい
- 名前の `<input>` 2 つと `#buttons` は、今と同じく `<body>` の直下
  （`#board` の外）に置く

### 4. **画像の読み込みを待ってから `Board` を組む**（いちばんの落とし穴）

`BgImage` のコンストラクタは `this.image_el.width` / `height` を読んで
大きさを決める。今は `<img>` が HTML にあり、`window.onload` が画像の
読み込みを待つので幅が取れている。**`dom.js` が `<img>` を作った直後に
`Board` を組むと、読み込み前なので幅が 0 になり、配置が崩れる。**
作った `<img>` がすべて読み込み終わるのを待ってから（`img.decode()` か
`load` イベントを `Promise.all` で）`Board` を組むこと。
**読み込みに失敗した画像があっても止まらないようにする**
（`decode()` は失敗で reject するので、`allSettled` にするなど）。

### 5. `image_dir` と `server_id` は `<body>` の `data-*` から 1 か所で読む

`BgImage.get_image_dir()`（`src` の文字列を切り出して逆算している）と、
`Board` が `#server-id` の `innerHTML` を読んでいるところを消す。
読むのは 1 か所（`settings.js` に関数を置くか、`main.js` が読んで渡す。
形は任せる）。**`src` の文字列を切り出す処理は残さない。**

### 6. `window` への橋渡しを消す

`main.js` の末尾の `Object.assign(window, {...})`（TODO-028 で置いた、
15 個の関数を載せる橋渡し）を消し、すべて `addEventListener` にする。
**`window.board` は残す**（デバッグ用。`tests/browser/helper.mjs` も
これを待っている）。

名前の `<input>` は `focusout` と `change` の両方で `emit_playername()` を
呼んでいる。**両方つなぐこと**（片方だけにしない）。

メニューの `<a href="#">` は、押すと URL に `#` が付く。今と同じにするなら
`preventDefault()` は呼ばない（呼ぶと挙動が変わる）。

### 7. 挙動は変えない。例外は 1 つだけ

**ヘッダの `<label>` の `for` の書き間違いを直す。** 今は
`<label class="headerinput" for"disp-pip">` のように `=` が抜けており
（`disp-pip` / `clock_sw` / `clock_limit0` / `clock_limit1` の 4 つ）、
ラベルを押してもチェックボックスが切り替わらない。直すとラベルを押して
切り替わるようになる。**これは直す。** それ以外は変えない。

## 報告

- [implementer-report.md](implementer-report.md)
- [reviewer-report.md](reviewer-report.md)
- [verifier-report.md](verifier-report.md)

## main の判断（あとから追記）

implementer と reviewer が挙げた「判断が要る点」への答え。

### implementer の判断が要る点

| # | 内容 | main の判断 |
|---|------|-------------|
| 1 | メニューの `<a>` 9 個に `id` を付けた（README の「属性だけ消す」より一歩多い） | **受け入れる。** `id` が無いと `querySelectorAll()` の並び順で拾うしかなく、項目を足したり並べ替えたりしたときに黙って別の関数につながる |
| 2 | `tests/test_ws.py` の `test_index_has_image_dir()` を直した | **受け入れる。** 「1 行も変えずに通す」と言ったのは `tests/browser/` の 2 本。`board-base.png` が `index.html` から消えたので、Python 側のテストは直るのが正しい |
| 3 | `CLAUDE.md` の「構成」を直した | **受け入れる**（言い回しは main が見た） |

### reviewer の指摘

要修正 0 件。検討 3 件のうち 2 件に対応した。

| # | 内容 | main の判断 |
|---|------|-------------|
| 検討 1 | `CLAUDE.md` が「`wait_images()` が配置を守っている」と読めるが、実測では常に no-op | **main が書き直した。** 効いているのは `build_dom()` を `load` より前に呼ぶこと。両方を書き、**どちらもテストでは守られない**ことも明記した |
| 検討 2 | `focusout` / `change` が片方だけでも通る | **テストを 2 本足した**（S4 / S5）。既存の 30 件は無変更。片方だけの版で、対応する 1 本だけが 10 回とも落ちることを確かめた |
| 検討 3 | チェッカー 15 枚 / ダイス 4 個の定数が `dom.js` と `board.js` / `ui/dice.js` の 2 か所にある | **直さない。** reviewer の言うとおり、元は「HTML と JS の二重」だったので悪化はしていない（むしろ同じ言語に寄った）。定数を 1 か所に寄せるなら TODO-030 の範囲 |

「好みの範囲」の 2 件は直していない。
