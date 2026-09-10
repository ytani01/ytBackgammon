# TODO-021 verifier 報告

## 走らせた検証（すべて `/home/ytani/work/ytBackgammon` で実行）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `node --test tests/browser/` | 0 | tests 5, pass 5, fail 0（duration_ms 10318） |
| `uv run pytest` | 0 | 101 passed in 1.78s |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 5 source files |

4 件とも通った。落ちた箇所は無い。

`node --test` の出力全体:

```
▶ ブラウザでの基本の動作確認
  ✔ 盤面が描画される (294.797256ms)
  ✔ Roll ボタンでダイスが出る (164.585911ms)
  ✔ チェッカーをドラッグできる (364.645815ms)
  ✔ 2 枚目のタブに同期する (144.799328ms)
  ✔ コンソールエラーが出ていない (1.486372ms)
✔ ブラウザでの基本の動作確認 (4995.419712ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10318.372405
```

## 利用者のデータへの影響

`node --test tests/browser/` の前後で `~/ytbg-*.json` を比較した。

実行前:
```
.rw-r--r-- 67k ytani 11  9月 04:43 /home/ytani/ytbg-1.json
.rw-r--r-- 791 ytani  9  9月 23:01 /home/ytani/ytbg-2.json
.rw-r--r-- 28k ytani  9  9月 23:04 /home/ytani/ytbg-3.json
.rw-r--r-- 791 ytani  9  9月 23:01 /home/ytani/ytbg-4.json
```

実行後（同一）:
```
.rw-r--r-- 67k ytani 11  9月 04:43 /home/ytani/ytbg-1.json
.rw-r--r-- 791 ytani  9  9月 23:01 /home/ytani/ytbg-2.json
.rw-r--r-- 28k ytani  9  9月 23:04 /home/ytani/ytbg-3.json
.rw-r--r-- 791 ytani  9  9月 23:01 /home/ytani/ytbg-4.json
```

ファイル名・タイムスタンプとも変化なし。**増えていない・更新されていない。**

## 後始末

- `node --test tests/browser/` 実行後に `pgrep -af ytbg` を実行 → ytbg
  プロセスは残っていない（マッチしたのはこのコマンド自身の zsh 起動行のみ）。
  実行前に確認していたときも同じで、ytbg プロセスは元々起動していなかった。
- `ls -d /tmp/ytbg-test-*` → `no matches found`（一時ディレクトリは残っていない）。

**`pkill` は使わず、`pgrep -af` のみで確認した。**

## CLAUDE.md の「実行」の節どおりに走らせられるか

書かれたコマンドをそのまま打った。

- `npm install`（実装時にすでにインストール済みで `node_modules/` が
  存在していたため、今回改めて `npm install` は実行していない。
  `node_modules/playwright`・`node_modules/playwright-core` の存在は確認した）
- `node --test tests/browser/` → 上記のとおり通った
- `uv run pytest` / `uv run ruff check .` / `uv run mypy src` → いずれも通った

`npm install` そのものを実行してのゼロからの確認は行っていない
（既存の `node_modules/` を壊すことになるため見送った。判断が要る点として
下に記す）。

## 変更ファイルと指示範囲の一致

`git status`:

```
Changes not staged for commit:
	modified:   .gitignore
	modified:   CLAUDE.md
	modified:   src/ytbg/yt_backgammon_server.py

Untracked files:
	archives/agents/TODO-021/
	package-lock.json
	package.json
	tests/browser/
```

TODO-021 の指示範囲（`package.json`、`package-lock.json`、`.gitignore`、
`CLAUDE.md`、`tests/browser/`、`src/ytbg/yt_backgammon_server.py` の 1 行、
`archives/agents/TODO-021/`）と一致しており、範囲外のファイルは無い。

`src/ytbg/yt_backgammon_server.py` の diff:

```diff
-    DATAFILE_DIR = os.getenv('HOME')
+    # 保存先。ブラウザでの動作確認は実プロセスを起動するので、
+    # 環境変数で一時ディレクトリへ逃がせるようにしてある (TODO-021)
+    DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
```

**本体側の変更はこの 1 行（＋コメント 2 行）だけ**であることを確認した。

`.gitignore` と `CLAUDE.md` の diff も確認した。`.gitignore` は
`!package.json` / `!package-lock.json` の例外追加と `node_modules/` の
追加のみ。`CLAUDE.md` は「実行」の節へのコマンド追加と、ブラウザ確認の
分担・注意点の追記のみで、指示の範囲に収まっている。

`tests/browser/` の中身は `board.test.mjs` と `helper.mjs` の 2 ファイル。

## 確かめられなかったこと・判断できないこと

- **implementer 報告にある「わざと壊して落ちることを確かめた」4 通りは
  再現していない。** 今回の指示（「特に確かめること」）には含まれておらず、
  再現するには `src/` と `ytbg.js` を一時的に壊す必要があり手間も大きいため
  見送った。テストが「通ることだけ」を見ていないかどうかは、レビュー担当の
  判断に委ねるべきと考える（この点は判断できない）。
