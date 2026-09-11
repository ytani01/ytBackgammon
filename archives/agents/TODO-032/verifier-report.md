# TODO-032 確認報告（verifier）

## 検証コマンドと終了コード

すべて通った。

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 229 passed |
| `uv run ruff check .` | 0 | All checks passed |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | 59 tests, pass 59 |
| `node --test tests/browser/` | 0 | 44 tests, pass 44（1 回のみ実行） |

## 変更ファイルと指示の範囲

`git status` / `git diff --stat` で確認。

- `src/ytbg/history.py` / `src/ytbg/message.py` / `src/ytbg/server.py` —
  指示どおりの実装（`NO_HISTORY_TYPES`、`on_json()` のガード、
  `History.add()` の重複排除）
- `src/ytbg/webroot/static/js/board.js` / `ui/clock.js` —
  `emit_set()` を常に `false` で送るよう変更
- `CLAUDE.md` — 「状態と通信」節に 1 段落追記。指示の範囲内
- `TODO.md` — 進行中項目の記録（内容は未読だが、他ファイルと矛盾しない）
- `tests/conftest.py` / `tests/test_history.py` / `tests/test_message.py` /
  `tests/test_clock.py` / `tests/test_replay.py` / `tests/test_on_json.py` /
  `tests/browser/clicks.test.mjs` — テストの追加・置き換え

指示に無いファイルの変更は見当たらない。範囲は指示と一致している。

## 2. 「盤面系は今までどおり」が壊れていないか

`tests/test_on_json.py` の該当箇所を読んだ。

- `test_history_true_appends_one_entry`（`set_score`、`history: True`）と
  `test_history_false_does_not_append`（同、`history: False`）は
  **今回の diff で変わっていない**（`git diff` に出てこない）。
  盤面系（`set_score` を代表として）が `history: true` で 1 件積まれる
  ことは、変更前からある既存テストがそのまま担保している
- `put_checker` / `dice` / `set_turn` / `cube` / `set_playername` / `resign`
  については、`history: True` で 1 件積まれることを個別に確かめる
  テストは無い（`history: False` の単体テストのみ）。これは今回の
  変更で失われたのではなく、**元々そうだった**（diff に含まれない
  既存の構成）。`NO_HISTORY_TYPES` に入っていない type なら
  `if m.history and m.type not in NO_HISTORY_TYPES:` の分岐を通るので
  実装上は問題ないはずだが、個別 type ごとの「積まれる」確認は
  `set_score` の代表 1 件に留まる点は指摘しておく（深刻度: 低。
  設計上は type 共通の同じ分岐を通るため、個別に確かめる必要性は
  薄いという判断もありうる）

## 3. 足したテストが、変更を戻すと落ちるか（自分で確認）

3 通りとも、実装担当の報告どおりに再現した。確認後はすべて
`git diff --stat` で元の差分に戻ったことを確認済み。

### (1) `server.py` の `NO_HISTORY_TYPES` ガードを外す
`if m.history and m.type not in NO_HISTORY_TYPES:` → `if m.history:` に戻して
`uv run pytest` を実行。

```
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[set_clock_limit-data0]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[set_player_clock-data1]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[set_clock_switch-data2]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[start_clock-data3]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[resume_clock-data4]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[stop_clock-data5]
FAILED tests/test_clock.py::test_clock_types_skip_add_history_call[reset_clock-data6]
7 failed, 222 passed, 1 warning in 2.36s
```

（`test_clock_types_do_not_append_history` は `History.add()` 側の
重複排除だけで結果的に通ってしまうため落ちない。これは実装担当の
報告にある「機能が重なっている」ことの裏付けで、
`test_clock_types_skip_add_history_call` を別に足した判断は妥当）

### (2) `history.py` の重複排除の判定を外す
`if len(self._history) > 0: ... return False` のブロックを削除して
`uv run pytest tests/test_history.py tests/test_clock.py` を実行。

```
FAILED tests/test_history.py::test_history_add_skips_same_entry - assert True is False
FAILED tests/test_history.py::test_history_add_skips_same_entry_keeps_fwd_hist
2 failed, 46 passed in 0.27s
```

### (3) `ui/clock.js` の `emit_set` を `true` で送るよう戻す
`emit_msg(..., false)` → `emit_msg(..., true)` に戻して
`node --test tests/browser/clicks.test.mjs` を実行。

```
✖ ヘッダ 持ち時間 (分) → set_clock_limit {index: 0} を送る
  AssertionError: set_clock_limit: history / true !== false
✖ ヘッダ 持ち時間 (秒) → set_clock_limit {index: 1} を送る
  AssertionError: set_clock_limit: history / true !== false
EXIT=1
```

いずれも、戻した後に `\cp` でファイルを元に戻し、`git diff --stat` が
壊す前と同じ内容であることを確認した。最後に `uv run pytest` を
再実行し、229 passed に戻っていることも確認済み。

## 4. テストの書き換えで、元々見ていたことが失われていないか

`tests/conftest.py` の `add_history` フィクスチャと、
`tests/test_history.py` / `test_on_json.py` / `test_replay.py` /
`test_clock.py` での置き換え箇所を読んだ。

- `add_history(bg_server)` は「呼ぶたびに `game_num` を 1 増やしてから
  `bg_server.add_history()` を呼ぶ」だけのラッパーで、**確認したい
  こと（`hist_len0 + N` 件積まれる、`sn` が振り直される、`fwd_hist` が
  空になる等）の assert 自体はどのテストも変えていない**。
  `bg_server.add_history(bg_server._gameinfo)` を 2 回呼んでいた
  箇所を `add_history(bg_server)` 2 回に機械的に置き換えているだけで、
  assert の弱化は見当たらない
