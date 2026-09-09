# TODO-014. バージョンを git tag に連動させる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 20,455 | 124,122 | 56% |
| reviewer | Opus 5 | high | 13,608 | 63,081 | 25% |
| implementer | Sonnet 5 | medium | 9,225 | 74,312 | 9% |
| verifier | Sonnet 5 | medium | 9,976 | 45,264 | 9% |
| 合計 |  |  | 53,264 | 306,779 | 概算 $4.8 |

- implementer と verifier は定義（`~/.claude/agents/`）のモデル・effort のまま
- reviewer は定義が sonnet。`CLAUDE.md` の「コードレビューには Opus を充てる」に
  従って Opus 5 に上書きした（effort は定義の high のまま）
- verifier はセッションの上限（HTTP 429）で 2 回目の途中で止まった。
  残りの確認は main が行った（実装は implementer なので、実装と確認は
  分かれたまま）

## きっかけ

バージョンが 3 箇所に別々に手書きされていて、ずれていた。

- `pyproject.toml` の `version = "0.80"`
- `ytbg.js` の `VERSION = "0.96"`
- git tag の `1.0.0`

画面には「Server v. 0.80 / Client v. 0.96」と 2 つ並び、タグを打つたびに
3 箇所を手で揃えることになっていた。

## やったこと

### バージョンを git tag から取る

`pyproject.toml` を `dynamic = ["version"]` にし、hatchling のプラグイン
`hatch-vcs` で git tag から取るようにした。

```toml
[tool.hatch.version]
source = "vcs"

[tool.hatch.version.raw-options]
local_scheme = "no-local-version"
```

- `local_scheme = "no-local-version"` は利用者と相談して決めた。タグ上は
  `1.0.0`、そこから 3 コミット進むと `1.0.1.dev3` になり、`+g<hash>` は
  付かない
- `src/ytbg/__init__.py` は変更していない。`importlib.metadata.version()` が
  そのまま追従する

### `[tool.uv] cache-keys`

uv は editable インストールをキャッシュするので、これが無いとタグを打っても
バージョンが古いまま残る。

```toml
cache-keys = [
    { file = "pyproject.toml" },
    { git = { commit = true, tags = true } },
]
```

**`{ file = "pyproject.toml" }` を明示しているのが要点。** `cache-keys` を
書くと uv の既定のキー（`pyproject.toml` の変更）が置き換わって消え、
`pyproject.toml` を編集しただけでは再ビルドされなくなる。reviewer が
別プロジェクトで実測して見つけた。

### バージョン表示を 1 つにまとめる

- `index.html` の
  `<strong>{{ name }} v. {{ version }}</strong>/<strong id="version">Version Number</strong>`
  を前半だけにした
- `ytbg.js` から `const VERSION` と、`#version` へ「Client v.」を書き込む
  2 行を消した
- その結果、`Board` のコンストラクタの `// Title` ブロックが何も指さなく
  なったので、`const name_el`（`index.html` に `id="name"` の要素は無い）と
  `const MY_NAME` もまとめて消した。いずれも参照が無いことを確かめている

### `CLAUDE.md`

「実行」の節に、バージョンは git tag から取ること、タグを打ったあとは
`uv sync` が要ること、タグを持たない clone（`--no-tags` / `--depth 1`）では
エラーにならず `0.1.devN` という誤った値になることを書いた。

## 確かめたこと

- `uv sync` / `uv run pytest`（57 件）/ `uv run ruff check .` /
  `uv run mypy src`（`__main__.py` の既存 7 件のみ、増えていない）
- **タグに追従する。** 一時タグ `9.9.9` を打って `uv sync` すると
  バージョンが変わり、消すと戻った（タグは削除済み）。
  **作業ツリーがきれいなら、タグちょうどのコミットで `9.9.9` になる。**
  ただし dirty だと `9.9.10.dev0` のように 1 つ繰り上がった dev 版になる。
  これは setuptools_scm 系の既定（`guess-next-dev`）の動作で、
  `local_scheme` は関係しない。**タグを打つときは、コミットを済ませてから**
