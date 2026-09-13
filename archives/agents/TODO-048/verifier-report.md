# TODO-048 検証（verifier）

コードは変更していない。壊す確認は一時的に書き換えて `\cp` で復元し、
最後に `git diff --stat` が元と同じであることを確認した。

## 1. 範囲

`git diff --stat` は下の 11 ファイル。指示どおり。

```
 CLAUDE.md                                | 10 ++++++--
 docs/Developer.md                        |  2 +-
 src/ytbg/webroot/static/js/board.js      |  2 +-
 src/ytbg/webroot/static/js/log.js        | 12 +++++++---
 src/ytbg/webroot/static/js/settings.js   | 11 +++++++++
 src/ytbg/webroot/static/js/ui/button.js  |  4 ++--
 src/ytbg/webroot/static/js/ui/checker.js | 11 ---------
 src/ytbg/webroot/static/js/ui/dice.js    |  6 ++---
 src/ytbg/webroot/static/js/ui/label.js   | 12 +++-------
 src/ytbg/webroot/templates/index.html    |  2 +-
 tests/browser/clicks.test.mjs            | 39 ++++++++++++++++++++++++++++++++
 11 files changed, 77 insertions(+), 34 deletions(-)
```

未追跡は `tests/browser/debug.test.mjs` と `archives/agents/TODO-048/` のみ。
それ以外の未追跡・変更ファイルは無い。範囲外の混入は無い。

## 2. 検証（各 1 回）

| コマンド | 結果 |
|---|---|
| `node --test tests/browser/` | 61 tests, pass 61, fail 0 |
| `node --test tests/js/` | 99 tests, pass 99, fail 0 |
| `uv run pytest` | 227 passed, 1 warning（starlette の非推奨警告。既存で無関係） |
| `uv run ruff check .` | All checks passed! |

終了コードはすべて 0（`node --test` は fail 0 なら 0、`pytest` は
`227 passed` で 0、`ruff` は `All checks passed!` で 0）。落ちた出力は無い。

## 3. 7 件が直っていること（`git diff` で確認）

1. `?debug` のときだけ `log()` を出す — `log.js` が `settings.js` の
   `get_debug_query()` を読み込み時に 1 度評価し、`DEBUG` が真のときだけ
   `console.log` を呼ぶ。`settings.js` に `get_debug_query()` を追加
   （`URLSearchParams(...).has("debug")`）。確認済み
2. `ScoreButton` の `player` 引数 — `button.js` のコンストラクタから
   `player` 引数を削除し、`board.js` の呼び出し（`score_btn` の中）から
   `0` の実引数を削除。`git grep "player: player}"` は残り 7 箇所すべて
   `clock.js` / `checker.js` / `label.js`（`Score` 系）/ `button.js`
   （`EmitButton` 系）/ `base.js` / `dice.js` で、`ScoreButton` 系は
   含まれない
3. `PlayerScore.on_mouse_down_xy()` を削除。`ui/label.js` に
   `this.el.style.pointerEvents = "none";` を追加（表から外れた項目、
   下記「4. 壊して確かめる」の (a) で効いていることを確認）
4. `Dice.set()` — `this.el.children[0].src` を `this.image_el.src` に変更。
   `git grep "children\[0\]\.src"` は範囲外の `ui/cube.js:93` のみ残る
   （レビューで「範囲外」と明記済み）
5. `RollButton.roll()` の未使用変数 — `let dice = [0,0,0,0];` を削除、
   `const modified = this.check_disable();` を `this.check_disable();` に
   変更。`git grep "let dice = \[0, 0, 0, 0\]"` は 0 件
6. `Checker.is_inner()` を削除。`git grep -n "is_inner" src/` は 0 件
   （残るのは `archives/` の過去の報告と `TODO.md` の表の文字列だけ）
7. `<html lang="jp">` → `<html lang="ja">`。`src/ytbg/webroot/templates/index.html`
   のみ対象。**`ytbg.html`（リポジトリ直下、静的な iframe 一覧ページ）は
   `lang="jp"` のまま**だが、これは指示の対象外（`index.html` としか
   書かれていない）なので範囲外として扱った

`git grep` での消し残しは無い（範囲外と明記済みの `ytbg.html` と
`ui/cube.js:93` を除く）。

## 4. わざと壊して落ちることの確認

いずれも壊す前に `\cp` で `/tmp/.../scratchpad/` へ退避し、確認後に
`\cp` で復元。最後に `git diff --stat` が上記と一致することを確認済み。

### (a) `ui/label.js` の `this.el.style.pointerEvents = "none";` を削除

`node --test tests/browser/clicks.test.mjs` で 3 件が落ちた。

```
✖ スコアの ▲ → set_score {player: 0, score: +1} を送る
  Error: set_score: timeout. last value=[]
✖ スコアの ▼ → set_score {player: 0, score: 0} を送る
  Error: set_score: timeout. last value=[]
✖ スコアの ▲ / ▼ の上に、押せなくする要素が重なっていない
  AssertionError: ボタンが覆われている: {"score_up0":210,"score_down0":126,
  "score_up1":210,"score_down1":126}
```

狙いどおり（▲・▼ を押すテストと、覆いを測るテストの両方が反応した）。

### (b) `log.js` の `if ( DEBUG )` を `if ( true )` に変更

`node --test tests/browser/debug.test.mjs` で 1 件が落ちた（他 2 件は通過）。

```
✖ クエリが無ければ log() は何も出さない (1578.446956ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  49 !== 0
```

### (c) `settings.js` の `get_debug_query()` が常に `false` を返すようにする

`node --test tests/browser/debug.test.mjs` で 2 件が落ちた（1 件は通過）。

```
✖ ?debug を付けると log() が出る (1158.510782ms)
  AssertionError [ERR_ASSERTION]: console.log が出ていない: 0
✖ 他のクエリと並んでいても読める (1088.024802ms)
  AssertionError [ERR_ASSERTION]: console.log が出ていない: 0
```

## 5. 復元の確認

3 通りの壊し方それぞれで `\cp` により元のファイルへ戻し、`diff` で
バイト単位の一致を確認した。最終的な `git diff --stat` は 1 節の表と
一致し、余分な差分は残っていない。

## 確かめられなかったこと・判断が要る点

- `ytbg.html` の `lang="jp"` は指示の対象に入っていない（指示は
  `index.html` のみ）。直すかどうかは管理者の判断が要る（reviewer は
  言及していない）
- `uv run mypy src` と `uv run basedpyright` は今回の変更が JS と
  テンプレートのみなので実施していない（Python の変更が無いため）。
  必要なら追加で走らせる
- レビュー報告にある「▼ を押すテストが無い」という指摘は、今回の
  diff で `#score_down0` を押すテストとして追加済みであることを確認した