- `game_num` を書き換える副作用が他のテストの判定とぶつからないか
  確認した。`test_on_json.py` の `test_new_keeps_score_playername_
  limit_and_resets_board` は `game_num` を直接アサートしているが、
  この節は `add_history` フィクスチャを使っていないので影響しない
  （実装担当の報告どおり）
- `tests/test_history.py` の新規 3 件（`test_history_add_skips_
  same_entry` 系）は `History` を直接使い、`hist.add()` の戻り値
  （`True`/`False`）と `len(hist.entries)` / `len(hist.fwd_entries)`
  を見ている。重複排除の 3 パターン（積まない・`fwd_hist` を保つ・
  盤面が変われば積む）をそれぞれ独立に確認しており、意味のある
  カバレッジと判断した
- `tests/test_clock.py` の `test_clock_types_do_not_append_history`
  （件数を見る）と `test_clock_types_skip_add_history_call`
  （`add_history` 呼び出し自体を monkeypatch で見る）は、上の (1) の
  検証で示したとおり、狙いが異なる別の壊れ方をそれぞれ検出できている

## 確かめられなかったこと・判断が要る点

- `TODO.md` の内容そのものは読んでいない（書式や整合性のみ範囲チェック
  対象外と判断）
- 「2」で述べたとおり、`put_checker` / `dice` / `set_turn` / `cube` /
  `set_playername` / `resign` の各 type について、`history: True` で
  1 件積まれることを**個別に**確かめるテストは無い（`set_score` の
  代表 1 件のみ）。これは今回の変更で失われたものではなく元々の
  構成だが、指示 2 の「今までどおり」の確認としては、代表 1 件だけで
  足りるかどうかは判断が要る（型で分岐を共有しているため実装上のリスクは
  低いと考えるが、テストの網羅性としては薄い）

---

## 追記: レビューで見つかった 2 件のバグ修正の再確認

`implementer-report.md` 末尾の追記（New Game で `_fwd_hist` を必ず捨てる、
`set_clock_limit` / `new_game()` で `save_data()` を呼ぶ）を確認した。
`git stash` は使わず、`\cp` でのバックアップと直接書き換えで確認した。

### 検証コマンド（すべて通った）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 233 passed |
| `uv run ruff check .` | 0 | All checks passed |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | 59 tests, pass 59 |
| `node --test tests/browser/` | 0 | 44 tests, pass 44（1 回のみ実行） |

### 直しを戻すと足したテストが落ちるか（自分で確認）

3 通りとも、`src/ytbg/history.py` または `src/ytbg/server.py` を
`\cp` でバックアップしてから直接編集し、確認後に `\cp` で戻した。
毎回 `git diff --stat` が修正後と同じ（15 ファイル、417 insertions /
65 deletions）であることを確認済み。

**(1) `History.add()` を「積まないときは `_fwd_hist` を捨てない」旧実装に戻す**

```
FAILED tests/test_history.py::test_history_add_skips_same_entry_but_clears_fwd_hist
FAILED tests/test_on_json.py::test_new_after_back_all_clears_fwd_hist - AssertionError:
  assert bg_server._hist.fwd_entries == []
  Left contains one more item: GameInfo(sn=2, ...)
2 failed, 60 passed in 0.85s
```

**(2) `_on_set_clock_limit()` の `save_data()` を外す**

```
FAILED tests/test_save_load.py::test_set_clock_limit_is_saved - assert [120, ...] == [111, ...]
1 failed, 34 passed in 0.14s
```

**(3) `new_game()` の `save_data()` を外す**

```
FAILED tests/test_save_load.py::test_new_game_saves_clock_reset -
  assert [[10.0, 2.0], [10.0, 2.0]] == [[120, 12], [120, 12]]
1 failed, 34 passed in 0.14s
```

いずれも狙った箇所だけを戻したとき、狙ったテストだけが落ちた。

### 前回通っていたことが壊れていないか

`tests/test_on_json.py::test_history_true_appends_one_entry` /
`test_history_false_does_not_append`（`set_score` を代表に、盤面系が
`history: true` で 1 件積まれる／`history: false` では積まれないこと）は
今回も変更されておらず、単体で実行して通ることを確認した（2 passed）。

### テスト内容の確認

`git diff tests/test_history.py tests/test_on_json.py tests/test_save_load.py`
を読んだ。

- `History.add()` の戻り値の意味変更（「積んだか」→「履歴が変わったか」）に
  合わせて、`test_history_add_skips_same_entry_but_clears_fwd_hist` は
  戻り値が `True` になることと `fwd_entries == []` の両方を見ている。
  対になる `test_history_add_when_board_changes_clears_fwd_hist` も
  新規に足されており、「積む場合」「積まないが捨てる場合」の両方を
  カバーしている
- `test_new_after_back_all_clears_fwd_hist` は、盤面を初期配置に戻した
  状態で New Game を送る（`add_history()` が積まない条件）ことを
  明示的に作り、`fwd_entries == []` に加えて `fwd_all` しても前のゲームの
  手が復活しないことまで確かめている。バグの実際の症状（「進む」を
  押すと前のゲームの手が戻る）に対応した検証になっている
- `test_new_game_saves_clock_reset` は、`set_player_clock` だけでは
  盤面が変わらず `add_history()` が保存しないケースになることを
  避けるため、`back` で明示的に保存点を作ってから New Game を送る形に
  なっている（報告どおりの意図）
- いずれも assert の弱化は見当たらない

### 判断が要る点

前回報告と同じ（盤面系の一部 type は `set_score` の代表 1 件でしか
`history: true` の挙動を確かめていない）。今回の修正はこの点に影響しない。
