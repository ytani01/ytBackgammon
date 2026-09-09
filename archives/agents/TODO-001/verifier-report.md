# TODO-001 verifier 報告

すべて `/home/ytani/work/ytBackgammon` で実行。ポートは指示どおり
5011（単体確認）と 5001〜5004（`ytbg-boot.sh` 確認時のみ）を使った。

## 1. 完了条件の再現

| コマンド | 結果 |
|---|---|
| `uv sync` | 成功。終了コード 0（`Resolved/Checked 22 packages`） |
| `uv run ytbg --help` | 成功。usage と 4 オプションが出力される |
| `./ytbg.sh -d -p 5011 -i images1a 99` | 起動成功。`uv run` 経由で `.venv/bin/python .venv/bin/ytbg` が立つ |
| `/`, `/p1`, `/p2`, `/static/ytbg.js`, `/static/images1a/board-base.png` | いずれも 200（`curl -s -o /dev/null -w '%{http_code}'` で確認） |
| `./ytbg-boot.sh`（5001〜5004） | 4 面とも起動し、4 ポートとも `/` が 200 |
| `./ytbg-stop.sh` | 実行後、`pgrep -fa ytbg` で該当プロセスがゼロになることを確認（`uv run` 親プロセスも子の終了とともに消える） |

zsh の罠: `for path in ...; do curl ...$path; done` のように **`path` という変数名**
でループを回すと、zsh は `path` を `PATH` 探索配列に連動させているため
`curl: command not found` になった。`p` などの別名に変えたら解決した。
実装や検証結果とは無関係な、こちらの検証スクリプトの書き方の問題。

## 2. socket.io 4.x での通信

`uv run --with 'python-socketio[client]' python <script>` でクライアントを
2 本立てて確認した。

- **接続直後の gameinfo 配信**: 両クライアントとも接続直後に `type: gameinfo`
  を受信することを確認
- **broadcast**: `c1` から `{"type": "put_checker", "data": {"ch": 100, "p": 5,
  "idx": 0}, "history": true}` を送ると、`c2` が同じメッセージを受信した
- **履歴の戻し**: `c2` から `{"type": "back", "data": {"n": 1}, "history":
  false}` を送ると、`c1` に `type: gameinfo`（新しい盤面）が届いた
- **切断処理**: サーバログで `on_disconnect` が呼ばれ（`request.sid=...`
  のログが出る）、**`on_error` は一度も呼ばれていない**ことを
  `grep -c "on_error" ログ` = 0 で確認した。implementer の
  `handle_disconnect(reason=None)` の修正どおりに動いている

### 気になった点（判断が要る可能性）

クライアント切断のタイミングで、サーバのログに **`ConnectionError` の
トレースバックと werkzeug の 500** が出た:

```
22:36:09 ... "GET /socket.io/?transport=websocket&EIO=4&sid=...&t=... HTTP/1.1" 500 -
Traceback (most recent call last):
  ...
  File ".../engineio/async_drivers/_websocket_wsgi.py", line 19, in __call__
    raise ConnectionError()
ConnectionError
```

これは python-socketio クライアントが polling 接続後にバックグラウンドで
websocket へのアップグレードを試み、その GET リクエストがサーバに届いた
時点で、こちらの `c1.disconnect()` によって既にソケットが消えていた
（タイミングの競合）ために起きたと見える。`on_error`（Flask-SocketIO の
イベントハンドラ）は経由しておらず、WSGI レベルで 500 を返しているだけ
なので、依頼にあった「切断処理が `on_error` に落ちていないか」の基準
（イベントハンドラの話）には抵触していない。

ただし、これが uv 移行・socket.io 4.x 化で新しく出るようになった挙動か、
1.3.5 時代から Werkzeug の開発サーバ（`allow_unsafe_werkzeug=True`）が
websocket アップグレードとの競合で元々 500 を返していたのかは、
**こちらでは切り分けられていない**。ブラウザ（実際の JS クライアント）
でタブを閉じたときに同様の 500 が出るかどうかは未確認。実害（機能が
壊れる）は見えていないが、ログに毎回トレースバックが出ること自体は
気になる点として報告する。判断が要るなら管理者へ。

## 3. 状態ファイル

