# TODO-013 修正の依頼（implementer・3 回目）

verifier の検証（`archives/agents/TODO-013/verifier-report.md`）で穴が 1 つ
見つかった。**同じ性質の穴が他にも 4 つある**ので、まとめて直す。

`src/` は変更しない。直すのは `tests/test_on_json.py` だけ。

## 何が起きているか

`set_score()` の `data['player']` を **`0` に固定する**ミューテーションを
入れても、テストが 57 passed で通ってしまう（verifier が実測）。
`test_set_score_updates_only_target_player` が **`player: 0` を渡している**
ため、「指定を読んでいる」場合と「0 に固定した」場合が区別できない。

**「指定したほうだけが変わる」は見えているが、「指定を実際に読んでいるか」が
見えていない。** `player: 1` を渡していれば、0 固定のミューテーションで落ちる
（`put_checker` は `ch: 101` を使っているので、そちらは検出できている）。

## 直すもの

`tests/test_on_json.py` の次の 5 つ。いま `0` を渡しているのを **`1` 側を
指定する形に変える**（変わらないことを見る「隣」は `0` 側になる）。

| 行 | テスト | いまの指定 |
|---|---|---|
| 91 | `test_dice_updates_only_target_player` | `player: 0` |
| 113 | `test_set_playername_updates_only_target_player` | `player: 0` |
| 125 | `test_set_score_updates_only_target_player` | `player: 0` |
| 146 | `test_set_clock_limit_updates_only_target_index` | `index: 0` |
| 158 | `test_set_player_clock_updates_only_target_player` | `player: 0` |

**`0` のケースを足すのではなく、`1` 側で検証する形に変える**こと
（両方を書くと、同じことを 2 回見るだけでテストが増える）。
`gameinfo` の初期値は `ytBackgammon.init_gameinfo()` にあり、
`clock_limit` は `[120, 12]` のように **要素ごとに値が違う**ので、
「隣が変わっていない」は初期値のべた書きで見られる。

## 終わったら

- **`src/` の各メソッドで `data['player']`（`set_clock_limit` は
  `data['index']`）を `0` に固定するミューテーションを 1 つずつ入れ、
  5 件とも落ちることを確かめる。** 壊す → `pytest` → **必ず元へ戻す**、を
  1 つずつ。`src/` が変更された状態で終わらせない
- `uv run pytest -q`、`uv run ruff check .`、`uv run mypy src`
- `archives/agents/TODO-013/implementer-report3.md` に、直した箇所と
  ミューテーションの結果を書く

**注意**（verifier がはまった点）: リポジトリを複製して試す場合、
`\cp -a` は `.venv` ごとコピーするが、コピー先の `.venv/bin/pytest` の
shebang は**元のリポジトリの python を絶対パスで指したまま**なので、
`uv run pytest` が元のソースを見てしまい、壊しても常に通る。
複製先で試すなら `\rm -rf .venv && uv sync` で作り直すこと。
**作業ツリーで直接壊して戻すほうが確実。**

返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
