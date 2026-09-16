# TODO-076 reviewer の報告

対象: 未コミットの差分すべて（`git diff` と、追跡されていない
`src/ytbg/paths.py`・`tests/test_paths.py`・`tests/test_cli.py`）。

実測は scratchpad のスクリプトで行った（CLI を `CliRunner` で呼び、
`_run()` / `create_app()` を差し替えて引数を見る）。lint と型チェックは
implementer の報告どおり 0 件（`ruff check .`、`mypy src` を再実行して確認）。
`uv run pytest` は 374 passed（1 回）。

---

## 要修正

### 1. `_set_base_dir()` は board では効いていない。説明も実装と違う

`src/ytbg/__main__.py:77-85`、`src/ytbg/__main__.py:116`、
`docs/Developer.md:117-122`

`_set_base_dir()` の docstring と Developer.md は、`--dir` を
`os.environ['YTBG_DIR']` へ移す理由を「`BackgammonServer` と、lobby が
起動するボードの子プロセスへ伝えるため」と書いている。前半は成り立って
いない。`board` は `resolve(base_dir, config)` に `--dir` を直接渡し、
さらに `create_app(..., paths.data)` → `BackgammonServer(..., data_dir)` で
解決済みの data を渡すので、`BackgammonServer` は環境変数を読まない。

**実測**: `_set_base_dir` を no-op に差し替えて
`ytbg board --dir /tmp/BASE1 9`（環境変数 `YTBG_DIR` は未設定）を呼ぶと、
`create_app()` に渡る data は `/tmp/BASE1/data` のままだった。つまり
`board` での環境変数の書き換えは、どこからも読まれない。

**実測**: `_set_base_dir` を no-op にしたまま `uv run pytest` を走らせると
**374 passed**。この関数の効き目を見るテストが 1 件も無い。唯一効いている
経路（lobby の `--dir` → 子プロセス）にもテストが無い
（`tests/test_lobby.py` の実プロセス起動は `--dir` ではなく環境変数
`YTBG_DIR` を直接渡している）。

`os.environ` を書き換えるコストは実際に出ていて、`tests/test_cli.py:29-31`
には「board が `--dir` を環境変数へ移すので、そうしないとテストの後に残る」
という但し書きと、そのための `monkeypatch.setenv` が入っている。

判断が要る点: `-c` は `BoardProcess.start()` から `-c <path>` で明示的に
子へ渡しているのに、基準だけ環境変数で暗黙に渡している。`BoardProcess` に
`--dir` も渡して `_set_base_dir()` ごと消すと、経路が 1 本になり、
`test_start_passes_config` と同じ形でテストもできる。

### 2. `docs/Admin.md:53-54` が、同じ差分で直した表と矛盾する

差分は `docs/Admin.md:42` の `-i` の行を
「省くと設定ファイルの値、それも無ければ `images1a`」に直し、
`docs/Admin.md:47-48` に「`-p` と `-i` を省くと設定から取る」を足した。
その 5 行下の

> **`-i` は毎回指定すること。** 既定値は `static/` に無いディレクトリを
> 指しているので、省くと盤面の画像が出ない。

がそのまま残っている。`src/ytbg/webroot/static/` に `images1a` は実在する
（`ls` で確認）ので、この文は今は誤り。implementer は「TODO-040 の時点で
古い、今回とは無関係」として範囲外にしているが、**直上の記述をこの差分で
書き換えた以上、読み手にはこの差分が作った矛盾に見える。**

### 3. 設定ファイルの `[[board]]` が 1 件でも壊れていると、CLI で全部
指定した board まで起動しなくなる

`src/ytbg/__main__.py:88-93`、`src/ytbg/__main__.py:121-129`

`_board_config()` は `load_config()` を通すので、`[[board]]` の検証が
**その board と関係ない項目まで**走る。

**実測**: 設定ファイルに
`[[board]] server_id="9" port=5009 image_dir="imgX"` と
`[[board]] server_id="7"`（`port` 無し）を書き、
`ytbg board --dir <base> -p 1 -i z 9` を実行 →
`Error: <base>/ytbg.toml: [[board]] #2: "port" is required` で exit 1。

従来 `board` は設定ファイルを一切読まなかったので、これは挙動の後退。
`ytbg.toml` は lobby のための `[[board]]` が並ぶファイルなので、その中の
1 件の誤りで全ボードが起動しなくなる。決めた仕様は「CLI が勝つ」なので、
CLI で `-p` と `-i` の両方を指定した場合まで止まるのは仕様と合っていない。

判断が要る点: (a) `port` と `image_dir` の両方が CLI で指定されていれば
`_board_config()` を呼ばない、(b) board では `[[board]]` の検証に失敗しても
警告にとどめて既定で続ける、(c) 今のまま（設定の誤りは必ず起動前に止める）
のどれを採るか。

