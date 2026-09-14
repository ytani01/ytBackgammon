# TODO-060 確認の依頼（verifier）

## 目的

`Board`・`actions.js` を `BoardController` / `BoardView` に置き換えた作業ツリーで、検証の一式が通るか、
足したテストが対象を壊したときに落ちるかを確かめる。コードは直さない（壊して試したら必ず戻す）。

## 読むもの

- 依頼と報告: `archives/agents/TODO-060/implementer-request.md`、`implementer-report.md`、`implementer-report-2.md`
- レビュー: `archives/agents/TODO-060/reviewer-report.md`（指摘 3 の確認をこちらで行う）

## やること

1. **検証の一式を 1 回ずつ**走らせ、終了コードと件数を記録する（ブラウザのテストも 1 回。繰り返さない）
   - `uv run pytest`、`uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`
   - `node --test tests/js/`、`node --test tests/browser/`（Bash の timeout を 600000 に伸ばす）
   - 件数の見込み: tests/js 156、tests/browser 97（実装の報告による）
前回の verifier は API の利用上限で途中で止まり、壊し方 a を戻さないまま終わった（main が戻した）。
**壊す前に対象のファイルを scratchpad へ `\cp` で控え、試したらすぐ `\cp` で戻して `cmp` で同じことを確かめる。**
1 つ戻してから次を壊す。

2. **壊して落ちるかを確かめる。** それぞれ壊して、対象のテストファイルだけを走らせ、落ちた出力を引用し、戻す。
   戻したあとは `git diff` で壊す前と同じに戻ったことを確かめる
   - a. Clock のチェックボックス: `board_controller.js` の `set_clock_switch()` で、送る前に Controller の `sw` を書き換える
     → `tests/browser/clock.test.mjs`
   - b. 履歴の返事の `clock_state`: `receive()` で、`clock_state` の `limit` だけを反映する形にする
     → `tests/browser/clock.test.mjs`
   - c. 掴んでいるキューブ: `board_view.js` の、掴んでいるキューブの座標と z を戻す行を消す → `tests/browser/drag.test.mjs`（ファイル全体で走らせる）
   - d. ダイスの傾き: `ui/dice.js` の `Dice.set()` を、前回の角度のまま置く形にする → `tests/browser/last_op.test.mjs`
   - e. DOM なしの Controller: `log.js` を `new URLSearchParams(location.search)` に戻す → `tests/js/controller.test.mjs`
   - f. `history_flag`: `server.py` の `emit_gameinfo()` の `data` に `'history_flag': False` を足す → `uv run pytest tests/test_on_json.py`
3. **レビューの指摘 3 の確認**: `board_view.js` の `render_turn()` で、`closeout()` と `winner_is()` の呼び方を
   それぞれ壊す（例: 常に false を返す形にする）。**`node --test tests/browser/` 全体を 1 回ずつ**走らせ、
   どのテストが落ちるか（落ちなければ落ちないこと）を記録して、戻す
4. `git status` で、変わったファイルが依頼の対象範囲に収まっているかを見る
   （`CLAUDE.md`・`TODO.md`・`docs/design-4.md` は main が直す。`TODO.md` の TODO-063 の節は利用者が足したもの）

## 報告

`archives/agents/TODO-060/verifier-report.md` に、一式の結果（コマンド・終了コード・件数）、
壊した箇所ごとの差分と落ちた出力、指摘 3 の結果、範囲の確認を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