- **`npm install` をゼロから実行しての確認はしていない**（上記のとおり
  既存の `node_modules/` を使った）。`package.json` / `package-lock.json`
  の内容だけを見て妥当と判断したが、実際に空の環境で `npm install` が
  ブラウザを落とさずに完了するかまでは確認していない。
- `DATAFILE_DIR` の条件式（`os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')`）
  が意図どおりに効くかは、`board.test.mjs` の実行で `~/ytbg-*.json` が
  増えなかったことから間接的に確認できているが、条件式そのものの
  良し悪し（例えば `YTBG_DATA_DIR` が空文字のときの挙動など）は
  reviewer の担当と考え、ここでは踏み込んでいない。

---

## 追記（レビュー後の 3 点の確認）

implementer がレビューを受けて追加した 3 点（`tests/test_datafile_dir.py`
新規、`tests/browser/helper.mjs` の `console_errors()` へのコメント 1 行、
`archives/agents/TODO-021/implementer-report.md` の追記）を確認した。

### 検証コマンド

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 105 passed in 1.70s（`test_datafile_dir.py` の 4 件を含む） |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 5 source files |
| `node --test tests/browser/` | 0 | tests 5, pass 5, fail 0（duration_ms 10284） |

### `tests/test_datafile_dir.py` が狙いを見ているか

`src/ytbg/yt_backgammon_server.py:30` を

```python
DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
```

から

```python
DATAFILE_DIR = os.getenv('HOME')
```

へ一時的に書き換え、`uv run pytest tests/test_datafile_dir.py -v` を走らせた。

```
tests/test_datafile_dir.py::test_ytbg_data_dir FAILED                    [ 25%]
tests/test_datafile_dir.py::test_no_ytbg_data_dir PASSED                 [ 50%]
tests/test_datafile_dir.py::test_empty_ytbg_data_dir PASSED              [ 75%]
tests/test_datafile_dir.py::test_datafile_path FAILED                    [100%]
...
FAILED tests/test_datafile_dir.py::test_ytbg_data_dir - AssertionError: asser...
FAILED tests/test_datafile_dir.py::test_datafile_path - AssertionError: asser...
========================= 2 failed, 2 passed in 0.05s ==========================
```

**`test_ytbg_data_dir` と `test_datafile_path` の 2 件が落ち、implementer の
報告（2 件落ちた）と一致した。** `test_no_ytbg_data_dir` と
`test_empty_ytbg_data_dir` は、`YTBG_DATA_DIR` が無い／空文字のときに
`HOME` を使う経路を見ているだけなので、この壊し方では動作が変わらず
通り続けるのは妥当。

確認後、`src/ytbg/yt_backgammon_server.py:30` を元の
`os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')` に戻し、
`git diff --stat src/ytbg/yt_backgammon_server.py` が壊す前と同じ
（3 insertions, 1 deletion）であることと、
`uv run pytest tests/test_datafile_dir.py -q` が 4 passed に戻ることを確認した。

### `tests/browser/helper.mjs` の変更がコメントだけか

`console_errors()` の本体（`favicon.ico` の除外、origin 判定の 2 条件の
`filter`）は前回確認したときと同じで、変わっていない。追加されたのは
関数上の JSDoc に 1 段落分のコメント（「なお、この振り分けは url が
空文字のもの……も一緒に除いてしまう」）だけで、コードの行は変わっていない。

ただし `tests/browser/` は git 管理下に無い（未追跡）ため、コミット済みの
版と `git diff` を取って機械的に比較することはできなかった。**目視での
確認にとどまる**（前回自分が読んだ関数本体の記憶と、今回読んだ内容を
突き合わせた限りでは一致している、という水準）。

### 変更ファイルの範囲

```
Changes not staged for commit:
	modified:   .gitignore
	modified:   CLAUDE.md
	modified:   src/ytbg/yt_backgammon_server.py

Untracked files:
	archives/agents/TODO-021/
	package-lock.json
	package.json
	tests/browser/
	tests/test_datafile_dir.py
```

前回確認した範囲（`package.json`、`package-lock.json`、`.gitignore`、
`CLAUDE.md`、`tests/browser/`、`src/ytbg/yt_backgammon_server.py` の 1 行、
`archives/agents/TODO-021/`）に、今回追加された `tests/test_datafile_dir.py`
が加わっただけで、指示外のファイルは無い。

### 確かめられなかったこと

- `tests/browser/helper.mjs` のコメント追加が本当に「コメントだけ」かは、
  コミット履歴が無いため機械的な diff では確認できず、目視のみ。
  厳密な確認が要るなら、implementer に変更前後のパッチを別途出させるか、
  一度コミットしてから比較する必要がある。
