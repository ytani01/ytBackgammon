# TODO-052 reviewer 報告

対象: 未コミットの差分（`git diff`）。変更前は `git show HEAD:<path>` と比べた。
テストの一式は走らせていない（verifier の担当）。以下の根拠は、特に書いていなければ
コードを読んだもの。

**要修正 1 件 / 検討 5 件 / 好みの範囲 3 件。**
「押してよいか」の判定と表示で、変更前と変わったもの（リグレッション）は見つからなかった
（末尾の「確かめて問題が無かったこと」）。

---

## 要修正

### 1. `CLAUDE.md:453-454` 予測の土台を「最後に届いた `gameinfo`」と書いている

- **問題:** この差分で書き直した箇条が「変えたもの以外を『最後に届いた `gameinfo`』へ戻す」
  のままになっている
- **根拠:** `board.js:715` の `apply()` は先頭で `this.gameinfo = gameinfo` とするので、
  予測を `apply()` したあとは `this.gameinfo` が**予測そのもの**になる。次の予測
  （`predict_gameinfo()`、`click_dice()` の free move、`set_score()`）はどれも
  `this.gameinfo` を複製するので、土台は「最後に `apply()` した盤面（届いたものか、自分の予測）」。
  2 回押しても 2 回ぶん効くのはこのためで、`clicks.test.mjs` の新しい 2 件もこれを前提にしている
- **起きる状況:** `move` のあとに返事を待たずに ▲ を押すと、▲ の予測には `move` の予測が
  残る。今の書き方だと、次のセッションが「▲ を押すと駒が戻る」と読んでしまう
- **直し方の案:** 「予測は `this.gameinfo`（最後に `apply()` したもの。自分の予測のことも
  ある）を土台にし、変えたもの以外はそのまま使う」のように書き、そのあとの「画面の方が新しい
  値は 1 往復ぶん巻き戻る」の説明は、他のクライアントの変更についての話として残す

---

## 検討

### 2. 続けて押したとき、途中で前の返事が届くと 1 回ぶん消える（リグレッションではない）

- **場所:** `actions.js:132-137`（free move のダイス）、`actions.js:513-519`（`set_score()`）、
  説明は `CLAUDE.md:449-452`
- **問題:** 押す → 押す → **1 回目の返事が届く** → 押す、の順だと、3 回目は 1 回目の返事
  （`this.gameinfo` が上書きされる）を土台にするので、2 回目と同じ値を送る。
  得点なら 3 回押して +2、ダイスなら 5→6→1→**1**。▲ の前に自分の `move` を送っていて、
  その返事が ▲ の間に届いた場合も同じ
- **根拠:** コードを読んだもの（実測はしていない）。`set_score` と `dice` は差分ではなく
  値そのものを送り、`apply()` は届いた `gameinfo` を丸ごと `this.gameinfo` に入れる。
  変更前も `apply()` が `PlayerScore.score` / `Dice.value` を届いた値で書き戻していたので、
  **挙動は変更前と同じ**
- **直し方の案:** 直すなら範囲が変わる（送ったがまだ返事の無い操作を覚えておく仕組みが要る）
  ので、この項目では直さず、`CLAUDE.md:451-452` の「返事が届く前に続けて押した分が消える」を
  「返事が 1 通も届かない間に続けて押した分は消えない（途中で返事が届くと消えることがある。
  変更前と同じ）」のように限界まで書くのがよい。直すかは利用者の判断

### 3. `CLAUDE.md:416` 「`gameinfo` がまだ届いていないときは、何も操作できない」が広すぎる

- **問題:** ガードを付けたのは `actions.js` のうち盤面を読む判定と送信（`roll` / `click_dice` /
  `can_pick_checker` / `can_hold_cube` / `double` / `resign` / `score_up` / `score_clear`）だけ。
  名前（`set_playername`）、クロック（`stop_clock` / `resume_clock` / `set_clock_*`）、
  履歴の操作と New Game（`history_op`）は `gameinfo` が無くても送る
- **根拠:** `actions.js:526-578` にガードが無い。どれも消した属性を読まないので、
  送っても壊れはしない。`docs/design.md` の同じ文言は「判定は `gameinfo` だけを読む」の節の中なので、
  盤面を読む操作の話と読める
