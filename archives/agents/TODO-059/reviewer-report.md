# TODO-059 レビューの報告（reviewer）

対象: `git diff`（HEAD 9a536a0 との差）と未追跡の `rules/actions.js`・`tests/js/actions.test.mjs`。
作業ツリーは書き換えていない。実測はすべて scratchpad に写したコピーで行った。

## 実測したこと

1. **変更前と変更後の結果の比較。** `git show HEAD:` の `rules/{position,move,judge}.js` を写し、
   変更前の `can_pick_checker()` / `decide_dst()` + `move()` + `Board.predict_gameinfo()` / `roll()` を
   純粋関数に書き直して（`ch.cur_point` = gameinfo の位置、`Board.checkers_at()` は 15 枚まで）、
   新しい `can_pick_checker()` / `plan_move()` / `plan_roll()` と突き合わせた。
   ランダムな盤面 4000 件（半分はバーの駒が入れない盤面）× 30 枚 × 離す位置 29 通り:
   - `can_pick_checker` 120,000 回、`plan_move` 3,480,000 回（成り立った 276,952 回）、`plan_roll` 8,000 回
   - **違いは 0 件**（予測に失敗して例外になる場合も一致）。ただし、変更前の目 `10` が変更後に `0`
     になるものは同じと見なした。これが 45,029 回あり、違いはこれだけ
   - 渡した gameinfo が書き換わった回数 0
2. **わざと壊して、`node --test tests/js/` が落ちるか**（`rules/actions.js` に 35 通り）。
   29 通りは落ちた。残った 6 通りのうち 3 通りは結果が変わらない壊し方
   （`checkers.length == 1` → `>= 1`、`can_pick_checker` の `turn >= 2` → `> 2`、`predict_moves` の移動元を
   元の gi から読む）。**残りの 3 通りはテストの足りなさ**（下の指摘 1・2）
3. `node --test tests/js/` 152 pass / 0 fail

## 要修正

### 1. `tests/js/actions.test.mjs:79-83` — 「手番でないプレーヤーの駒は掴めない」が、手番を見ていない

- 何が問題か: `gi_with({ dice: [[3, 5, 0, 0], [0, 0, 0, 0]] })` で player 1 のダイスが空なので、
  `can_pick_checker(gi, 100, false)` は「使えるダイスが無い」で `false` になる。
  `rules/actions.js:84` の `if ( gi.turn != player ) return false;` を消しても、このテストは通る（実測）。
  テスト名の条件を確かめていない
- 根拠: 実測（上の 2。`gi.turn != player` の分岐を消しても 152 件すべて通る）
- 直すなら、両方のプレーヤーにダイスを置いた盤面で見る

## 検討

### 2. `tests/js/actions.test.mjs` — 成り立たない側の条件が抜けているもの

依頼の「成り立つ・成り立たない条件の両側」に照らして、壊しても落ちなかったもの:

- **ヒットは相手の駒だけ**（`rules/actions.js:140` の `checkers[0].player != player`）。消すと、自分の駒が
  1 枚だけあるポイントへ動かしたときに自分の駒をバーへ送る move になるが、テストは通る（実測）。
  自分の駒が 1 枚のポイントへ動かすテストが無い（:145 の移動先 6 は 5 枚）
- **キューブの `side` が 0 のとき**（`rules/actions.js:386` の `cube.side >= 0`）。`> 0` にしても通る（実測）。
  :334 は `side: 1` しか見ていない。`side: 0` を player 1 が掴めないことを見るものが無い
- **リダブルのプレーヤー番号が掴んだ位置で決まること**（`rules/actions.js:448` の `plan_double(gi, 0, true)`）。
  `plan_double(gi, player, true)` にしても通る（実測）。:396-399 は player 0 で y1[0] から掴む場合だけで、
  0 と `player` が同じ値になる。y1[1] 側（:403）は player 0 で見ているので壊すと落ちる。
  盤面の反転があるので player 1 が y1[0] から掴む場面は実際にある（未確認。反転時の y1 の扱いは読んでいない）

### 3. 実装の報告の「判断が要る点 3」— 15 枚より多い壊れた盤面でも挙動が変わる

- 報告は「15 枚より多いときの挙動は同じ」としているが、`put_checker` の idx とヒットの判定では変わる
- 変更前は `Board.checkers_at()`（15 枚まで）で数えていたが、変更後は `rules/position.js` の
  `checkers_at()`（全部）で数える。`src/ytbg/webroot/static/js/rules/actions.js:139` と `:261`
- 実測: 初期配置の `checker[1]` に 16 枚目 `[7, 0]` を足し、turn 0・ダイス `[1,0,0,0]`
  - `plan_put_checker(gi, 5, 7)` の idx: 変更前 0 → 変更後 1
  - `plan_move(gi, 7, 7)`（8 → 7）: 変更前はヒットなしの 1 手、変更後は `{ch: 115, p: 27}` を含む 2 手。
    115 という ID の駒は画面に無い
- サーバは読み込むときに枚数を確かめていない（`src/ytbg/` を grep したが、該当する処理は無かった）。
  壊れた `.jsonl` を読んだときだけの話で、変更前も `Position.from_gameinfo()`（全部数える）と
  `Board.checkers_at()`（15 枚まで）が食い違っていた。直すかどうかより、報告の記述を正すかどうかの判断
