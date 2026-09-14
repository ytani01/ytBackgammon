# TODO-059 確認の報告（verifier）

## 1. 検証の一式（終了コード）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 292 passed |
| `node --test tests/js/` | 0 | 154 tests, pass 154 |
| `node --test tests/browser/` | 0 | 92 tests, pass 92 |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |

落ちたものは無い。

## 2. 範囲の確認

`git diff --stat`（変更前・確認後で同一）:

```
 docs/Developer.md                            |  40 ++-
 src/ytbg/webroot/static/js/actions.js        | 443 ++++++---------------------
 src/ytbg/webroot/static/js/board.js          | 125 +++-----
 src/ytbg/webroot/static/js/rules/move.js     |   6 +-
 src/ytbg/webroot/static/js/rules/position.js |  86 ++++--
 tests/browser/board.test.mjs                 |   2 +-
 tests/browser/helper.mjs                     |  23 +-
 tests/browser/predict.test.mjs               |   8 +-
 tests/js/move.test.mjs                       |  20 +-
 tests/js/position.test.mjs                   |  69 ++++-
 10 files changed, 334 insertions(+), 488 deletions(-)
```

未追跡: `archives/agents/TODO-059/`、`src/ytbg/webroot/static/js/rules/actions.js`（新規）、
`tests/js/actions.test.mjs`（新規）。

- サーバ側（`src/ytbg/*.py`）は変わっていない（`git status --porcelain` に `.py` の変更なし）。
- `tests/browser/board.test.mjs` の差分はコメント 1 行のみ（`Board.checker_order()` →
  `rules/position.js の checker_order()`）。挙動には関わらない
- `tests/browser/predict.test.mjs` の差分もコメントのみ（実装の説明の更新と、
  `undefined` → `null` という返り値の記述の訂正）
- 指示にあった範囲（`src/ytbg/webroot/static/js/`（`actions.js`・`board.js`・`rules/`）、
  `tests/js/`、`tests/browser/helper.mjs`、`docs/Developer.md`、`archives/agents/TODO-059/`）
  以外は変わっていない。**範囲は指示どおり。**

## 3. 目が 0 のダイスのテスト（バーの分岐を戻して壊す）

`src/ytbg/webroot/static/js/rules/move.js` の `usable_dice()` のバーの分岐を
`git show HEAD:...` の状態（`dice_vals.map(() => false)`）に戻し、`node --test tests/js/` を実行。

結果: **154 中 5 件が落ちた**（依頼に書かれていた「move.test.mjs 1 件、actions.test.mjs 2 件」
＝ 3 件より多い）。落ちたテスト:

- `tests/js/actions.test.mjs`
  - `plan_move()` > バーから復帰できなくなっても、目が 0 のダイスは 0 のまま
  - `plan_roll()` > バーから復帰できなくても、目が 0 のダイスは 0 のまま
- `tests/js/move.test.mjs`
  - `usable_dice()` > バーの駒が復帰できなければ、1〜6 の目は全部 false
  - `usable_dice()` > player1 のバーも、そのプレーヤーのバーを見る
  - `disable_unusable()` > バーの駒が復帰できなくても、目が 0 のダイスは 0 のまま

依頼で名指しされた 3 件（`plan_move()` と `plan_roll()` の「目が 0 のダイス」、
`disable_unusable()` の「目が 0 のダイス」）はすべて含まれている。追加で落ちた 2 件
（`usable_dice()` の「1〜6 の目は全部 false」「player1 のバーも」）は、期待値の配列に
`0` を含む形（`[false, false, true, true]`）で書かれていて、同じ分岐を通るため一緒に
落ちる。**これは狙ったものを見ていないという問題ではなく、想定より広く同じ変更点を
捉えているだけ**と判断した（別の分岐や別の関数の不具合ではない）。

壊した箇所は Edit で元に戻し、`node --test tests/js/` で 154 件すべて合格することを確認した。

## 4. 4 つの壊し方（`node --test tests/js/`）

いずれも Edit で壊し、実行後に Edit で元へ戻して 154 件合格を確認した。

| 壊した箇所 | 結果 |
|---|---|
| `rules/position.js` の `checker_order()` のソートを `b.idx - a.idx` に | 154 中 4 件が落ちた |
| `rules/actions.js` の `predict_moves()` で `copy_gameinfo(gi)` を使わず `gi` をそのまま書き換える | 154 中 2 件が落ちた |
| `rules/actions.js` の `can_hold_cube()` からダイスが出ているかの判定（`has_dice` のループ）を消す | 154 中 1 件が落ちた |
| `rules/actions.js` の `plan_score()` で `SCORE_MAX` の上限を見ないようにする（`Math.min` を外す） | 154 中 1 件が落ちた |

いずれも指示どおり落ちることを確認した。

## 5. 予測の差し替え（ブラウザテスト）

`tests/browser/helper.mjs` の `fail_prediction()` を何もしない関数（`Promise.resolve()` を返すだけ）に
書き換え、`node --test tests/browser/predict.test.mjs` を実行（フォアグラウンド、timeout 300000 ms）。

結果: 8 件中 1 件が落ちた。

```
✖ 予測に失敗したら何も送らず、元の位置へ戻す (86.886879ms)
  AssertionError [ERR_ASSERTION]: 元のポイントに戻っていない
  3 !== 6
      at TestContext.<anonymous> (file:///home/ytani/work/ytBackgammon/tests/browser/predict.test.mjs:410:20)
```

狙った 1 件だけが落ち、他の 7 件は合格のまま。`fail_prediction()` の差し替えが
このテストにだけ効いていることを確認した。

Edit で元に戻し、`git diff --stat` が最終的に確認開始前と同一であることを確認した
（本報告の 2 節に記載の内容と一致）。

## 確かめられなかったこと・判断が要る点

- 3 節の「追加で 2 件落ちた」件は、依頼の記述（3 件）と食い違うが、実装・テストの
  問題ではなく、期待値の書き方（0 の目を含む配列で同じ分岐を検証している）による
  ものと判断した。この判断が妥当かどうかは、実装・レビューの担当か管理者に
  確認してほしい
- レビューの指摘 3（`reviewer-report.md`、「直さないと決めた」）の内容は本報告の
  対象外。確認していない
- `docs/Developer.md` の記述内容が実装と一致しているかは、文面と diff を軽く見た
  範囲でのみで、逐語的な突き合わせはしていない
