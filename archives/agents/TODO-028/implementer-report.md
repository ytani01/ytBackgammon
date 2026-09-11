# TODO-028 実装担当の報告

段 1 は前の実装担当が行い、レート制限で止まった（報告は書かれていなかった）。
段 1 の節は、引き継いだ実装担当が作業ツリーの状態から書いた。

## 段 1（分割だけ）

### 分割後のファイル

`src/ytbg/webroot/static/ytbg.js`（4,351 行）を消し（`git rm` 済みで staged）、
`src/ytbg/webroot/static/js/` の 15 ファイルへ分けた。段 1 の終わりの行数:

| ファイル | 行数 | 中身 |
|----------|-----:|------|
| `main.js` | 284 | エントリ。メニュー・ヘッダから呼ぶ関数、キー操作、`window.onload` で `Board` を作り WebSocket をつなぐ |
| `ws.js` | 85 | 接続・再接続・送信（`ws_connect()` / `emit_msg()`） |
| `log.js` | 13 | `log()` |
| `layout.js` | 11 | 盤面の座標 `BX` / `BY` |
| `settings.js` | 105 | `CookieBase` / `QueryStringBase` |
| `sound.js` | 44 | `SoundBase` と効果音の定数、`GlobalSoundSwitch` |
| `board.js` | 1,166 | `Board` |
| `ui/base.js` | 501 | `BgBase` / `BgText` / `BgImage` と中間クラス |
| `ui/point.js` | 68 | `BoardArea` / `BoardPoint` |
| `ui/checker.js` | 400 | `Checker` |
| `ui/cube.js` | 279 | `Cube` |
| `ui/dice.js` | 588 | `Dice` / `RollButton` |
| `ui/clock.js` | 270 | `ClockLimit` / `PlayerClock` |
| `ui/label.js` | 228 | `PlayerName` / `PlayerPipCount` / `PlayerScore` |
| `ui/button.js` | 256 | ボタン各種 |
| 計 | 4,298 | |

### `window` への橋渡し

`main.js` の末尾で `Object.assign(window, {...})` により、`index.html` の
`onClick` / `onChange` 属性から呼ばれる 15 個の関数（README の 1 番の一覧）を
`window` に載せている。「TODO-029 で addEventListener に移したら、この橋渡しごと
消す」のコメント付き。`window.board` もデバッグ用として `window.onload` の中で
入れている（`tests/browser/helper.mjs` が待っている）。

### キャッシュのヘッダ

- `index.html` は `<script type="module" src="/static/js/main.js">` と
  `<link rel="stylesheet" ... href="/static/ytbg.css">` の 2 行になり、
  `?ts=` 付き URL と動的な `<script>` 生成は無くなった
- `src/ytbg/app.py` に `NoCacheStaticFiles`（`StaticFiles` を継承し、
  `file_response()` で `Cache-Control: no-cache` を付ける）を足し、`/static` の
  Mount に使っている
- `tests/test_ws.py` に `test_static_no_cache`（`/static/js/main.js` の
  `cache-control` が `no-cache`）を足した

### 段 1 の検証（main が確かめた結果）

`uv run pytest`（211 passed）、`ruff`、`mypy`、`node --test tests/browser/`
（5 pass）がいずれも通っていた。

### 段 1 で消えていたもの

元の `ytbg.js` の先頭にあったクラス階層図（`[Class tree]`）は、分割の際に
どのファイルにも移されていなかった。段 2 で新しい階層の図を書き直す。

## 段 2（継承階層の組み直し）

作業前の `static/js/` は scratchpad に丸ごと控えてから始めた。

### 2-1. 属性を足すだけの中間クラスをやめた（済）

- `ui/base.js`: `BoardText` / `PlayerText` / `OnBoardImage` / `OnBoardButton` /
  `PlayerItem` を消した。`BgBase` / `BgText` / `BgImage` のコンストラクタの
  最後に options（`{board, player}`。`BgBase` / `BgImage` は `w` / `h` も、
  `BgText` は `text` も）を取り、`BgBase` が `this.board` / `this.player` を入れる
- `ui/point.js`: **`BoardArea` も消した**（README の一覧には無いが、`board` を
  足すだけの同じ種類の中間クラス。`BoardPoint` は `BgBase` を直接継承する）
