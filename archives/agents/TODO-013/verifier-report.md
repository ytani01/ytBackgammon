# TODO-013 検証報告（verifier）

implementer-report.md / reviewer-report.md / implementer-report2.md を読み、
修正後の状態（`tests/conftest.py` の差分、`tests/test_on_json.py`）を検証した。

## 1. 走ること

作業ツリー（`/home/ytani/work/ytBackgammon`）で実行。

- `uv run pytest -q` — **57 passed**（期待どおり）
- `uv run ruff check .` — **All checks passed!**（0 件、期待どおり）
- `uv run mypy src` — **7 errors**、すべて `src/ytbg/__main__.py`
  （`"None" has no attribute ...`）。TODO-002 で残した既存の指摘と一致

## 2. `src/` が変わっていないこと

```
git status --short
 M tests/conftest.py
?? archives/agents/TODO-013/
?? tests/test_on_json.py
```

`git diff --stat src/` は空。この項目はテストだけを足しており、範囲は
指示どおり。

## 3. 17 分岐すべてに触れていること

`src/ytbg/yt_backgammon_server.py` の `on_json()` の `if msg['type'] == ...`
は 17 個（`back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` / `new` /
`set_gameinfo` / `put_checker` / `cube` / `dice` / `set_turn` /
`set_playername` / `set_score` / `resign` / `set_clock_limit` /
`set_player_clock`）。`tests/test_on_json.py` を `grep` したところ、17 個
すべてが 2 回以上（`'type': 'xxx'` の指定と parametrize の型名の両方）
使われていることを確認した。網羅漏れは無い。

## 4. ミューテーションで落ちること（本題）

依頼どおり、リポジトリを scratchpad
（`.../scratchpad/ytbg-verify`）へ `\cp -a` で複製し、そちらで 1 つずつ
壊して `uv run pytest -q` を確認した。作業ツリーの `src/` は触っていない
（最終的に `git diff --stat src/` が空であることを確認済み）。

**検証環境上の注意（自分のミス、報告として残す）**: `\cp -a` は
`.venv` ごとコピーするため、コピー直後の `.venv/bin/pytest` の
shebang が元リポジトリの `.venv/bin/python3` を指したまま残る
（絶対パスなので）。この状態で `uv run pytest -q` を実行すると、
**scratchpad ではなく元リポジトリの（無傷の）ソースに対してテストが
走ってしまい、ミューテーションを入れても常に「57 passed」になる**
（実測。`uv run python -m pytest` では正しく検出する）。この事象に
気づかず最初の 2 件を検証してしまったため、`\rm -rf .venv && uv sync`
で scratchpad 専用の venv を作り直してから、全項目をやり直した。
以後の結果はすべて venv を作り直した後のもの。

| # | ミューテーション | 結果 |
|---|---|---|
| 1 | `set_score()` で `data['player']` を `0` に固定 | **57 passed（落ちない）** |
| 2 | `put_checker()` で `player = int(ch_id / 100)` を `player = 0` に | 2 failed（`test_put_checker_updates_only_target` ほか） |
| 3 | `set_gameinfo` の分岐から `return` を削除 | 2 failed（`test_set_gameinfo_replaces_gameinfo` ほか） |
| 4 | `on_json()` 末尾の `if msg['history']:` を `if True:` に | 1 failed（`test_history_false_does_not_append`） |
| 5 | `new_game()` の `score[0] = score0` の行を削除 | 1 failed（`test_new_keeps_score_playername_clock_limit_and_resets_board`） |
| 6 | 末尾の `emit()` から `broadcast=True` を外す | 1 failed（`test_put_checker_broadcasts_msg`） |
| 7 | `emit()` 直前に `msg['src'] = 'server'` を足す | 10 failed（`test_put_checker_broadcasts_msg` と fallthrough 9 件全部） |
| 8 | `backward_hist`/`forward_hist` の `history_flag=True` を `False` に | 4 failed |
| 9 | `SEC_CHECKER_MOVE` を `0.2` → `0.9` に | 2 failed |
| 10 | `emit_gameinfo()` の `'hist_i': len(self._history)` を `len(...) - 1` に | 1 failed（`test_back_moves_hist_i_by_n`） |
| 11 | `forward_hist()` の `while` 条件を `while False and ...` に | 7 failed（`test_history.py` の既存テストも含む） |
| 12 | `set_gameinfo()` の `copy.deepcopy(gameinfo)` を `gameinfo` に | 1 failed（`test_set_gameinfo_replaces_gameinfo`） |
| 13 | 末尾の `emit('json', msg, broadcast=True)` を 2 回呼ぶ | 1 failed（`test_put_checker_broadcasts_msg`、通数を見る assertion） |

**#1 だけ落ちない。** 依頼書が挙げた 12 種のミューテーションのうち、
`set_score()` の `data['player']` を `0` に固定するものだけが検出されない。

原因を確認した。`tests/test_on_json.py` の
`test_set_score_updates_only_target_player` は

```python
data = {'player': 0, 'score': 5}
msg = {'type': 'set_score', 'data': data, 'history': False}
bg_server.on_json(req, msg)
assert bg_server._bg._gameinfo['score'][0] == 5
assert bg_server._bg._gameinfo['score'][1] == before1
```

と、**もともと `player: 0` を渡している**ため、`data['player']` を `0` に
固定するミューテーションと実際の呼び出しが区別できない。「指定した
プレーヤーだけが変わる」ことは確認できているが、「`data['player']` を
実際に読んでいるか」（別のプレーヤーを指定したら別のプレーヤーが
変わるか）は確認できていない。`data['player']` を `1` にしたケースを
もう 1 つ足す（もしくは既存のケースを `player: 1` に変える）と検出できる
はずだが、これは推定であり実際に直して確かめてはいない
（依頼が「コードは直さない」だったため、テストコードの修正も行っていない）。

## 5. implementer の報告との食い違い

implementer-report2.md の「ミューテーションでテストが落ちることを
確かめた結果」の表には、依頼書の 12 種類のうち `set_score` の
`data['player']` 固定（依頼書の 1 番目）が**表に含まれていない**
（implementer が確かめたのは put_checker 以降の 12 件で、依頼書の項目数
と implementer の表の行数が合っていない）。今回の検証で、その未確認
だった項目がまさに検出できない項目だったことになる。implementer の
報告に「落ちるとされているのに落ちなかった」という直接の矛盾は無いが、
**依頼書にあった項目を implementer が確認し忘れており、そこが実際の穴
だった**、というのが今回の発見。

## 後始末

- 作業ツリーの `src/` は `git diff --stat src/` で変更なしを確認済み
- scratchpad の複製（`ytbg-verify`）は削除済み

## 残る懸念・判断が要る点

- **穴（#1）を埋めるかどうかは利用者の判断。** 埋めるなら
  `test_set_score_updates_only_target_player` に `player: 1` のケースを
  追加する程度の小さな修正で足りるはずだが、実際に直して確認はしていない
  （検証担当はコードを直さない）
- reviewer が「検討」扱いにした項目（8〜15番、reviewer-report.md）は
  今回の依頼の範囲外のため確認していない
