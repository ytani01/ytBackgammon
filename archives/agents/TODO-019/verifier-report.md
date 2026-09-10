# TODO-019 verifier 報告

## 検証コマンド

- `uv run pytest -q` → **100 passed**（終了コード 0）
- `uv run ruff check .` → **All checks passed!**（終了コード 0）
- `uv run mypy src` → **Success: no issues found in 5 source files**（終了コード 0）

## 変更されたファイル

`git status` / `git diff --stat`（作業ツリー、コミット前）:

- `CLAUDE.md`
- `src/ytbg/webroot/static/ytbg.js`
- `src/ytbg/webroot/templates/index.html`
- `src/ytbg/yt_backgammon_server.py`
- `tests/test_history.py`
- `tests/test_on_json.py`

依頼書の「対象範囲」5 種類とちょうど一致。指示に無いファイルの変更は無い。
（未追跡の `archives/agents/TODO-019/` はこのやり取り自体の成果物）

## 完了条件との突き合わせ

1. **消す範囲**: `clear_history()` は `_fwd_hist = []`、`_history` を
   `[copy.deepcopy(self._bg._gameinfo)]` の 1 件だけにし、`self._bg._gameinfo`
   自体（盤面）は書き換えていない。設計どおり
2. **`sn` を振り直す**: `self._cur_sn = 1` としたうえで
   `self._bg._gameinfo['sn'] = self._cur_sn` してから複製している
3. **`save_data()`**: `clear_history()` の末尾で呼んでいる
4. **`on_json()` の `clear_hist`**: `async with self._replay_lock:` の中で
   `await self._cancel_replay()` → `self.clear_history()` の順。`back` と
   同じ形
5. **`emit_gameinfo()`**: `clear_history()` のあと `await self.emit_gameinfo(0)`
   を呼んでいる。`hist_i = len(_history)`、`hist_n = len(_history) + len(_fwd_hist)`
   の式から、1 件だけ残った状態では 1 / 1 になることをコードで確認した
6. **クライアントの `confirm()`**: `ytbg.js` の `clear_hist()` は
   `nav.checked=false` → `console.log` → `confirm()` が false なら
   `return`（何も送らない）→ true のときだけ `emit_msg("clear_hist", {}, false)`。
   `new_game()` / `back_all()` と同じ形（`nav.checked=false`、
   `emit_msg()` 第 3 引数 `false`）に `confirm()` の分岐を足しただけ
7. **メニューの位置**: `index.html` で「連続で進める(高速)」の `<ul>` の
   直後、New Game の `<ul>` の直前に新しい `<ul id="nav"><li><a ... onClick="clear_hist();">履歴を削除</a></li></ul>`
   を追加。既存の `<ul>` と同じ `id="nav"` の形式で、綴りも「履歴を削除」
   で依頼書の記載と一致

## わざと壊して確認したこと（すべて `src/ytbg/yt_backgammon_server.py` を
一時的に編集し、確認後に元へ戻した。最終的に `git diff` が壊す前と
同一であることを確認済み）

- `clear_history()` から `self._fwd_hist = []` を消す
  → `test_clear_history_leaves_only_current`、`test_clear_hist_leaves_one_entry`、
  `test_clear_hist_stops_running_replay` の 3 件が落ちる（`_fwd_hist` が
  空でないという assertion error）
- `sn` の振り直し（`self._cur_sn = 1` と `self._bg._gameinfo['sn'] = ...`）を
  消す → `test_clear_history_leaves_only_current` が
  `assert 2 == 1` で落ちる
- `self.save_data(self._datafile_path)` の呼び出しを消す →
  `test_clear_history_saves_data` が `assert 3 == 1` で落ちる
  （保存されていない古いファイルを読むため）
- `on_json()` の `clear_hist` 分岐から `async with self._replay_lock: await
  self._cancel_replay()` を外し、`self.clear_history()` だけ直接呼ぶ形に
  する → `test_clear_hist_stops_running_replay` が
  `assert task.cancelled()` で落ちる（Task が止まらない）

壊すたびに、狙ったテストだけが落ちることを確認した（他のテストへの
巻き添えは無かった）。すべて元に戻したあと `uv run pytest -q` で
100 件通ることを再確認済み。

## 確かめられなかったこと・判断が要ること

- ブラウザでの実機確認（`confirm()` のダイアログ表示や、複数クライアントへ
  同時に反映される見た目）は依頼書のとおり行っていない。利用者が確認する
  前提