- 部品の側（`Checker` / `Dice` / `Cube` / 各ラベル / 各ボタン）は
  **コンストラクタの引数の並びを変えていない**（`(id, board, player, x, y, deg)`
  など）。これらにとって `board` と `player` は省けないので、位置引数のままに
  して、基底へ渡すところだけ options にした。`board.js` の生成箇所は変わらない
- `Board` は `super(id, x, y, 0)`（`this.board` は undefined のまま。
  `get_xy()` の `if ( this.board )` の分岐は前と同じ）
- 前は `this.board` / `this.player` を基底のコンストラクタが終わってから
  入れていたが、いまは `BgBase` の先頭で入れる。基底のコンストラクタの中で
  呼ばれる上書きメソッド（`BannerButton.move()`）はどちらも見ないので、
  結果は変わらない
- `node --test tests/browser/` は 5 pass

### 2-2. `EmitButton` の 6 つのサブクラスを 1 つにした（済）

- `ui/button.js`: `BackButton` / `Back2Button` / `BackAllButton` / `FwdButton` /
  `Fwd2Button` / `FwdAllButton` を消した。`EmitButton(id, board, type, data, x, y)`
  はそのまま
- `board.js`: `new EmitButton("button-back", this, "back", {n: 1}, ...)` と
  `new EmitButton("button-fwd", this, "fwd", {n: 1}, ...)` にした。送る
  type と data は前の `BackButton` / `FwdButton` と同じ
- **盤面で使っていたのは `BackButton` と `FwdButton` の 2 つだけ**で、残りの 4 つは
  どこからも生成されていなかった。しかも `Fwd2Button` / `FwdAllButton` は
  `super(id, board, "fwd2", x, y)` と data を渡し忘れており、生成すれば
  `x` が data に、`y` が x に入る壊れた状態だった（使われていないので表に出て
  いない）。消したので、この不具合も一緒に消えた
- `node --test tests/browser/` は 5 pass（終了コード 0）

### 2-3. `BannerButton` の 3 つのサブクラスをコールバックにした（済）

- `ui/button.js`: `PassButton` / `ResignBannerButton` / `WinButton` を消した。
  `BannerButton(id, board, player, x, y, deg=0, on_click=undefined)` に
  `on_click` を足し、`on_mouse_down_xy()` が `this.on_click(this)`
  （押されたボタンを渡す）を呼ぶ。省いたときは何もしない
- `board.js`: 動作は `Board` のコンストラクタで `on_resign_banner` / `on_pass` /
  `on_win` として作り、生成時に渡す。`on_pass` の中身は前の
  `PassButton.on_mouse_down_xy()` と同じ（`off()` → `change_turn()` →
  `emit_turn(1 - player, -1, true)`）。`main.js` のスペースキーの経路は
  `pass_btn.on_mouse_down_xy(0, 0)` のままで動く
- 残りの 2 つは前もログを出すだけだった。ログの文言は `resign banner.on_click>`
  などに変えた（前の `ResignBannerButton` は `WinButton.on_mouse_down>` と
  書き写し間違いのままだった）。画面にも送るメッセージにも出ない
- **`RollButton` は `BannerButton` のサブクラスのまま**（README の 6 番）。
  ダイス 4 つを持ち、`on()` / `off()` も「隠す」ではなく「盤の端へ動かす」で
  違うので、コールバックでは表せない。`RollButton` は `on_mouse_down_xy()` を
  上書きしているので、足した `on_click` の経路は通らない
- `node --test tests/browser/` は 5 pass（終了コード 0）

### 継承階層の前後

前（段 1 の終わり。元の `ytbg.js` の図と同じ。37 クラス）:

```
BgBase
 +- BgText
 |   +- BoardText
 |       +- ClockLimit
 |       +- PlayerText
 |           +- PlayerClock / PlayerName / PlayerPipCount / PlayerScore
 +- BgImage
 |   +- OnBoardImage
 |   |   +- OnBoardButton
 |   |   |   +- InverseButton / ResignButton
 |   |   |   +- EmitButton
 |   |   |       +- BackButton / Back2Button / BackAllButton
 |   |   |       +- FwdButton / Fwd2Button / FwdAllButton
 |   |   +- Cube
 |   |   +- PlayerItem
 |   |       +- ScoreButton / Dice / Checker
 |   |       +- BannerButton
 |   |           +- RollButton / PassButton / ResignBannerButton / WinButton
 |   +- Board
 +- BoardArea
     +- BoardPoint
CookieBase, QueryStringBase, SoundBase
```

