# TODO-001 reviewer 報告

対象: `git diff HEAD -M` と未追跡ファイル（`pyproject.toml`、`uv.lock`、
`src/ytbg/__init__.py`）。実測はすべて
`/home/ytani/work/ytBackgammon` で行った（flask 3.1.3 /
flask-socketio 5.6.1 / python-socketio 5.16.4 / python-engineio 4.14.0）。

---

## 要修正

### 1. `pyproject.toml` / `uv.lock` / `src/ytbg/__init__.py` が未追跡

- どこ: リポジトリ直下と `src/ytbg/__init__.py`
- 何が問題か: `git status --porcelain` で `??` のまま。ステージ済みなのは
  `git mv` と `git rm` の分だけ
- どうなると困るか: このままコミットすると、clone した先に
  `pyproject.toml` も `uv.lock` も無く、`uv sync` も `uv run ytbg` も
  できない。`src/ytbg/__init__.py` が無いと
  `from . import __prog_name__, __version__` で import が落ちる
- 根拠: `git status --porcelain` の実測

### 2. `README.md` と `CLAUDE.md` が旧手順のまま

- どこ: `README.md:101-134`、`CLAUDE.md:14-35`
- 何が問題か: `python3 -m venv env1` → `./setup.sh` の手順、
  `ytbg.sh ~/env1 -p ...` の呼び方、画像の置き場所
  `~/env1/ytBackgammon/static/`、`./ytbg.py` の直接起動が残っている。
  `setup.sh` は今回削除された
- どうなると困るか: README のとおりに操作すると `./setup.sh` が
  存在せず失敗する。TODO.md の
  「`README.md` と `CLAUDE.md` の実行手順を更新する」が未了なので、
  この項目はまだ完了条件を満たしていない
- 根拠: `grep -rn 'setup.sh\|env1\|ytbg.py' README.md CLAUDE.md` の実測。
  implementer も報告の「判断が要る点 3」で自分から挙げている
  （常設の定義で文書を触らない決まりのため未着手）

### 3. `ytbg.sh` / `ytbg-boot.sh` がシンボリックリンク越しに動かない

- どこ: `ytbg.sh:9-13`（`MYDIR=\`dirname $0\`` → `cd "${MYDIR}"`）、
  `ytbg-boot.sh:6,13`
- 何が問題か: `dirname $0` はリンクの実体ではなく**リンクが置かれた
  ディレクトリ**を返す。`cd` した先に `pyproject.toml` が無いので
  `uv run ytbg` がプロジェクトを見つけられない
- 実測: `ln -s /home/ytani/work/ytBackgammon/ytbg.sh /tmp/.../bin/ytbg.sh`
  を作って叩くと

      error: Failed to spawn: `ytbg`
        Caused by: No such file or directory (os error 2)

  終了コード 2。`ytbg-boot.sh` も `sh -x` で追うと
  `MYDIR` がリンク側のディレクトリになり、同じ `ytbg.sh` を呼ぶ
- どうなると困るか: 削除した `setup.sh` は `~/bin` に `ytbg.sh` の
  シンボリックリンクを張っていて、README と CLAUDE.md はそれを前提に
  「`ytbg.sh` を PATH から叩く」と書いている。今の `~/bin` に
  リンクは残っていない（`ls ~/bin` で確認）ので現時点の実害は無いが、
  **リンクを張る運用をやめたのか、リンクでも動くようにするのかを
  決めて文書に書く必要がある**。決めずに置くと、
  以前の環境から上げた人が最初につまずく

---

## 検討

### 4. `app.json.ensure_ascii = False` は、このアプリでは効かない

- どこ: `src/ytbg/__main__.py:37-38`
- 何が問題か: コメントに「日本語をそのまま JSON に出す」とあるが、
  Flask の JSON プロバイダを通る経路がこのアプリに無い。ルートが返すのは
  `render_template()` だけで、`jsonify` は 1 か所も無い
  （`grep -rn 'jsonify' src/ytbg/*.py` は 0 件）
- 実測: ポート 5019 に実サーバを立て、EIO4 のポーリングで
  `set_playername` に「たに」を送って払い出しを見たところ

      42["json",{...,"name":"たに",...}]

  と `\u` エスケープのまま。SocketIO 側の直列化は python-socketio の
  `json.dumps`（既定 `ensure_ascii=True`）で、`app.json` を見ていない
