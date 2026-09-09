# TODO-013 最終確認報告（verifier・2 回目）

`implementer-report3.md` の内容（`tests/test_on_json.py` の 5 テストを
`player`/`index` に `1` を渡す形へ変更）を検証した。**今回は前回の反省
（`\cp -a` した複製の `.venv/bin/pytest` shebang が元リポジトリの python を
指し、ミューテーションを入れても常に無傷のソースが走ってしまう）を踏まえ、
作業ツリーで直接 `src/` を壊して `git checkout --` で戻す方法で確認した。**
コードは直していない（ミューテーションはすべて確認後に元へ戻し、
最終的に `git diff --stat src/` が空であることを確認済み）。

## 1. 走ること

- `uv run pytest -q` — **57 passed**
- `uv run ruff check .` — **All checks passed!**
- `uv run mypy src` — **7 errors**、すべて `src/ytbg/__main__.py`
  （`"None" has no attribute ...`）。TODO-002 の既存の指摘と一致

## 2. `git diff --stat src/` が空であること

作業の最後に確認。出力なし（変更なし）。

## 3. ミューテーション（今回の修正対象 5 件）

`src/ytbg/yt_backgammon.py` の各メソッドで `data['player']`
（`set_clock_limit` のみ `data['index']`）を `0` に固定し、対応する
テストだけ（`pytest -q -k <名前>`）を実行、その後 `git checkout --` で
元に戻した。

| メソッド | ミューテーション | 結果 |
|---|---|---|
| `dice()` | `data['player']` → `0` | 失敗（`test_dice_updates_only_target_player`、`test_cube_and_dice` も道連れで失敗） |
| `set_playername()` | 同上 | 失敗（`test_set_playername_updates_only_target_player`） |
| `set_score()` | 同上 | 失敗（`test_set_score_updates_only_target_player`）— **前回検出できなかった穴が塞がったことを確認** |
| `set_clock_limit()` | `data['index']` → `0` | 失敗（`test_set_clock_limit_updates_only_target_index`） |
| `set_player_clock()` | `data['player']` → `0` | 失敗（`test_set_player_clock_updates_only_target_player`） |

5 件とも狙ったテストが正しく落ちることを確認した。

## 4. 代表 3 種の回帰確認（前回検出できていたものが今も落ちるか）

作業ツリーで直接壊し、`uv run pytest -q`（全件）を実行して確認。

| ミューテーション | 結果 |
|---|---|
| `put_checker()` の `player = int(ch_id / 100)` を `player = 0` に | 2 failed（`test_put_checker_updates_only_target`、`test_put_checker_derives_player_from_id`） |
| `on_json()` 末尾の `if msg['history']:` を `if True:` に | 1 failed（`test_history_false_does_not_append`） |
| 末尾の `emit('json', msg, broadcast=True)` から `broadcast=True` を外す | 1 failed（`test_put_checker_broadcasts_msg`） |

いずれも今回の修正で壊れておらず、依然として正しく検出できる。

## 後始末

- `git diff --stat src/` — 空（最終確認済み）
- `git status --short` — `tests/conftest.py`（既存の変更）、
  `tests/test_on_json.py`（未追跡）、`archives/agents/TODO-013/`
  （未追跡）のみ。`src/` は変更されていない

## 残る懸念

特になし。依頼された確認項目（1〜4）はすべて期待どおりの結果だった。
