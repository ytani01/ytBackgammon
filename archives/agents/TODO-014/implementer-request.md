# TODO-014 実装の依頼

## 目的

バージョンの定義を git tag 1 つに集約する。今は `pyproject.toml` の
`version = "0.80"`、`ytbg.js` の `VERSION = "0.96"`、git tag の `1.0.0` が
それぞれ手書きで、ずれている。

方針は `TODO.md` の TODO-014 の節に書いてある。**先に読むこと。**

## 対象範囲

これ以外のファイルは触らない。

### 1. `pyproject.toml`

- `[build-system]` の `requires` に `hatch-vcs` を足す
- `[project]` の `version = "0.80"` を消し、`dynamic = ["version"]` を足す
- `[tool.hatch.version]` で `source = "vcs"`
- `raw-options` で `local_scheme = "no-local-version"`
  （タグから進んだコミットで `1.0.1.dev3` になり、`+g...` が付かない形）
- `[tool.uv]` に `cache-keys = [{ git = { commit = true, tags = true } }]`
  を足す。**これが無いと editable インストールが再ビルドされず、タグを
  打ってもバージョンが古いまま残る**
- 追加した節には、なぜ要るのかを短くコメントで添える（既存の
  `[tool.hatch.build.targets.*]` の書き方に合わせる）

### 2. `src/ytbg/webroot/static/ytbg.js`

- `const VERSION = "0.96";`（67 行目付近）を消す
- `Board` の中の `const ver_el = document.getElementById("version");` と
  次行の `ver_el.innerHTML = ...`（2673 行目付近）を消す
- **消す前に `VERSION` と `ver_el` が他で使われていないか grep で確かめる**。
  使われていたら消さずに報告する
- `MY_NAME` は残す（別物）

### 3. `src/ytbg/webroot/templates/index.html`

- 82 行目の
  `<strong>{{ name }} v. {{ version }}</strong>/<strong id="version">Version Number</strong>`
  を `<strong>{{ name }} v. {{ version }}</strong>` だけにする

### 4. `CLAUDE.md`

- 「実行」の節に、バージョンは git tag から取ること、タグを打ったあとは
  `uv sync` が要ること（cache-keys で自動的に再ビルドされる旨）を
  2〜3 行で書き足す。`（TODO-014）` を付ける

## やらないこと

- `src/ytbg/__init__.py` は変更しない（`importlib.metadata.version()` が
  そのまま追従する）
- `tests/test_save_load.py` の `'0.80'` は**直さない**。あれは
  `hist_ent2str()` に渡す入力値で、パッケージのバージョンとは無関係
- 新しいタグは打たない

## 完了条件

すべてリポジトリのディレクトリの中で実行する。

1. `uv sync` が通る
2. `uv run python -c "import ytbg; print(ytbg.__version__)"` が
   `1.0.0` を出す（HEAD にタグ `1.0.0` が付いている。ただし着手後に
   コミットが進んでいれば `1.0.1.devN`。どちらでもよいが、**どちらだったかを
   報告に書く**）
3. `uv run pytest` が全件通る
4. `uv run ruff check .` と `uv run mypy src` が、着手前より指摘を増やさない
   （着手前の出力を先に取っておいて比べる）

ブラウザでの表示確認はしなくてよい（verifier が行う）。

## 報告

`archives/agents/TODO-014/implementer-report.md` に書く。変更点、上の 4 つの
検証結果（コマンドの出力も貼る）、残る懸念に絞る。

返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内にすること。