- 挙動やロジックの妥当性（設計そのものが良いか）は reviewer の領分と
  理解し、ここでは踏み込んでいない

---

## 追加分の確認（レビュー指摘 4 件の反映分）

### 検証コマンド

- `uv run pytest -q` → **101 passed**（終了コード 0。前半の 100 件 + 新規
  `tests/test_clock.py::test_clear_hist_keeps_running_clock` の 1 件）
- `uv run ruff check .` → **All checks passed!**（終了コード 0）
- `uv run mypy src` → **Success: no issues found in 5 source files**（終了コード 0）

### 変更されたファイル

`git status` / `git diff --stat`:

- `CLAUDE.md`
- `src/ytbg/webroot/static/ytbg.js`
- `src/ytbg/webroot/templates/index.html`
- `src/ytbg/yt_backgammon_server.py`
- `tests/test_clock.py`（今回追加）
- `tests/test_history.py`
- `tests/test_on_json.py`

前半で確認済みの 6 ファイルに `tests/test_clock.py` が増えただけで、
反映内容（検討 1〜4）と一致。指示に無いファイルの変更は無い。

### 完了条件との突き合わせ

- **前半 1〜7 が引き続き満たされているか**: `clear_history()` が
  `async def` になり、`on_json()` の `clear_hist` 分岐が
  `await self._run_replay(self.clear_history)` に置き換わっていた。
  `_run_replay()` の中身を読むと
  `async with self._replay_lock: await self._cancel_replay(); await func(...)`
  で、ロック → cancel → 実行の順は変わっていない。`back` / `fwd`（n > 0）と
  同じ経路を通るようになっただけで、消す範囲・`sn` の振り直し・
  `save_data()` ・`emit_gameinfo()` の呼び出しは `clear_history()` 側に
  そのまま残っており、前半の完了条件はすべて満たされたまま
- **`new_game()` のキャンセル時に何も送らないか**: `ytbg.js` の
  `new_game()` に `clear_hist()` と同形の
  `if (! confirm(...)) { return; }` が足されており、`nav.checked=false` →
  `console.log` → `confirm()` → キャンセルなら `emit_msg()` を呼ばず
  `return` という構造も `clear_hist()` と一致
- **`CLAUDE.md` の追記が実装と合っているか**: 「`clear_hist` は `back` と
  同じく `_run_replay()` に渡す」「連続再生の途中で押すと、止まった時点の
  盤面がそのまま残る」「New Game も `confirm()` で確認を取る」の 3 点は、
  それぞれ上記のコード（`on_json()` の分岐、`_cancel_replay()` が
  途中の盤面のまま止める既存の挙動、`ytbg.js` の `new_game()`）と食い違いは無い

### わざと壊して確認したこと（`src/ytbg/yt_backgammon_server.py` を一時的に
編集し、確認後に元へ戻した。`git diff --stat` の行数が壊す前後で
一致することを確認済み）

- `on_json()` の `clear_hist` 分岐を `await self._run_replay(self.clear_history)`
  から `await self.clear_history()`（`_run_replay` を経由しない直接呼び出し）
  に変える → `test_clear_hist_stops_running_replay` が
  `assert task.cancelled()` で落ちる（Task が止まらない）。ロック/cancel の
  経路が効いていることを確認
- `clear_history()` の中に `self._clock_active = [False, False]`
  （クロックを止める副作用）を注入する →
  `test_clear_hist_keeps_running_clock` が
  `assert bg_server._clock_active == [True, False]` で落ちる
  （`[False, False]` になってしまう）。クロックへ副作用が漏れないことを
  この新しいテストが実際に検出することを確認

  **補足（判断不要の記録）**: 最初に `self._freeze_clock(0)` /
  `self._freeze_clock(1)` の注入を試したところ、このテストは落ちなかった。
  `_freeze_clock()` は「その時点の残り時間を書き戻して基準時刻を
  打ち直す」だけで `_cur_clock()` の返す値を変えないため、注入としては
  観測可能な副作用にならなかった（バグではなく、注入の選び方の問題）。
  実際にクロックの状態を変える注入（`_clock_active` の書き換え）では
  正しく検出された

すべて元に戻したあと `uv run pytest -q` で 101 件通ることを再確認済み。

### 確かめられなかったこと・判断が要ること

- ブラウザでの実機確認（`new_game()` の `confirm()` ダイアログの見た目など）
  は依頼書のとおり行っていない
- `_run_replay()` のリファクタ自体の設計の妥当性（reviewer の領分）には
  踏み込んでいない
