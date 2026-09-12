# TODO-043 確認担当の報告

## 1. 変更範囲

`git status` / `git diff --stat` で確認。変更は次の 5 ファイルのみ、
それ以外は `archives/agents/TODO-043/`（新規）だけ。指示どおり。

```
 src/ytbg/webroot/static/js/board.js      | 125 ++-----------
 src/ytbg/webroot/static/js/rules/move.js | 292 +++++++++++++++++++++++++++++++
 src/ytbg/webroot/static/js/ui/checker.js |  57 +-----
 src/ytbg/webroot/static/js/ui/dice.js    |  89 +---------
 tests/js/move.test.mjs                   | 275 ++++++++++++++++++++++++++++-
 5 files changed, 593 insertions(+), 245 deletions(-)
```

## 2. 検証（各 1 回）

| コマンド | 結果 | 終了コード |
|----------|------|-----------|
| `node --test tests/js/` | 96 pass / 0 fail | 0 |
| `node --test tests/browser/` | 54 pass / 0 fail（6 suite すべて成功） | 0 |
| `uv run pytest` | 227 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |

すべて成功。落ちた箇所は無い。

## 3. 挙動の突き合わせ（移す前 = `git show HEAD:...`）

- **`usable_dice()` のバーの枝**: 移す前の `RollButton.check_disable()` は
  復帰できないとき `for (let d=0; d < 4; d++) this.dice[d].disable();` で
  4 個全部を disable していた。移したあとの `usable_dice()` は
  `return dice_vals.map(() => false);`（`dice_vals` は `this.get()` の
  返り値で長さ 4）を返し、新しい `check_disable()`（`ui/dice.js:363-378`）が
  その `false` の分だけ `disable()` を呼ぶ。結果として 4 個とも disable
  される。**一致を確認した。**
- **`check_disable()` の返り値 `modified`**: 移す前は「バーで復帰不可」
  「通常ループで 1 つでも disable」のときに `true`。移したあとは
  `usable[i]` が `false` の要素があれば同じ回数だけ
  `this.dice[i].disable(); modified = true;` を実行する形。
  `usable_dice()` の判定条件（バー branch・通常ループとも）は移す前と
  同一のロジックをそのまま `Position` の API（`pos.count()` /
  `pos.owner()`）に置き換えただけで、分岐の意味は変えていない。
  **一致を確認した。**
- **`Board.all_inner()` の判定**: 移す前は `Checker.is_inner()` を
  15 回（`this.checker[player][i]`）呼び、`is_inner()` は
  player 0: `cur_point <= 6`、player 1: `cur_point >= 19 && <= 25`。
  移したあとの `all_inner(pos, player)`（`rules/move.js:44-56`）は
  `pos.points_of(player)` で得た全ポイント（バー・ゴールを含む、
  チェッカー 1 枚につき 1 要素で 15 個ぶん）を走査し、player 0 は
  `p > 6` で false、player 1 は `p < 19 || p > 25` で false。
  境目・バーの扱い・チェッカー数（15 枚）とも移す前と同じで、
  結果が変わる盤面は見当たらなかった。

## 4. わざと壊して確かめた（管理者指定の 3 通り）

`src/ytbg/webroot/static/js/rules/move.js` を 1 か所ずつ壊し、そのつど
`node --test tests/js/` を実行。壊す前に元ファイルを退避し、確認後に
`\cp` で戻した。

| 壊し方 | 結果 |
|--------|------|
| `dst_point()` のブロック判定 `pos.count(dst_p1) >= 2` → `>= 3` | 7 件 fail（`actual: [true,true,true,true]` vs `expected: [false,false,true,true]` など） |
| `all_inner()` の player 0 の境目 `p > 6` → `p > 7` | 1 件 fail |
| `dice_for_move()` のベアオフ `Math.max(...active_dice)` → `Math.min(...active_dice)` | 1 件 fail |

3 通りとも、狙った箇所を壊すと対応するテストが落ちることを確認した。
**落ちなかったものは無い。**

## 5. 復元後の確認

`\cp` で 3 つとも元に戻し、`git diff --stat` が壊す前と同一であることを
確認。`node --test tests/js/` は 96 pass / 0 fail に戻った。

## 気になった点（判断不要・報告のみ）

- implementer の報告にある「判断が要る点・気づいたこと」5 件
  （`Checker.is_inner()` が未使用になった、docstring の誤りが元から
  あった、`dst_points()` が途中のブロックを見ない、`usable_dice()` の
  バー復帰時の T.B.D.、`dst_point()` の範囲外アクセスの可能性）は
  いずれも実装報告どおりで、今回の変更範囲外の既存の挙動として
  そのままにされている。私からは追加の指摘は無い。

## 確かめられなかったこと

- 特になし。指示された 5 項目（範囲・検証・3 点の突き合わせ・3 通りの
  破壊・復元確認）はすべて実施できた。
