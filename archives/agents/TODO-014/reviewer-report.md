# TODO-014 レビュー報告

対象: 未コミットの `git diff`（`CLAUDE.md` / `pyproject.toml` / `ytbg.js` /
`index.html` / `uv.lock`）。**コードは直していない。**

実測は、リポジトリを触らずに済むよう scratch ディレクトリに作った別の
プロジェクトで行った（uv のビルド環境のキャッシュにある hatchling 1.32.0 /
hatch-vcs 0.5.0 / setuptools_scm 10.2.1 / vcs_versioning 2.3.1 を使用）。
このリポジトリでは `uv sync` も `git tag` も実行していない。

## 要修正

### 1. `pyproject.toml:49-52` — cache-keys が既定のキーを置き換える

`cache-keys = [{ git = { commit = true, tags = true } }]` だけを書くと、
uv の既定のキー（`pyproject.toml` の変更）が**置き換わって消える**。その結果、
`pyproject.toml` を編集しただけでは editable インストールが再ビルドされない。

実測（scratch プロジェクト、uv 0.12.11）:

- cache-keys が git のみ: `description` を `AAA` → `BBB` に書き換えて
  `uv sync` → インストール済みの `METADATA` は `Summary: AAA` のまま
- cache-keys 無し（既定）: 同じ操作で `Summary: BBB` に更新される

タグやコミットを打てば再ビルドされるので気付きにくいが、コミット前に
`[project.scripts]` や依存、`[tool.hatch.build.*]` を足しても反映されない。
`cache-keys = [{ file = "pyproject.toml" }, { git = { commit = true, tags = true } }]`
のように、既定のキーを明示して足しておくのがよい。

なお、この節の本来の目的（タグを打ったら再ビルド）は動く。実測で、HEAD に
新しいタグを打っただけ（新しいコミット無し）で `uv sync` すると
`bar-1.1.1.dev1` → `bar-2.0.0` に入れ替わった。CLAUDE.md の追記の内容自体は
正しい。

## 検討

### 2. タグを持たない clone では、エラーにならず `0.1.devN` になる

実測:

- `git clone --no-tags` した作業ツリー → バージョンは `0.1.dev4`
- `git clone --depth 1`（shallow）→ `0.1.dev1`
  （`"..." is shallow and may cause errors` の UserWarning だけ出る）

止まらずに間違った値が通るので、画面表示にも保存ファイルの
`server_version` にも `0.1.dev1` が入る。TODO.md の「引っかかる点」には
「git の無い環境ではタグを引けない」とあるが、**git はあるがタグが無い**
この経路は書かれていない。CLAUDE.md か TODO.md に「タグごと clone する」旨を
一行足しておくと安全。`fallback-version` はこの場合に効かない（SCM の取得
自体は成功しているため）が、**この点は未確認**。

### 3. `ytbg.js:2670-2671` — `// Title` ブロックが完全な死にコードになる

`ver_el` の 2 行を消した結果、残るのは
`const name_el = document.getElementById("name");` の 1 行と `// Title` の
コメントだけになった。`name_el` は変更前から未参照で（`git show HEAD:` の
grep で確認）、`index.html` に `id="name"` の要素も無い（grep で 0 件）。
`MY_NAME`（`ytbg.js:66`）も定義だけで参照が無い。

依頼文が「`MY_NAME` は残す」と指定していたので実装の判断は正しい。ただ、
何も指していないコメントと変数が残るので、まとめて消すか、別項目として
残すかを決めるとよい。

### 4. TODO.md のチェックリストと実装の範囲が食い違っている

`TODO.md:154` の「`tests/test_save_load.py` の `'0.80'` 直書きを直す」は、
implementer-request で「直さない」と決めた（`hist_ent2str()` に渡す入力値で
パッケージのバージョンとは無関係、という理由。コードを読んで確認したとおり
妥当）。決着させるときに、TODO.md 側のこの行を「対応しない・理由」の形に
書き直さないと、やり残しに見える。

## 見たうえで問題が無かったところ

- **表記が決めたとおりになる。** 実測で、タグちょうどのコミット →
  `1.0.0`、そこから 3 コミット → `1.0.1.dev3`、`+g<hash>` は付かない。
  作業ツリーが dirty でも `1.0.1.dev3` のまま（`+dirty` が付かない）
- **`version_scheme` を明示していないのは問題ない。** 既定は
  `guess-next-dev`（`vcs_versioning/_config.py:88`）で、上の表記になる。
  `local_scheme = "no-local-version"` も有効なスキーム名
  （`vcs_versioning` の entry points に存在）
- **配布物で壊れない。** 実測で、sdist を展開して `.git` の無い状態から
  wheel をビルドでき、バージョンも `1.0.1.dev3` のまま保たれた
  （setuptools_scm の PKG-INFO fallback、`_fallback_workdir.py:147`）。
  `[tool.hatch.build.targets.sdist]` の `exclude`（`/docs` `/archives`
  `*.xcf` `*.pptx`）は PKG-INFO を落とさないので影響しない。
  `.git` も PKG-INFO も無いディレクトリ（GitHub の ZIP など）では、
  分かりやすいメッセージでビルドが失敗する
- **保存ファイルへの影響は無い。** `server_version` は文字列としてしか
  扱われていない。`hist_ent2str()`（`yt_backgammon_server.py:209`）は
  `"{h["server_version"]}"` と引用符付きで埋めるだけ、`load_data()` は
  `history` / `fwd_hist` のキーしか見ておらず、バージョンの比較も解析も
  無い。`ytbg.js:3466` も受け取った値をそのまま返しているだけ。
  既存の `"0.80"` のファイルも `1.0.1.devN` のファイルも同じに読める
  （実際に読ませる確認は verifier の範囲）
- **`id="version"` を参照するコードは他に無い**（`src/ytbg/webroot/` を
  grep して 0 件）。`ytbg.html` と `README.md` にもバージョン表示は無い
- **`CLAUDE.md` の追記は周りに揃っている。** 「実行」の節の `uv sync` の
  説明の直後、`（TODO-014）` 付き、行幅も既存の段落と同程度（最大 73 桁）
- **範囲外の変更は無い。** `0.80` / `0.96` の残りは `TODO.md` と
  `archives/` だけで、どちらも記録なので直す対象ではない
