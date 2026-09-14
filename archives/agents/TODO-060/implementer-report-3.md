# TODO-060 実装の報告 3 巡目（implementer）

`verifier-report.md` を読んで、依頼の 2 つを行った。`src/` は変えていない（壊す確認のあと戻した）。コミットはしていない。

## 1. drag.test.mjs の「キューブを掴めていない」

### main の見立ては合っていた

scratchpad の `cube_probe.mjs` で確かめた。キューブをプレーヤー 0 の側でテイク済みにしてから、新しいページを `open_board()` し、その直後に次を読んだ（3 回）。

- `#cube` の `getAnimations()` — 3 回とも `top:running`・`transform:running` が残っていた
- 開いた直後の `center_of('#cube')` の y と、0.6 秒後の y — 直後は 450 / 400 / 387.5、0.6 秒後は 575 だった（定位置へ動いている途中）
- 開いた直後に読んだ座標でマウスを下ろす — 3 回とも掴めなかった（`holding_cube()` が `undefined`）
- 0.6 秒後には `getAnimations()` は 0 件

`open_board()` は駒の `cur_point` が入るのを待つだけなので、最初の描画のキューブの transition（`move_sec` 0.3 秒）は残っている。通しの実行では、ページを開いてから座標を読むまでが短いと、この途中の座標を読むことになる。

### 直したこと

- `tests/browser/helper.mjs:253` に `wait_still(page, selector)` を足した。要素の `getAnimations()` が 0 件になるまで `waitForFunction()` で待つ
- `tests/browser/drag.test.mjs:107` で、`center_of(page3, '#cube')` の前に `wait_still(page3, '#cube')` を呼ぶ（今回足したテストなので本体を変えた）

`node --test tests/browser/drag.test.mjs` を 1 回走らせ、3 pass / 0 fail だった（rules.test.mjs と一緒に走らせた）。
失敗はたまにしか起きないので、1 回通っただけでは直ったことの裏付けにならない。裏付けは上の実測（直後の座標では必ず掴めない）による。

## 2. バナーを表示から読むテスト（レビューの指摘 3）

### コードで確かめたこと

- パスのバナー: `BoardView.render_turn()` は、turn が 0 / 1 のとき `closeout(pos, 1 - turn)` なら `pass_btn[turn].on()`（`hidden = false`）
- 勝ちのバナー: turn が -1 で `resign` が無ければ、`winner_is()` の `score` が 0 でないプレーヤーの `win_btn` を出して、名前を強調する
- **勝ちの点数は表示に出ない。** `render_turn()` の `score` は、バナーを出すかの判定と `log()`（`board_view.js:666`）にしか使っていない。得点の表示（`p0score`）は `gameinfo.score` で、勝ちの点数を足すのはサーバ。ページの中だけで盤面を置く `apply_gameinfo()` では変わらない。そこで点数は読まず、勝ちのバナーと名前の強調を読む形にした

### 足したもの

- `tests/browser/helper.mjs:1127` の `shown_banners(page)`。パス・勝ち・投了のバナーが出ているか（要素の `hidden`）と、名前が強調されているか（`p{n}name` の `style.color`）を 2 人ぶん、DOM から読む
- `tests/browser/rules.test.mjs:126`「相手に閉め出されている手番では、パスのバナーが出る」。プレーヤー 1 はインナー（19〜24）に 2 枚ずつ、残りはゴール。プレーヤー 0 は 1 枚がバー（26）、残りは 6。手番は 0、ダイスは空。これを `apply_gameinfo()` で置くとパスのバナーが `[true, false]` になり、バーの駒を 13 に置き直すと `[false, false]` になるかを見る
- `tests/browser/rules.test.mjs:155`「上がった盤面では、勝った側に勝ちのバナーが出て名前が強調される」。プレーヤー 0 の 15 枚が全部ゴール、turn は -1、`resign` は -1。`win` と `name_on` がどちらも `[true, false]` になるかを見る
- どちらも最後に元の `gameinfo` を `apply_gameinfo()` で戻す（`beforeEach` が初期配置を確かめているため）

### 壊して落ちるかの確認

`board_view.js` の控えを scratchpad に取り、verifier の 3-1・3-2 と同じ壊し方で `node --test tests/browser/rules.test.mjs` を走らせた。

| 壊し方 | 結果 |
|--------|------|
| 3-1: `if ( false && closeout(pos, 1 - turn) )` | 8 pass / 1 fail。落ちたのは「パスのバナーが出る」 |
| 3-2: `score = 0;`（`winner_is()` の呼び出しを置き換え） | 8 pass / 1 fail。落ちたのは「勝ちのバナーが出て名前が強調される」 |

どちらも、戻したあと `cmp` で控えと一致した（`SAME`）。

## 走らせたテスト

- `node --test tests/browser/rules.test.mjs tests/browser/drag.test.mjs` — 12 pass / 0 fail（rules 9 件、drag 3 件）
- 壊した状態の `node --test tests/browser/rules.test.mjs` を 2 回（上の表）

ブラウザのテスト全体の件数は、2 巡目の 97 件に 2 件を足して 99 件になるはず（全体では走らせていない）。

## 残る懸念

- `wait_still()` は、無限に続くアニメーションがある要素に使うと、`waitForFunction()` の既定の待ち時間で打ち切られる。今はキューブにしか使っていない
- clicks.test.mjs の `drag_cube()` はキューブの動きを `sleep(500)` で待っている。今回は変えていない（`wait_still()` に置き換えられる）
