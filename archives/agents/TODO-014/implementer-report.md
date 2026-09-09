# TODO-014 実装報告

## 変更点

### pyproject.toml
- `pyproject.toml:1-4` `version = "0.80"` を消し `dynamic = ["version"]` を追加
- `pyproject.toml:22-24` `[build-system] requires` に `hatch-vcs` を追加
- `pyproject.toml:38-52` `[tool.hatch.build.targets.sdist]` の後に
  `[tool.hatch.version]`（`source = "vcs"`）、
  `[tool.hatch.version.raw-options]`（`local_scheme = "no-local-version"`）、
  `[tool.uv]`（`cache-keys = [{ git = { commit = true, tags = true } }]`）を追加。
  それぞれ既存節と同様にコメントで理由を添えた

### src/ytbg/webroot/static/ytbg.js
- `ytbg.js:66-69` `const VERSION = "0.96";` を削除（`MY_NAME` は残した）
- `ytbg.js:2671-2676` 付近の `const ver_el = ...` と
  `ver_el.innerHTML = ...` の 2 行を削除
- 削除前に `VERSION` / `ver_el` が他で参照されていないことを grep で確認済み
  （どちらもこの箇所以外に出現しない）。`name_el`（同じ Title ブロックの
  1 行上）は元から未使用だったが、依頼の対象外なので触っていない

### src/ytbg/webroot/templates/index.html
- `index.html:82` `<strong id="version">Version Number</strong>` 部分を削除し、
  `<strong>{{ name }} v. {{ version }}</strong>` だけにした

### CLAUDE.md
- 「実行」の節、`uv sync` の説明の直後に、バージョンは git tag から
  hatch-vcs で取ること、タグを打ったあとは `uv sync` が要ること
  （`cache-keys` で再ビルドされる旨）を 3 行で追記。`（TODO-014）` を付けた

## 検証結果

1. `uv sync` — 成功（exit 0）。`ytbg==0.80` → `ytbg==1.0.1.dev1` に更新された
2. `uv run python -c "import ytbg; print(ytbg.__version__)"` →
   `1.0.1.dev1`。着手前に `git log` を見たところ、HEAD
   （`e39811b docs(todo): バージョンを git tag に連動させる件を TODO-014 として立てる`）
   はタグ `1.0.0` から 1 コミット進んでいた（`git describe --tags` →
   `1.0.0-1-ge39811b`）ため、依頼どおり `1.0.1.devN` 側になった
3. `uv run pytest` — 57 件全件成功（exit 0）
4. `uv run ruff check .` — 着手前後とも `All checks passed!`（差分なし）
   `uv run mypy src` — 着手前後とも `src/ytbg/__main__.py` の 7 件のみで
   同一（`diff` で完全一致を確認）。新しい指摘は増えていない

## 残る懸念

- 依頼文の「やらないこと」で明示されたとおり、`src/ytbg/__init__.py` と
  `tests/test_save_load.py` の `'0.80'` 直書きは触っていない
  （`TODO.md` のチェックリストにはこの 2 項目もあるが、依頼文の対象範囲・
  やらないことを優先した）
- 「既存の `~/ytbg-*.json` が読めることを確かめる」は依頼文の完了条件・
  対象範囲に含まれていなかったため実施していない（verifier 側で
  必要なら確認を）
- ブラウザでの表示確認は依頼どおり実施していない（verifier が行う）
- 新しいタグは打っていない

## 追記: レビュー指摘への対応（2 巡目）

### pyproject.toml
- `pyproject.toml:50-56` `[tool.uv] cache-keys` を
  `[{ file = "pyproject.toml" }, { git = { commit = true, tags = true } }]`
  に直した。uv の既定のキー（`pyproject.toml` の変更検知）が
  `cache-keys` の指定で置き換わって消える旨をコメントに一行足した

### src/ytbg/webroot/static/ytbg.js
- `ytbg.js:66` `const MY_NAME = "ytBackgammon Client";` を削除
- `ytbg.js:2670-2671` 付近の `// Title` コメントと
  `const name_el = document.getElementById("name");` を削除
- 削除前に `MY_NAME` / `name_el` / `id="name"` を grep で再確認し、
  参照が無いこと（`index.html` にも `id="name"` の要素が無いこと）を確かめた

### CLAUDE.md
- TODO-014 で足した段落の末尾に、`git clone --no-tags` や `--depth 1` の
  ようにタグを持たない clone ではエラーにならず `0.1.devN` という
  誤ったバージョンになるので、タグごと clone すること、という注意を一行足した

### 検証結果（2 巡目）
1. `uv sync` — 成功（exit 0）。`ytbg==1.0.1.dev1` のまま（変化なし）
2. `uv run python -c "import ytbg; print(ytbg.__version__)"` →
   `1.0.1.dev1`（1 巡目と同じ。着手後に新たなコミットは無い）
3. `uv run pytest` — 57 件全件成功（exit 0）
4. `uv run ruff check .` — `All checks passed!`（差分なし）
   `uv run mypy src` — 1 巡目と同じ 7 件のみ（`diff` で完全一致を確認）。
   新しい指摘は増えていない

### 残る懸念（2 巡目）
- 追加の懸念は無い
