# TODO-048 レビュー（reviewer）

対象: `git diff`（10 ファイル）と未追跡の `tests/browser/debug.test.mjs`。
作業ツリーは変えていない。実測はスクラッチのスクリプトから
`tests/browser/helper.mjs` の `start_server()` / `open_board()` を借りて、
ページの中でスタイルを一時的に切り替えて行った（ファイルは書き換えていない）。

**要修正: 0 件。**

## 検討

### 1. `tests/browser/clicks.test.mjs:423` 付近 / ▼ ボタン（スコアを 0 にする）を押すテストが無い

- 問題: `pointer-events: none` を外すと ▲ は `clicks.test.mjs` の
  `#score_up0` のテストで落ちるはずだが、▼ を押すテストは無い
  （`grep score_down tests/browser` で 0 件）
- 根拠（実測）: `#score_up0` / `#score_down0` / `#score_up1` / `#score_down1`
  の中心を `elementFromPoint()` で見ると、`pointer-events` を戻した状態では
  4 つとも `p0score` / `p1score` が受ける。今の状態では各ボタンが受ける。
  playwright の `click({force: true})` は中心を押すので、▲ のテストは
  「消したのに `pointer-events` を付け忘れた」壊し方を捕まえる（推論。
  実際に壊して走らせてはいない = 未確認）。▼ は同じ壊れ方をしても誰も
  気づかない
- 案: ▼ を押して `set_score {player: 0, score: 0}` が送られることを見る
  テストを 1 件。CLAUDE.md の「わざと壊して落ちることを確かめる」に沿って、
  `label.js` の `pointerEvents` の行を外して ▲ / ▼ が落ちるかを確かめる

### 2. `tests/browser/debug.test.mjs:12-13` と `CLAUDE.md:104-105` / 理由の書き方が実際と食い違って読める

- 問題: 「`open_board()` は `goto()` のあとでしか console を見られない」とあるが、
  `helper.mjs:166` の `open_board()` は `goto()`（177 行）の**前に**
  `page.on('console')` をつないでいる。つないだ中身が `error` だけを貯め、
  呼ぶ側には `goto()` と盤面の待ちが済んだあとのページしか返らない、
  というのが実際の理由
- 根拠: `tests/browser/helper.mjs:162-185` を読んだ
- 案: 「`open_board()` は `error` しか貯めず、呼ぶ側がリスナーを足せるのは
  ページを開いたあと」のように直す

## 好みの範囲

### 3. `src/ytbg/webroot/static/js/settings.js:24` / `?debug=0` でも出る

`has("debug")` なので `?debug=0` も true。docstring に「値は見ない」と
書いてあり意図どおり。`?sound` と揃えて値を見る必要は無いと考えるが、
`?debug=0` で止まると思う人はいる。

## 見てほしいと言われた点の結論

### `PlayerScore` に `pointer-events: none`（label.js:172）

- **失われる操作は無い。**
  - `BgBase` が付けるのは `onmousedown` / `ontouchstart` / `onmouseup` /
    `ontouchend` / `onmousemove` / `ontouchmove` / `ondragstart`（base.js:75-83）。
    `PlayerScore` が上書きしていたのは `on_mouse_down_xy()` だけで、
    up / move は基底の no-op。`ondragstart` は `false` を返すだけ
  - 移動・離す処理を持つのは `Checker` / `Cube`（自分の要素で受ける）と
    `Board.on_mouse_move_xy()`（`#board` で受ける）。スコアの要素は
    `#board` の子なので、以前も今もイベントは `#board` へ bubble する。
    `pointer-events: none` で標的が下のボタンか `#board` に変わっても、
    `#board` に届く点は同じ
  - タッチは `touchmove` / `touchend` の標的が `touchstart` の要素に固定される。
    始点がスコアの上だった場合、以前は `PlayerScore`、今は `ScoreButton` か
    `#board` になり、どちらも `touch2mouse()` で `preventDefault()` を呼ぶ
  - CSS の `cursor` はスコアにもボタンにも付いていない（`ytbg.css` の
    `cursor` は `#nav-*` だけ）
  - `BgText.set()` は `move()` / `rotate()` を呼ぶが `pointerEvents` には
    触らないので、スコアが変わっても付いたまま
