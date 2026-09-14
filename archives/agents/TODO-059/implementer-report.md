# TODO-059 実装の報告（implementer）

## 足した関数

`src/ytbg/webroot/static/js/rules/position.js`

- `checker_order(gameinfo)` :86 — `{id, player, point, idx}` の列。idx の安定ソート
- `checkers_at(gameinfo, point)` :110
- `active_dice(gameinfo, player)` :121
- `Position.from_gameinfo()` は `checker_order()` を使う形にした（積み順は 1 か所だけ）

`src/ytbg/webroot/static/js/rules/actions.js`（新規。import は rules/ の中だけ）

- `CUBE_MAX` / `SCORE_MAX` :22-23（actions.js から移した）
- `can_pick_checker(gi, id, free_move)` :74
- `decide_dst(gi, id, point)` :118 — `{point, hit_id}` か `null`
- `predict_moves(gi, moves, player, used_dice)` :165 — **表に無い関数を 1 つ公開した**（下の「判断が要る点」）
- `plan_move(gi, id, point)` :208
- `plan_put_checker(gi, id, point)` :257
- `plan_roll(gi, player, {d1, d2, value1, value2})` :284
- `plan_dice_click(gi, player, index, free_move)` :317
- `can_hold_cube(gi, player)` :379
- `plan_double(gi, player, redouble)` :412
- `plan_cube_drop(gi, player, {src_y, y, y0, y1})` :433
- `plan_resign(gi, player)` :482
- `plan_score(gi, player, "up"|"clear")` :508
- 内部で使う `id_player` / `point_of` / `has_dice` / `active_dice_desc` は export していない

## Board と actions.js に残した委譲

`src/ytbg/webroot/static/js/board.js`

- `checker_order()` :423 — `rule_checker_order()` を呼び、`id % 100 < 15` で絞って `this.checker[p][c]` に直す
- `checkers_at()` / `top_checker()` は `checker_order()` を通るので、変えていない
- `get_active_dice()` :524 — `rule_active_dice()` を呼ぶ
- `plan_move(id, point)` :793 — **新規。予測の入口はここ 1 か所。** gameinfo が無ければ例外を投げる
- `predict_gameinfo()` は消した（使う側が無くなった）
- `put_checker()` :844 — `rule_predict_moves()` で予測を作る
- `has_dice()` はそのまま（`ui/dice.js` が使う）

`src/ytbg/webroot/static/js/actions.js`

- `roll` :49、`click_dice` :85、`can_pick_checker` :123、`drop_checker` :146、`put_checker` :180、
  `can_hold_cube` :198、`drop_cube` :214、`resign` :234、`score_up` / `score_clear` / `set_score` :250-272
  が rules の関数を呼び、返った message を送り、predicted を `board.apply()` する形になった
- 送る順番は変えていない: move は送ってから予測を表示し、free move のダイスと得点は予測を表示してから送る
- `parseInt` は、rules へ渡す前に同じ値へかける形にした（roll / click_dice / resign / set_score の player）
- `decide_dst()` / `move()` / `double()` は export から消した（外から呼ぶ所は無かった）。`take()` /
  `cancel_double()` の関数も消した。`drop_cube` は `plan_cube_drop()` の message をそのまま送る
- `drag.js`・`ui/` は変えていない（呼び出しのシグネチャは同じ）

## 0 のダイス

`rules/move.js:199` の `usable_dice()` のバーの分岐を `dice_vals.map((v) => v < 1 || v > 6)` にした
（関数の説明どおり、1〜6 でない目は対象外で true）。

テストを先に足し、直す前のコードで落ちることを確かめた。

- `tests/js/move.test.mjs` 「バーの駒が復帰できなくても、目が 0 のダイスは 0 のまま」

  ```
  ✖ バーの駒が復帰できなくても、目が 0 のダイスは 0 のまま
    actual: [ 13, 15, 10, 10 ], expected: [ 13, 15, 0, 0 ]
  ```