後（22 クラス。最も深いところで BgBase から 3 段 = `RollButton`）:

```
BgBase                  .. board / player は options で受ける
 +- BgText
 |   +- ClockLimit / PlayerClock / PlayerName / PlayerPipCount / PlayerScore
 +- BgImage
 |   +- Board / Cube / Checker / Dice
 |   +- InverseButton / ResignButton / ScoreButton
 |   +- EmitButton      .. type と data を生成時に渡す
 |   +- BannerButton    .. 押したときの動作を on_click で渡す
 |       +- RollButton
 +- BoardPoint
CookieBase, QueryStringBase, SoundBase
```

図は `ui/base.js` の先頭に、ファイル名付きで書いた（元の `ytbg.js` の図は
`BgImage` に mouse handlers と書いていたが、実際は `BgBase` にあるので直した）。

### 統合しなかったもの

- `RollButton` — 上の 2-3 のとおり
- `InverseButton` / `ResignButton` / `ScoreButton` — 指示の範囲外なので残した。
  `InverseButton` と `ResignButton` は押したときの動作だけのボタンで、
  `BannerButton` と同じくコールバックにできる形だが、`BannerButton` は
  中央寄せ・z の出し入れを持つので、そのままは載せられない。`ScoreButton` は
  状態（`score_obj` / `offset`）と `set_wh()` の上書きを持つ

### CLAUDE.md は直していない（判断が要る）

指示では `CLAUDE.md` の「構成」と「書き方の慣習」を直すことになっていたが、
実装担当の定義で `CLAUDE.md` は触らないことになっており、エージェントからの
依頼でそれを越えることはできないので、**直していない**。main か利用者が直す。
案を下に置く。

「構成」の `ytbg.js` の行（182 行目）を置き換える案:

```
- `src/ytbg/webroot/static/js/` — クライアント。ES Modules で、バンドラは
  使わない（TODO-028）。`index.html` は `<script type="module"
  src="/static/js/main.js">` の 1 行で読み込む。クラス階層図は `ui/base.js`
  の先頭にある
  - `main.js` — エントリ。`Board` を作り、WebSocket をつなぐ。
    `index.html` の `onClick` / `onChange` 属性から呼ぶ関数を `window` に
    載せている（TODO-029 で消す）。`window.board` はデバッグ用
  - `ws.js`（接続・再接続・送信）、`log.js`、`layout.js`（盤面の座標）、
    `settings.js`（Cookie / QueryString）、`sound.js`
  - `board.js` — `Board`
  - `ui/` — 表示部品（`base.js` に `BgBase` / `BgText` / `BgImage`、
    ほかは `point.js` / `checker.js` / `cube.js` / `dice.js` / `clock.js` /
    `label.js` / `button.js`）。`board` と `player` はコンストラクタの
    options で渡す
- `/static` は `Cache-Control: no-cache` で返す（`app.py` の
  `NoCacheStaticFiles`）。`import` した先のモジュールまでキャッシュを
  避けるため（TODO-028）
```

「書き方の慣習」の最後の行を置き換える案:

```
- クライアント側の座標は `layout.js` の `BX` / `BY` の配列を基準に
  組み立てられている（`Board` が複製して `this.bx` / `this.by` として持つ）。
  位置を直すときはこの配列を見る
```

ほかに `CLAUDE.md` の 267・283・305・311 行目も `ytbg.js` の名前で関数を
指している（`PlayerClock.update()` → `ui/clock.js`、`apply_clock_sw()` →
`board.js`、n = 1 しか送らない話と `clear_hist()` → `main.js`）。

### 段 2 の終わりの行数

board.js 1186, layout.js 11, log.js 13, main.js 284, settings.js 105, sound.js 44, ws.js 85, ui/base.js 498, ui/button.js 176, ui/checker.js 400, ui/clock.js 270, ui/cube.js 279, ui/dice.js 588, ui/label.js 228, ui/point.js 58, 合計 4225

## わざと壊して確かめた結果