---

## 検討

### 4. 環境変数と引数の 2 経路が併存している

`src/ytbg/server.py:54-70`、`src/ytbg/app.py:77,102`

`BackgammonServer(..., data_dir=None)` の `None` の枝（自分で `resolve()` を
呼ぶ）は、**本番では通らない**。`board` は必ず `paths.data` を渡すので、
この枝を通るのは `BackgammonServer` を直接作るテストと、`data_dir` を
省いた `create_app()`（`tests/test_ws.py`）だけ。

つまり `tests/conftest.py` の `YTBG_DIR` 差し替えと
`tests/test_datafile_dir.py` は、本番が通らない枝を見ていることになる。
ブラウザテスト（実プロセス）は `board()` の中の `resolve()` を通るので
本番と同じ経路だが、Python 側のテストだけ経路が違う。

`docs/Developer.md:117-121` の
「`BackgammonServer` は作られるときに `resolve()` を呼ぶので、環境変数は
import のあとに差し替えても効く」も、この枝限定の話になっている。
`CLAUDE.md:165-167` の「この環境変数は `BackgammonServer` を作るときに読み」
も同様。

寄せるなら、`create_app()` / `BackgammonServer` は `data_dir` を必須にして
テスト側が渡す（置き場所の解決は `__main__` だけが持つ）形が素直。

### 5. `load_config()` の空の扱いが非対称

`src/ytbg/lobby.py:82-89`

**実測**: `board` キーが無い → `[]`（起動できる）。`board = []`（空リスト）
→ `ConfigError: no [[board]]`。同じ「ボードが 0 件」でも結果が違う。
`docs/Developer.md:127-130` は「`[[board]]` が 1 つも無くてよい」としか
書いていないので、`board = []` を書いた利用者は説明どおりに動かない。

なお **CLI から見た挙動は保たれている**ことは確認した。`[path]` だけの
ファイルと空のファイルで `ytbg lobby` を実行すると、どちらも exit 1 で
`Error: <path>/ytbg.toml: no [[board]]`（従来と同じ文言）。空リストを
受けた側は `src/ytbg/__main__.py:158-159` で確かに弾いている。

### 6. `no [[board]]` の文言が 2 か所にある

`src/ytbg/lobby.py:88` と `src/ytbg/__main__.py:159`。片方だけ直すと
入口によって文言が変わる。

### 7. 設定ファイルを 1 起動で 2 回パースする

`resolve()`（`paths.py:58` の `_path_table()`）と `load_config()` が
それぞれ `tomllib.load()` する。`board` でも `lobby` でも毎回 2 回読む。

`resolve()` が呼ばれるたびに読み直す形ではあるが、1 プロセスで 1〜2 回
なので実害は無い（テストでは毎回読むが、`tmp_path` の小さいファイル）。
**問題視するほどではない**が、`Paths` に生の dict を持たせるか、
`load_config()` に読んだ結果を渡せるようにすれば 1 回で済む。

### 8. 最上位のキーは検証していない

`src/ytbg/paths.py:74-83` は `[path]` の**中**の unknown key を弾き、
`load_config()` は `[[board]]` の**中**の unknown key を弾くが、
最上位のテーブル名は誰も見ていない。

**実測**: `[paths]`（複数形の打ち間違い）を書いた設定ファイルで
`resolve()` を呼ぶと、エラーにも警告にもならず `<base>/data` が返る。
中の打ち間違い（`date = "d"`）は弾くのに、外は黙って無視するのは非対称で、
利用者が気づけない。

### 9. `[path] data = ""` が基準そのものになる

**実測**: `[path]\ndata = ""` で `resolve(base).data` は `base` 自身。
`.jsonl` が `ytbg.toml` と同じ場所に並ぶ。`""` は打ち間違いのはずなので、
`val` が空文字なら `ConfigError` にするほうが揃う（`must be str` の検証は
あるが、空文字は通る）。

同様に `data = "../x"` は `<base>/../x` のまま（`Path.resolve()` を
呼んでいない）ので、ログに出る保存先が読みにくい。

### 10. `-c` の相対パスがそのまま子へ渡る

`src/ytbg/paths.py:102-103` は `expanduser()` だけで `resolve()` を
呼ばないので、`ytbg lobby -c ytbg.toml` のときの `paths.config` は相対の
まま。`BoardProcess.start()`（`src/ytbg/lobby.py:204-205`）はそれを
`-c <相対パス>` で子へ渡す。子は `cwd` を指定せずに起動していて lobby と
同じ cwd を継ぐので**今は動く**（CLAUDE.md の開発手順
`uv run ytbg lobby -c ytbg.toml` がこれに当たる）が、cwd に依存している
ことがコードからは読めない。絶対パスに直してから渡すほうが安全。