- `put_checker` を送った後、`~/ytbg-99.json` が作成・更新されることを確認
- サーバを `kill` して再起動すると、ログに
  `load_data: path_name=/home/ytani/ytbg-99.json` および
  `_history=(2), _fwd_hist=(0)` が出て、保存した履歴 2 件を読み込んでいる
  ことを確認
- 確認後、`~/ytbg-99.json` および `ytbg-boot.sh` 確認で作られた
  `~/ytbg-{1,2,3,4}.json` は `\rm -f` で削除済み

### 気になった点（原因不明、対応不要と思われる）

検証の途中、`~/ytbg-98.json` というファイルが 22:38:53 に出現しているのに
気づいた。**こちらは server_id 98 でサーバを起動した覚えが無い**
（このセッションで使ったのは 99 と 1〜4 のみ）。ログ（`/tmp/ytbg99b.log`
`/tmp/ytbg99c.log`）にも server_id=98 は出てこない。同じマシン上で
別のセッション（他のサブエージェントなど）が並行して動いていた
可能性がある。このファイルは数分後には（こちらが削除する前に）
自然に消えており、現状 `~/ytbg-*.json` は残っていない。**原因は
特定できていない**が、TODO-001 の実装とは無関係と考えられるので
報告のみに留める。

## 変更ファイルの範囲

`git status` / `git diff --stat` で implementer 報告の一覧と突き合わせ、
記載どおり（新規: `pyproject.toml` `src/ytbg/__init__.py` `uv.lock`、
`git mv` によるファイル移動、`setup.sh` `requirements.txt` の削除、
`.gitignore` `ytbg.sh` `ytbg-boot.sh` `ytbg-stop.sh` と各 `.py`/
`index.html` の中身の修正）と一致していることを確認した。範囲外の
変更は見つからなかった。

なお `git status` にリポジトリ直下の未追跡 `CLAUDE.md` があるが、これは
今回のセッション開始時点のスナップショットに元から出ていたもので、
TODO-001 の変更ファイル一覧には含まれていない（implementer 報告にも
無い）。TODO-001 とは無関係と判断した。

## 確かめられなかったこと

- ブラウザ（実際の JS クライアント）での操作は行っていない
  （`socket.io-client` の Python 実装での通信確認のみ）
- `ruff` / `mypy` の再実行はしていない（implementer 報告のとおり
  TODO-002 の範囲と理解し、今回は完了条件に無いため省略した）
- 上記の `ConnectionError`/500 が既存の挙動か今回の変更由来かは切り分けていない

## 2 巡目（レビュー後の修正の確認）

管理者が直した 4（5）点を、作業ツリーのまま（コミット前）確認した。

### 差分の確認

- `src/ytbg/__main__.py` — `socketio.run()` から `debug=debug` が消え、
  `debug` を渡さないコメント（Werkzeug の対話デバッガ対策）が入っている。
  `app.json.ensure_ascii = False` の行も削除されている
- `pyproject.toml` — `[tool.hatch.build.targets.wheel]` に
  `exclude = ["*.xcf", "*.pptx"]`、`[tool.hatch.build.targets.sdist]` に
  `exclude = ["/docs", "/archives", "*.xcf", "*.pptx"]` が追加されている
- `README.md` — Install が `git clone` → `uv sync`、usage が
  `./ytbg.sh -p {ポート番号} -i {画像ディレクトリ名} {サーバID}`（venv 引数なし）、
  Board Design の画像置き場が `src/ytbg/webroot/static/`、動作環境に
  Python 3.14 以上と uv の記載に変わっている
- `CLAUDE.md`「実行」— `uv sync` / `./ytbg.sh` / `uv run ytbg --help` /
  `./ytbg-boot.sh` / `./ytbg-stop.sh` / `uv run ruff check .` /
  `uv run mypy src` に置き換わっている。「構成」の節も `src/ytbg/` 前提に
  書き直されている
- `ytbg.sh` / `ytbg-boot.sh` — 未使用の `MYNAME` が削除されている
- `.gitignore` — 確認したところ、1 巡目で入った uv のコメント節は
  今回のツリーで見当たらない（削除済みと判断）

### 動作確認

