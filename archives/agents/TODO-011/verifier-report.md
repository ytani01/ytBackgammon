# TODO-011 verifier 報告

## 走らせた検証

- `uv run ruff check .` → 終了コード 0、`All checks passed!`
- `uv run pytest -q` → 終了コード 0、`10 passed in 0.03s`
- `uv run mypy src` → 終了コード 1、7 件のエラー。すべて `src/ytbg/__main__.py`
  の `svr` （`None` で初期化）由来（55, 61, 67, 72, 78, 83, 89 行、
  `"None" has no attribute ...`）。変更前から存在する既知の指摘で、
  この項目の対象ファイル（`yt_backgammon_server.py`）には指摘なし。
  完了条件の「変更前から増えていない」を満たす。

## 変更ファイルの範囲

`git status` / `git diff --stat` で変更されているのは
`src/ytbg/yt_backgammon_server.py` の 1 ファイルのみ（+29/-20）。
指示（`hist_ent2str()` の f-string 化、`save_data()`/`load_data()` の
`except` 絞り込み）と一致し、範囲外のファイルは変更されていない。

## `hist_ent2str()` の出力比較

変更前後のコードをそれぞれ `ytbg_old` / `ytbg_new` という別名パッケージ
としてコピーし、`ytBackgammonServer.__new__(ytBackgammonServer)` で
生成したインスタンスに対して両方の `hist_ent2str()` を直接呼んで文字列を
比較した（スクリプト:
`/tmp/claude-649/.../scratchpad/compare.py`、作業ディレクトリの外なので
リポジトリには残していない）。

試したケース（18 通り、いずれも完全一致 `OK`）:

- 日本語の名前（`田中太郎`, `山田花子`）
- 半角スペースを含む名前、先頭スペース
- ダブルクォート・バックスラッシュを含む名前
- 絵文字を含む名前
- `cube.accepted = False`、`cube.side = -1`
- `resign = 0` / `1`
- `turn` が負（`-1`, `-5`）
- `score` が 2 桁・3 桁（`[12,34]`, `[123,456]`、負数含む）
- `clock` / `clock_limit` が 2 桁・3 桁
- 上記を組み合わせた複合ケース（日本語＋クォート＋バックスラッシュ＋絵文字＋
  負の turn/score、`cube.value=64` など）

すべて `old_out == new_out` を確認した（`repr()` でも比較しており、
改行やエスケープの違いも検出できる形にしてある）。

## `save_data()` 全体の出力比較

同様に `_history` / `_fwd_hist` を差し替えて `save_data()` を呼び、
一時ファイルの中身を比較した。

- 履歴 0 件（`_history=[]`, `_fwd_hist=[]`）→ 一致
- 履歴 1 件 → 一致
- 履歴複数件（日本語名を含むエントリを混ぜたもの）＋ `_fwd_hist` 1 件 → 一致

いずれも `SAVE OK` で、`SAVE_ALL_OK` を確認した。

## 確かめられなかったこと・判断が要る点

- **`load_data()` の `KeyError` の扱い。** TODO-011 の節には「絞るなら
  `load_data()` は `OSError` に加えて `json.JSONDecodeError` と、
  `data['history']` が無いときの `KeyError` が要る」と書かれているが、
  実装は `except (OSError, json.JSONDecodeError)` のみで `KeyError` は
  捕まえていない。変更前は `except Exception` だったため `KeyError`
  （`history` キーの無い壊れた JSON）も握りつぶして `0, 0` を返していたが、
  変更後は `KeyError` が上位へそのまま伝播する。これは「保存ファイルの
  中身が変わらない」検証の範囲外で、**挙動が変わったかどうかの妥当性の
  判断**になるため、reviewer 側の担当（分担表にもそう書かれている）と
  考えて verifier からは判断していない。事実として報告する
- `~/ytbg-*.json` の実データは書き換えていない（読んでもいない。今回は
  自作データのみで検証した）

---

## 追加の変更（コメント修正・load_data() の例外拡大・テスト追加）の確認

### 走らせた検証

- `uv run ruff check .` → 終了コード 0、`All checks passed!`
- `uv run pytest -q` → 終了コード 0、`16 passed`（前回の 10 件 ＋ 新規 3 種類
  6 件。`test_load_data_broken_file_returns_zero` は 4 通りの壊れたファイルで
  パラメトライズされている）
- `uv run mypy src` → 終了コード 1、7 件のエラー。前回と同一
  （`src/ytbg/__main__.py:55,61,67,72,78,83,89`、いずれも `svr` が
  `None` 由来）。増えていない

### 変更ファイルの範囲

`git status` で変更されているのは `src/ytbg/yt_backgammon_server.py` と
`tests/test_save_load.py` の 2 ファイルのみ。指示の範囲と一致する。

### 足したテストが本当に効くか（実装を壊して確認）

**手順:** 変更後の `src/ytbg/yt_backgammon_server.py` を作業前に
`/tmp/claude-649/.../scratchpad/current_server_backup.py` へコピーしてから
1 か所ずつ壊し、狙ったテストが落ちることを確認したあと、バックアップから
復元して `git diff` が壊す前と一致することを確認した。

