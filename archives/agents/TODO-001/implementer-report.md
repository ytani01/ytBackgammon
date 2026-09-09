# TODO-001 implementer 報告

## 変更したファイル

### 新規

- `pyproject.toml` — `[project]` name=`ytbg` / version=`0.80`（静的）/
  requires-python=`>=3.14` / dependencies=click, flask, flask-socketio。
  `[project.scripts] ytbg = "ytbg.__main__:main"`。build-backend は hatchling
  （hatch-vcs は使わない）。`[dependency-groups] dev` に ruff, mypy。
  `[tool.ruff] line-length=78`、`extend-exclude=["archives"]`、
  `[tool.ruff.lint] extend-select=["I","B","SIM","UP","PTH"]`、
  `[tool.mypy] python_version="3.14"`, `check_untyped_defs=true`、
  overrides で click / flask / flask_socketio を `ignore_missing_imports`
- `src/ytbg/__init__.py` — `importlib.metadata.version(__package__)` で
  `__version__` を読む。`__prog_name__ = 'ytBackgammon Server'`
- `uv.lock` — `uv sync` が生成（追跡する）

### 移動（`git mv`）

- `ytbg.py` → `src/ytbg/__main__.py`
- `ytBackgammonServer.py` → `src/ytbg/ytBackgammonServer.py`
- `ytBackgammon.py` → `src/ytbg/ytBackgammon.py`
- `MyLogger.py` → `src/ytbg/MyLogger.py`
- `templates/` → `src/ytbg/webroot/templates/`
- `static/` → `src/ytbg/webroot/static/`

### 削除（`git rm`）

- `setup.sh`
- `requirements.txt`

### 中身の修正

- `src/ytbg/__main__.py:11-38` — import を整理し相対 import に変更。
  `WEBROOT = Path(__file__).absolute().parent / 'webroot'` を追加し、
  `Flask(__name__, template_folder=..., static_folder=...)` で
  `webroot/` 配下の絶対パスを指す。`MY_NAME` / `VERSION` は
  `__init__.py` の `__prog_name__` / `__version__` から取る
- `src/ytbg/__main__.py:37-38` — `app.config['JSON_AS_ASCII'] = False` を
  `app.json.ensure_ascii = False` に置換。コメントも現状に合わせて書き直した
- `src/ytbg/__main__.py:67-70` — `handle_disconnect()` に `reason=None` を追加。
  **これは版上げに伴う実害のある修正**（下の「判断が要る点」参照）
- `src/ytbg/__main__.py:105-108` — `socketio.run(...)` に
  `allow_unsafe_werkzeug=True` を追加（下の「判断が要る点」参照）
- `src/ytbg/ytBackgammonServer.py:10-20` — import を整理し相対 import に変更
- `src/ytbg/ytBackgammon.py:11` — `from .MyLogger import get_logger`
- `src/ytbg/MyLogger.py:10` — docstring の使用例も相対 import に合わせた
- `src/ytbg/webroot/templates/index.html:14` — socket.io の CDN を
  1.3.5 → 4.8.1
- `static/ytbg.js` は無変更。`io.connect(url)` は socket.io-client 4.x でも
  `io()` の別名として残っており、`ws.on("connect"/"disconnect"/"json")`、
  `ws.emit("json", ...)` も 4.x の API のまま使える
- `.gitignore:89-91` — uv の節を追加（`.venv` は既存の Environments の節で
  除外済み、`uv.lock` は追跡するので書かない、という趣旨のコメントのみ）
- `ytbg.sh` — `exec uv run ytbg "$@"` を呼ぶだけの薄いものに書き換え。
  venv ディレクトリの引数は廃止
- `ytbg-boot.sh` — `VENVDIR` を削除し、スクリプトと同じディレクトリの
  `ytbg.sh` を `-d -p {port} -i {images} {id}` で呼ぶ
- `ytbg-stop.sh` — `ps` の grep パターンを
  `python.*/bin/[y]tbg` に変更（uv 導入後の実体は
  `.venv/bin/python .venv/bin/ytbg ...`）。`grep -v grep` は `[y]` で不要に
  なったので削除。`pkill` は使っていない

## 検証結果

すべて `/home/ytani/work/ytBackgammon` で実行。

| コマンド | 結果 |
|---|---|
| `uv sync` | 成功（終了コード 0）。flask 3.1.3 / flask-socketio 5.6.1 / python-socketio 5.16.4 / click 8.5.0 が入った |
| `uv run ytbg --help` | 成功。usage と 4 つのオプションが出る |
| `./ytbg.sh -d -p 5011 -i images1a 99` | 起動成功 |
| `curl -s -o - http://localhost:5011/` | HTTP 200、`index.html` の HTML が返る（socket.io 4.8.1 の script タグを確認） |
| `curl http://localhost:5011/static/ytbg.js` | HTTP 200 |
| `curl http://localhost:5011/static/images1a/board-base.png` | HTTP 200 |
| `curl "http://localhost:5011/socket.io/?EIO=4&transport=polling"` | HTTP 200（engine.io v4 のハンドシェイクが返る） |
| `./ytbg-stop.sh` | 成功。python 2 プロセスと親の `uv run` がすべて消えたことを `ps` で確認 |
| `uv run ruff check .` | **実行できる**。終了コード 1、38 件の指摘 |
| `uv run mypy src` | **実行できる**。34 件のエラー（3 ファイル / 5 ファイル検査） |