| 確認項目 | 結果 |
|---|---|
| `uv sync` | 成功（終了コード 0） |
| `./ytbg.sh -d -p 5011 -i images1a 99` | 起動成功。`pgrep -fa` で
  `uv run ytbg ...` と `.venv/bin/python3 .venv/bin/ytbg ...` の **2 プロセスのみ**
  （1 巡目では reloader で python 側が 2 つ、計 3 つだった）。**プロセスが
  1 面あたり 1 つに減っている**ことを確認した |
| ログに `DEBUG` の行が出るか | 出る（`grep -c DEBUG` で 8 件以上） |
| Werkzeug のデバッガ PIN / reloader の出力 | 無し（`grep -ni "debugger\|pin code\|reloader"` で
  ヒット無し。出たのは通常の起動ログと `WARNING: This is a development
  server...` のみ） |
| `Debug mode:` の表示 | `Debug mode: off`（`debug=debug` を渡さなくなった影響どおり） |
| `/`, `/p1`, `/p2`, `/static/ytbg.js`, `/static/images1a/board-base.png` | いずれも 200 |
| 2 クライアントでの broadcast（`put_checker`） | c2 が受信することを確認（1 巡目と同じ） |
| 日本語を含む `set_playername`（`'たにばやし　太郎'`、全角スペース込み） | c2 が
  **1 文字違わず**受信（`got_name == name` で `True`）。`ensure_ascii` を
  削除した影響は見えなかった。もともと `ensure_ascii=False` は
  Flask の `jsonify`/レンダリング側の設定で、`emit('json', ...)`（python-socketio
  自身のシリアライズ）には効いていなかったという implementer の見立てと
  整合する |
| 切断処理 | `on_disconnect` のログが出て、`on_error` は 0 件（`grep -c on_error` = 0） |
| `uv run ruff check .` | 実行できる。終了コード 1、38 件の指摘（1 巡目と同数。TODO-002 の範囲） |
| `uv run mypy src` | 実行できる。終了コード 1、33 件のエラー（1 巡目は 34 件。TODO-002 の範囲） |
| `./ytbg-boot.sh`（5001〜5004） | 4 面とも起動し、各面 python プロセスが 1 つずつ（計 4 つ。以前は 8 つ）。4 ポートとも `/` が 200 |
| `./ytbg-stop.sh` | 実行後 `pgrep -fa ytbg` で該当プロセスがゼロ |
| `uv build` | 成功。`dist/ytbg-0.80-py3-none-any.whl` と `dist/ytbg-0.80.tar.gz` ができた |
| wheel に `.xcf` / `.pptx` が無いか | `zipfile` で確認、0 件 |
| wheel に `webroot` の `.png`/`.js`/`.css`/`.mp3` があるか | すべて有り |
| sdist に `docs/` `archives/` が無いか | `tar -tzf` で `ytbg-0.80/docs/` `ytbg-0.80/archives/` を grep、0 件。`.xcf`/`.pptx` も 0 件 |

確認後、`~/ytbg-99.json`、`~/ytbg-{1,2,3,4}.json`、`dist/` は
`\rm -f` / `\rm -rf` で削除済み。起動したサーバはすべて `kill`
（`pkill` は未使用）で止め、`pgrep -fa ytbg` で残っていないことを確認した。

### README.md / CLAUDE.md どおりに動くか

`README.md`「ytBackgammon server」の手順（`uv sync` → `./ytbg.sh -p ... -i
... {id}` → `uv run ytbg --help` → `./ytbg-boot.sh` → `./ytbg-stop.sh`）を
そのまま実行し、書いてあるとおりに動くことを確認した。書いてある内容と
実際の食い違いは見つからなかった。`CLAUDE.md`「実行」に書かれたコマンドは
すべて実行でき（`ruff`/`mypy` は指摘が残るが、それは文書にも
「既存コードの指摘はまだ残っている（TODO-002）」と明記されており、
文書の記述と食い違わない）。

### 確かめられなかったこと・判断が要る点

- 1 巡目で報告した、クライアント切断時の websocket アップグレード競合による
  `ConnectionError`/500 のログは、今回の 4 点修正の対象ではないため
  再確認していない（未解消のままと思われるが、今回のスコープ外と判断した）
- 1 巡目の「原因不明の `~/ytbg-98.json`」は、今回は発生しなかった
