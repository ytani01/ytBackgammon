# TODO-016 verifier report

対象: 未コミットの差分（`git diff`）。コードは変更していない。

## 1. TODO.md のチェックリスト 4 項目

| 項目 | 確認結果 |
|---|---|
| サーバがクロックの動作中フラグと `clock_sw` を保持する | 満たしている。`ytBackgammonServer.__init__` に `_clock_sw`（bool）、`_clock_active`（プレーヤーごとの bool のリスト）を追加（`yt_backgammon_server.py:64-68`） |
| サーバが動作の開始時刻を持ち、送るときに経過分を差し引く | 満たしている。`_clock_start`（`time.monotonic()`）を保持し、`_cur_clock()` が経過分を差し引いて返す（`yt_backgammon_server.py:146-163`） |
| `on_connect()` で `gameinfo` と一緒に送る | 満たしている。`on_connect()` は従来どおり `emit_gameinfo(0)` を呼ぶだけで、`emit_gameinfo()` が送信データに `clock_state`（`sw` / `active` / `clock`）を追加している（`yt_backgammon_server.py:203-216`）。`on_connect()` 自体には変更が無い |
| クライアントが受け取って復元する | 満たしている。`ytbg.js` の `load_gameinfo()` に `clock_state` 引数を追加し、`clock_state !== undefined` のとき `set_clock_switch()` と `player_clock[p].set()` / `.resume()` で復元する（`ytbg.js:3585-3609`）。`ws.onmessage` の `gameinfo` 分岐も `msg.data.clock_state` を渡すよう直っている（`ytbg.js:4219-4223`） |

## 2. `uv run pytest` / `ruff` / `mypy`

- `uv run pytest -q` → `85 passed in 1.22s`（終了コード 0）
- `uv run ruff check .` → `All checks passed!`（終了コード 0）
- `uv run mypy src` → `Success: no issues found in 5 source files`（終了コード 0）

## 3. テストの実効性（`src/ytbg/yt_backgammon_server.py` をわざと壊す）

4 つとも別々に壊し、`uv run pytest -q tests/test_clock.py` を実行。
1 回ごとに `git checkout -- src/ytbg/yt_backgammon_server.py` ではなく
（下記の注意参照）、退避しておいたオリジナルファイルへ `\cp` で戻した。

| 壊し方 | 結果 |
|---|---|
| `_cur_clock()` の経過分の差し引きを消し、常に `gameinfo` の値を返すようにする | 9 件が落ちた（`test_running_clock_counts_down_the_delay` など） |
| `emit_gameinfo()` の `clock_state` を消す | 2 件が落ちた（`test_clock_state_carries_current_clock`、`test_on_connect_sends_running_clock`。`KeyError: 'clock_state'`） |
| `start_clock` の分岐で、猶予を `clock_limit[1]` に戻す行を消す | 1 件が落ちた（`test_start_clock_resets_delay_and_activates`。`[100, 0.0] == [100, 12]` で不一致） |
| `stop_clock` の分岐の `_freeze_clock()` 呼び出しを消す | 2 件が落ちた（`test_stop_clock_freezes_elapsed`、`test_resume_clock_keeps_remaining_delay`） |

4 つとも、狙った壊し方で対応するテストが落ちることを確認した。
最後に `uv run pytest -q` を再実行し `85 passed` に戻ったことと、
`git diff --stat` が元の差分（5 files changed, 174 insertions(+), 13
deletions(-)）と一致することを確認した。

**注意（作業上のミス）**: 1 回目の壊し方を戻す際に `git checkout --
src/ytbg/yt_backgammon_server.py` を使ったところ、未コミットの TODO-016 の
差分ごと HEAD の状態へ戻ってしまった（このファイルは元から未コミットの
変更を含んでいるため、`checkout --` は「壊す前」ではなく「コミット時点」に
戻る）。直後に気づき、`git diff` で取得済みだった差分をパッチとして
`git apply` で当て直して復元し、以降は退避したファイルのコピーを
`\cp` で戻す方式に切り替えた。復元後、`git diff --stat` が壊す前と
完全に一致すること（112 insertions(+), 2 deletions(-)）を確認済み。
最終的に差分の破損は残っていない。

## 4. `ytbg.js` の構文チェック

`node --check src/ytbg/webroot/static/ytbg.js` → エラー無し（`node` が
使えたので実行した）。JS の自動テストは無いため、これ以上の動作確認は
していない。

## 5. README.md

`README.md` を通読した。クロックの挙動や `on_json()` の分岐、通信の
詳細には触れていない（起動コマンド・画像ディレクトリ・`uv` の手順のみ）。
今回の変更で嘘になった記述は見つからなかった。

## 変更ファイルの一覧と指示との整合

`git status` で変更されていたのは指示どおりの 6 ファイル:
`CLAUDE.md`、`TODO.md`、`src/ytbg/webroot/static/ytbg.js`、
`src/ytbg/yt_backgammon_server.py`、`tests/test_on_json.py`（既存の
`test_emit_gameinfo_message_shape` に `clock_state` の検証を追加）、
`tests/test_clock.py`（新規）。指示に無いファイルの変更は無い。

`CLAUDE.md` の差分は「クロックの進行はクライアント側だけで動いている」を
「表示を進めるのはクライアント側だけだが、残り時間の基準はサーバも持つ」に
書き換えており、`yt_backgammon_server.py` の実装内容と一致している。

## 確かめられなかったこと・判断が要ること

- ブラウザでの実機確認はしていない（指示により不要）。**利用者に
  試してもらうべきこと**: 2 台以上のブラウザでクロックを動かした状態で
  3 台目を接続し、動作中の表示（カウントダウン中かどうか、残り秒数）が
  正しく復元されるか。特に `clock_sw` が off のまま `start_clock` を送った
  直後に再接続するケース（`_clock_sw` が false のときの表示）