- つまり元の `# XXX 文字化け対策が効かない TBD` という状態は
  **変わっていない**。ただしエスケープされた JSON はブラウザの
  `JSON.parse` で元に戻るので、文字化けは起きない
- どうするか: (a) コメントを実態（Flask 経由の JSON 応答が無いので
  効き目は無い、置いてあるだけ）に書き直す、(b) 設定ごと落とす、
  (c) 本当に効かせたいなら `SocketIO(app, json=...)` 側に付ける、
  のいずれか。管理者の判断

### 5. `allow_unsafe_werkzeug=True` と `-d` の組み合わせ

- どこ: `src/ytbg/__main__.py:107-108`、`ytbg-boot.sh:13`
- 追加そのものは妥当: flask_socketio 5.6.1 は
  `if not sys.stdin or not sys.stdin.isatty()` で `RuntimeError` を
  上げる（`flask_socketio/__init__.py:662-667`）。`&` 付きの
  バックグラウンド起動でも端末が外れていれば止まるので、
  自分で起動する共有ボードとしては許可する判断でよい
- 気になる点: threading モードでは `app.run(...)` に流れ、Flask の
  `run()` は `options.setdefault("use_debugger", self.debug)` する
  （Flask のソースで確認）。`ytbg-boot.sh` は 4 面すべてに `-d` を
  付けるので、`0.0.0.0` に Werkzeug の対話デバッガ（PIN 付き）が
  出ることになる。以前は端末以外からの起動がそもそも止まっていたので、
  **headless 起動でこの露出が起きるのは今回からが初めて**
- あわせて `-d` は reloader も有効にし、1 面あたり python が
  2 プロセスになる（`ps` で実測。`uv run` を含めて 3 つ）。
  4 面で 8 python プロセス
- 家庭内 LAN 限定なら許容の範囲だが、`ytbg-boot.sh` から `-d` を
  外すかどうかは決めておく価値がある

### 6. `ytbg-stop.sh` のパターンはリポジトリを区別しない

- どこ: `ytbg-stop.sh:9`
- 動作は確認できた: `./ytbg.sh -d -p 5019 ...` で起動した
  `uv run`(1) → python(reloader 親) → python(子) のうち、
  python 2 つを拾って kill し、親の `uv run` も連鎖して消えた（実測）。
  `grep` 自身も `[y]` のおかげで拾わない（実測で確認）
- 気になる点: `python.*/bin/[y]tbg` は**どの venv の ytbg でも**
  マッチする。将来 ytbg を別の場所にもインストールすると
  巻き込む。今は 1 か所なので実害は無い
- パターンの外にある `uv run` 自体はマッチしないが、子が死ねば
  終了するので取りこぼしは無い

### 7. 配布物に元データが入る

- どこ: `pyproject.toml:[tool.hatch.build.targets.wheel]`
- 実測: `uv build` で wheel 7.5MB / sdist 93MB。wheel には
  `webroot` 148 ファイル（templates 2 件を含む）が正しく入るが、
  デザインの元データ `.xcf` 12 件と `.pptx` 1 件も同梱される。
  sdist は `docs/movies/*.mp4`（30MB のものを含む）まで入る
- 配る予定が無いなら害は無い。exclude を書くかは判断

### 8. TODO.md の項目本文と実装が食い違う

- どこ: `TODO.md:9`
- 「hatchling + hatch-vcs」とあるが、実装は hatchling のみで
  version は静的（implementer-task.md の「決まっていること」どおり）。
  決着させるときに本文も直したい

---

## 好みの範囲

- `.gitignore:89-91` — 「uv」の節に規則が 1 つも無く、コメントだけ。
  意図の記録としては分かるが、節を作らず既存の行の近くに
  1 行添えるほうが読みやすい
- `ytbg.sh:9` / `ytbg-boot.sh:5` — `MYNAME=` が未使用のまま残っている

---

## 確認して問題が無かったところ（依頼の観点への回答）

### `handle_disconnect(reason=None)` は妥当（実測）

小さな Flask アプリを組んで両方を試した。

| 定義 | 結果 |
|---|---|
| `def d0():` | `error:TypeError:d0() takes 0 positional arguments but 1 was given`（`on_error_default` に回る） |
| `def d2(reason=None):` | `disconnect:client disconnect`（正常に呼ばれる） |