壊す前の `static/js/` を scratchpad に控え、1 通りずつ壊して
`node --test tests/browser/` と、ヘッダ・メニュー・盤面のボタンを playwright で
実際にクリックするスクリプト（下の「クリックでの確認」）を走らせ、控えから戻した。
戻したあとは毎回 `diff -r` で控えと一致することを見た。

| # | 壊し方 | tests/browser/ | クリックでの確認 |
|---|--------|----------------|------------------|
| M1 | `ui/button.js` の `export class EmitButton` から `export` を消す（ES Modules の読み込み） | 落ちる（5 件とも。`board` が組み上がらず `waitForFunction` がタイムアウト） | 落ちる |
| M2 | `board.js` の `import ... from "./ui/button.js"` を `"./ui/buton.js"` にする（ES Modules の読み込み） | 落ちる（同上） | 落ちる |
| M3 | `main.js` の `Object.assign(window, {` を `Object.assign({}, {` にする（橋渡しを消す） | 落ちる（3 件。下の注） | 落ちる（メニューの「ボード回転」から先） |
| M4 | `BannerButton.on_mouse_down_xy()` の `this.on_click(this)` を消す（2-3） | **通る** | 落ちる（パスのバナーのクリックとスペースキー） |
| M5 | `BgBase` の `this.player = player` を `undefined` にする（2-1） | 落ちる（5 件とも） | 落ちる |
| M6 | `board.js` の戻すボタンの data を `{n: 2}` にする（2-2） | **通る** | 落ちる（`button back`） |

M4 と M6 は `tests/browser/` では捕まらず、クリックでの確認だけが捕まえた。

**注（M3）: 「`tests/browser/` は橋渡しを消しても落ちない」は、実際には違った。**
ドラッグのテストがヘッダの `#free-move` を押すので、橋渡しが無いと
`apply_free_move is not defined` がコンソールに出て、ドラッグ・2 枚目のタブ・
コンソールエラーの 3 件が落ちる。ただし、それ以外の 14 個の関数
（メニューの項目、ほかのチェックボックス、クロックの入力、名前の入力）は
`tests/browser/` では見ていない。

## クリックでの確認

`tests/` には足していない（scratchpad の `clickcheck.mjs`。
`tests/browser/helper.mjs` の `start_server` / `launch_browser` /
`open_board` を使う）。手順:

1. `WebSocket.prototype.send` を包み、送ったメッセージを貯める。
   `confirm()` は自動で OK する
2. メニュー（`#nav-open` を押してから項目の文字を押す）: 「ボード回転」で
   `board.player` が反転し、メニューが閉じる。「1つ戻す」〜「New Game」の 8 項目で
   `back {n:1}` / `back2` / `back_all` / `fwd {n:1}` / `fwd2` / `fwd_all` /
   `clear_hist` / `new` が送られる
3. ヘッダ: Sound / Free / Pip のチェックで `board.sound` / `free_move` /
   `disp_pip` が変わる。Clock で `set_clock_switch`、2 つの持ち時間の入力で
   `set_clock_limit`、名前の入力で `set_playername` が送られる
4. 盤面: 戻す・進めるボタンで `back {n:1}` / `fwd {n:1}`、回転ボタンで
   `board.player` が反転、スコアの ▲ で `set_score`
5. バナー: `pass_btn[0].on()` にしてクリックすると `set_turn {turn:1}` が送られ
   バナーが消える。スペースキーでも同じ。投了・勝ちのバナーは押しても何も送らない
6. コンソールエラーが無い（favicon と CDN の font awesome を除く）

段 2 の終わりで 27 項目とも PASS（終了コード 0）。

持ち時間の 2 つ目の入力では、`page.fill()` がフォーカスを移したときに
1 つ目の入力の `change` がもう一度起き、サーバからの `gameinfo` で入力が
保存済みの値へ書き戻されるため、送られる値が入れた値にならないことがある。
スクリプトの操作の順番による見え方で、`ClockLimit` と `apply_clock_limit()` の
処理は変えていない。

## 検証（段 2 の終わり）

| コマンド | 結果 | 終了コード |
|----------|------|-----------:|
| `uv run pytest` | 211 passed, 1 warning | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | no issues found in 12 source files | 0 |
| `node --test tests/browser/` | 5 pass / 0 fail | 0 |
| クリックでの確認（scratchpad の `clickcheck.mjs`） | 27 項目とも PASS | 0 |

