# TODO-044 確認の報告

## 1. 範囲

変更されたファイルは以下の 5 つのみ（`git status --porcelain`）。
`archives/agents/TODO-044/` は今回自分が作った報告置き場のみで、他に
未追跡ファイルは無い。指示どおりの範囲。

- `src/ytbg/webroot/static/js/board.js`
- `src/ytbg/webroot/static/js/ui/checker.js`
- `src/ytbg/webroot/static/js/ui/point.js`
- `tests/browser/board.test.mjs`
- `tests/browser/predict.test.mjs`

テスト 2 ファイルの diff を 1 行ずつ確認した。すべて
`board.point[p].checkers.length` → `board.checkers_at(p).length`、
`board.point[p].checkers.slice(-1)[0]` → `board.top_checker(p)` という
API 名の置き換えのみ。assert の中身・期待値・比較演算子は変わっていない。
期待値を緩めた箇所は無い。

## 2. 検証（各 1 回）

| コマンド | 結果 |
|---|---|
| `node --test tests/browser/` | 54 pass / 0 fail |
| `node --test tests/js/` | 99 pass / 0 fail |
| `uv run pytest` | 227 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |

すべて implementer の報告と一致。

## 3. `.checkers` の消滅確認

```
git grep -n "\.checkers" -- ':!*rules/*' -- ':!archives/*'
```
出力なし。`BoardPoint.checkers` を含め、`rules/` の `Position` 以外に
`.checkers` は残っていない。

## 4. `emit_put_checker()` の `idx`

`git show HEAD:src/ytbg/webroot/static/js/board.js` の変更前は
`idx = this.point[p].checkers.length`。この `this.point[p].checkers` は
`apply()` の中で `gameinfo` から作り直される配列で、`apply()` 以外の
場所で増減しない（`add()` の `push` を呼ぶのは `apply()` の 1 か所のみ）。
新しい `idx = this.checkers_at(p).length` も同じ `gameinfo` を同じ規則
（`checker_order()`）で並べて point で絞ったものなので、値は変わらない。
実装報告の説明と食い違いは見当たらない。

## 5. わざと壊す（3 パターン、実施後すべて元に戻し済み）

### (a) `top_checker()` が「いちばん下」を返す
`slice(-1)[0]` → `[0]` に変更。

**落ちた。** 3 件 fail（`node --test tests/browser/`）。
- `チェッカーをドラッグできる`
- `2 枚目のタブに同期する`
- `予測が外れても、サーバの gameinfo で表示が戻る`

implementer の報告と件数・テスト名とも一致。

### (b) `apply()` の配り直しで、ポイントごとの枚数を数えず常に `0` を渡す
`this.point[e.point].add(e.ch, n_at[e.point], sec)` を
`this.point[e.point].add(e.ch, 0, sec)` に変更（`n_at` の更新はそのまま
残した。参照されなくなるだけ）。

**落ちなかった。** `node --test tests/browser/` は 54 件すべて通った。

これは implementer が試した「ソートを外す」（項目 5 の(2)）とは別の壊し方で、
依頼の指示どおりに実施したもの。**指摘: 積む位置 `n`（重なり順・z-index の
基準）が常に 0 になっても、どのテストも検出しない。** 表示上は全チェッカーが
同じ位置に重なって描かれるはずだが、テストは `checkers_at(p).length`
（そのポイントの枚数）や `top_checker(p)`（`idx` で決まる先端の駒）しか
見ておらず、`n`（呼ぶ順）そのものは見ていないため。

### (c) `Board.position()` のガードを外し、`this.gameinfo` が
`undefined` でも `Position.from_gameinfo()` を呼ぶ

**落ちなかった。** `node --test tests/browser/` も `node --test tests/js/`
も全件通った。

`position()` は `pip_count()` / `winner_is()` / `all_inner()` から呼ばれるが、
これらはどのテストでも `apply()` が一度も走らないうちには呼ばれていない
ため、`this.gameinfo === undefined` の分岐そのものが実行されない。
`Position.from_gameinfo(undefined)` が実際に例外を投げるかどうかは
未確認（呼ばれていないので判定できない）。

いずれも確認後、`git diff --stat` が壊す前と同一であることを確認して
元に戻した。

## 確かめられなかったこと・判断が要る点

- (b) と (c) は、実装が「意図どおりに動いている」ことをどのテストも
  積極的には保証していない、という意味の指摘であり、実装そのものが
  誤っているという指摘ではない。テストを足すかどうかは管理者の判断に
  委ねる（(b) は表示の重なり順、(c) は `gameinfo` が無い初期状態での
  `position()` の呼び出し）
- `Position.from_gameinfo(undefined)` が実際に投げる例外の種類・
  メッセージまでは確認していない（呼ばれる経路が無いため）