### 11. `docs/Admin.md:287` の「画像 | `~/.ytbg/images/`」

「既定の場所」の表に並べているが、今の `-i` はパッケージの中の
`static/` の下の名前しか受けない（`docs/Admin.md:42` と矛盾して見える）。
下に「まだ無い」と注記はあるが、表からは読めない。TODO-077 が入るまでは
表から外すか、行に「(TODO-077 で使う。いまは未使用)」相当の但し書きを
付けるほうが誤解が少ない。

### 12. `tests/browser/helper.mjs:86,98` の変数名 `data_dir`

`YTBG_DIR`（＝基準）に渡す値になったので、名前が中身と合っていない
（`lobby.test.mjs` の `dir` は合っている）。直上のコメントは
「置き場所」に直っている。

---

## 好みの範囲

### 13. 引数の型注釈

`_set_base_dir(base_dir)`（`__main__.py:77`）、
`_board_config(config, server_id)`（`__main__.py:88`、返り値だけ注釈あり）、
`create_app(..., data_dir=None)`（`app.py:77`）、
`BackgammonServer.__init__(..., data_dir=None)`（`server.py:54`）に
引数の注釈が無い。既存コードも混在しているので既存の慣習には反しないが、
`paths.py` は全部付いているので、そこだけ揃っていない。

### 14. `_board_config()` の二度手間

`Path(config).exists()` で見てから `load_config(config)` が改めて開く。
`load_config()` は無いファイルを `ConfigError` にする仕様なので必要な
ガードではあるが、`board` 側から見ると「無ければ既定」という意図が
`exists()` に埋もれている。

---

## 確認したが、問題は無かったもの

- **`--port` / `--image_dir` の既定を `None` にした件。** `if port is None`
  で見ているので、`-p 0`（OS に選ばせる）はこれまでどおり 0 が通る。
  **実測**: `-p 0` → 0、`-i ''` → `''`。設定に該当の `server_id` が
  無いときは `DEFAULT_PORT`(5001) / `DEFAULT_IMAGE_DIR`('images1a') で、
  設定ファイルが無いときも同じ（`tests/test_cli.py::test_defaults`、
  `test_other_server_id`）。設定の `server_id = 1`（整数）と CLI の `'1'`
  が合うことも実測した（`load_config()` が str に直している）。
- **`load_config()` が `[]` を返すようになった件。** 上の 5 のとおり、
  CLI の入口では従来と同じ文言・同じ終了コードで落ちる（実測）。
- **書き方の慣習。** ログは `{}` と引数（`paths.py:113`、
  `__main__.py:131,161`、`server.py:55`）。`getLogger('paths')` は
  クラスの無いモジュールの `app.py` と同じ形。コメントと docstring は
  日本語で周りに合っている。`ruff check .` と `mypy src` は 0 件。
- **`docs/Developer.md` に TODO の番号は足されていない**（既存の
  `TODO-069` は差分の外）。
- **過剰実装。** `Paths.log` / `Paths.images` は今は誰も使わないが、
  「`[path]` に `data`・`log`・`images` を書ける」は TODO-076 で利用者と
  決めた範囲なので、先取りではない。`paths.py` の docstring にも
  「log は TODO-078、images は TODO-077」と断ってある。
- **テストの隔離。** `tests/conftest.py`・`tests/test_cli.py`・
  `tests/test_paths.py`・`tests/test_ws.py`・`tests/test_lobby.py`・
  `tests/browser/helper.mjs`・`tests/browser/lobby.test.mjs` は
  いずれも `YTBG_DIR`（と多くは `HOME`）を一時ディレクトリへ逃がして
  いるので、利用者の `~/.ytbg/` は読み書きされない。
- `Storage.save()` の `mkdir(parents=True, exist_ok=True)` は
  `test_data_dir_is_made_when_saving` が見ている。

---

## 範囲について（管理者の判断が要る）

`CLAUDE.md` がこの差分に含まれている（`YTBG_DATA_DIR` → `YTBG_DIR` の
書き換え、14 行）。implementer の報告には「implementer は `CLAUDE.md` を
触らない決まりなので、管理者か wording の担当で直してほしい」とあり、
報告と差分が食い違っている。誰がいつ直したのか、利用者の承認を得たのかを
確かめてほしい。内容そのものは 4 の指摘（「`BackgammonServer` を作るときに
読み」が本番では成り立たない）を除けば新しい仕様と合っている。

それ以外に、指示に無い変更は見つからなかった。
