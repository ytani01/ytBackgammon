# TODO-059 実装の依頼（implementer）

## 目的

TODO-060 で `Board` を `BoardController` と `BoardView` に分ける前に、
**盤面の参照と操作の判定・予測を、ID と盤面データだけで計算する純粋関数へ移す。**
今の `Board` と `actions.js` はそれを呼ぶ形（委譲）にして、挙動を保つ。
挙動を変えるのは「目が 0 のダイス」だけ。

設計は `docs/design-4.md` の「クライアントの構成」（`rules/actions.js` の表、
`checker_order()` と `plan_move()` の説明）、「変える挙動」、「実装項目の分け方」の 3。
TODO の節は `TODO.md` の TODO-059。実装の前に `docs/Developer.md` を読むこと。

## 対象範囲

- 変えてよい: `src/ytbg/webroot/static/js/rules/`（`actions.js` を新しく作る）、
  `src/ytbg/webroot/static/js/actions.js`、`src/ytbg/webroot/static/js/board.js`、
  それを呼んでいる `drag.js` / `ui/` の呼び出し箇所（必要なときだけ）、
  `tests/js/`、`tests/browser/helper.mjs`、`docs/Developer.md`
- **変えない:** `tests/browser/*.test.mjs` の本体、サーバ（`src/ytbg/*.py`）、
  CLAUDE.md・TODO.md（main が直す）

## やること

1. `rules/position.js` に `checker_order(gi)`、`checkers_at(gi, point)`、
   `active_dice(gi, player)` を足す
   - `checker_order()` は `{id, player, point, idx}` の列。`idx` の安定ソートで、
     同じ `idx` なら player・駒番号の順（今の `Board.checker_order()` と同じ）。
     ID は `player * 100 + 駒番号`
   - `Board.checker_order()` / `checkers_at()` / `top_checker()` / `get_active_dice()` は
     これを呼び、`this.checker[p][c]` に直して返す。今の「15 固定」（壊れた `.jsonl` で
     15 と違う長さでも止まらない）の挙動は保つ
   - `Position.from_gameinfo()` と積み順の決め方が 2 か所にならないようにする
     （片方をもう片方で作れるなら、そうする）
2. `rules/actions.js` を作り、設計の表の関数を置く:
   `can_pick_checker(gi, id, free_move)`、`decide_dst(gi, id, point)`、
   `plan_move(gi, id, point)`、`can_hold_cube(gi, player)`、
   `plan_cube_drop(gi, player, geometry)`、`plan_roll(gi, player, random_values)`、
   `plan_dice_click(gi, player, index, free_move)`、`plan_double(gi, player, redouble)`、
   `plan_resign(gi, player)`、`plan_score(gi, player, operation)`、
   `plan_put_checker(gi, id, point)`
   - plan の関数は、成り立たなければ `null`、成り立てば `{message: {type, data}}` と、
     要るときだけ `predicted`。表示の指示は返さない
   - `plan_move()` はヒットの 2 手、`idx`、使ったダイス、勝ちの点数を同じ予測から求める。
     駒の移動元は gameinfo から読む（`ch.cur_point` を使わない）。
     **渡された盤面を書き換えず、`sn` を進めない**
   - 判定の無い操作（`end_turn`、`take`、`cancel_double`、名前・履歴・時計の設定）は
     関数にしない
   - 乱数は `plan_roll()` の外（`actions.js`）で作って渡す。
     `geometry` は `{src_y, y, y0, y1}` のような値で、DOM の要素を渡さない
   - **`rules/` が import してよいのは `rules/` の中だけ**（`log.js` も不可）。
     今 `actions.js` にある `log()` を残したいなら `actions.js` 側に置く
3. `actions.js` の各関数は、`board.gameinfo` と ID・値を `rules/actions.js` に渡し、
   返った `message` を送り、`predicted` を `board.apply()` する形にする。
   **送る順番と予測を表示する順番（move は送ってから予測、free move のダイスと
   得点は予測してから送る）、`parseInt` での数への変換は今のまま。**
   `Board.predict_gameinfo()` と `Board.put_checker()` も、移した予測を使う形にする
   （使う側が無くなったものは消してよい）
4. `tests/browser/helper.mjs` の `corrupt_prediction()` / `fail_prediction()` /
   `restore_prediction()` は `board.predict_gameinfo` を差し替えている。予測の入口が
   変わるなら、**helper の中だけを直して、テスト本体を変えずに同じ意味（予測を外す・
   失敗させる）を保つ**。TODO-060 では予測を Controller が持つので、差し替える先は
   `board` の 1 か所に留める（ES Modules の export は外から差し替えられない点に注意）
5. **目が 0 のダイスを、使えない目にするときも 0 のままにする。**
   原因は `rules/move.js` の `usable_dice()` のバーの分岐で、復帰できないときに
   1〜6 以外の目も `false` にしている（関数の説明では「1〜6 でない要素は対象外で true」）。
   `disable_unusable()` がそれを `0 % 10 + 10 = 10` にする。
   `roll`（`[v, 0, w, 0]`）と `move` の予測の両方がこの経路を通る。
   **テストを先に足し、直す前のコードで落ちることを確かめてから直す**
6. `tests/js/` に純粋関数のテストを足す。設計の「検証と完了条件」の表の 1 行目
   （ID でのヒット・積み順・ダイスの消費・勝ちの点数・渡した盤面が変わらない・
   `sn` が変わらない・目が 0 のダイスが 0 のまま）と、各 plan 関数の成り立つ・
   成り立たない条件（キューブの上限・`accepted`・`side`・`turn`・ダイスが出ているか）。
   初期配置は `tests/js/helper.mjs` のものを使う
7. `docs/Developer.md` を直す（`Board.checkers_at()` / `checker_order()` を積み順の
   持ち主としている箇所、`actions.js` と `rules/` の役割の表、離したときの流れなど）。
   TODO の番号は書かない（Developer.md の規約）

## 注意

- 挙動を変えるのはダイスの 0 だけ。それ以外で挙動が変わりそうなら、変えずに報告に書く
- 移すときに条件式を書き直さない（等号・`>=` などをそのまま移す）
- 今の `actions.js` のコメントにある経緯（TODO 番号付き）は、移した先に要るものだけ残す

## 完了条件

- 関係するテストが通る: `node --test tests/js/`、`node --test tests/browser/`（**1 回でよい**）。
  **検証の一式（pytest・ruff・mypy・basedpyright）は verifier が走らせるので、走らせなくてよい**
- 足した 0 のダイスのテストが、直す前のコードで落ちたことを確かめてある
- テストの件数を、変える前と後で控えてある

## 報告

`archives/agents/TODO-059/implementer-report.md` に、足した関数（ファイル:行）、
`Board` と `actions.js` に残した委譲、helper を直した箇所と理由、0 のダイスのテストが
直す前に落ちた出力、テストの件数の前後、走らせた結果、判断が要る点を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