pytest の 1 warning は starlette の `testclient.py` が出す anyio の
DeprecationWarning で、段 1 の前からある（このリポジトリのコードではない）。

終わる前に `git status` と、壊したときの文字列の grep で、`src/` と `tests/` に
壊した版が残っていないことを確かめた。

## 判断が要る点

1. **`CLAUDE.md` を直していない**（上の「CLAUDE.md は直していない」）。
   案は書いたので、main か利用者が入れる
2. **`BoardArea` も消した。** README の一覧には無いが、`board` を足すだけの
   同じ種類の中間クラスだった。残すべきなら戻す
3. **部品の側のコンストラクタは位置引数のまま。** options にしたのは基底の
   3 クラス（`BgBase` / `BgText` / `BgImage`）だけ。`Checker` などにとって
   `board` / `player` は省けないので、部品の側まで options にはしていない。
   部品の側も options に揃えるなら `board.js` の生成箇所が全部変わる
4. **クリックでの確認を `tests/` に足すか。** M4（バナーのコールバック）と
   M6（戻すボタンの data）は `tests/browser/` では捕まらなかった。ただし
   TODO-029 で `onClick` 属性を `addEventListener` に移すと、メニューと
   ヘッダの操作の中身が変わるので、足すならそのときがよいかもしれない

## 範囲外で気づいたこと（直していない）

- `board.js` の `new ClockLimit(this.board)`: `Board` には `this.board` が無いので
  `undefined` を渡している。`ClockLimit` は `board` を使っていないので表には
  出ない（段 1 の前からそう）
- `ScoreButton` は 4 つとも `player` に 0 を渡している（`board.js`）。
  `ScoreButton` の中では `player` を使っていない
- `BgBase.get_pip()` は引数の `player` ではなく `this.player` を見ている。
  ルール層を切り出す TODO-027 で扱う話
- `index.html` の `<label for"disp-pip">` などは `=` が抜けている（TODO-029 で
  DOM を作り直すときに消える）

## クリックでの確認を tests/ に足した

main の答え（判断が要る点の 1〜4）を受けて、scratchpad の `clickcheck.mjs` を
正式なテストにした。上の「クリックでの確認」の節は、足す前の記録として残す。

### 足したもの

- `tests/browser/clicks.test.mjs`（372 行、新規）。`describe('クリックでの操作')`
  の中に 25 件の `it`（元の 27 項目のうち、メニューの回転と閉じるのを 1 件に、
  パスのバナーのクリックと消えるのを 1 件にまとめた）。`board.test.mjs` と同じく
  `before` でサーバ・chromium・ページを用意し、`after` で後始末する
- 題名は「押すもの → 送る type と data、または変わる board の属性」の形
  （例: `盤面の戻すボタン → back {n: 1} を送る`）。data は `assert.deepEqual` で
  丸ごと比べる
- `confirm()` の自動 OK、`WebSocket.prototype.send` の包み方、`settle()` は
  **テストファイルの中**に置いた（`helper.mjs` は変えていない）
- 既存の `board.test.mjs` と `helper.mjs` は変えていない（`git diff` で差分なし）

### 揺れないようにしたところ

1. **持ち時間の入力。** `fill()` のあとに `blur()` して、`change` を入力ごとに
   1 回だけ起こす（`dispatchEvent` で起こすと、ブラウザの「フォーカスを得た
   ときの値」が更新されず、フォーカスが移ったときにもう一度 `change` が起きて
   いた）。さらに、1 つ目の返事で `board.clock_limit.limit[0]` が 180 に
   なるのを待ってから 2 つ目を触る。`gameinfo` が届くたびに入力が 2 つとも
   サーバの値へ書き戻されるため
2. **バナー。** 最初の版で、投了のバナーを `on()` にした直後に、前の項目
   （スペースキーの `set_turn`）の返事が届き、`load_gameinfo()` がバナーを
   全部 `off()` にして押せなくなった（1 回目の実行で落ちた）。
   `settle()` を足し、バナーを `on()` にする前に、それまでの返事が出揃うのを待つ。
   目印を付けたメッセージ（`src: 'settle-N'`、プレーヤー 1 の名前を今の値の
   まま `history: false` で送る）を 1 本送り、その返事の `last_op.src` が
   届くのを待つ。サーバは 1 つの接続のメッセージを順に処理するので、
   目印の返事が届けば前の返事も届いている。
   「送った数と届いた `gameinfo` の数を比べる」形は、返事を返さない
   メッセージ（連続再生など）があって合わなかった（25 送って 19 届く）ので採らなかった