理由も implementer の説明どおりだった。
`flask_socketio/__init__.py:850-857` は `connect` のときだけ
`handler(auth)` → `TypeError` → `handler()` のフォールバックを持ち、
それ以外は `handler(*args)` を直に呼ぶ。python-socketio 側の
`server.py:626-629` にある disconnect 用フォールバックは、
flask_socketio の `except:`（859-867 行）が先に捕まえるので届かない。

実サーバ（ポート 5019、EIO4 ポーリングで接続 → 切断）でも
`on_connect` と `on_disconnect` が両方ログに出て、`on_error` は
出なかった。`_client_sid` の増減も壊れていない。

### 他のハンドラで引数が変わったものは無い

- `connect`: 上記のフォールバックがあるので `handle_connect()` の
  ままでよい。実サーバで `request.event['args'][0]['REMOTE_ADDR']` も
  取れている（ログ `from 127.0.0.1:57438`）
- `on_error_default(e)`: 1 引数のままでよい（`err_handler(value)`）
- `json`: 1 引数のまま動作を確認（実サーバでメッセージが
  ブロードキャストされた）

### `emit(..., broadcast=True)` を残した判断は妥当

flask_socketio 5.6.1 の `emit()` は `broadcast` を正規の引数として
扱い（`__init__.py:924-926`）、docstring にも残っている。
非推奨の警告は出ない（`grep DeprecationWarning` は `disconnect` の
`silent` のみ）。実測でも別クライアントへ届いた。

### `static/ytbg.js` を無変更で 4.x に載せた判断は妥当

CDN の `socket.io 4.8.1` を落として node の vm で評価したところ、
`typeof io.connect === 'function'`、`io.connect === io` だった。
`ytbg.js:4156` の `io.connect(url)`、`ws.on("connect"/"disconnect"/
"json")`（4164-4178）、`ws.emit("json", {...})`（90）はいずれも
4.x の API のまま使える。再接続の既定値（`reconnection: true`）も
1.x と同じ。

ただし**ブラウザでの実操作は未確認**（当方が確かめたのは
サーバ側の EIO4 ハンドシェイクとメッセージの往復まで）。
チェッカーの移動やクロックの表示は verifier / 利用者の確認に委ねる。

### パスの解決は起動ディレクトリに依存しない

`WEBROOT = Path(__file__).absolute().parent / 'webroot'` なので
`__file__` 基準。実測で `GET /` が 200、`GET /static/ytbg.js` が 200、
`index.html` に socket.io 4.8.1 の script タグが入っていた。
wheel にも `ytbg/webroot/templates/index.html` と
`ytbg/webroot/static/...` が入る（`uv build` の中身を確認）。

### 状態ファイルの場所は変わっていない

`ytBackgammonServer.DATAFILE_DIR = os.getenv('HOME')` のままで
`~/ytbg-{server_id}.json`。実測で `~/ytbg-98.json` ができた
（確認後に削除済み）。

### `pyproject.toml` は ytsched に揃っている

`~/work/ytsched/pyproject.toml` と比べて、違うのは
version を静的にした点（`dynamic`/`[tool.hatch.version]` が無い、
`hatch-vcs` を requires に入れない）と、
`[tool.basedpyright]` が無い点、`[tool.ruff.lint] ignore` が無い点。
いずれも今回の依頼どおり。mypy の overrides はカンマ区切り文字列も
ytsched と同じ書き方で、実際に flask 系の import エラーは出ていない
（`uv run mypy src` の 34 件はすべて既存コードの型の指摘）。
`src/ytbg/__init__.py` も ytsched と同じ形（クォートだけ
このリポジトリの慣習に合わせて `'`）。

### `uv run` はオフラインでも起動する

`UV_OFFLINE=1 uv run ytbg --help` が終了コード 0 で通った。
起動時にネットワークを要求しない。

---

## 確認時の気づき（指摘ではない）

レビュー中の `ps` で、ポート 5011 の ytbg が一瞬見えてすぐ消えた。
implementer の動作確認で使ったポートと同じなので、
別の担当が並行で確認していたものと思われる。作業終了後の `ps` では
ytbg のプロセスは 0 件。当方が起動した 5019 の確認用サーバと
`~/ytbg-98.json` は削除済み。
