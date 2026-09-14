# TODO-054 implementer の報告

パスは `src/ytbg/webroot/static/js/` からの相対パス。

## 変えたファイルと要点

- `dom.js:250` `build_dom()` — 作った要素を返す。`build_board()` と `build_side()` は
  `els` を受け取り、そこへ要素を入れる。先頭のコメント（`BgBase は getElementById で拾う`）も直した
- `main.js:13` — `const els = build_dom();`。**呼ぶ場所はモジュールの評価時のまま**。
  `new Board(els, ...)` に渡す。名前の `<input>` も `els.name_input[player]` から取る（`main.js:44`, `:200`）
- `ui/base.js:56` `BgBase` の第 1 引数を `el` に変えた（`getElementById` を消した）。
  `ui/base.js:89` に `get id()`（`el.id` を返す getter）を置いた。`BgText` / `BgImage` も `el` を受け取る
- `ui/*.js` のサブクラスはすべて第 1 引数を `el` に変えた
  - `ui/clock.js:51` `PlayerClock(el, bg_el, board, player, x, y, deg)`
  - `ui/label.js:17` `PlayerName(el, input_el, board, player, x, y, deg)`
  - `ui/dice.js:146` `RollButton(el, dice_els, board, player, x, y, deg=0)`。`Dice` には `dice_els[i]` を渡す
  - `ui/checker.js:14` `Checker(el, board, player, num)`。`this.num` に通し番号（0〜14）
  - `ui/point.js:19` `BoardPoint` は `undefined` を渡す（以前は `""`）
- `board.js:63` `Board(els, x, y)`。部品にはすべて `els` の要素を渡す
- `board.js` `search_checker()` を消した。`apply()` の put_checker は
  `this.checker[Math.floor(ch_id / 100)]?.[ch_id % 100]`（`board.js:623` 付近）
- `board.js:826`（`predict_gameinfo()`）は `ch.num`、`board.js:895`（`put_checker()`）は `ch.player * 100 + ch.num`
- `actions.js:28` `checker_id()` を `ch.player * 100 + ch.num` にした
- `CLAUDE.md` — `main.js`、`dom.js`、`ui/` の説明と、チェッカーの ID の段落に追記した

## `build_dom()` が返す形

キーは `Board` のフィールド名に揃えた。プレーヤーごとのものは `[0 の分, 1 の分]`。

```
{ board,                         // #board 自身
  clock: [2], clock_bg: [2], pip: [2], name: [2], name_input: [2],
  score: [2], score_btn: [{up, down}, {up, down}],
  checker: [[15], [15]], cube, dice: [[4], [4]],
  roll_btn: [2], pass_btn: [2], win_btn: [2], resign_banner_btn: [2],
  button_resign, button_inverse, button_fwd, button_back }
```

## 走らせたテスト

- `node --test tests/browser/board.test.mjs predict.test.mjs last_op.test.mjs clicks.test.mjs drag.test.mjs`
  — 68 件すべて pass（終了コード 0）
- `node --test tests/js/` — 103 件 pass（ルール層は変えていないが、念のため）

一式（pytest ほか、`tests/browser/` の残り）は依頼どおり走らせていない。

## 壊して確かめたこと

どれも元へ戻し、`md5sum` で退避したファイルと一致することを確かめた。

| 壊し方 | 走らせたファイル | 結果 |
|--------|------------------|------|
| `Checker` の `num` を常に 0 | predict | 5 件 fail |
| `actions.js` の `checker_id()` を `ch.num` だけに | clicks, predict | 2 件 fail |
| `apply()` の put_checker の引き当てを常に `[0]` | last_op | **落ちない** |
| `RollButton` に渡すダイスの要素を 0 と 1 で入れ替え | board, last_op | **落ちない** |

put_checker の引き当ては、テストの外で一時スクリプト（実行後に削除した）を使って確かめた。
バーにある 114 をバーへ置くと `sound_put`、盤上の 113 をバーへ置くと `sound_hit` が鳴る。
引き当てを壊すと両方 `sound_hit` になる。

## テストで押さえられていないところ

