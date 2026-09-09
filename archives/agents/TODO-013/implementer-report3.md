# TODO-013 修正報告（implementer・3 回目）

`archives/agents/TODO-013/implementer-task3.md` の指示にしたがい、
`tests/test_on_json.py` の 5 つのテストを、`data['player']`（`set_clock_limit`
のみ `data['index']`）を実際に読んでいるかどうかを区別できる形に直した。
`src/` は変更していない（ミューテーション実測のときだけ一時的に書き換え、
都度 `\cp` で元へ戻した。作業ツリーで直接壊して戻す方法を取り、
`\cp -a` によるリポジトリ複製は使っていない）。

## 変更した箇所（`tests/test_on_json.py`）

いずれも「`0` 側を指定していたのを `1`（`set_clock_limit` は `index: 1`）に
変え、変わらない側を初期値のべた書きで確認する」形に変えた。`0` のケースを
追加はしていない（依頼どおり、既存のケースを置き換えただけ）。

- `test_dice_updates_only_target_player` — `data: {'player': 1, ...}`。
  `dice[1]` が変わり、`dice[0]` が初期値 `[0, 0, 0, 0]` のままであること
- `test_set_playername_updates_only_target_player` — `data: {'player': 1, ...}`。
  `playername[1]` が変わり、`playername[0]` が初期値 `''` のままであること
- `test_set_score_updates_only_target_player` — `data: {'player': 1, ...}`。
  `score[1]` が変わり、`score[0]` が初期値 `0` のままであること
- `test_set_clock_limit_updates_only_target_index` — `data: {'index': 1, ...}`。
  `clock_limit[1]` が変わり、`clock_limit[0]` が初期値 `120` のままである
  こと（`clock_limit` の初期値 `[120, 12]` は要素ごとに値が違うので、
  「隣が変わっていない」が初期値のべた書きで見られる）
- `test_set_player_clock_updates_only_target_player` — `data: {'player': 1, ...}`。
  `clock[1]` が変わり、`clock[0]` が初期値 `[120, 12]` のままであること

いずれの docstring にも「`0` を渡すと、実装が固定していても区別が付かない
ため `1`（`index` は `1`）を渡す」旨を書いた。

## ミューテーションで落ちることを確かめた結果

依頼書のとおり、対応する `src/ytbg/yt_backgammon.py` の各メソッドで
`data['player']`（`set_clock_limit` は `data['index']`）を `0` に固定する
ミューテーションを 1 つずつ入れ、`pytest -k` で対象テストを実行、
`\cp` で `src/` を元に戻す、を 1 つずつ実施した。

| メソッド | ミューテーション | 結果 |
|---|---|---|
| `dice()` | `data['player']` → `0` に固定 | `test_dice_updates_only_target_player` が失敗（`[0,0,0,0] == [3,4,0,0]` で不一致） |
| `set_playername()` | 同上 | `test_set_playername_updates_only_target_player` が失敗（`'' == 'Alice'`） |
| `set_score()` | 同上 | `test_set_score_updates_only_target_player` が失敗（`0 == 5`）。**verifier が報告した穴そのものが塞がったことを確認** |
| `set_clock_limit()` | `data['index']` → `0` に固定 | `test_set_clock_limit_updates_only_target_index` が失敗（`12 == 60`） |
| `set_player_clock()` | `data['player']` → `0` に固定 | `test_set_player_clock_updates_only_target_player` が失敗（`[120,12] == [90,5]`） |

5 件とも、直す前は（`test_set_score_...` について verifier が実測したとおり）
検出できなかったはずのミューテーションが、直した後は正しく検出されることを
確認した。

## 検証結果

- `uv run pytest -q` — 57 passed（テスト数は変わらず、内容だけ変更）
- `uv run ruff check .` — All checks passed
- `uv run mypy src` — 7 errors（変更前と同一。すべて `__main__.py`、TODO-002）
- `git diff --stat src/` — 出力なし（変更なし。ミューテーションはすべて
  `\cp` で復元済み）

## 判断が要る点

特になし。依頼書の指示どおり、5 箇所を `1` 側の指定に置き換え、
`0` のケースは追加していない。
