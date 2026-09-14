# TODO-052 verifier 報告

## チェックリストの確認

- `Board.turn` / `Board.resign`、`Cube.value` / `accepted` / `player`、`PlayerScore.score`、
  `Dice.value`、`RollButton.dice_active` / `get()` / `get_active_dice()` は
  `git grep` で `src/` `tests/` に読み書きが残っていないことを確認した。
  - `.turn` / `.resign` の残りは、すべて `gameinfo.py`（サーバの `GameInfo.turn/resign`）、
    `gi.turn`（`gi = board.gameinfo`）、`judge.js` の関数引数名など別物。混同していない
  - `RollButton.get()` 等は消え、`Board.get_active_dice()` / `Board.has_dice()` に
    置き換わっている（design.md の表と implementer 報告の対応表どおり）
  - `Board.turn` / `resign` を消したこと、`gameinfo` がまだ無いときは操作できないこと、
    `tests/browser/` の直し、`CLAUDE.md` の直しの 4 項目はいずれも実装とテストの両方に
    対応箇所がある（下記「壊し方」で 1 件目・3 件目は実テストで裏付けた）
- 消し忘れは見つからなかった

## 検証コマンド（すべて 1 回、終了コード 0）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 291 passed |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues found in 12 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 99 pass, 0 fail |
| `node --test tests/browser/` | 83 pass, 0 fail |

## 壊し方 3 通り（すべて `\cp /tmp/actions.js.bak src/ytbg/webroot/static/js/actions.js` で
戻し、`git diff --stat` が元と同じ内容量に戻っていることを確認した）

1. **free move のダイスで、予測を表示せずに送る**（`click_dice()` の `board.apply(predicted, ...)` を
   削除）。`node --test tests/browser/clicks.test.mjs` で
   `free move でダイスを返事の前に 2 回押す → 目が 2 つ進む` が **✖ で落ちた**。
   狙ったテストが機能している
2. **`gameinfo` が届く前でも操作できるようにする**（`can_pick_checker()` の
   `gi === undefined` のとき `false` を返していたのを `true` に変更）。
   `node --test tests/browser/` は **83 件全て通った（落ちない）**。
   → **この分岐を見るテストは無い**（implementer 報告の「実装しなかったこと・残る懸念」の
   1 点目と一致）
3. **`can_hold_cube()` の「ダイスが出ていたら触れない」判定を外す**（`has_dice` の
   ループを削除）。`node --test tests/browser/` は **83 件全て通った（落ちない）**。
   → **この分岐を見るテストも無い**（implementer 報告の同節 2 点目と一致）

2 件目・3 件目は、report が自己申告していたテストの欠落を実際に再現して裏付けた形。
どちらも「操作できてはいけないものが操作できてしまう」方向の抜けで、機能上のリグレッションを
検出できないままになっている。直すかどうかは管理者の判断。

## 変更ファイルと指示の対応

`git status` の変更ファイルは実装者報告のリストと一致（`CLAUDE.md`、`actions.js`、
`board.js`、`ui/cube.js`、`ui/dice.js`、`ui/label.js`、`tests/browser/` の 7 ファイル）。
指示外のファイルの変更は無い。`archives/agents/TODO-052/`（このディレクトリ自体）は
report 置き場として想定どおり。

## 確かめられなかったこと・判断できないこと

- ブラウザテストは指示どおり 1 回のみ実行（MEMORY.md の方針に従った）。フレーク耐性は
  未確認
- 「先行実行の `apply()` は `set_turn()` を通るので、バナーと Roll ボタンが一度 off →
  出し直しになる」という implementer の申告は、実装は確認したが目視での見た目の確認は
  していない（report も同様に未確認と書いている）
- 壊し方 2・3 でテストが増える必要があるかどうかは設計判断であり、判断できない
  （報告のみ。直すかどうかは管理者判断）
