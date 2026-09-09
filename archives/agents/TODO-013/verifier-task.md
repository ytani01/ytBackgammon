# TODO-013 検証の依頼（verifier）

TODO-013（`on_json()` の分岐ごとのテストを足す件）を検証する。
**コードは直さない。** 見つけたことは報告するだけ。

作業ディレクトリは /home/ytani/work/ytBackgammon。

## これまでの経緯

- implementer がテストを書いた（`implementer-report.md`）
- reviewer が「値を変えてもテストが通ってしまう」箇所を実測で 7 件見つけた
  （`reviewer-report.md`）
- implementer が直した（`implementer-report2.md`）

**この 3 つの報告を読むこと。** いま検証するのは修正後の状態。

`git diff`（`tests/conftest.py`）と `git status`
（`tests/test_on_json.py` は未追跡）を見ること。

## 確認すること

1. **走ること。** `uv run pytest -q`、`uv run ruff check .`、`uv run mypy src`。
   期待は pytest 57 passed、ruff 0、mypy 7 errors（すべて `__main__.py`、
   TODO-002 で残した既存の指摘）。**mypy は `tests/` を見ていない**

2. **`src/` が変わっていないこと。** `git status` と `git diff --stat src/`。
   この項目はテストだけを足す

3. **17 分岐すべてに触れていること。** `src/ytbg/yt_backgammon_server.py` の
   `on_json()` を読んで `type` の一覧を作り、`tests/test_on_json.py` が
   その全部を投げているか数える

4. **ミューテーションで落ちること（ここが本題）。**
   implementer は自分でも確かめたと報告しているが、**実装した本人とは別に
   確かめる**のがこの依頼の目的。**リポジトリを scratchpad へ複製して
   そちらで壊すこと**（作業ツリーの `src/` は触らない）。

   ```bash
   cp -a /home/ytani/work/ytBackgammon <scratchpad>/ytbg-verify
   ```

   複製先で 1 つずつ壊して `uv run pytest -q` を走らせ、**どのテストが
   落ちるか**を記録する。落ちなければそれが穴。

   - `yt_backgammon.py` の `set_score()` で `data['player']` を `0` に固定
   - `yt_backgammon.py` の `put_checker()` で `player = int(ch_id / 100)` を
     `player = 0` に
   - `on_json()` の `set_gameinfo` の分岐から `return` を消す
   - `on_json()` の末尾の `if msg['history']:` を `if True:` に
   - `new_game()` から `self._bg._gameinfo['score'][0] = score0` の行を消す
   - `on_json()` 末尾の `emit()` から `broadcast=True` を外す
   - `emit()` の直前に `msg['src'] = 'server'` を足す
   - `backward_hist()` / `forward_hist()` の `emit_gameinfo(sec,
     history_flag=True)` を `history_flag=False` に
   - `SEC_CHECKER_MOVE` を `0.2` → `0.9` に
   - `emit_gameinfo()` の `'hist_i': len(self._history)` を
     `len(self._history) - 1` に
   - `forward_hist()` の `while len(self._fwd_hist) > 0 and ...` を
     `while False and ...` に
   - `set_gameinfo()` の `copy.deepcopy(gameinfo)` を `gameinfo` に
   - `on_json()` 末尾の `emit('json', msg, broadcast=True)` を 2 回呼ぶ

   **1 つ壊すごとに元へ戻してから次を試すこと**（複数同時に壊さない）。

5. **implementer の報告と食い違うものがあれば、それを報告する。**
   報告では落ちるとされているのに落ちなかったもの、その逆

## 後始末（必須）

- 作業ツリーの `src/` が変更されていないこと（`git status` で確かめる）
- scratchpad の複製は消してよい

## 報告

`archives/agents/TODO-013/verifier-report.md` に書く（確かめた手順、
ミューテーションごとの結果、落ちなかったもの、残る懸念）。
返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
ファイルの全文を返事に貼らない。