- **ボタンの外にはみ出した数字の部分:** 以前は `PlayerScore.on_mouse_down_xy()`
  が `in_this()` で両方 false になり何もしなかった。今は下の `#board` が
  受け、`Board` は `on_mouse_down_xy()` を上書きしていない（`grep` で確認）
  ので何もしない。**同じ。** 実測では、スコアの矩形を 2px 刻みで見ると、
  ボタンの外に当たるのは `#board` だけだった（プレーヤー 0 / 1 のどちらの向きでも）
- **回転と押せる範囲:** `ScoreButton` 自身は回転しておらず（deg 0）、
  回るのは `Board.inverse()` による `#board` 全体の 180 度だけ。
  以前の判定（`get_xy()` で盤の座標に直してから `in_this()`）と、ボタンの
  実際の矩形（`getBoundingClientRect()`）を 0.5px 刻み・周囲 4px まで比べた。
  プレーヤー 0 の向きでは不一致 0 / 29280 点。プレーヤー 1 の向きでは
  1192 点が食い違ったが、**すべて矩形の境界線ちょうど**（境界からの距離の
  最大が 0）。半開区間 `[x, x+w)` を反転したときの端の 1px の扱いだけで、
  押せる範囲は実質変わらない

### `?debug`（log.js / settings.js）

- 循環は無い: `settings.js` は何も import しない
- `rules/` は `../` から何も import していない（`grep "\.\./" rules/` で 0 件）。
  `tests/js/` も `log.js` / `settings.js` を import していない
- `tests/browser/` で console の `log` を数えているのは `debug.test.mjs` だけ。
  `helper.mjs` は `error` だけを見る
- `src/ytbg/webroot/static/js/` で `console.log` を直接呼んでいるのは
  `log.js` だけ（`grep` で確認）

### `ScoreButton` の `player` 引数を消した件

main の判断で正しい。`BgBase` で `this.player` を読むのは `get_xy()` だけで、
`board` があれば `board.player` を使う（base.js:220-223）。`ScoreButton` は
常に `board` を渡され、`ScoreButton` 自身も `this.player` を読まない。
`inverse_xy()` も `board` があれば `board` の値しか使わない。

### `Dice.set()` の `this.image_el`

同じ要素。`BgImage` が `this.el.children[0]`（base.js:352）、`Dice` の
コンストラクタが `this.el.firstElementChild`（dice.js:39）で入れており、
どちらも最初の子要素。`image_el` へ代入しているのはこの 2 か所だけで、
差し替える経路は無い。なお `ui/cube.js:93` にも `this.el.children[0].src`
が残っている（表に無いので今回の範囲外。直すなら別項目）。

### `debug.test.mjs` の固定の仕方

「既定で 0 件」は、`log()` 以外から `console.log` が出るようになると落ちる。
いま直接呼んでいるのは `log.js` だけなので、落ちたら「`log()` を通さない
出力が増えた」ことが分かり、既定で出さないという狙いにも合う。それでよいと考える。
待ちの条件は `open_board()` と同じで、最初の `gameinfo` を `apply()` した
あと（`Board.apply()` が `log()` を呼ぶ）まで待つので、`?debug` 付きの
2 件が 0 件にならない。`log()` を常に出す／常に出さない壊し方のどちらも
いずれかのテストで落ちるはず（未確認。壊して走らせてはいない）。

### 文書

- `docs/Developer.md` に TODO 番号は書かれていない
- `CLAUDE.md` の追記は周りと同じ書き方。上の検討 2 の言い回しだけ
- 範囲外の変更は混ざっていない。なお `TODO.md` のチェックボックスが
  「下の 6 つ」だが表は 7 行（差分の外。管理者向けのメモ）
