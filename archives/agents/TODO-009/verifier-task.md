# TODO-009 verifier への依頼

## 何を確かめるか

サーバを **Flask + Flask-SocketIO + gevent** から
**Starlette + 素の WebSocket + uvicorn** へ移した変更（TODO-009）。
クライアントも socket.io をやめて素の WebSocket にし、再接続を足した。

変更は working tree にある（**まだ commit していない**）。
ブランチは `starlette`。

- 実装の報告: `archives/agents/TODO-009/implementer-report.md`
- 依頼の内容: `archives/agents/TODO-009/implementer-task.md`
- 項目の説明: `TODO.md` の「TODO-009」の節

**コードは直さないこと。** 見つけたことは報告に書く。

## 先にやること

**利用者が起動したままのサーバ（ポート 5001〜5004）が動いている。**
これは移行前のコードを読み込んだままなので、必ず

```
./ytbg-stop.sh
```

で止めてから確認を始めること。確認が終わったら `./ytbg-boot.sh` で
起動し直しておくこと（利用者が使っている）。

自分で試すサーバは 5099 など、5001〜5004 を避けたポートを使う。

## 確かめること

### 1. 検証コマンド

`CLAUDE.md` の「実行」の節にあるもの。終了コードと件数を記録する。

- `uv sync`
- `uv run pytest`
- `uv run ruff check .`
- `uv run mypy src`

実装の報告では 57 passed / ruff 0 件 / mypy 0 件。**同じになるか**を見る。

### 2. テストが本当に効いているか

`CLAUDE.md` に「テストが通ることだけを見ない。`src/` をわざと壊して、
狙ったテストが落ちることを確かめる」とある。今回の移行で入れ替わった
ところを壊して、落ちることを確かめる。少なくとも次の 3 つ。

- `broadcast()` の送信をやめる（何もしないメソッドにする）→ 落ちるか
- `on_json()` の末尾の `await self.broadcast(msg)` を消す → 落ちるか
- `backward_hist()` の `_fwd_hist.append(...)` を消す → 落ちるか

**壊したら必ず元に戻すこと**（`git diff` で戻っていることを確認する）。

### 3. サーバの起動と HTTP

- `./ytbg.sh -d -p 5099 -i images1a 99` で起動する
- `/` `/p1` `/p2` が 200 を返す
- `/static/ytbg.js` と `/static/images1a/board-base.png` が 200 を返す
- 返ってきた `index.html` に socket.io の記述が無い

### 4. `-d` の効き方

- `-d` なし: DEBUG も uvicorn のログ（`Uvicorn running on ...`、
  `connection open`）も出ない
- `-d` あり: DEBUG とアクセスログの両方が出る

### 5. WebSocket の実測（素のクライアント）

`uv run --with websockets python <スクリプト>` などで 2 本つなぐ。
使い捨てのスクリプトはスクラッチパッドに置く。

- 接続すると `gameinfo` が届く
- A が送った `put_checker` が A・B の両方に届く
- `back_all` の連続再生が動き、**その最中に B が送ったメッセージが
  処理される**（再生が他のメッセージを止めない）
- 連続再生の最中に別の再生要求（`fwd_all`）を送ると、前の再生が止まって
  新しい再生が始まる
- **不正な JSON を送っても接続が切れず**、その後もメッセージが往復する
- **`data` が足りないメッセージ**（例: `{"type":"back","data":{},"history":false}`）
  を送っても接続が切れず、その後もメッセージが往復する
- クライアントを切ってもサーバのログに traceback が出ない

### 6. ブラウザでの操作確認（この項目の要）

**playwright で、画面を表示して実際に触る。** TODO-003 のときと同じ手順で
よい（`archives/todo/TODO-003. 切断のたびにログへ ConnectionError と 500 が出る.md`
の「確かめたこと」を参照）。

2 タブ（`/p1` と `/p2`）を開いて、

- 盤面が正しく描画される（チェッカー、ダイス、キューブ、時計）
- お互いに Roll でダイスを振る
- チェッカーをドラッグして動かし、**もう一方のタブに反映される**
- 1 手戻す・1 手進める
- 連続で戻す（`back_all`）を実行し、両方のタブでアニメーションが動く
- New Game
- 片方のタブを閉じても、もう一方が動き続ける
- ブラウザのコンソールにエラーが出ていない

**再接続の確認**（今回足した機能）。

- 2 タブを開いたまま**サーバを止める**（Ctrl-C / kill）
- コンソールに再接続の試行が出ること
- **サーバを起動し直すと、自動でつながり直し、盤面が復元される**こと
- つながり直したあと、操作が両方のタブに反映されること

**スクリーンショットを撮り、報告にパスを書くこと。**
保存先は `~/tmp/playwright-mcp/` 、内容の分かるファイル名にする。

### 7. 差分の確認

`git status` と `git diff --stat` で、変わったファイルが依頼の範囲
（`pyproject.toml` / `uv.lock` / `src/ytbg/__main__.py` /
`src/ytbg/yt_backgammon_server.py` / `src/ytbg/webroot/templates/index.html` /
`src/ytbg/webroot/static/ytbg.js` / `tests/`）に収まっているかを見る。
`CLAUDE.md` / `README.md` / `TODO.md` は main が書くので、
**変わっていたら報告する**。

`src/ytbg/yt_backgammon.py`（盤面のロジック）が変わっていないことも確認する。

## 報告

`archives/agents/TODO-009/verifier-report.md` に書く。

- 上の 1〜7 それぞれの結果。**落ちたものは出力をそのまま引用する**（要約しない）
- 2 で壊したときに落ちたテストの名前と件数、元に戻したことの確認
- 6 のスクリーンショットのパス
- 気づいたこと（範囲外でもよい。ただし推定は推定と明示する）

**確認が終わったら `./ytbg-boot.sh` を実行して、5001〜5004 を
起動し直しておくこと。**

**返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内**。
報告の全文を返事に貼らないこと。

## 補足: playwright の動かし方

MCP のツールは使えないので、**Bash から Python で動かす**こと。

```
uv run --with playwright python <スクリプト>
```

ブラウザの実体が入っていなければ `uv run --with playwright playwright install chromium`。
画面表示あり（`headless=False`）で動かせないときは headless でよいが、
**その旨を報告に書くこと**。