ruff / mypy の指摘は TODO-002 の範囲なので直していない。指摘の内訳（概略）:

- ruff: `N999`（ファイル名がキャメルケース）3 件、`UP031`（`%` 書式）多数、
  `PTH123`（`open()` → `Path.open()`）2 件、`BLE001`、`EXE001`、`I001`、
  `SIM114`、`C408`、`PLR1711`、`PLR2044`、`RUF059`
- mypy: `svr = None` のグローバルに対する `"None" has no attribute ...` 8 件、
  `ytBackgammonServer.py` の `load_data()` 戻り値まわり 11 件、
  `app.json.ensure_ascii` の `attr-defined` 1 件など

起動確認で作られた状態ファイル `~/ytbg-99.json` は削除済み。

## 判断が要る点

1. **`handle_disconnect(reason=None)` を足した理由。**
   python-socketio 5.x は disconnect ハンドラに切断理由を渡す。
   python-socketio 側には引数の数が合わないときに引数を減らして呼び直す
   フォールバックがあるが、Flask-SocketIO の `_handle_event()` が先に
   `except:` で `TypeError` を捕まえて `on_error_default` へ回してしまうため、
   フォールバックが働かない。引数を足さないと、切断のたびに
   `svr.on_disconnect()` が呼ばれず（`_client_sid` が減らない）、
   代わりに `svr.on_error()` が TypeError を記録する。
   引数を無視するだけなので挙動は 4.x 時代と同じにしてある
2. **`allow_unsafe_werkzeug=True` を足した理由。**
   Flask-SocketIO 5.x は、標準入力が端末でないときに Werkzeug の開発サーバを
   使うと `RuntimeError` で止まる。サービスや cron 経由で起動する場合に
   起動できなくなるので明示的に許可した。**本番向けの WSGI サーバに
   替えるかどうかは別の判断**なので、そこは変えていない
3. **`README.md` と `CLAUDE.md` は編集していない。**
   依頼の項目 6 に含まれていたが、implementer の常設の定義で
   「`CLAUDE.md`、その他の文書を触らない（管理者と wording の担当）」と
   決まっているため、こちらでは手を付けなかった。直す必要がある箇所は次のとおり:
   - `README.md`「ytBackgammon server > 1. Install」— venv を作って
     `setup.sh` を叩く手順。uv 版（`git clone` → `uv sync`）に差し替えが必要
   - `README.md`「2. ytBackgammon server usage」— `ytbg.sh ~/env1 -p ...` の
     venv 引数が無くなり `ytbg.sh -p {port} -i {images} {id}` になった
   - `README.md`「3. Board Design」— 画像の置き場所が
     `~/env1/ytBackgammon/static/` から `src/ytbg/webroot/static/` に変わった
   - `README.md`「動作環境 > サーバ」— Python3 の版（3.14 以上）と uv
   - `CLAUDE.md`「実行」— `setup.sh` / `requirements.txt` の記述、
     `ytbg.sh ~/env1 ...` の呼び方、`./ytbg.py` の直接起動。
     `uv sync` / `uv run ytbg` / `uv run ruff check .` / `uv run mypy src` へ
   - `CLAUDE.md`「構成」— ファイルの置き場所が `src/ytbg/` と
     `src/ytbg/webroot/` に変わった。「テスト・lint の仕組みは無い」も
     ruff / mypy が入ったので現状と合わない

## 範囲外だが気づいたこと

- `ytBackgammonServer.on_disconnect()` の `self._client_sid.remove(request.sid)` は、
  登録されていない sid が来ると `ValueError` になる。今回は触っていない
- `emit(..., broadcast=True)` は Flask-SocketIO 5.6.1 でも受け付けられており、
  非推奨の警告も出ないので変更していない
- `templates/top.html` を返す `app_top()` はどのルートからも呼ばれていない
  （`/` `/p1` `/p2` はすべて `app_index()`）
- ルート直下に残っている `bg.png` / `bg0.png` / `cloth_00043.png` /
  `twinkle_00028.png` は、どこからも参照されていないように見える。
  今回は移動も削除もしていない
- `.gitignore` の先頭に `*.json` があるため、状態ファイル
  （`~/ytbg-{server_id}.json`）以外の JSON も追跡されない。今回は変えていない

## 残る懸念

- ブラウザでの実際の操作（チェッカー移動、履歴の戻し／進め、クロック、
  複数クライアント間の broadcast）は確認していない。socket.io を 1.3.5 →
  4.8.1 に上げているので、**verifier による実機確認が必須**
- `static/ytbg.js` は無変更のまま 4.x で動かす前提にしている。
  接続部分（`io.connect(url)`）は 4.x の API で通るはずだが、
  実際の通信は上の実機確認で見てもらう必要がある
