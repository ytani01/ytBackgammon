# TODO-058 確認の依頼（verifier）

## 目的

TODO-058（`TODO.md` の節）で、ブラウザテストがページの中の `board` を触る箇所を
`tests/browser/helper.mjs` の関数に集めた。**テストの意味（何を検出するか）を変えずに**
移せているか、指示どおりの範囲かを確かめる。コードは直さず、見つけたことを報告する。

依頼の内容は `archives/agents/TODO-058/implementer-request.md`、実装の報告は
`archives/agents/TODO-058/implementer-report.md`。差分は `git diff`（未コミット）。

## 確かめること

1. **検証の一式を 1 回ずつ走らせ、終了コードを記録する。**
   `uv run pytest`、`node --test tests/js/`、`node --test tests/browser/`、
   `uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`。
   ブラウザのテストは 1 回でよい（1 回およそ 20 秒。timeout は伸ばすこと）
2. **範囲。** `src/` が変わっていないこと。変わったのが `tests/browser/` と
   `docs/Developer.md` だけであること
3. **テスト本体に `board` への参照が残っていないこと。**
   `grep -nE '(^|[^.\w])board(\.|\[|\))' tests/browser/*.test.mjs`
4. **テストが弱まっていないこと。** `git diff` で変える前と比べ、
   assert が消えた・条件が緩んだ・読むタイミングが変わって検出できなくなった箇所が
   無いかを見る。特に実装の報告の「分けたもの」の節（evaluate を複数に分けた箇所、
   待ちの中で読む値を減らした箇所）は、分けても意味が変わらないという判断が
   正しいかを確かめる
5. **helper の関数を壊すと、狙ったテストが落ちること。** 少なくとも次を、
   helper の中（または `src/` 側）をわざと壊して、対象のテストファイルだけを
   走らせて確かめる。**確かめたら必ず元に戻し、`git diff src/` が空であることを最後に見る**
   - `gameinfo()` が古い値を返す、など盤面を読む関数
   - `apply_gameinfo()` / `effects_of_apply()`（受信の差し替え）
   - `record_apply()` / `corrupt_prediction()` / `fail_prediction()`（予測の観測）
   - `dragging()` / `drop_cube_while_holding_checker()`
   - `judge()` の `patch` を戻さない、など後始末
   壊し方は各自で選んでよい。落ちなかったものは、そのまま報告する
   （1 回の実行で見ればよい。10 回連続は要らない）
6. `docs/Developer.md` に足した説明が、今の helper と合っていること

## 報告

`archives/agents/TODO-058/verifier-report.md` に、走らせたコマンドと終了コード、
落ちたものは出力のまま、壊した内容と落ちたテスト、弱まった疑いのある箇所（ファイル:行と理由）を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
