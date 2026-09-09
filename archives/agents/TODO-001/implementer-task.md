# TODO-001 implementer への依頼

## 目的

ytBackgammon の開発環境を uv に移行する。ytsched（`~/work/ytsched`）の
`pyproject.toml` と `src/` レイアウトに揃える。

## 決まっていること（相談不要。この通りに実装する）

- パッケージ名は `ytbg`。`src/ytbg/` レイアウト
- Python は 3.14。依存は Flask 3 / Flask-SocketIO 5.x / click の最新
- ファイル名は変えない（`ytBackgammonServer.py` などキャメルケースのまま）。
  今回の目的は uv 化であって命名整理ではない
- version は `pyproject.toml` に静的に `0.80` と書く。git タグが無いので
  hatch-vcs は使わない（ytsched とはここだけ違う）。`__main__.py` 側は
  `importlib.metadata.version("ytbg")` で読む
- `templates/` と `static/` は ytsched に倣って `src/ytbg/webroot/` の下へ
- 状態ファイルの保存先（`~/ytbg-{server_id}.json`）は変えない

## やること

1. **`pyproject.toml` を作る**
   - `[project]` name=`ytbg`, version=`0.80`, requires-python=`>=3.14`,
     dependencies=click / Flask / Flask-SocketIO
   - `[project.scripts]` `ytbg = "ytbg.__main__:main"`
   - build-backend は hatchling。`[tool.hatch.build.targets.wheel]`
     packages=`["src/ytbg"]`
   - `[dependency-groups] dev` に ruff と mypy
   - `[tool.ruff]` line-length=78、`[tool.ruff.lint] extend-select`
     は ytsched に合わせる。`[tool.mypy]` python_version="3.14"、
     flask 系の `ignore_missing_imports` を overrides に書く
   - **ruff / mypy の指摘の解消は TODO-002 で別にやる。** ここでは設定を
     置くだけでよく、既存コードの指摘を直さない
2. **`src/ytbg/` へ移す**（`git mv` を使う。`mv` は `-i` にエイリアス
   されていて止まる）
   - `ytbg.py` → `src/ytbg/__main__.py`
   - `ytBackgammonServer.py` / `ytBackgammon.py` / `MyLogger.py` → `src/ytbg/`
   - `templates/` → `src/ytbg/webroot/templates/`
   - `static/` → `src/ytbg/webroot/static/`
   - `src/ytbg/__init__.py` を作る
   - import を相対 import に直す
   - `Flask()` の `template_folder` / `static_folder` を `webroot/` 配下の
     絶対パスに向ける（`pathlib` で `__file__` から組み立てる）
3. **依存の版上げに伴う修正**
   - `emit(..., broadcast=True)` は 5.x でも使えるので、動くなら変えない。
     非推奨の警告が出るなら `to=None` などへ直す
   - `app.config['JSON_AS_ASCII']` は Flask 3 で無効。`app.json.ensure_ascii`
     に置き換える（元のコメントには「効かない」とあるので、置き換えたうえで
     コメントも現状に合わせて書き直す）
   - 他にも Flask 3 / Flask-SocketIO 5.x で消えた API を使っていないか
     確かめる
4. **クライアント側の socket.io を 4.x に上げる**
   - `templates/index.html` の CDN の URL（1.3.5）を 4.x へ
   - `static/ytbg.js` の接続まわり（`io(...)` の呼び方、`ws.on(...)`）が
     4.x で動くか確かめて、必要なら直す
5. **スクリプトの書き換え**
   - `setup.sh` は削除する（venv を手で探して activate する仕掛けは
     uv では要らない）
   - `ytbg.sh` は `uv run ytbg ...` を呼ぶ薄いものに書き換える。
     引数から venv ディレクトリを取るのはやめ、`ytbg.sh -d -p 5001 -i images1a 1`
     の形にする
   - `ytbg-boot.sh` を新しい `ytbg.sh` に合わせる（`VENVDIR` は不要になる）
   - `ytbg-stop.sh` は `ps`+`grep` の対象が変わるはずなので合わせる。
     `pkill` は自分のシェルを巻き込むので使わない
6. **後片付けと文書**
   - `requirements.txt` を削除
   - `.gitignore` に `.venv/` と `uv.lock` の扱いを書く
     （`uv.lock` はアプリなのでコミットする＝ignore しない）
   - `README.md` のインストール・実行手順を uv 版に書き換える
   - `CLAUDE.md`（未追跡のまま置いてある）の「実行」「構成」の節を、
     新しいレイアウトと手順に合わせて直す

## 完了条件

- `uv sync` が通る
- `uv run ytbg --help` が動く
- `./ytbg.sh -d -p 5001 -i images1a 1` でサーバが起動し、`curl -s
  http://localhost:5001/` が HTML を返す（起動確認したら必ず止める）
- `uv run ruff check .` と `uv run mypy src` が**実行できる**
  （指摘が残っていてよい。件数だけ報告する）

## 報告

`archives/agents/TODO-001/implementer-report.md` に書く。中身は
変更点・検証結果・残る懸念に絞る。返事は「終わったか・報告ファイルのパス・
判断が要る点」を 5 行以内で。

ブラウザでの実際の操作確認は verifier とレビュー担当が別に行うので、
ここでは起動と HTTP 応答までで良い。
