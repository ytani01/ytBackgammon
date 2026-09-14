# TODO-059 確認の依頼（verifier）

## 目的

TODO-059（`TODO.md` の節）で、盤面の参照と操作の判定・予測を `rules/` の純粋関数へ移し、
目が 0 のダイスを 0 のままにした。**検証が通るか、指示どおりの範囲か、足したテストが狙ったものを
見ているか**を確かめる。コードは直さず、見つけたことを報告する。

- 依頼: `archives/agents/TODO-059/implementer-request.md`
- 実装の報告: `implementer-report.md`、`implementer-report-2.md`（同じディレクトリ）
- レビューの報告: `reviewer-report.md`（指摘 3 は直さないと決めた）
- 差分: `git diff` と未追跡のファイル（`git status`）

## 確かめること

1. **検証の一式を 1 回ずつ走らせ、終了コードを記録する。**
   `uv run pytest`、`node --test tests/js/`、`node --test tests/browser/`、
   `uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`。
   ブラウザのテストは 1 回でよい。**フォアグラウンドで、Bash の timeout を 300000 ms に伸ばす**
   （バックグラウンドで走らせると完了の通知が届かず、止まってしまう）
2. **範囲。** 変わったのが `src/ytbg/webroot/static/js/`（`actions.js`・`board.js`・`rules/`）、
   `tests/js/`、`tests/browser/helper.mjs`、`docs/Developer.md`、`archives/agents/TODO-059/` だけであること。
   サーバ（`src/ytbg/*.py`）が変わっていないこと。`tests/browser/*.test.mjs` の差分がコメントだけであること
3. **目が 0 のダイスのテストが、直す前のコードで落ちること。**
   `src/ytbg/webroot/static/js/rules/move.js` の `usable_dice()` のバーの分岐を、変更前
   （`git show HEAD:src/ytbg/webroot/static/js/rules/move.js` の `dice_vals.map(() => false)`）に戻して
   `node --test tests/js/` を走らせ、0 のダイスのテスト（`move.test.mjs` 1 件、`actions.test.mjs` 2 件）が
   落ちることを見る
4. **次の壊し方で、`node --test tests/js/` が落ちること。** 1 つずつ壊して走らせ、戻す
   - `rules/position.js` の `checker_order()` のソートを `b.idx - a.idx` にする
   - `rules/actions.js` の `plan_move()`（または `predict_moves()`）で、渡された gameinfo を複製せずに書き換える
   - `rules/actions.js` の `can_hold_cube()` で、ダイスが出ているかの判定を消す
   - `rules/actions.js` の `plan_score()` の上限（`SCORE_MAX`）を見ないようにする
5. **予測の差し替えがブラウザテストで効いていること。** `tests/browser/helper.mjs` の
   `fail_prediction()` の中身を何もしない関数にして `node --test tests/browser/predict.test.mjs` を走らせ、
   落ちることを見る（フォアグラウンド、timeout 300000 ms）
6. **壊したものは必ず元に戻し、最後に `git diff --stat` が確認を始める前と同じであることを見る。**
   `git stash` や `git checkout` は使わない（未コミットの実装が消える）。壊すときは Edit で書き換え、
   Edit で戻す

## 報告

`archives/agents/TODO-059/verifier-report.md` に、走らせたコマンドと終了コード、落ちたものは出力のまま、
壊した内容と落ちたテスト（落ちなかったものはそのまま）、範囲の確認結果を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
