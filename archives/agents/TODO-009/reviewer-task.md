# TODO-009 reviewer への依頼

## 何をレビューするか

サーバを **Flask + Flask-SocketIO + gevent** から
**Starlette + 素の WebSocket + uvicorn** へ移した変更（TODO-009）。
クライアントも socket.io をやめて素の WebSocket にし、再接続を足した。

変更は working tree にある（**未 commit**）。ブランチは `starlette`。
`git diff` で差分を見ること。

- 項目の説明: `TODO.md` の「TODO-009」の節（決めたこと・変えないもの）
- 実装への依頼: `archives/agents/TODO-009/implementer-task.md`
- 実装の報告: `archives/agents/TODO-009/implementer-report.md`
- 確認の報告: `archives/agents/TODO-009/verifier-report.md`

**コードは直さないこと。** 見つけたことを報告する。
「動くか」は verifier が実測済み（pytest 57 passed、ruff 0 件、mypy 0 件、
ブラウザ 2 タブの操作と再接続まで確認）。こちらは
**「規約と設計に合っているか」「挙動が変わっていないか」**を見る。

## とくに見てほしいところ

### 1. 挙動が変わっていないか

移行なので、**同じことが同じように起きる**のが原則。

- `on_json()` の分岐ごとの振る舞い（何が更新され、何が送られ、履歴が
  積まれるか）が移行前と同じか。**`git diff` で移行前のコードと突き合わせる**
- `on_connect()` が全員へ `gameinfo` を送る挙動（移行前と同じはず）
- 履歴の連続再生の意味が変わっていないか。とくに
  - 移行前は `_repeat_flag` を落として `time.sleep(.5)` で相手が止まるのを
    待ってから始めていた。今は Task の `cancel()` に置き換わっている。
    **止まり方と、止めたあとの状態（`_history` / `_fwd_hist` / 保存）が
    移行前と同じか**
  - `try: ... finally: save_data()` に変わったことで、保存の回数や
    タイミングが変わっていないか
  - `n > 0`（1 手だけ）の場合も Task になった。移行前は同期に処理されて
    いたので、**呼び出し側から見た順序が変わっていないか**

### 2. 連続再生の Task 化

- `_cancel_replay()` / `_start_replay()` / `wait_replay()` の作りが妥当か
- **競合**: 再生 Task が動いている最中に `put_checker` などが来て
  `_bg._gameinfo` を書き換えると、どうなるか。移行前（greenlet）との差は
  あるか
- cancel されたときに `CancelledError` がどこへ行くか。
  握りつぶしていないか、逆に漏れていないか
- `wait_replay()` はテスト専用のヘルパになっていないか
  （本番のコードから呼ばれない API を足していないか）

### 3. `broadcast()` と受信ループの例外処理

- `broadcast()` が `except Exception` + `# noqa: BLE001` で握っていること
  の妥当性。**握る範囲が広すぎないか**
- 送信に失敗したクライアントを `_clients` から外さず、受信ループの
  `finally` に任せている判断は妥当か。**外れないまま残る経路は無いか**
- `__main__.py` の受信ループの例外の分け方
  （`WebSocketDisconnect` → 抜ける、`JSONDecodeError` → 続ける、
  受信段階のその他 → 抜ける、`on_json()` の中 → 続ける）。
  **無限ループになる経路が無いか**、`CancelledError` の扱いは正しいか
- `broadcast()` の途中で `_clients` が変わる（切断が挟まる）可能性と、
  `list(self._clients)` でコピーしていることの妥当性

### 4. クライアント側（`ytbg.js`）の再接続

- `onclose` と `onerror` の両方から再接続が走って、**接続が二重に張られる
  経路が無いか**。`setTimeout` が多重に積まれないか
- 再接続で `ws` が差し替わったとき、古い `ws` のハンドラが残らないか
- `emit_msg()` の `readyState` の見方が正しいか
- `Board` のコンストラクタから `ws` を外したことの影響（本当に未使用か）
- 分岐の中身（`ws.onmessage` の各 `type`）が移行前と同じか。
  **字下げ以外の変更が紛れていないか**

### 5. テストの守備範囲（verifier の指摘）

verifier が、**`broadcast()` の中身をわざと壊しても pytest では
1 件も落ちない**ことを実測した（`conftest.py` が `broadcast()` を丸ごと
`monkeypatch` で差し替えているため）。

- この設計（送信のメソッドごと差し替える）は妥当か。移行前の
  `emit()` の差し替えと比べてどうか
- `broadcast()` の中身（`_clients` を回す、1 つ失敗しても続ける）を
  確かめるテストを足すべきか。足すならどういう形か
- 他にも、移行で**テストの網から漏れた**ところが無いか

### 6. 規約

`CLAUDE.md`（利用者全体とプロジェクトの両方）に照らす。

- ログは `{}` と引数で渡しているか（f-string になっていないか）。
  **`{}` の数と引数の数が合っているか**（合わないと、抑制される水準でも
  実行時に例外になる）
- `getLogger(__qualname__)` / `_log = getLogger("main")` の置き方
- コメント・docstring が周りに合っているか。**実態と食い違っていないか**
  （移行前の説明が残っていないか）
- 造語や、そのリポジトリで使われていない言い回しが入っていないか

### 7. 依存

- `starlette` / `uvicorn[standard]` / `jinja2` / `pytest-asyncio` の
  追加と、`flask` / `flask-socketio` / `gevent` の削除が過不足ないか
- `uvicorn[standard]` が引き込むもの（`uvloop`、`httptools`、`websockets`
  など）が **aarch64（Raspberry Pi）で wheel があるか**。
  `uv.lock` を見て確かめる
- mypy の `overrides` を `click` だけにしたこと
- `[tool.pytest.ini_options]` の `asyncio_mode = "auto"`

## 報告

`archives/agents/TODO-009/reviewer-report.md` に書く。

- **要修正**（直すべき）と**気になる点**（判断が要る）を分けて書く
- 根拠は、コードの行を挙げるか、実際に確かめた結果を書く。
  **推定は推定と明示する**
- 要修正が 0 件ならそう書く

**返事は「終わったか・報告ファイルのパス・要修正の件数」の 5 行以内**。
報告の全文を返事に貼らないこと。