- 15 枚より少ない盤面で「TypeError で止まっていたのが止まらなくなる」点は報告どおり（コードを読んで確認。実測はしていない）

### 4. `docs/Developer.md:388-390` — `take` / `cancel_double` は `actions.js` が直接送っていない

- 「判定の無い操作（`end_turn`、`take`、`cancel_double`、…）は関数にせず、`actions.js` が直接送る」とあるが、
  今のコードでは `take` と `cancel_double` のメッセージは `rules/actions.js` の `plan_cube_drop()`（:441、:460）が
  作り、`actions.js` はそれを送るだけ。`actions.js` の関数 `take()` / `cancel_double()` は消えている。
  `end_turn` も `plan_dice_click()` が作る経路と、`actions.js` の `end_turn()`（パスのバナー）の 2 つがある
- 同じ言い方が `rules/actions.js:12-13` のコメントにもある
- 設計の表（「判定の無い操作は関数にしない」）には合っている。合っていないのは「直接送る」という説明だけ

### 5. 古くなったコメント

- `src/ytbg/webroot/static/js/actions.js:4-5` 「ゲームを進める処理と、「いま押してよいか」の判定をここに置く」。
  同じ docstring の :8-10 は「判定は rules/actions.js に任せ」と書いていて、食い違っている
- `tests/browser/predict.test.mjs:8` 「actions.js の move() が」、`:356` 「decide_dst() がキャンセルしたら
  undefined を返し」、`tests/browser/board.test.mjs:141` 「積み順を決めているのは Board.checker_order() だけ」。
  テスト本体なので実装担当の範囲外。直すなら main の判断

## 好みの範囲

### 6. `rules/actions.js:49` の `has_dice` を `rules/position.js` に置くか

設計に「盤面を読む関数は `rules/position.js` に足す」とある。`Board.has_dice()`（`board.js:538`）と同じ条件が
2 か所にある。`get_active_dice()` と同じように委譲できる。実装の報告も気づいているとおり、TODO-060 でまとめてもよい

## 問題が無かった観点

1. **移した条件:** 等号・`>=`、`turn` の範囲、`side` / `accepted` / 上限、リダブルの 0 / 1、`src_y` の `==`、
   free move の目の進め方、先手決めの比較、ワンタッチ、ヒット、idx、+10、勝ちの点数は、HEAD と 1 行ずつ
   突き合わせて同じ。move と roll は上の比較でも一致
2. **送る内容と順番:** move は送ってから `apply()`（`actions.js:164-169`）。free move のダイスと得点は
   `apply()` してから送る（:96-99、:278-279）。予測に失敗すると送らない（:153-158）。`parseInt` は
   roll / click_dice / resign / set_score の player で同じ値にかかっている。`drop_cube` の player は
   `settings.player` をそのまま渡すが、`Settings.load_player()` / `set_player()` で常に数なので変わらない
3. **予測の土台:** `plan_move()` / `predict_moves()` の移動元は gameinfo から読む（`ch.cur_point` を使わない）。
   `apply()` がすべての駒の `cur_point` を gameinfo から書き直している（`board.js:654`）ので、15 枚の盤面では
   変更前と同じ値になる。渡した gameinfo を書き換えず、`sn` も進めない（テストがあり、壊すと落ちる）
4. **目が 0 のダイス:** `usable_dice()` のバーの分岐だけを変えた。1〜6 の目は `false` のまま、11〜16 と 10 は
   変更前も `v % 10 + 10` で同じ値に戻っていたので結果は同じ。`usable_dice` / `disable_unusable` を呼ぶのは
   `predict_moves()` と `plan_roll()` だけ（grep）で、roll と move の両方がこの 1 か所を通る
5. **判断が要る点:** `predict_moves()` の公開は、`Board.put_checker()`（helper の `put_checker_local()`）で
   使うので妥当。`Board.plan_move()` の名前も妥当。`actions.js` の `put_checker()` で gameinfo が無いのは、
   呼ぶのが `drop_checker()`（掴めたあと）と helper の `send_put_checker()`（ページを開いたあと）だけで、
   `board.gameinfo` を `undefined` にするのはコンストラクタだけ（`board.js:92`）なので、到達しない。
   `debug.test.mjs` は `console.log` の件数が 0 か 1 以上かしか見ていない（:60、:65）ので、ログが減っても影響しない
6. **helper:** `corrupt_prediction()` は `predicted` だけを壊すようになった。`predict.test.mjs:307-353` の
   本体が見ているのは、表示が壊れた予測になること、送った `[ch, p]`、返事で戻ることで、idx は見ていない。
   変更前に idx が壊れた値で送られていたのは、予測から message を作っていた副作用で、確かめたい点ではない。
   弱まっていない
7. **設計との整合:** `rules/actions.js` の import は `rules/` の中だけ。公開しているのは設計の表の 11 関数と、
   `predict_moves()`（上の 5）、`CUBE_MAX` / `SCORE_MAX`（テストだけが使う）。判定の無い操作の plan 関数は無い。
   テストの初期配置は `tests/js/helper.mjs` の `make_gameinfo()` / `init_checker()` を使っている
8. **テストの足りなさ:** 設計の表の 1 行目（ID でのヒット・積み順・ダイスの消費・勝ちの点数・盤面が変わらない・
   `sn`・0 のダイス）はそろっている。足りないのは上の 1・2
9. **`docs/Developer.md`:** 上の 4 以外は今のコードと合っている。TODO の番号は書いていない