3. 決まった時間だけ待つのは、投了・勝ちのバナーの「何も送らない」を見るところの
   200 ms だけ。`on_click` は同期で送るので、包んだ `on_click` が呼ばれた
   時点で出揃っており、この待ちは落ちる方向には効かない

### わざと壊して確かめた（足したテストで）

scratchpad の控え（段 2 の終わり）から毎回戻し、戻したあと `diff -r` で一致を見た。

| # | 壊し方 | `node --test tests/browser/` |
|---|--------|------------------------------|
| M4 | `BannerButton.on_mouse_down_xy()` の `this.on_click(this)` を消す | 落ちる（終了コード 1。パスのバナー、スペースキー、投了・勝ちのバナーの 4 件） |
| M6 | 戻すボタンの data を `{n: 2}` にする | 落ちる（終了コード 1。`盤面の戻すボタン → back {n: 1} を送る` の 1 件） |

### 3 回続けて走らせた結果

`node --test tests/browser/`（既存 5 件 + 足した 25 件 = 30 件）:

| 回 | 結果 | 終了コード |
|----|------|-----------:|
| 1 | 30 pass / 0 fail | 0 |
| 2 | 30 pass / 0 fail | 0 |
| 3 | 30 pass / 0 fail | 0 |

終わる前に、`src/ytbg/webroot/static/js/` が段 2 の終わりの控えと一致すること、
壊した版の文字列が `src/` に残っていないことを確かめた。

### 残る懸念

- `settle()` は「プレーヤー 1 の名前をこのファイルが変えない」ことに依存する。
  プレーヤー 1 の名前を変える項目を足すときは、目印に使うメッセージを変えること
  （ファイルの中にも書いてある）
- テストは書いた順に 1 つのサーバの盤面を変えていくので、並べ替えると
  前提が崩れる（`board.test.mjs` と同じ作り）

## R4 は main が直した

実装担当がレート制限で止まったため、reviewer の R4（Python 側のコメント・
docstring に残る `ytbg.js` の名前）は main が直した。R1・R2・R3 は
実装担当が済ませていた。

今のファイルを指していた 8 か所を、実際の置き場所に直した。

| ファイル | 前 | 後 |
|----------|-----|-----|
| `src/ytbg/clock.py:15` | `ytbg.js の PlayerClock.update()` | `ui/clock.js の …` |
| `src/ytbg/clock.py:102` | `ytbg.js の PlayerClock.reset()` | `ui/clock.js の …` |
| `src/ytbg/clock.py:110` | `ytbg.js の PlayerClock.start()` | `ui/clock.js の …` |
| `src/ytbg/server.py:483` | `ytbg.js の apply_clock_sw()` | `board.js の Board.apply_clock_sw()` |
| `src/ytbg/server.py:495` | `ytbg.js の PlayerClock.start()` | `ui/clock.js の …` |
| `tests/test_clock_unit.py:74` | `ytbg.js の PlayerClock` | `ui/clock.js の PlayerClock` |
| `tests/test_clock.py:195` | `ytbg.js と同じ` | `ui/clock.js と同じ` |
| `tests/test_save_load.py:153` | `ytbg.js の apply_clock_sw()` | `board.js の apply_clock_sw()` |

置き場所は grep で確かめた（`update()` / `start()` / `reset()` は
`ui/clock.js:141, 180, 196`、`apply_clock_sw()` は `board.js:460`）。

**昔の経緯を書いている 2 か所は残した**（reviewer の R4 のとおり）。

- `src/ytbg/server.py:459` —「TODO-015 より前は ytbg.js の受信側が…」
- `tests/test_clock.py:238` — 同じ

### 検証（R4 のあと）

| コマンド | 結果 | 終了コード |
|----------|------|-----------:|
| `uv run pytest` | 211 passed, 1 warning | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | no issues found in 12 source files | 0 |
| `node --test tests/browser/` × 3 回 | 3 回とも 30 pass / 0 fail | 0 |
