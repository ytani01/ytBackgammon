# TODO-028 レビュー担当の報告

対象は作業ツリー（`390e397` からの差分）。元の `ytbg.js` は
`git show 390e397:src/ytbg/webroot/static/ytbg.js`（**4,243 行**。TODO.md の
4,351 行は TODO-023 でデッドコードを消す前の数）。

見方:

- クラスごとに、元の本体と新しい本体を切り出して比べた
  （`console.log(` → `log(` と `export` を揃えてから unified diff）。
  メソッドの一覧も比べた
- 素の識別子は、playwright に同梱の babel（`traverse` の scope）で
  **モジュールごとに束縛されていない識別子を全部**出した。わざと素の
  `nav` / `board` / `emit_msg2` と暗黙のグローバル代入を足したファイルで、
  4 つとも拾うことを先に確かめてある
- `NoCacheStaticFiles`、no-cache の影響、クリックのテスト、名前付きアクセスは
  実測（TestClient と playwright。スクリプトは scratchpad に置いた）

## 重大なもの

なし。

## 直したほうがよいもの

### R1. パスのバナーの「バナーが消える」は、`on_pass` の `off()` を見ていない（実測）

`tests/browser/clicks.test.mjs:317-319`（と、同じ作りの 326-336）

- 何が: `assert_sent()` で `set_turn` を見つけてから `pass_btn[0].active` を
  見ているが、その時点ではサーバの返事がもう届いていることが多い。返事の
  `load_gameinfo()` → `set_turn()` が、バナーを 4 種類とも `off()` にする
  （`board.js:559-565`、呼び出しは `board.js:1061`）
- 根拠（実測）: ページの中で `pass_btn[0].on_click` を **`btn.off()` を
  抜いた版**に差し替え、テストと同じ手順で 5 回押した。テストの判定の時点で
  `active` が false だったのは **5 回中 4 回**（壊れているのに通る）。
  残り 1 回だけ true で落ちた。つまり壊れた版では揺れ、正しい版では何も
  確かめていない
- あわせて、`on_pass` の 2 つ目の処理
  `player_clock[player].change_turn()` は、どのテストも見ていない
  （抜いても落ちない。これは読んで確かめた）
- 実装担当の M4（`this.on_click(this)` を消す）が捕まったのは `set_turn` が
  送られないからで、「消える」の assert は効いていない

### R2. 送ったメッセージの `history` を比べていない

`tests/browser/clicks.test.mjs:126-129`

- 何が: `assert_sent()` は `m.data` だけを `deepEqual` しており、`history` を
  見ていない
- なぜ: この項目の約束は「送るメッセージを変えない」で、`history` はサーバが
  履歴に積むかどうかを決める（CLAUDE.md「状態と通信」）。たとえば
  `EmitButton` が `history: true` を送るように変わっても、
  `on_pass` の `emit_turn(..., true)` が false になっても落ちない

### R3. 素の `board` は、`window.board` を消しても ReferenceError にならない（実測）

`src/ytbg/webroot/static/js/main.js:240-241`、CLAUDE.md の「構成」

- 何が: 素の `board` が「動いてしまう」理由は `window.board` だけではない。
  `index.html` に `<div id="board">` があり、**id を持つ要素は window の
  名前付きプロパティになる**
- 根拠（実測、playwright）:
  - `window.onload` より前（DOMContentLoaded）の素の `board` は
    `<div id="board">`（`typeof board` は `object`）
  - `delete window.board` のあとの素の `board` も `<div id="board">`
  - 素の `cube` は `<div id="cube">`、素の `nav` も object（`id="nav"` がある）
- なぜ問題か: どこかのモジュールに素の `board` を書き足しても、
  ReferenceError にはならず、DIV を掴んで黙って違う動きになる
  （`board.free_move` なら undefined で「free move ではない」扱い）。
  TODO-029 で `dom.js` が要素を作るようになっても、id を付ける限り同じ
  （名前付きアクセスは後から作った要素にも効く。**これは未確認**）