- **直し方の案:** 書き方を「**盤面を読む操作**（ロール、ダイス、チェッカー、キューブ、投了、得点）は
  何もしない」に絞る。すべて止めたいならガードを足すが、その場合は利用者に聞く

### 4. テストが無い判定が 2 つある

- **場所:** `actions.js:400-405`（ダイスが出ているとキューブに触れない）、各関数の
  `gi === undefined` のガード
- **問題:** implementer の報告どおり、`has_dice()` を常に `false` にしても `clicks.test.mjs` は通る。
  `can_hold_cube()` は判定の読み先を `RollButton.dice_active` から `Board.has_dice()` に
  変えたところなので、テストで押さえておきたい。`cancel_double`（`cube.js:166` の
  `1 - this.player` → `1 - side`）もクリックのテストが無い（以前から）
- **「作りにくい」について:** 入っている playwright 1.63.0 には `page.routeWebSocket()` が
  ある（`node_modules/playwright-core/types/types.d.ts` で確認）。サーバからの `gameinfo` を
  止めたままページを開けるので、届く前にキューブ・▲・Roll を押して何も送らないことを見るテストは
  書けるはず（書いて試してはいない）
- **直し方の案:** `clicks.test.mjs` に「ダイスが出ているときにキューブを動かしても何も送らない」
  を足す。届く前の操作は、足すかどうかを管理者が決める

### 5. ▲ / free move のダイスの先行実行で、押した直後の Roll ボタンがもう一度出る

- **場所:** `actions.js:516`、`actions.js:134` の `board.apply(predicted, {sec: 0})`
  → `board.js:492` `roll_btn[turn].update()`
- **問題:** Roll を押す（`RollButton.on_mouse_down_xy()` が `off()` するだけで、`gameinfo` の
  ダイスは 0 のまま）→ 返事の前に ▲ を押す → 予測の `apply()` が `set_turn()` を通り、
  ダイスが 0 で手番なので Roll ボタンが `on()` に戻る。ここで Roll をもう一度押すと `roll` が
  2 通飛び、サーバは `roll` に条件を付けないので目が振り直される
- **根拠:** コードを読んだもの（実測はしていない）。他のクライアントの操作で `gameinfo` が
  届いたときにも同じことが起きるので、新しい穴ではないが、変更前は自分の ▲ では起きなかった。
  1 往復の間に Roll → ▲ → Roll と押す必要があり、起きにくい
- **直し方の案:** 気にするなら、この項目では `CLAUDE.md` に一言残す程度。直すなら
  `roll` も先行実行するか、サーバで `roll` を「その手番のダイスが 0 のときだけ」受け付ける
  （範囲外。別の項目）

### 6. 切断中に ▲ / ダイスを押すと、送っていない値が画面に残る

- **場所:** `actions.js:516-518`、`ws.js:31-35`
- **問題:** `emit_msg()` は切断中は捨てるが、その前に予測を `apply()` しているので、
  つなぎ直すまで画面の得点・目は送っていない値になる。つなぎ直すと `on_connect()` の
  `gameinfo` で戻る
- **根拠:** コードを読んだもの。`move` の先行実行も同じ作りで、変更前の ▲ は表示を変えて
  いなかった
- **直し方の案:** つなぎ直せば戻るので、そのままでよいと考える。気にするなら
  「送れたときだけ `apply()` する」ために `emit_msg()` が送れたかを返す形にする

---

## 好みの範囲

### 7. `ui/dice.js:202` と `actions.js:36`

- `RollButton.update()` は `gi.board.dice[this.player].some((v) => v != 0)` を自分で書いている。
  `this.board.has_dice(this.player)` と同じ意味（目は負にならない）なので、そちらを呼べば
  「ダイスは `get_active_dice()` と `has_dice()` で読む」（`CLAUDE.md:414-415`）と揃う
- `copy_gameinfo()` は `board.js:920` の `predict_gameinfo()` と同じ複製を別に書いている。
  TODO-053 で `disable_unusable()` を動かすときにまとめてもよい

### 8. `tests/js/move.test.mjs:227` のコメントが消した `Dice.value` を書いている

差分の外だが、消した属性の名前が残っているのはここだけ（`git grep` で確認）。
「`gameinfo.board.dice` の値が取るのは」に直す程度。

### 9. `CLAUDE.md:125-127` の挿入位置

