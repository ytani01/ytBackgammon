# TODO-009 verifier への依頼（2 回目）

reviewer の指摘を受けた直しの確認。**1 回目の確認（`verifier-report.md`）で
済んでいるところは繰り返さなくてよい。** 今回の直しに絞る。

読むもの。

- `archives/agents/TODO-009/implementer-report-2.md`（今回の直しの報告）
- `archives/agents/TODO-009/implementer-task-2.md`（今回の依頼）
- `archives/agents/TODO-009/reviewer-report.md`（R1・C1〜C8 の元の指摘）

**コードは直さないこと。**

## 何が変わったか

- **R1**: 連続再生の cancel に `asyncio.Lock` を入れ、追跡外の再生 Task が
  残らないようにした
- **C1**: `back` / `fwd`（n > 0）を Task にせず、ロックを握ったまま
  その場で走り切る形にした
- **C2**: 再生 Task を `_replay()` で包み、中の例外を `on_error()` へ渡す
- **C3**: `broadcast()` を `asyncio.gather(..., return_exceptions=True)` に
- **C4**: `on_connect()` を `try` の中へ
- **C5**: `wait_replay()` を消した（テストは `_replay_task` を直接待つ）
- **C7**: `WEBROOT` を `src/ytbg/__init__.py` へ寄せた
- **C8**: `tests/test_broadcast.py`（6 件）と `tests/test_replay.py`（5 件）を追加

## 確かめること

### 1. 検証コマンド

- `uv run pytest` — **68 passed** になるか（57 → 68）
- `uv run ruff check .` — 0 件
- `uv run mypy src` — 0 件

終了コードを記録する。

### 2. 足したテストが本当に効くか

implementer が M1〜M8 の 8 通りの壊し方を試したと報告している
（`implementer-report-2.md` の「壊して落ちることの確認」の表）。
**そのうち次の 4 つを自分で再現する。**

- **M1**: `broadcast()` の先頭で `return` → 3 件落ちるか
  （1 回目の確認で「1 件も落ちない」だった壊し方。ここが塞がったかを見る）
- **M5**: R1 の直し前に戻す（ロックを使わず、cancel の前に
  `_replay_task = None`）→ `test_only_one_replay_runs` が落ちるか
- **M6**: C1 の直し前に戻す（n > 0 も `_start_replay()` で Task に）
  → 4 件落ちるか
- **M7**: C2 の直し前に戻す（`_replay()` で包まず、`func()` を直接
  `create_task()` する）→ `test_replay_error_goes_to_on_error` が落ちるか

**壊したら必ず元に戻す**（`git diff --stat` と `uv run pytest` で
68 passed に戻ることを確認する）。

### 3. R1・C1・C2 が直っていることの実測

implementer の実測を、**自分の手で再現する**。サーバを 5099 で起動して、
素の WebSocket クライアントで確かめること（スクリプトはスクラッチパッドに）。

- **R1**: 走っている `back_all` に、別々のクライアントから `back_all` と
  `fwd_all` を同時にぶつける。**打ち消し合いが続かないこと**
  （数秒後に broadcast が止まること）。
  直す前は「10 秒後も両方走ったまま、その間に 203 通」だった
- **C1**: 履歴を積んだ状態で `back`（n=1）を 2 通同時に送る。
  **2 手戻り、broadcast も 2 通**になること
- **C2**: 再生の中で例外が起きたとき `on_error()` のログが出て、
  stderr に `Task exception was never retrieved` が**出ない**こと。
  再現の仕方は任せる（`src/` を一時的に壊す形でよい。**必ず戻すこと**）

### 4. 実機（WebSocket クライアント 2 本）

1 回目と同じ範囲でよい。今回の直しで壊れていないことを見る。

- 接続時に `gameinfo` が届く
- `put_checker` が両方に届く
- `back_all` の連続再生が動き、その最中に別のメッセージが処理される
- 不正な JSON を送っても接続が切れず、その後も往復する
- ログに traceback が出ない、`never retrieved` も出ない

### 5. ブラウザ（範囲を絞る）

1 回目でひととおり確認済みなので、**今回の直しに関わるところだけ**でよい。

- 2 タブを開き、**連続で戻す（`back_all`）が動き、両方のタブに反映される**
- 連続再生の最中に、もう一方のタブで**連続で進める**を押す
  → 前の再生が止まり、進む方向に切り替わること
- チェッカーのドラッグが両方に反映される
- コンソールにエラーが出ていない（`favicon.ico` の 404 は既存）

スクリーンショットを `~/tmp/playwright-mcp/` に撮り、報告にパスを書く。
`headless` で動かしたならその旨を書く。

### 6. 差分の範囲

`git status` / `git diff --stat` で見る。

**今回は `CLAUDE.md` / `README.md` / `TODO.md` が変わっている**
（main が並行して書いている）。それは想定どおりなので報告しなくてよい。
それ以外に、依頼の範囲外のファイルが変わっていたら報告する。

`src/ytbg/yt_backgammon.py`（盤面のロジック）が変わっていないことは
確認する。

## 注意

- ポート 5001〜5004 は利用者のサーバが動いている。**触らないこと。**
  自分で試すサーバは 5099 などを使う
- 1 回目のように `./ytbg-stop.sh` を実行する必要は無い

## 報告

`archives/agents/TODO-009/verifier-report-2.md` に書く。

- 1〜6 それぞれの結果。**落ちたものは出力をそのまま引用する**
- 2 で壊したときに落ちたテストの名前と件数、戻したことの確認
- 5 のスクリーンショットのパス
- 気づいたこと（推定は推定と明示する）

**返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内**。
