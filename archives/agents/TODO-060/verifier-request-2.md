# TODO-060 確認の依頼 2 回目（verifier）

3 巡目（`archives/agents/TODO-060/implementer-report-3.md`）で、`tests/browser/helper.mjs` に `wait_still()` と
`shown_banners()`、`drag.test.mjs` に待ち、`rules.test.mjs` にバナーのテスト 2 件を足した。`src/` は変わっていない。
コードは直さない。

## やること

1. 検証の一式を 1 回ずつ走らせ、終了コードと件数を記録する（ブラウザのテストも 1 回。繰り返さない）
   - `uv run pytest`、`uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`、`node --test tests/js/`、
     `node --test tests/browser/`（timeout 600000。見込み 99 件）
2. 足した 2 件が狙いどおり落ちるかは実装担当が確かめ済みなので、ここでは繰り返さない
3. `git status` で、前回の報告（`verifier-report.md` の 4）から増えた変更が上の 3 ファイルと `CLAUDE.md` だけかを見る

## 報告

`archives/agents/TODO-060/verifier-report-2.md` に書く。返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