`set_turn()` の説明と、その注意（「0 / 1 / -1 から 2 へは戻せず…」）の間に入っていて、
注意がどこに掛かるか読みにくい。注意のあとへ移すとよい。

---

## 確かめて問題が無かったこと

変更前（`HEAD`）と並べて読み、同じ結果になることを確かめた（実測はしていない）。

- **ロール** `roll()`: 変更前の `Cube.accepted` は初期値 `false` で、`apply()` で `gameinfo` の値に
  なっていた。届く前に振れないのも同じ
- **ダイスのクリック** `click_dice()`: オープニングの `roll_btn1.dice_active` は
  `RollButton.set()` が先頭で `clear()` してから「0 より大きい目があるか」で立てていたので、
  `has_dice()`（`v > 0`）と同じ。`get_active_dice()` の 1〜6 の絞り込みも同じ。
  オープニングの自動クリック（2 秒後）も、押した時点の `gameinfo` を読む点で同じ
- **チェッカーを掴む** `can_pick_checker()`: 読み先が変わっただけ。`move` の予測を `apply()` すると
  `this.gameinfo` も予測になるので、続けて 2 枚目を掴むときの使えるダイスも変更前と同じ。
  free move で届く前に掴めなくなったのは、変更前なら `predict_gameinfo()` が例外を投げていた経路で、
  改善
- **キューブ** `can_hold_cube()`: `Cube.player` は `side < 0` のとき `undefined` だったので、
  `side >= 0 && side != board.player` と同じ。外した `cube.player && cube.player != board.player` は
  1 つ前の判定で必ず先に弾かれていて、implementer の言うとおり通らない。
  `Cube.on_mouse_up_xy()` のテイク・リダブル・取り消し・ダブルの分岐も、`this.player` / `this.accepted`
  を `side` / `cube.accepted` に置き換えただけ
- **投了の点数** `resign()`: 同じ式。届く前は変更前だと 0.5 を送っていた
- **得点の ▲▼**: 送る値は同じ。`score_clear()` も予測を通るようになった
- **パスのバナー**: `RollButton.set()` の `dice_active` を引数の `dice_value` から求める形にしたが、
  上と同じ理由で結果は同じ。`set_turn()` の `closeout(1 - turn)` も、変更前は直前に
  `this.turn = turn` していたので同じ
- **勝ちのバナー**: `set_turn()` の中の `winner_is()` は `gameinfo.resign` と
  `gameinfo.board.cube` を読む。変更前は `apply()` が同じ値を `this.resign` と `Cube` に
  入れてから `set_turn()` を呼んでいた
- **表示**: `Cube.set()` の向きと位置の分岐、`Dice.set()` の画像と opacity（11〜16 で 0.5）は、
  写しへの代入を消しただけ。予測の `apply()` は `last_op` と `clock_state` を渡さないので、
  音もクロックも変わらない。`PlayerName.set()` は `<input>` の値に触らないので、
  名前の入力中に ▲ を押しても入力は消えない
- **予測が外れたとき**: `set_score` と `dice` のハンドラ（`server.py:377-393`）は条件を付けずに
  受け付けて `gameinfo` を返すので、返事で必ず上書きされる（切断中は 6 を見ること）
- **テストで状態を読む先**: `predict.test.mjs` で `shown_dice()` を別の evaluate に分けた 4 か所は、
  送信を止めているか（1 件目・4 件目）、何も送らない（2 件目・3 件目）ので、間に返事が
  届いて読み違えることは無い
- **`RollButton.get()` / `get_active_dice()` / `another()` を消した判断**: どれも `Dice.value` か
  `dice_active` を読むだけで、`src/` からの呼び出しは残っていない（`git grep` で確認）。
  テストで表示を見るために `shown_dice()` を要素から読む形にしたのは、`gameinfo` と比べると
  「表示まで届いたか」を見分けられる（implementer が `Dice.set()` の `disable()` を外して
  `predict.test.mjs` が落ちることを確かめている）ので、妥当と考える
- 消した属性（`Board.turn` / `resign`、`Cube.value` / `accepted` / `player`、`PlayerScore.score`、
  `Dice.value`、`RollButton.dice_active`）を読み書きしている箇所は、`src/`・`tests/`・
  `docs/Developer.md`・`CLAUDE.md` に残っていない（8 のコメントを除く。`git grep` で確認）