- いまの状態は問題ない（下の「観点 2」）。**罠として `CLAUDE.md` か
  `main.js:240` のコメントに残しておく**のを勧める。
  README の「`window.board` が無いとブラウザの確認が動かない」も半分だけ
  正しい。`typeof board !== 'undefined'` は DIV でも真になる。
  `helper.mjs` の `open_board()` は `board.checker[0][0].cur_point` まで
  見ているので、実際には DIV に騙されない

### R4. Python 側のコメント・docstring に `ytbg.js` の名前が残っている

- `src/ytbg/clock.py:15, 102, 110`（`ytbg.js の PlayerClock.update()` など）
- `src/ytbg/server.py:459, 483, 495`
- `tests/test_clock.py:195, 238`、`tests/test_clock_unit.py:74`、
  `tests/test_save_load.py:153`
- なぜ: `CLAUDE.md` の同じ種類の参照（`PlayerClock.update()`、
  `apply_clock_sw()`）は `ui/clock.js` / `board.js` に直したが、こちらは
  もう無いファイルを指したまま。「TODO-015 より前は ytbg.js の…」のような
  昔の話（`test_clock.py:238`、`server.py:459`）は、そのままでもよい

### R5. `CLAUDE.md` のブラウザのテストの説明に `clicks.test.mjs` が無い

`CLAUDE.md:65-68`

- 何が: 「盤面の描画・Roll・ドラッグ・2 枚目のタブへの同期・コンソール
  エラーを見る」のままで、クリックの確認（メニュー・ヘッダ・盤面のボタン・
  バナー、25 件）が載っていない
- なぜ: テストを足す人が読む節で、`settle()` が「プレーヤー 1 の名前を
  このファイルが変えない」ことに頼っている、テストの並べ替えができない、
  という注意も、いまはテストファイルの中にしか無い

## 好みの問題

- **使っていない import**（babel で確認）: `board.js:15` の `Dice`、
  `ui/point.js:1` の `log`。
  `ui/dice.js:385` の `const board = this.board;` も使われなくなった。
  元の `check_disable()` の素の `board` はこのローカルを指していたので
  （`old.js:1737`）、`this.board` への書き換えは要らなかった（害は無い）
- **no-cache は画像と音にも付く**（実測）。リロードのたびに `/static` の
  30 件（JS 15、CSS 1、画像 14）が 304 で問い合わせになり、mp3 4 件は 206 で
  送り直される。前は `Last-Modified` からの推定でキャッシュされていた。
  ページの中でダイスの画像を差し替えても、問い合わせは起きない
  （2 巡目は 0 件）。操作感には効かない。`ytbg.html` の 4 面なら 4 倍。
  気になるなら `.js` / `.css` だけに絞れるが、決めたとおりなので指摘ではない
- **数の記述**: TODO.md の「段数が 5 から 2 になる」は、`RollButton` を残した
  ので実際は 3（BgBase → BgImage → BannerButton → RollButton）。archives に
  移すときに実際の数を書くとよい。README の「次の 13 個」は、並べてあるのが
  15 個（実装は 15 個で正しい）。`main.js:262` と `CLAUDE.md` の
  「`onClick` / `onChange` 属性」には `onFocusOut`（`index.html:179, 183`）も
  ある（呼ぶ関数は同じ `emit_playername` なので、橋渡しは足りている）

## 観点ごとの確認結果（問題なし）

### 1. 段 1 の取りこぼし・重複

- 元のクラス 37 のうち 22 が新しいファイルにあり、**それぞれ 1 か所だけ**。
  消えた 15 は、中間クラス 5（`BoardText` / `PlayerText` / `PlayerItem` /
  `OnBoardImage` / `OnBoardButton`）、`BoardArea`、`EmitButton` の
  サブクラス 6、`BannerButton` のサブクラス 3 で、どれも意図どおり
