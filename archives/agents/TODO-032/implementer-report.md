# TODO-032 実装報告（implementer）

## 変更したファイル

### サーバ

- `src/ytbg/message.py:193-206` — `NO_HISTORY_TYPES`（frozenset）を追加。
  クロック系 7 つの type（`set_clock_limit` / `set_player_clock` /
  `set_clock_switch` / `start_clock` / `resume_clock` / `stop_clock` /
  `reset_clock`）。
- `src/ytbg/server.py:24-25`（import）、`server.py:543-545`（`on_json()` 末尾）
  — `if m.history and m.type not in NO_HISTORY_TYPES:` に変更。
- `src/ytbg/history.py:48-78`（`History.add()`）— 積む前に、直前のエントリと
  `sn` を除いて比較し、同じなら `_fwd_hist` を捨てず・`sn` も振り直さずに
  `False` を返すようにした。

### クライアント

- `src/ytbg/webroot/static/js/ui/clock.js:39-51`
  （`ClockLimit.emit_set()`）— `add_hist` 引数を削除し、常に `false` で送る。
- `src/ytbg/webroot/static/js/board.js:488`
  （`Board.apply_clock_limit()`）— `emit_set(index, limit, true)` →
  `emit_set(index, limit)`。

### CLAUDE.md

- 「状態と通信」の節（301 行付近）に、クロック系が積まれないことと、
  同じエントリが積まれないことを 1 段落で追記（`（TODO-032）` 参照）。

### テスト

- `tests/conftest.py` — フィクスチャ `add_history` を追加。
  `bg_server._gameinfo.game_num` を 1 増やしてから `add_history()` を呼ぶ
  ラッパー。既存テストの「同じ盤面のまま繰り返し積む」呼び出しを
  この形に置き換えた（`tests/test_on_json.py` の該当箇所、
  `tests/test_history.py` の一部、`tests/test_replay.py` の
  `make_history()` は関数自体を同じ方針で書き換え）。
- `tests/test_history.py` — 新規 3 件
  （`test_history_add_skips_same_entry` /
  `test_history_add_skips_same_entry_keeps_fwd_hist` /
  `test_history_add_adds_when_board_changes`）。`History` を直接使い、
  同じ盤面は積まない・`_fwd_hist` を捨てない・盤面が変われば積む、を見る。
- `tests/test_message.py` — `test_no_history_types_are_known_types`
  （`NO_HISTORY_TYPES <= set(DATA_TYPES)`、ruff の指摘で
  `set(DATA_TYPES) >= NO_HISTORY_TYPES` に自動整形）。
- `tests/test_clock.py` — `test_clock_is_not_in_history` を 1 手ぶん
  変えてから積むよう調整。新規 2 件
  （`test_clock_types_do_not_append_history`：クロック系 7 つを
  `history: True` で送っても履歴の件数が増えないこと。
  `test_clock_types_skip_add_history_call`：`bg_server.add_history` を
  monkeypatch して、`on_json()` がそもそも呼んでいないことを直接見る。
  `History.add()` 自身の重複排除と切り分けるため）。
- `tests/browser/clicks.test.mjs:305-306, 317-318` —
  `set_clock_limit` の期待する `history` 引数を `true` → `false`。

## 検証結果

- `uv run pytest` — 229 passed
- `uv run ruff check .` — All checks passed（import 順と Yoda 条件を
  `--fix` で自動整形）
- `uv run mypy src` — Success: no issues found in 12 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- `node --test tests/js/` — 59 tests, pass 59
- `node --test tests/browser/` — 44 tests, pass 44（1 回のみ実行）

## わざと壊して確認したこと

- `src/ytbg/history.py` の変更を一時的に戻す → `test_history.py` の
  新規 2 件が `assert True is False` で失敗することを確認
- `src/ytbg/server.py` の変更（`NO_HISTORY_TYPES` によるガード）を
  一時的に戻す → `test_clock_types_skip_add_history_call` の 7 件が
  すべて失敗することを確認（`History.add()` 自身の重複排除だけでは
  この呼び出し自体の有無を検出できないため、この専用テストを追加した）
- `src/ytbg/message.py` の変更を戻す → `test_message.py` が
  `ImportError` で収集エラーになることを確認

いずれも確認後、`git stash pop` で元に戻した。

## 判断が要る点・残る懸念

- `History.add()` の「同じ盤面なら積まない」判定と、`server.py` の
  `NO_HISTORY_TYPES` によるガードは、クロック系 7 つの type に関しては
  常に同じ結果になる（クロック系は gameinfo を書き換えないので、
  積もうとする時点で必ず直前と同じになるため）。両方入れるのは
  決めたことの通り（表による明示的な決定＋一般的な重複排除の二重の
  備え）だが、機能としては重なっている。指示どおりの実装のため
  そのままにした
- `add_history` フィクスチャは `game_num` を目印として使っている。
  `game_num` を別の目的（New Game 後のゲーム番号）に使うテストとは
  ぶつからないことを確認済み（`test_on_json.py` の `game_num` 関連の
  アサーションは、このフィクスチャを使っていない箇所のみ）
- 範囲外の指摘は無し

---

## 追記: レビューで見つかった 2 件のバグの修正

レビュー報告（`archives/agents/TODO-032/reviewer-report.md`）の「要修正 1」
「要修正 2」と、関連する指摘（検討 1・検討 4・好みの範囲）に対応した。

