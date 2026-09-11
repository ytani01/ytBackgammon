# TODO-035 確認報告（verifier）

## 検証コマンドと結果

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest -q` | 0 | 211 passed, 1 warning |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |

いずれも落ちていない。

## 変更ファイルの一覧（`git diff --cached --name-only`）

- `LICENSE`（新規）
- `src/ytbg/` 12 ファイル（`__init__.py` `__main__.py` `app.py` `clock.py`
  `gameinfo.py` `history.py` `hub.py` `message.py` `mylog.py` `replay.py`
  `server.py` `storage.py`）
- `tests/` 12 ファイル（`conftest.py` `test_broadcast.py` `test_clock.py`
  `test_clock_unit.py` `test_datafile_dir.py` `test_gameinfo_ops.py`
  `test_history.py` `test_message.py` `test_on_json.py` `test_replay.py`
  `test_save_load.py` `test_ws.py`）

指示にあった src 11 + tests 11 という数え方（mylog.py を別扱い）と、
実際に存在するファイル数（src 12、tests 12、計 24）は一致していないが、
これは指示文の数え方の違いで、実際の変更範囲はすべて指示どおり
「src/ytbg/ と tests/ の全 .py ファイルのコピーライト統一」に収まっている。
指示に無いファイルの変更は無い（`.codegraph/` は untracked で今回の
変更に含まれない）。

## 確認項目ごとの結果

1. **LICENSE の体裁** — MIT ライセンスの定型文で、
   `Copyright (c) 2020 Yoichi Tanibayashi` を含む。体裁は満たしている。
2. **pyproject.toml との整合** — `license = "MIT"`（6 行目）で、
   LICENSE の MIT 表記と矛盾しない。
3. **コピーライト表記の統一** —
   `grep -rn "^# (c)" --include="*.py" src/ tests/` で 24 件ヒットし、
   全て `# (c) 2020 Yoichi Tanibayashi` に揃っている（`mylog.py` も
   元の `(c) 2026` から `2020` に変わっている）。表記の不統一は無い。
4. **`__author__` / `__date__` の削除確認** —
   `grep -rn "__author__\|__date__" .` （`.venv/` `.git/` 除外）で
   ヒットしたのは `TODO.md` の記述（本項目の説明文そのもの）だけで、
   コード側（src/ytbg/、tests/、docs/、その他 .md）に実体としての
   参照は残っていない。
5. **`__all__` からの `'__author__'` 削除** —
   `src/ytbg/__init__.py` を確認済み。`__all__` は
   `['WEBROOT', '__prog_name__', '__version__']` で `'__author__'` は
   含まれていない。
6. **diff の余計な変更の有無** — `git diff --cached -- src/ytbg/` を
   全ハンク目視。各ファイルとも次の 2 種類の変更のみ:
   - コピーライト行の `# (c) Yoichi Tanibayashi` →
     `# (c) 2020 Yoichi Tanibayashi`（`mylog.py` のみ `2026` → `2020`）
   - `__author__ = ...` と `__date__ = ...`（存在する場合）の削除の 2 行
   削除後、docstring の閉じ `"""` と次の import 文の間には空行が
   1 行残っており、不自然な空行の増減は起きていない。
   （`awk` で全文の連続空行を機械的に洗い出したところ複数ヒットしたが、
   いずれも既存のデコレータ前などの元からある空行で、今回の diff 行の
   前後とは無関係と確認した。）
   `tests/` 側の diff はコピーライト行 12 件の置換のみで、
   それ以外の変更は無い。
7. **検証コマンド** — 上表のとおり全て通過。

## 確かめられなかったこと・判断が要る点

- 指示文にあった「src 11 ファイル・tests 11 ファイル（計 22）＋
  mylog.py は別」という数え方と、実際のファイル数（各 12、計 24）に
  ずれがある。中身（表記の統一・削除範囲）自体は指示どおりで問題は
  見当たらないが、数え方の食い違いは報告しておく。判断は不要と思われる。
- LICENSE の著作権年を「2020」とした妥当性（実際のプロジェクト開始年か
  どうか）は、コード上から確認できないため判断できない。管理者・実装者の
  認識に委ねる。