- `_cur_clock()` は `sec1 < 0` のとき `sec0 += sec1` として持ち時間から
  引くが、`sec0` がさらにマイナスになるケース（猶予も持ち時間も使い切った
  状態）の表示が `ytbg.js` の `PlayerClock.update()` の見た目と一致するかは
  コードの対応関係を読んだだけで、実際の画面表示までは確認していない
  （テストは数値の一致のみ見ている）
- `mypy src` は `tests/` を見ない設定なので、`tests/test_clock.py` の
  型は確認対象外（`CLAUDE.md` の記載どおり）

## 再確認（レビュー指摘の修正後）

対象: レビューで見つかった 2 件（`back`/`fwd` がクロックの基準を巻き戻す件、
`_clock_sw` の初期値）を直した後の、現在の未コミットの差分。

### 1. `uv run pytest` / `ruff` / `mypy`

- `uv run pytest -q` → `89 passed in 1.12s`（終了コード 0。前回の 85 件から
  `tests/test_clock.py` に足した 4 件増えて 89 件）
- `uv run ruff check .` → `All checks passed!`（終了コード 0）
- `uv run mypy src` → `Success: no issues found in 5 source files`（終了コード 0）

### 2. 足したテストの実効性

前回と同じく、1 回ごとに退避しておいたファイルへ `\cp` で戻す方式で
`src/ytbg/yt_backgammon_server.py` を壊した（今回は最初から `\cp` 方式を
使い、`git checkout --` は使っていない）。

| 壊し方 | 結果 |
|---|---|
| `_load_hist_ent()` の `board.clock` の引き継ぎを消し、元どおり `copy.deepcopy(hist_ent)` だけにする | 2 件が落ちた: `test_back_does_not_rewind_running_clock`（`[50, 7.0] != [100, 7]` ではなく、back 側は `assert bg_server._cur_clock(0) == [100, 7]` で不一致）、`test_fwd_does_not_rewind_running_clock`（`[50, 7.0] == [100, 7]` で不一致）。他のテストは巻き込まれず 19 件成功 |
| `_clock_sw` の初期値を `True` から `False` に戻す | `test_clock_sw_starts_on` の 1 件だけが落ちた（`assert False is True`）。他の 20 件は影響を受けなかった |
| `new_game()` の `_reset_clock(0)` / `_reset_clock(1)` の 2 行を消す | 2 件が落ちた: `test_new_stops_the_clock`（`assert [True, False] == [False, False]`。`_clock_active` がクロックを止めないまま残るため）、`test_new_resets_clock_to_limit`（`assert [[120, 12], [120, 12]] == [[60, 6], [60, 6]]`） |

3 つとも、狙った壊し方で指定されたテストが落ちることを確認した。
`test_new_stops_the_clock` は指示に無かったが、`new_game()` の
`_reset_clock()` 呼び出しが `_clock_active` のリセットも兼ねているため、
`_reset_clock()` を消すと副作用でこちらも落ちる（設計どおりの連動で、
テストが弱いという意味ではない）。

最後に `\cp` でオリジナルへ戻し、`git diff --stat` が壊す前
（`CLAUDE.md 38+`, `TODO.md 19+`, `ytbg.js 29+`,
`yt_backgammon_server.py 135+`, `tests/test_on_json.py 3+`。
合計 `5 files changed, 206 insertions(+), 18 deletions(-)`）と一致すること、
`uv run pytest -q` が `89 passed` に戻ることを確認した。

### 3. `ytbg.js` の構文チェック（再確認）

`ytbg.js` の差分は前回の確認時から変わっていない（`git diff
src/ytbg/webroot/static/ytbg.js` が前回と同一）。`node --check` を再実行し、
エラー無しを確認した。

### 4. 前回の確認項目で結果が変わるもの

- **チェックリスト 4 項目・`on_connect()` 経由の復元**: 今回の修正は
  `back`/`fwd` とクロック開始値・初期値に関するもので、チェックリストの
  4 項目自体の満たし方（1 節）に変化は無い。再確認して同じ結論
- **README.md**: 変更なし。今回の修正でも嘘になった記述は見つからなかった
- **「確かめられなかったこと」に新たに加わったもの**:
  - `_load_hist_ent()` は `board.clock` だけを引き継ぐ実装になっている
    （`clock`以外のクロック関連キーは `gameinfo` に元々存在しない）。
    `back` を連続再生（`back2`/`back_all`）で通した場合の挙動は
    `tests/test_clock.py` では 1 手だけの `back`/`fwd` しか見ておらず、
    連続再生の Task 経由での確認はしていない。ロジック上は
    `backward_hist()`/`forward_hist()` のループ内で毎回
    `_load_hist_ent()` を呼ぶので同じはずだが、実行して確かめてはいない
  - `_clock_sw` の初期値を `True` にしたことで、`index.html` の
    チェックボックスの初期状態（`checked` かどうか）と実際に一致しているかは
    `index.html` のテンプレートを目視で確認していない（HTML の自動テストは
    無い）。**利用者に確認してほしい**: サーバ起動直後・盤面リセット直後に
    ブラウザ側の Clock チェックボックスが checked で始まり、`_clock_sw` の
    `True` と食い違わないか

### 変更ファイルの一覧（再確認）

`git status` は前回の 6 ファイルと同じ
（`CLAUDE.md`、`TODO.md`、`src/ytbg/webroot/static/ytbg.js`、
`src/ytbg/yt_backgammon_server.py`、`tests/test_on_json.py`、
`tests/test_clock.py`）。指示に無いファイルの変更は無い。
`archives/agents/TODO-016/` はこの報告のために自分で作成したディレクトリ。
