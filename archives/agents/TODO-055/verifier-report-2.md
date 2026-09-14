# TODO-055 verifier-report-2

reviewer-report.md の検討 1〜8 と verifier-report.md の 5-(b) への修正を確かめた。
コードは直していない。

## 1. 検証コマンド（1 回ずつ）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 292 passed, 1 warning（exit 0）。以前の 291 件から +1
  （足された `test_header_only_file_starts_with_one_entry`） |
| `uv run ruff check .` | All checks passed!（exit 0） |
| `uv run mypy src` | Success: no issues found in 12 source files（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | 103 pass / 0 fail |

JS を変えていないので `node --test tests/browser/` は指示どおり走らせていない。

## 2. 5-(b)（`load_data()` を「履歴 0 件でも True」に壊す）

`src/ytbg/server.py` の `return len(self._hist) > 0` を `return True` に書き換え、
一時 `HOME` で `.venv/bin/python -m pytest tests/test_save_load.py -q` を実行。

```
TMPHOME=/tmp/tmp.1CtvWVtw4c
.................................F...                                    [100%]
FAILED tests/test_save_load.py::test_header_only_file_starts_with_one_entry
    assert 0 == 1
     +  where 0 = len([])
     +    where [] = <ytbg.history.History object at ...>.entries
1 failed, 36 passed in 0.13s
```

足したテスト `test_header_only_file_starts_with_one_entry` が狙いどおり落ちた。
以前の verifier-report.md で指摘した「この分岐を検出するテストが無い」は解消している。

書き換えは `sed` で 1 行だけ戻し、`git diff --stat src/ytbg/server.py` が
実験前と同じ（34 行の差分）であることを確認した。

## 3. レビューの検討 1〜8 との対応

| 検討 | 内容 | 確認結果 |
|---|---|---|
| 1 | `HOME` も差し替えないと、退行時に本物の `$HOME` へ書く | `git diff` で確認。`tests/conftest.py` の `make_bg_server` と `bg_server_raw`、
`tests/test_ws.py` の `client` フィクスチャ、いずれも `monkeypatch.setenv('YTBG_DATA_DIR', ...)` に
加えて `monkeypatch.setenv('HOME', str(tmp_path))` を足している。直っている |
| 2 | `Developer.md` の「type を足すときに直すのはこの表だけ」が言い切りすぎ | `docs/Developer.md` の該当箇所に「音やダイスの回転が要るときは、クライアントの
`Board.apply()` にも足す。」の 1 文が追加されている。直っている |
| 3 | `Developer.md` の「free move の…得点の ▲▼」の掛かり方が曖昧 | 該当箇所が「free move での目の変更と、得点の ▲▼（free move に限らない）も、
予測した盤面を先に表示してから送る。」に分けて書き直されている。直っている |
| 4 | `load_data()` の docstring 1 行目が「False なら何も書き換えない」と読める | `src/ytbg/server.py` の docstring が「読めないか、履歴が 1 件も無ければ False を返す。
初回起動もそこを通る。読めて履歴が 0 件のときは、クロックだけは読んだものに差し替わる。」
に直っている。直っている |
| 5 | `TODO.md` がまだ `docs/design.md` を指す | 対象外（指示どおり。項目を閉じるときに直す） |
| 6 | `CLAUDE.md` で「現行仕様ではない」が 2 回続く | 該当箇所は「TODO-049 で決めた構成の見直し（第 3 弾）の設計は
`archives/docs/design-3.md` にあり…**どちらも現行仕様ではないので、実装の根拠として
引かないこと。**」の 1 文にまとまっている。直っている |
| 7（好みの範囲） | 足した行の表示幅が 78 を超える | 確認していない（好みの範囲であり、指示に無いため深追いしていない） |
| 8（好みの範囲） | `fake_add_history(gameinfo=None)` の既定値、`add_history()` の注釈欠落 | `tests/test_clock.py` は `fake_add_history(gameinfo)` に既定値なし。
`src/ytbg/server.py` は `def add_history(self, gameinfo: GameInfo):` に注釈が付いている。
直っている |

## 4. `git status` / `git diff` と指示の対応

指示（`tests/conftest.py` と `tests/test_ws.py` で `HOME` も `tmp_path` に差し替え、
`tests/test_save_load.py` にテストを 1 つ足し、ほかは docstring・コメント・
`CLAUDE.md`・`docs/Developer.md` の書き方と `add_history()` の注釈、
`test_clock.py` の既定値）と、変更されたファイル一覧を照らした。

```
M CLAUDE.md
RM docs/design.md -> archives/docs/design-3.md
M archives/docs/design-3.md
M docs/Developer.md
M src/ytbg/history.py
M src/ytbg/server.py
M src/ytbg/webroot/static/js/rules/position.js
M tests/browser/helper.mjs
M tests/conftest.py
M tests/test_clock.py
M tests/test_datafile_dir.py
M tests/test_history.py
M tests/test_named_ops.py
M tests/test_save_load.py
M tests/test_ws.py
?? archives/agents/TODO-055/
```

このうち `archives/docs/design-3.md`、`docs/design.md` の移動、`src/ytbg/history.py`、
`src/ytbg/server.py`（`load_data()` 以外の部分）、`src/ytbg/webroot/static/js/rules/position.js`、
`tests/test_datafile_dir.py`、`tests/test_history.py`、`tests/test_named_ops.py` の差分は、
TODO-055 の前段（reviewer が見た時点の差分）に含まれるもので、今回の依頼（レビュー後の
追加修正）の対象ではない。今回の依頼で新たに直った範囲は `tests/conftest.py`・
`tests/test_ws.py`（`HOME` の差し替え）・`tests/test_save_load.py`（テスト追加）・
`CLAUDE.md`・`docs/Developer.md`・`src/ytbg/server.py`（`load_data()` の docstring）・
`tests/test_clock.py`（既定値）・`src/ytbg/server.py`（`add_history` の注釈）で、
指示の範囲と一致している。指示に無いファイルの変更は見当たらない。

`tests/browser/helper.mjs` の `headless: false` は利用者に頼まれた一時的な変更として
対象外にした（変更していないことを diff で確認）。

## 5. 検証の前後で `~/ytbg-*` の更新時刻

`ls -l --time-style=full-iso ~/ytbg-*` を検証の前後（`uv run pytest` 一式・
5-(b) の壊し方の実験の前後）で比較し、すべて変わっていないことを確認した。

```
ytbg-1.json    2026-09-11 04:43:36
ytbg-1.jsonl   2026-09-12 16:06:22
ytbg-2.json    2026-09-09 23:01:00
ytbg-2.jsonl   2026-09-12 04:53:32
ytbg-3.json    2026-09-09 23:04:27
ytbg-3.jsonl   2026-09-12 16:09:45
ytbg-4.json    2026-09-09 23:01:00
ytbg-4.jsonl   2026-09-12 04:53:32
ytbg-test.json  2026-09-11 07:57:24
ytbg-test.jsonl 2026-09-12 04:53:32
```

## 確かめられなかったこと・判断が要る点

- 検討 7（好みの範囲、行の表示幅）は直したかどうかを確認していない。
  指示（好みの範囲は対象外）どおりに扱った。
- `docs/Developer.md` の書き直し内容全体が実装と完全に一致しているかは、
  今回も目視の範囲に留めている（機械的な突き合わせはしていない）。