- put_checker の put と hit の判定（上の表）。`last_op.test.mjs` の put_checker は
  盤上から盤上への移動しか見ていない
- 要素の取り違え（ダイス、クロックの背景、名前の `<input>`、スコアのボタンなど）。
  id 属性は正しいままなので、見た目は崩れても `#id` で探すテストは通ると思われる
- 画像の読み込みを待つ順番。**触っていない**（`build_dom()` を呼ぶ場所は変えていない）ので、遅延の実測はしていない

## 迷って決めたこと

- **`BgBase` に `id` の getter を残した。** `tests/browser/` が `ch.id`、`board.drag.checker.id`、
  `board.top_checker(6).id`、`btn.id` を使っているため。値は持たず `el.id` を返すだけ。
  消すならテスト側を `.el.id` に直す必要がある
- 通し番号のフィールド名は `num`（`idx` は gameinfo の積み順、`BoardPoint.idx` はポイント番号で使われているため）
- `RollButton` はダイスの要素を第 2 引数で受け取る
- `main.js` の名前の `<input>` も `getElementById` をやめて `els` から取った（`build_dom()` が作る要素なので）

## 実装しなかったこと・範囲外

- `tests/browser/predict.test.mjs:210`, `:365` にテスト側の `parseInt(ch.id.slice(1)) % 100` が残っている。
  getter のおかげで動くので触っていない。`ch.num` に揃えるかは管理者の判断
- 挙動の違いが 1 つある。範囲外の `ch`（例: 999）の put_checker が届いたとき、以前の `search_checker("p999")` は
  `this.checker[9]` が無くて TypeError になっていた。今は `undefined` になって音を鳴らさず先へ進む。
  サーバは型しか確かめないので、届く可能性はある

## レビュー後の修正

管理者の指示（レビューの 1〜3。4 の負の `ch` は直さない）で直した。

### 変更

- `tests/browser/last_op.test.mjs:134` — 「put_checker → 動かす前がバーなら put、盤上からバーへなら hit」を追加。
  `checker[1][14]` をバーに置いた盤面で `ch: 114` → `sound_put`、`ch: 113` → `sound_hit`。最後に元の `gameinfo` へ戻す
- `tests/browser/board.test.mjs:82` — 「表示部品が dom.js の作った要素を取り違えずに持っている」を追加。
  68 か所の部品の `el.id`（名前の `<input>` は `el_input`、クロックの背景は `el_bg`）を期待する id と照らし、
  チェッカーの `player` / `num` も添字と照らす。照らした数が 68 であることも見る
- `CLAUDE.md:297`、`src/ytbg/webroot/static/js/dom.js:233` — 「キーは `Board` のフィールド名に揃え」を
  「近い名前」に直し、`name` → `player_name`、`clock` → `player_clock`、`name_input` / `clock_bg` / `dice` は
  `Board` に同じ名前のフィールドが無いことを書いた

### 検証（足したファイルだけ）

- `node --test tests/browser/board.test.mjs tests/browser/last_op.test.mjs` — 17 件 pass、終了コード 0
- `board.js` を壊して対象のファイルだけ走らせた（毎回スクラッチの控えから `\cp` で戻した）
  - `put_ch` の引き当てを `this.checker[0]?.[0]` に固定 → `last_op.test.mjs` の追加分が fail
  - `ch_id % 100` を `% 10` に → 同じく fail
  - `RollButton` に渡す `els.dice[0]` / `[1]` を入れ替え → `board.test.mjs` の追加分が fail
  - `els.checker[player][i]` を `[(i + 1) % 15]` に → 追加分ほか 3 件が fail
- 戻したあと `cmp` で控えと一致、`git diff --stat` の `board.js` も修正前と同じ（91 行）

### 残る懸念

- プレーヤーの取り違え（`Math.floor(ch_id / 100)` を壊す）は試していない。テストの駒の置き方から落ちるはずだが実測はしていない
- レビューの 5（`predict.test.mjs` の `parseInt(ch.id.slice(1)) % 100`）と 7（`CLAUDE.md:400` の折り返し）は指示に無いので触っていない
