# TODO-043. JS のルール層に合法手の判定を移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 19,901 | 49,358 | 41% |
| reviewer | Opus 5 | high | 37,389 | 116,242 | 34% |
| implementer | Opus 5 | medium | 20,498 | 72,709 | 19% |
| verifier | Sonnet 5 | medium | 7,082 | 53,019 | 5% |
| 合計 |  |  | 84,870 | 291,328 | 概算 $7.9 |

- implementer と reviewer は、定義のモデル（`sonnet`）を Opus 5 に上書きした。
  ルールの中心のロジックを移す項目で、`~/.claude/CLAUDE.md` が
  「込み入ったロジックの実装とコードレビューには Opus」としているため
- verifier は定義のまま（Sonnet 5 / medium）

## きっかけ

TODO-042 で決めた 6 つの実装項目の 1 つめ。

合法手の判定が `Board` と `RollButton` と `Checker` に散らばっていて、
`rules/` に入っていなかった。`rules/move.js` は 33 行で、引き算するだけの
`calc_dst_point()` しか無い。そのため**ベアオフ、バーからの復帰、ゾロ目、
使えないダイスの判定にテストが 1 件も無かった**。

## やったこと

`rules/move.js` に 5 つの純粋関数を足した（292 行増）。

| 関数 | 引数 | 返り値 | 移す前 |
|------|------|--------|--------|
| `all_inner` | `(pos, player)` | `boolean` | `Board.all_inner()` |
| `dst_point` | `(pos, player, src_p, dice_val)` | `number \| undefined` | `Board.get_dst_point1()` |
| `dst_points` | `(pos, player, src_p, dice_vals)` | `number[]` | `Board.get_dst_points()` |
| `usable_dice` | `(pos, player, dice_vals)` | `boolean[]` | `RollButton.check_disable()` の判定部分 |
| `dice_for_move` | `(player, active_dice, from_p, to_p)` | `number[]` | `Checker.dice_check()` |

呼び出し元は薄い包みになった（`board.js` −129 行、`ui/dice.js` −89 行、
`ui/checker.js` −64 行）。`Board.all_inner()` / `get_dst_point1()` /
`get_dst_points()` は残してある（`tests/browser/rules.test.mjs` が
`board.get_dst_points()` を呼ぶ）。

`tests/js/move.test.mjs` は 9 件から 48 件になった。

**判定は 1 つも変えていない。** 枝の順番も境目もそのまま写し、
`this.point[p].checkers` を見ていたところを `Position` の
`owner()` / `count()` に置き換えただけ。

`usable_dice()` は移す前と同じく、`dice_vals` と同じ長さの配列を返す。
バーの駒が復帰できないときは全部 `false` で、呼び出し側が 4 つとも
`disable()` する（値が 0 のダイスも `disable()` されて 10 になる、という
細かい副作用も込みで移す前と同じ）。

`dice_for_move()` だけは `Position` を受け取らない（引き算とダイスの
突き合わせしかしていない）。

## 確かめたこと

verifier が各 1 回ずつ実行し、すべて通った。

| 対象 | 結果 |
|------|------|
| `node --test tests/js/` | 99 件すべて成功 |
| `node --test tests/browser/` | 54 件すべて成功 |
| `uv run pytest` | 227 passed |
| `uv run ruff check .` / `mypy src` / `basedpyright` | 指摘なし |

**わざと壊す確認**は 3 者で合わせて 12 通り行った。implementer が 5 通り、
verifier が管理者の指定した 3 通り、reviewer が隔離したコピーで 9 通り。

reviewer の 9 通りのうち **4 通りが「壊しても 1 件も落ちない」** だった。
そのうち 3 つを塞ぐテストを足し（下記）、残る 1 つは到達しない枝だった。