### 直したもの 1. New Game が進む側の履歴を捨てなくなった

- `src/ytbg/history.py:48-95`（`History.add()`）—
  「積まないときは `_fwd_hist` を捨てない」という前回の判断を撤回し、
  **積む・積まないに関わらず `_fwd_hist` を必ず捨てる**ように変更。
  戻り値の意味を「積んだか」から「履歴が変わったか（保存が要るか）」に
  変更（積まなくても `_fwd_hist` を捨てた＝空でなかったときは `True`）。
  docstring も書き直した
- `src/ytbg/server.py:120-139`（`new_game()`）— `add_history()` の直後に
  `save_data()` を明示的に呼ぶよう追加（理由をコメントに残した。
  下記「直したもの 2」と合わせて）

### 直したもの 2. `set_clock_limit` がファイルに保存されなくなった

- `src/ytbg/server.py:459-476`（`_on_set_clock_limit()`）— 末尾に
  `save_data()` を追加。`_on_set_clock_switch()` と同じ理由をコメントに
  残した
- `new_game()` のクロックのリセット（`_clock.reset(0)/reset(1)`）が
  保存されない件も、上記の `new_game()` の `save_data()` 追加で解決
  （`add_history()` の保存と二重になるが、New Game はまれな操作なので
  許容とコメントに明記）
- `set_player_clock` と start/stop/resume/reset_clock は指示どおり
  触っていない

### テスト

- `tests/test_on_json.py` — `test_new_after_back_all_clears_fwd_hist`
  を新規追加。1 手動かして積み、`back_all` で初期配置まで戻して進む側を
  作ってから New Game を送り、進む側が空になること・`fwd_all` しても
  前のゲームの手が戻らないことを見る
- `tests/test_history.py` —
  `test_history_add_skips_same_entry_keeps_fwd_hist` を
  `test_history_add_skips_same_entry_but_clears_fwd_hist` に書き換え
  （進む側を必ず捨てる・戻り値が `True` になることを見る形に）。
  対になるテスト `test_history_add_when_board_changes_clears_fwd_hist`
  を新規追加（盤面が違えば積んで、進む側も捨てることを見る。検討 1 の
  指摘への対応）。`test_history_add_adds_when_board_changes` の
  docstring を、実際に見ている内容（`sn` 以外にも違いがあれば積む。
  `game_num` は盤面ではない）に合わせて書き直した（好みの範囲の指摘）
- `tests/test_save_load.py` — `test_set_clock_limit_is_saved`
  （`set_clock_limit` のあとファイルに新しい `limit` が書かれていること）、
  `test_new_game_saves_clock_reset`
  （board を変えずに `back` で残り時間をファイルへ保存させてから
  New Game を送り、ファイルの `clock` が `limit` に戻っていることを見る。
  最初 `set_player_clock` だけで組んだところ、盤面が変わらないままだと
  `add_history()` が保存しないので、修正前の実装でも通ってしまう
  （検証していない）ケースになっていたため、`back` で明示的に保存点を
  作る形に直した）を新規追加
- `tests/test_on_json.py` の 5 関数
  （`test_back_all_leaves_one_entry` / `test_back2_behaves_like_back_all` /
  `test_fwd2_behaves_like_fwd_all` / `test_clear_hist_leaves_one_entry` /
  `test_back_moves_hist_i_by_n`）と `tests/test_clock.py` の
  `test_clock_types_skip_add_history_call` — 今回新たに 78 文字を超えた
  シグネチャ・行を折り返した（検討 4 の指摘。もともと超えていた行は
  触っていない）

### CLAUDE.md

- 「履歴（戻す・進める）」の節に、積まなかったときも進む側は必ず
  捨てることを 1 段落追記（`（TODO-032）` 参照）。「状態と通信」側の
  追記はそのまま

### 検証結果（追記分）

- `uv run pytest` — 233 passed
- `uv run ruff check .` — All checks passed
- `uv run mypy src` — Success: no issues found in 12 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- `node --test tests/js/` — 59 tests, pass 59
- `node --test tests/browser/` — 44 tests, pass 44（1 回のみ実行）

### わざと壊して確認したこと（追記分）

`git stash` は使わず、対象ファイルを直接書き換えて確認し、
バックアップ（`\cp` で `/tmp/` に保存）から戻した。

- `History.add()` を「積まないときは `_fwd_hist` を捨てない」旧実装に
  一時的に戻す → `test_history_add_skips_same_entry_but_clears_fwd_hist`
  と `test_new_after_back_all_clears_fwd_hist` が失敗することを確認
- `_on_set_clock_limit()` の `save_data()` を一時的に外す →
  `test_set_clock_limit_is_saved` が失敗することを確認
- `new_game()` の `save_data()` を一時的に外す →
  `test_new_game_saves_clock_reset` が失敗することを確認
- いずれも確認後、バックアップから元に戻し、`uv run pytest` で
  233 passed を再確認した

### 判断が要る点・残る懸念（追記分）

- 今回の変更で `History.add()` の戻り値が「積んだか」から「履歴が
  変わったか（保存が要るか）」に変わったので、これを呼ぶ側
  （`add_history()`）の挙動もそれに合わせて自然に直った（別途の
  変更は不要だった）
- 範囲外の指摘（検討 2・検討 3・好みの範囲の JSDoc）は、指示どおり
  対応していない
