# TODO-003 検証の依頼（verifier）

TODO-003（クライアント切断のたびに Werkzeug がログへエラーを出す件）の変更を
検証する。**コードは直さない。** 見つけたことは報告するだけ。

作業ディレクトリは /home/ytani/work/ytBackgammon。

## 変更の内容

`git diff` を見ること。要点:

- gevent の WSGI サーバへ移行（`src/ytbg/__main__.py`）
- ファイル先頭で `monkey.patch_all()`、`SocketIO(..., async_mode='gevent')`、
  `socketio.run(..., log_output=debug)`（`allow_unsafe_werkzeug=True` は削除）
- `pyproject.toml` に gevent を追加、mypy の overrides に `gevent,gevent.*` を追加

## 確認すること

1. **lint。** 変更前は `uv run ruff check .` が 19 errors、`uv run mypy src` が
   9 errors だった（どちらも TODO-002 で残した既存の指摘）。**増えていないこと**

2. **起動と切断のログ。** ポート 5099、server_id `test003` を使う
   - `nohup uv run ytbg -p 5099 test003 > <ログファイル> 2>&1 &` で起動
   - `uv run --with "python-socketio[client]" python` で socketio クライアントを繋ぎ、
     2 秒待って disconnect する。`transports=['polling']` と
     `transports=['polling','websocket']` の**両方**で行う
   - **切断してから 5 秒以上待ってから**ログを見る。400 / 500 やトレースバックが
     出ていないこと（移行前は websocket のときだけ、切断の数秒後に
     `code 400, message Bad HTTP/0.9 request type` が出ていた）

3. **monkey patch が効いているか。** 履歴の連続再生は
   `src/ytbg/yt_backgammon_server.py` の `back_hist()` / `forward_hist()` が
   `time.sleep()` を挟みながら emit する。patch されていないと再生中に
   サーバ全体が止まる
   - 履歴を数手ぶん作り（`on_json()` を読んで `put_checker` などの `json`
     メッセージを組み立てる。`history: true` を付けたものが 1 手として積まれる）、
     `back_all` を送った直後に `curl -m 3 http://127.0.0.1:5099/` が
     即座に 200 を返すこと

4. **`-d` の効き方。** `-d` を付けたときアクセスログ（`GET /socket.io/... 200`）が
   出て、付けないと出ないこと

## 後始末（必須）

- 起動したサーバを止める。**`pkill` は使わない**（パターンが自分のシェルに
  一致して巻き込む）。`ps -ef | grep "[b]in/ytbg -p 5099"` で PID を
  確かめてから kill する
- `\rm -f ~/ytbg-test003.json`（`rm` は `-i` にエイリアスされているので
  バックスラッシュを付ける）
- **利用者がポート 5001〜5004 でサーバを動かしている。絶対に触らない**

## 報告

`archives/agents/TODO-003/verifier-report.md` に書く（確かめた手順、結果、
残る懸念）。返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
ファイルの全文を返事に貼らない。
