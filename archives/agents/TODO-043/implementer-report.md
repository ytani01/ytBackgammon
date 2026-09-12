# TODO-043 実装担当の報告

## 変更したファイル

### `src/ytbg/webroot/static/js/rules/move.js`（+292 行）

既存の `calc_dst_point()` はそのまま。末尾に 5 つの純粋関数を足した。

| 関数 | 行 | 移した元 |
|------|----|----------|
| `all_inner(pos, player)` | 36:48 | `Board.all_inner()` + `Checker.is_inner()` |
| `dst_point(pos, player, src_p, dice_val)` | 61:110 | `Board.get_dst_point1()` |
| `dst_points(pos, player, src_p, dice_vals)` | 123:186 | `Board.get_dst_points()` |
| `usable_dice(pos, player, dice_vals)` | 202:274 | `RollButton.check_disable()` の判定部分 |
| `dice_for_move(player, active_dice, from_p, to_p)` | 288:337 | `Checker.dice_check()` |

判定はそのまま写した。置き換えたのは次の 3 つだけ。

- `this.point[p].checkers.length > 0 && checkers[0].player == player`
  → `pos.owner(p) === player`
- `checkers.length >= 2 && checkers[0].player != player`
  → `pos.count(p) >= 2 && pos.owner(p) !== player`
- `Board.all_inner()` の「15 枚すべてが `is_inner()`」
  → `pos.points_of(player)` が全部インナー（player 0 は 0〜6、
  player 1 は 19〜25。バーは外）

`usable_dice()` の細かい対応:

- 返すのは `dice_vals` と同じ長さの `boolean[]`。値が 1〜6 でない要素は
  `true`（現行の `continue` に当たる。disable しない）
- バーに駒があって復帰できないときは**全部 `false`**
  （現行は 4 個とも `disable()` していた）。復帰できるときは全部 `true`
  （現行の `return modified;` = 何も disable しない。T.B.D. のコメントも残した）
- バー判定に渡すダイスは、現行の `get_active_dice()` と同じく
  1〜6 だけに絞ったもの（関数の中で `filter`）
- 内側の「もう一つのダイスとの和」のループも、添字の範囲を
  `dice_vals.length` にしただけで枝の順番は同じ

### `src/ytbg/webroot/static/js/board.js`

- import を `calc_dst_point` から `all_inner` / `dst_point` / `dst_points`
  （`rule_` 接頭辞）に差し替え（board.js:10-12）
- `all_inner()`（board.js:658）、`get_dst_points()`（board.js:688）、
  `get_dst_point1()`（board.js:706）を `this.position()` を渡すだけの
  薄い包みにした。3 つとも**消していない**
- `get_dst_points()` のログは、引数と結果を 1 行にまとめて残した
  （途中の `dice_val` ごとのログは、ルール層へ移したので消えた）

### `src/ytbg/webroot/static/js/ui/dice.js`

- `check_disable()`（dice.js:363-380）を `usable_dice()` の結果で
  `this.dice[i].disable()` を呼ぶだけにした。返り値の `modified` は今までどおり
- import を `bar_point`（使わなくなった）から `usable_dice` に差し替え（dice.js:4）

### `src/ytbg/webroot/static/js/ui/checker.js`

- `dice_check()`（checker.js:55-63）を `dice_for_move()` の呼び出しだけにした
- `dice_for_move` の import を足した（checker.js:6）

### `tests/js/move.test.mjs`（+275 行）

`helper.mjs` の `make_position()` / `stack()` を使う形に揃えた。足した節:

| 節 | 件数 | 見ているもの |
|----|------|--------------|
| `all_inner()` | 5 | インナーだけ / ゴールの駒 / 1 枚外 / バー / 相手の駒は見ない |
| `dst_point(): ベアオフ` | 5 | ちょうどの目 / 大きい目 / 後ろに自分の駒 / 後ろが相手の駒 / インナー未完成 |
| `dst_point(): ブロック` | 4 | 相手 2 枚以上 / ブロット / 自分の駒 / 空き |
| `dst_point(): バーからの復帰` | 4 | 相手 2 枚以上 / ブロット / 空き / player1 の向き |
| `dst_points()` | 6 | ダイス無し / 2 つと和 / 重複削除 / 片方ブロック / ゾロ目 4 段 / ゾロ目の途中で止まる |
| `usable_dice()` | 8 | 全部使える / 1〜6 以外 / バーで復帰不可 / バーで復帰可 / 動かせない / 和で動かせる / 端のポイント (1, 24) / ゴールの駒 |
| `dice_for_move()` | 7 | 1 つの目 / 合計 / 届かない / バー / ゾロ目 3・4 個 / ベアオフで大きい方 / ベアオフでちょうど |

## 検証

| コマンド | 結果 |
|----------|------|
| `node --test tests/js/` | 96 pass / 0 fail（終了コード 0） |
| `node --test tests/browser/` | 54 pass / 0 fail（終了コード 0） |
| `uv run pytest` | 227 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed!（終了コード 0） |

新しい警告は出ていない。

## わざと壊して確かめた結果

`rules/move.js` を 1 か所ずつ壊し、そのつど `node --test tests/js/` を走らせて
元に戻した（5 通り）。

| 壊し方 | 落ちた件数 |
|--------|-----------|
| `dst_point()` のブロック判定 `count >= 2` → `>= 3` | 7 |
| `all_inner()` の player 0 の境目 `p > 6` → `p > 7` | 1 |
| `dice_for_move()` のベアオフ `Math.max` → `Math.min` | 1 |
| `usable_dice()` の走査 `p <= 24` → `p <= 23` | 1 |
| `usable_dice()` の走査 `p=1` → `p=2` | 1 |

最後の 2 つは、最初に書いたテストでは**どちらも 0 件**だった。
「端のポイント (1, 24) の駒も数える」を足して塞いだ。

## 判断が要る点・気づいたこと（直していない）

1. **`Checker.is_inner()`（checker.js:37）が、どこからも呼ばれなくなった。**
   唯一の呼び出し元が `Board.all_inner()` だった。範囲外なので残してある。
   消すなら別の項目。
2. **`Checker.dice_check()` の docstring が間違っている**（checker.js:52-53）。
   `@return {number} - 使用するダイスの目 / 0: そこには移動できない` とあるが、
   実際は `number[]` で、移動できないときは空配列。移す前からの誤り。
   `dice_for_move()` 側の docstring は正しく書いた。
3. **`dst_points()` は、目を足したときの途中のポイントを見ない。**
   13 から [3, 5] で 10 がブロックされていても、8 は行き先に出る。
   移す前と同じ挙動なのでそのままにした（テストでも、そう固定してある）。
4. **`usable_dice()` は、バーから復帰できるときに全ダイスを `true` にする。**
   もう一方のダイスが使えるかは見ていない。現行の T.B.D. コメントのままで、
   コメントも移してある。
5. **`dst_point()` は、`dst_p1` がポイントの範囲外になると例外になりうる。**
   `pos.count(dst_p1)` で `undefined.length` を読むため。移す前も
   `this.point[dst_p1].checkers` で同じだったので、そのままにした。
   実際には player 0 / player 1 のどちらもゴール側で頭打ちになるので、
   今の呼び出し方では起きない。