- **`{ file = ... }` が効く。** `description` を一時的に書き換えて
  `uv sync` すると、インストール済みの METADATA が追随した
- **画面のバージョン表示は 1 つだけ。** サーバを空きポートで起動して
  `curl` で確認。`id="version"` は 0 件、`ytbg.js` に `MY_NAME` /
  `name_el` / `ver_el` / `const VERSION` は 0 件。`node --check` も通る
- **既存の保存ファイルが読める。** `~/ytbg-1.json` をコピーして
  `DATAFILE_DIR` を差し替えて読ませ、履歴 38 件が例外なく読めた。
  既存エントリの `server_version: "0.80"` はそのまま保たれ、新しい
  エントリには新しい形式が入る。`server_version` は文字列としてしか
  扱われておらず、比較も解析もしていない
- **配布物で壊れない。** reviewer が実測。sdist を展開して `.git` の無い
  状態から wheel をビルドでき、バージョンも保たれる
  （setuptools_scm の PKG-INFO fallback）

**ブラウザで盤面を開く確認はしていない。** `CLAUDE.md` のとおり、
クライアントの動作確認は利用者が行う。

## 見送ったこと

- **`tests/test_save_load.py` の `'0.80'` 直書きは直さない。** 立てたときの
  チェックリストには入れていたが、着手して読んだところ、あれは
  `hist_ent2str()` に渡す入力値と、その出力の期待値だった。パッケージの
  バージョンとは無関係なので、直す必要が無い

## 残ること

- **`ytbg.js` にはまだ未使用のコードが残っている可能性がある。** 今回消したのは
  バージョン表示に連なる分だけ。TODO-009 で JS を大きく触るので、そこで見る
- タグを持たない clone では誤ったバージョンが通る。`CLAUDE.md` に注意を
  書いただけで、仕組みでは防いでいない

## 分担の振り返り

- **reviewer が一番効いた。** `cache-keys` が uv の既定のキーを置き換える件は、
  実装も確認も通したうえで残っていた欠陥で、reviewer が別プロジェクトを
  作って実測して見つけた。「タグを打てば再ビルドされる」ので、
  タグ連動の確認だけでは絶対に出てこない。挙動が変わる項目に
  レビューを別立てする決まりが、そのまま効いた
- **verifier は「動くか」を確かめる役として機能した。** タグを打って消す
  往復と、既存の保存ファイルの読み込みを実際にやった。dirty な作業ツリーで
  `9.9.10.dev0` になる件も、依頼文の期待値との食い違いとして正しく報告した
- **implementer は指示どおりで、判断のいる場面が無かった。** Sonnet 5 /
  medium で足りている
- **見込みとの食い違いは無い。** 立てたときに見込んだ 3 担当がそのまま動いた
- **次に同じ規模（設定ファイル＋表示の小さな変更）をやるなら、同じ組み方で
  よい。** ただし **reviewer への依頼文に「別プロジェクトで実測してよい」と
  明示する**と早い。今回は reviewer が自分で scratch にプロジェクトを作って
  確かめたが、依頼文にその許可が無ければ「仕様上こうなるはず」で止まって
  いた可能性がある。ビルド設定のように**このリポジトリで試すと副作用が出る**
  変更では、これを最初から書く
- **main が料金の 56% を占めた。** 依頼文を 3 通書き、差分を自分でも読み、
  verifier が落ちた分を引き取ったため。依頼文をファイルで渡す形は
  維持してよいが、**差分の確認を main と verifier で二重にやっている**分は
  減らせる。次は verifier の報告を読むだけにして、main は `git diff --stat` に
  留める

分担の理由と各担当の報告は `archives/agents/TODO-014/` にある。