- `tests/js/actions.test.mjs:202` plan_move「バーから復帰できなくなっても、目が 0 のダイスは 0 のまま」
  （`+ 10, + 10 / - 0, - 0`）
- `tests/js/actions.test.mjs:267` plan_roll「バーから復帰できなくても、目が 0 のダイスは 0 のまま」
  （`[13, 10, 15, 10]` になっていた）

既存の `usable_dice()` のテスト 2 件（バーから復帰できない、player0 と player1）は
`[false, false, false, false]` を期待していたので、`[false, false, true, true]` に直した。
テスト名も「1〜6 の目は全部 false」に変えた。

## helper を直した箇所

`tests/browser/helper.mjs`

- `corrupt_prediction()` :758 — `board.plan_move` を包み、返った `predicted` のうち最後の手の駒を
  `[point, 0]` に書き換える。message は書き換えないので、送る移動先はそのまま（テスト本体の期待どおり）
- `fail_prediction()` :781 — `board.plan_move` を例外を投げる関数に差し替える
- `restore_prediction()` :795 — `delete board.plan_move`

理由: 予測の入口が `Board.predict_gameinfo()` から `Board.plan_move()` に変わったため。ES Modules の
export は差し替えられないので、差し替える先は board のメソッド 1 か所にした。
以前の corrupt は message の idx も予測（壊した値）から取っていたが、今は壊す前の予測の idx が送られる。
テスト本体は idx を見ていない。テスト本体（`*.test.mjs`）は変えていない。

## テストの件数

| | 変える前 | 変えた後 |
|---|---|---|
| `node --test tests/js/` | 103 件 | 152 件（move +1、position +6、actions.test.mjs 新規 42） |
| `node --test tests/browser/` | 92 件 | 92 件 |

## 走らせた結果

- `node --test tests/js/` — 152 pass / 0 fail、終了コード 0
- `node --test tests/browser/`（1 回）— 92 pass / 0 fail、終了コード 0
- pytest・ruff・mypy・basedpyright は依頼どおり走らせていない（サーバは変えていない）

## docs/Developer.md

状態の持ち方（積み順の持ち主を `rules/position.js` に）、先行実行（`plan_move()`、0 のダイス、
離したときの流れ、`Board.plan_move()` が予測の入口であること）、モジュール表の `actions.js` の役割、
ルール層の表に `actions.js` の行と plan の返り値の説明を足した。

## 判断が要る点

1. **`predict_moves()` を rules/actions.js から公開した（設計の表に無い）。** `Board.put_checker()`
   （helper の `put_checker_local()` が使う、送らずに駒を置く処理）が予測を作るのに要る。
   `plan_move()` の中でも使う。TODO-060 で `Board.put_checker()` が無くなれば、export を外せる
2. **Board の予測の入口の名前を `plan_move(id, point)` にした。** 引数と戻り値が変わったので
   `predict_gameinfo` の名前を残さなかった
3. **挙動が変わりうるが、到達しない経路が 2 つある。**
   - `actions.js` の `put_checker()` は gameinfo が無ければ何も送らない（以前は idx 0 で送っていた）。
     呼ぶのは掴めたあと（gameinfo が必ずある）だけ
   - `Board.checker_order()` は gameinfo の checker[p] が 15 枚より**少ない**壊れた盤面で、以前は
     TypeError で止まり、今は止まらず足りない駒を配り直さない。15 枚より多いときの挙動は同じ
4. ログ: rules へ移した判定の中の `log()`（`can_pick_checker` の active_dice と dst_p、`decide_dst` の
   available_p と hit、`click_dice` の turn<0）は無くなった。`drop_checker` で送る move の中身を 1 行出す
   ようにした。`roll` のログは、振れたときだけ出す（以前は振る前に出していたが、cube が未テイクなら
   ログの前に return していたので、出る条件は同じ）

## 範囲外で気づいたこと

- `Board.has_dice()` と `rules/actions.js` の `has_dice` が同じ条件を 2 か所に持つ。TODO-060 で Board を
  分けるときに rules の方へまとめられる