- 22 クラスのメソッドの一覧は、元と同じ。違うのは、`BannerButton` に
  `on_mouse_down_xy()` が増えたことと、`BgBase` / `BgText` の
  コンストラクタの引数だけ。本体の差は下の 3 に挙げたものと、
  `Board` の `bx` / `by` → `[...BX]` / `[...BY]`（値は同じ）、
  `GlobalSoundSwitch =` → `set_global_sound_switch()` だけ。
  `CookieBase` / `QueryStringBase` / `SoundBase` は差なし
- トップレベル: 15 個の関数、`on_key_down`、`document.body.onkeydown` は
  `main.js` にあり、元との差は `console.log` → `log` だけ（diff で確認）。
  `ws` / `WS_RETRY_*` / `ws_retry_sec` / `emit_msg` と、`window.onload` の中に
  あった `ws_url` / `ws_connect` は `ws.js`（受信は `on_msg` のコールバック
  で `main.js` へ返す。中身は同じ）。`SOUND_*` / `GlobalSoundSwitch` は
  `sound.js`。`nav` / `board` は `main.js`
- 消した `Back2Button` / `BackAllButton` / `Fwd2Button` / `FwdAllButton` は、
  元のコードのどこからも `new` されていない（grep。`new BackButton` /
  `new FwdButton` だけ）。`Fwd2Button` / `FwdAllButton` が data を渡し忘れて
  いたことも元のコードで確認した（`old.js:1179-1193`）。`BoardArea` も
  直接は作られておらず、`BoardPoint` の親でしかなかった

### 2. 素の `board` と、import していないグローバル

- babel の scope で束縛の無い識別子を出すと、15 ファイルとも
  **標準のもの**（`document` / `window` / `JSON` / `Math` / `setTimeout` /
  `WebSocket` / `Audio` / `confirm` など）**だけ**。素の `board`、`nav`、
  `emit_msg` などは 1 つも無い
- `main.js` の `board` はモジュールの `let`。`on_key_down(e, board)` の
  `board` は引数（同じオブジェクト）
- 元のコードで素の `board` を使っていた 3 か所（`Checker` の
  `board.free_move` ×2、`Board.set_turn()` の `board.sound_turn_change`）は
  `this.board` / `this` になった。ボードは 1 面なので同じもの
- ES Modules は strict mode になる。暗黙のグローバルへの代入、読み取り専用の
  DOM プロパティ（`clientWidth` など）への代入、トップレベルの `this`、
  `this` を使う `function` は、どれも無い（babel で確認）

### 3. 段 2 の組み直し

- **`board` / `player` を入れるのが先頭になった件（報告 2-1）**:
  基底のコンストラクタの中で呼ばれるのは、`BgBase` は `bind` だけ、
  `BgText` は無し、`BgImage` は `get_image_dir()` と `move()`。
  `move()` を上書きしているのは `BannerButton` だけで、`x` / `y` / `w` / `h`
  しか見ない。`get_image_dir()` を上書きしているクラスは無い。
  **前後で見える値が変わるメソッドは無い**。`Board` / `Cube` などに
  `board` / `player` が undefined の自前のプロパティとして増えるが、
  `hasOwnProperty` / `in` / `Object.keys(this)` はどこも使っていない
- 部品ごとの引数の渡し方（x, y, deg, w, h, board, player）は、元の
  中間クラス経由のものと 1 つずつ突き合わせて、全部同じ。`ClockLimit` の
  deg は undefined → 既定の 0 で、前と同じ
- **`EmitButton` の 2 つ**: `board.js:101-108` は `"back", {n: 1}` と
  `"fwd", {n: 1}`。元の `BackButton` / `FwdButton`（`old.js:1143-1175`）と
  同じ。`history` はどちらも `emit_msg()` の既定の false
- **`on_pass`**（`board.js:298-304`）: `off()` → `player_clock[player]
  .change_turn()` → `emit_turn(1 - player, -1, true)` で、元の
  `PassButton.on_mouse_down_xy()` と同じ順序・同じ引数。アロー関数なので
  `this` は `Board`（元の `this.board` と同じもの）。スペースキーの経路
  （`main.js:198-201`）も `on_mouse_down_xy(0, 0)` → `on_click` を通る