1. **`hist_ent2str()` の末尾、チェッカー2 個目の後ろの空白を 1 つ削った**
   （`f'          {board["checker"][1]} \n'` → 末尾の空白を除去）。
   `test_hist_ent2str_format` のみ実行したところ次で失敗した。

   ```
   >       assert bg_server.hist_ent2str(h) == expected
   E       AssertionError: assert '    {\n     ...  }\n    },\n' == '    {\n     ...  }\n    },\n'
   E         - ], [1, 1]] 
   E         ?           -
   E         + ], [1, 1]]
   ```

   狙ったとおり `test_hist_ent2str_format` が落ちた。復元後、
   `git diff -- src/ytbg/yt_backgammon_server.py` を壊す前に保存しておいた
   パッチ（`restore.patch`）と `diff` して完全一致（差分なし、終了コード 0）
   を確認し、`pytest` が再び 16 件全通過することも確認した

2. **`load_data()` の `except` タプルから `KeyError` を外した**
   （`except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError)`
   → `KeyError` を除去）。`test_load_data_broken_file_returns_zero` を
   実行したところ、4 通りのうち狙った 2 通りだけが失敗した。

   ```
   src/ytbg/yt_backgammon_server.py:288: KeyError
   E           KeyError: 'fwd_hist'
   =========================== short test summary info ============================
   FAILED tests/test_save_load.py::test_load_data_broken_file_returns_zero[no-history-key-{"foo": 1}]
   FAILED tests/test_save_load.py::test_load_data_broken_file_returns_zero[no-fwd-hist-key-{"history": []}]
   2 failed, 2 passed in 0.06s
   ```

   `broken-json`（`JSONDecodeError`）と `invalid-utf8`（`UnicodeDecodeError`）
   は他の例外型で拾われるため通ったまま、`KeyError` が要るケースだけが
   ちょうど落ちた。狙いどおり。復元後、`git diff` の一致とテスト全通過
   （16 件）を確認した

いずれも「実装を壊すと対応するテストだけが落ちる」ことを確認できた。

### `load_data()` 失敗時に `_history` / `_fwd_hist` が書き換わらないこと

`{"history": []}`（`fwd_hist` キーだけ無い）のケースで確認した。
`ytBackgammonServer.__new__()` で作ったインスタンスに
`_history = [{"sn": 1}]`, `_fwd_hist = [{"sn": 2}]` をあらかじめ入れてから
`load_data()` を呼び、戻り値が `(0, 0)` であること、かつ
`_history` / `_fwd_hist` が呼び出し前の値のまま変わっていないことを確認した
（スクリプト: `scratchpad/test_extra.py` の `test_partial_no_overwrite()`、
`PARTIAL_NO_OVERWRITE: OK`）。`history = data['history']` の代入直後、
`fwd_hist = data['fwd_hist']` で `KeyError` になり、`try` を抜けて
`self._history` / `self._fwd_hist` への代入行（`try` の外）には到達しない
ため、局所変数で受ける実装が意図どおり効いていることを確認した。

### `__init__()` 経由で壊れたファイルがあってもインスタンスが作れること

`bg_server` フィクスチャと同じ形（`DATAFILE_DIR` を差し替え、`emit` を
差し替える）で、`ytbg-testinit.json` にあらかじめ次の 3 通りの壊れた内容を
書いてから `ytBackgammonServer(...)` を呼んだ（スクリプト:
`scratchpad/test_extra.py` の `test_init_with_broken_file()`）。

- `{` （壊れた JSON、`JSONDecodeError`）
- `{"foo": 1}` （`history` キーが無い、`KeyError`）
- `{"history": []}` （`fwd_hist` キーが無い、`KeyError`）

いずれも例外を上げずにインスタンスが作れ、`load_data()` が `0, 0` を
返した結果として `__init__()` が新しい初期状態の履歴 1 件を積むところまで
確認した（`INIT_OK for broken-json / no-history-key / no-fwd-hist-key`、
`history` に初期状態のエントリが 1 件、`fwd_hist=[]`）。

### `hist_ent2str()` の出力が変更前と一致すること（再確認）

今回の diff は `hist_ent2str()` 本体を変更しておらず（`save_data()` の
コメントと `load_data()` の例外処理のみ）、前回比較に使った
`ytbg_new` パッケージの `hist_ent2str()` 部分と、今回の
`src/ytbg/yt_backgammon_server.py` の `hist_ent2str()` 部分を
`diff` したところ差分なしを確認した。前回すでに `git show HEAD:...`
（変更前）との完全一致を 18 パターン・`save_data()` 3 パターンで
確認済みのため、再比較の必要はないと判断した。

### 確かめられなかったこと・判断が要る点

- 前回報告した「`load_data()` の `KeyError` の扱い」は、今回の変更で
  `KeyError` が例外タプルへ追加されたことで解消されている（reviewer の
  指摘どおりに直った）。実装の妥当性そのもの（`KeyError` まで握りつぶして
  良いかという設計判断）は今回も reviewer の担当と考え、verifier からは
  判断していない
- `~/ytbg-*.json` は今回も読み書きしていない。壊れたファイルの検証は
  すべて `tmp_path` / scratchpad 上の自作ファイルで行った