| 壊し方 | 前 | 塞いだあと |
|--------|----|-----------|
| `dice_for_move()` をダイス 1 個で空にする | 落ちない | 1 件落ちる |
| 使用済みダイス（11〜16）も判定の対象にする | 落ちない | 1 件落ちる |
| `usable_dice()` のバーを player 0 固定にする | 落ちない | 1 件落ちる |
| `usable_dice()` の `i2 == i` 除外を外す | 落ちない | **到達しない枝**（下記） |

**`usable_dice()` の `i2 == i` は、外しても結果が変わらない。**
内側のループへ入るには `dst_point(pos, player, p, dice_val2)` が
`undefined` でないことが要るが、`i2 == i` なら `dice_val2 == dice_val` で、
それが `undefined` でないなら外側の `dst` の時点で `can_use = true` になり、
すでに break している。移す前からある防御的な 3 行で、害は無いのでそのまま
残した。テストは足していない。

## reviewer の指摘への対応

| 指摘 | 対応 |
|------|------|
| `dice_for_move()` のダイス 1 個が未カバー（要修正） | テストを足した |
| `Checker.dice_check()` の JSDoc が `number` と誤記（移す前からの誤り） | 直した。本体を丸ごと書き換えた関数で、移した先の `dice_for_move()` は正しいのに包みだけ間違って残るのは紛らわしいため |
| `usable_dice()` の `i2 == i` が未カバー | 到達しない枝なので、テストは足さず理由を記録した |
| 「1〜6 でない目」のテストが実際には来ない値（7, −1）を使っている | 実際に来る値（0 / 10 / 11）に替えた |
| `usable_dice()` のバー判定が player 1 で未カバー | テストを足した |
| バーからの復帰 × ゾロ目の掛け合わせが無い | テストを足した |
| `Checker.is_inner()` が未使用になった | 範囲外なので消さず、TODO-048 の表に足した |
| テストのコメントが盤面と合っていない | 直した |
| `Board.all_inner()` の JSDoc に移譲先が書かれていない | 足した |

## 残ること

- `dice_for_move(0, [], 3, 0)` は `Math.max(...[])` で `[-Infinity]` を返す。
  移す前からある落とし穴だが、`on_mouse_up_xy()` が先に `dst_points()` で
  空を弾くのでここには届かない。直していない
- `dst_points()` は通り道を見ない（`[3, 5]` で 3 がふさがっていても
  3+5=8 を出す）。移す前からの挙動で、テストで固定してある

## 分担の振り返り

- **implementer が見つけたもの**: 移したあとに `Checker.is_inner()` が
  未使用になること、`dice_check()` の JSDoc の誤記。自分で 5 通り壊して
  取りこぼしを 2 つ見つけ、テストを 1 件足して塞いでいた
- **verifier が見つけたもの**: 無し（全件通り、指定した 3 通りの破壊でも
  狙いどおり落ちた）。**指定した 3 通りが、すでに押さえられている枝
  ばかりだった**のが効きの弱かった原因
- **reviewer が見つけたもの**: 「壊しても落ちないテスト」を 4 通り。
  これが今回いちばん価値があった。**隔離したコピーで実際に壊して
  試したから出た**もので、読むだけでは出ない。料金の 34% を使ったが、
  ルールの中心のロジックを移す項目でこれを省くと、
  「テストが 39 件増えたのに肝心の枝は押さえていない」状態で
  終わっていた
- **見込みとの食い違い**: 担当は見込みどおり。main のモデルだけ
  Opus で走った（切り替えるのは利用者）。料金は main 41% で、
  reviewer の指摘を受けての手直し（テスト 3 件と JSDoc 2 か所）を
  main が行ったぶんが乗っている
- **次に同じ規模でやるなら**: **reviewer に「隔離したコピーで壊して、
  落ちないものを挙げる」ことを依頼文で明示する。** 今回は reviewer が
  自分でそうしたので当たったが、指示していなかった。逆に **verifier へ
  渡す「壊し方」を管理者が決め打ちするのはやめる**（すでに押さえて
  ある枝を選んでしまい、判別力の確認にならなかった）。
  壊し方を選ぶこと自体が判断なので、reviewer 側へ寄せるのがよい