- **`RollButton`** は `ui/dice.js:571` で `on_mouse_down_xy()` を上書きして
  おり、`super.on_mouse_down_xy()` も呼ばないので、`on_click` の経路は
  通らない。報告の説明は正しい
- **`BoardArea` を消した件**: `BoardPoint` の親でしかなく、
  `super(id, x, y, 0, w, h)` と `this.board = board` だけのクラスだった。
  意図どおり

### 4. `window` への橋渡し

`index.html` の `onClick` / `onChange` / `onFocusOut`（19 か所）が呼ぶ関数は
15 種類で、`main.js:268-284` の `Object.assign(window, ...)` の 15 個と
過不足なく一致する。

### 5. `NoCacheStaticFiles`（TestClient で実測。starlette 1.6.0）

| 要求 | 状態 | `Cache-Control` |
|------|------|-----------------|
| 通常 | 200 | no-cache |
| `If-None-Match` | 304 | no-cache |
| `If-Modified-Since` | 304 | no-cache |
| `Range: bytes=0-99`（mp3） | 206 | no-cache |
| 複数の Range | 206 | no-cache |
| HEAD | 200 | no-cache |
| 範囲外の Range | 416 | 付かない |
| 無いファイル | 404 | 付かない |

304 に付くのは、`StaticFiles` が `file_response()` で作ったレスポンスの
ヘッダを `NotModifiedResponse` へ写すため。416 / 404 に付かなくても
害は無い（本体が無い）。

### 6. `clicks.test.mjs` の `settle()`

- 「目印の返事が届けば、前の返事も届いている」は成り立つ。`app.py` の
  受信ループは 1 本の接続のメッセージを `await svr.on_json()` で順に処理する。
  `load_gameinfo()` は同期（`board.js` に async / await は無い）。包んだ
  `load_gameinfo` は、目印を積むのと元の処理を同じタスクの中で行う
- 連続再生の Task が後から送る `gameinfo` は、メニューの `履歴を削除` が
  止めているので、バナーの項目までは残らない
- 持ち時間の 2 つの `wait_for` は空振りしない。初期値はサーバが `[120, 12]`
  （`clock.py:39`）、`index.html` が 2 分・12 秒で、
  `ClockLimit.emit_set()` は手元の値を書き換えない（`ui/clock.js`）。
  180 / 15 になるのはサーバの返事が届いたときだけ
- 弱いところは R1・R2

### 7. `CLAUDE.md` の書き直し

書かれていることは、実装と合っている。

- `ui/clock.js` の `PlayerClock.update()`（141 行）
- `Board.apply_clock_sw()`（`board.js:460-465`）が `history: false` で送る
- n = 1 しか送らない（`main.js:30-34, 59-63`、Ctrl-Z / Ctrl-Y も既定の n=1、
  `board.js:101-108`）
- `main.js` の `clear_hist()` の `confirm()`
- `layout.js` の `BX` / `BY` を `Board` が複製
- 階層図が `ui/base.js` の先頭にある

足りないのは R5 と、好みの問題の `onFocusOut`。

### 8. `index.html` の `<head>`

- 動的な `<script>` / `<link>` の生成は、`<link rel="stylesheet"
  href="/static/ytbg.css">` と `<script type="module"
  src="/static/js/main.js">` になった
- CSS も `/static` の下なので no-cache が付く。リロードで 304 の問い合わせに
  なることを実測した（JS の 15 ファイルも同じ）
- モジュールは defer 扱いで、load より前に走る。そのため
  `window.onload` の代入は間に合い、`document.body.onkeydown` の時点で
  body もある
- `index.html` そのものは `ETag` / `Last-Modified` を返さないので、推定での
  キャッシュもされない

## 範囲の外で気づいたこと

作業ツリーに `archives/agents/TODO-029/`（未追跡）がある。TODO-028 の
コミットに混ぜないこと。
