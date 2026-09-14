# TODO-054 reviewer の報告

対象: 未コミットの差分（`src/ytbg/webroot/static/js/` の 12 ファイルと `CLAUDE.md`）。
JS のパスは `src/ytbg/webroot/static/js/` からの相対パス。

## まとめ

- **要修正: 0 件。** 変更前と比べて、動きの変わったところは見つからなかった
  （範囲外の `ch` の件は下の 4 を参照。実際に届くのは負の `ch` だけ）
- 検討: 5 件（うち 2 件はテストの追加）。好みの範囲: 2 件

### 確かめたこと（実測）

ページを開いて、各部品の `el.id` を変更前に id で探していた名前と照らした
（スクラッチの一時スクリプト。`tests/` には置いていない）。

- チェッカー 30 個（`p000`〜`p114`）で、`player` と `num` が `checker[p][i]` の添字と一致
- ダイス 8 個（`roll_btn[p].dice[i]` が `dice{p}{i}`）、Roll ボタン、パス・勝ち・投了のバナー、
  スコア、スコアの増減ボタン 4 個、名前とその `<input>`、クロックとその背景、PIP、キューブ、
  右側のボタン 4 個、`Board` 自身（`board`）
- 68 か所すべて一致。`BoardPoint` 28 個はどれも `el` と `id` が `undefined`。コンソールエラー 0 件

コードを読んで確かめたこと:

- `build_dom()` の呼び出しは `main.js:13` のモジュール評価時のままで、`Board` を作るのは
  `main.js:117` の `wait_images()` のあと。**画像を待つ順番は変わっていない**。
  要素は作り直されない（`replaceWith` / `remove()` / 親の `innerHTML` の書き換えは無い）ので、
  評価時に取った要素を `window.onload` で使っても同じもの
- `this.id` を読んでいたのは `BgBase` のコンストラクタ、`PlayerClock`（`-bg`）、`PlayerName`（`-input`）、
  `search_checker()`、ID を文字列から取る 3 か所（`actions.js`、`predict_gameinfo()`、`put_checker()`）で、
  すべて置き換わっている。残る `.id` はログ（`drag.js:83`, `:110`、`actions.js:274`）と getter だけ。
  `id` へ代入しているところは無い（getter だけにしても strict mode の TypeError にならない）
- `checker_id()`（`actions.js:28`）と `put_checker()` の送信（`board.js:895`）は、
  `parseInt("p" + ...slice(1))` と同じ値（`player * 100 + num`）になる
- `predict_gameinfo()`（`board.js:826`）は `ch.num` が旧 `parseInt(ch.id.slice(1)) % 100` と同じ
- `Dice` の画像の接頭辞 `dice_prefix`（`"dice" + player`）は id ではなくファイル名に使うもので、残っている

---

## 検討

### 1. put_checker の put / hit を、チェッカーの引き当てで見分けるテストが無い

- **場所:** `board.js:621-623`（`apply()` の `put_ch` の引き当て）。テストは `tests/browser/last_op.test.mjs:126`
- **問題:** 引き当ての式は今回書き直した新しいコードだが、実装者が「常に `[0]` から引く」と壊しても
  落ちなかった（implementer の報告）。今のテストは `ch: 1` を盤上から盤上へ動かすだけで、
  どのチェッカーを引いても `sound_put` になる。変更前の `search_checker()` も同じく押さえられていなかった
- **起きる状況:** プレーヤーや通し番号を取り違えると、free move でバーへ置いたときの音が
  put と hit で逆になる。見た目は変わらないので気づきにくい
- **直し方の案:** `last_op.test.mjs` に 1 件足す。**プレーヤー 1、通し番号 10 以上**を使うと、
  「常に `[0]`」「`% 100` を `% 10` にする」「プレーヤーの取り違え」のどれでも結果が変わる。
  1. `gameinfo` を写し、`checker[1][14]` をバー（`[27, 0]`）にして `last_op` なしで `apply()`
  2. その盤面で `put_checker {ch: 114, p: 27}` → `['sound_put']`（動かす前がバー）
  3. `put_checker {ch: 113, p: 27}` → `['sound_hit']`（動かす前が盤上）
  4. 最後に元の `gameinfo` で `apply()` して戻す

  足したら `board.js:623` を `[0]` 固定に壊して落ちることを確かめる（`CLAUDE.md` の「通ることだけを見ない」）

### 2. 部品と要素の取り違えを見るテストが無い

- **場所:** `board.js` の `Board` のコンストラクタ（`els.*` を渡すところ全体）、`ui/dice.js` の `RollButton`
- **問題:** 実装者の報告どおり、`RollButton` に渡すダイスの要素を 0 と 1 で入れ替えても落ちない。
  id 属性は `dom.js` が正しく付けたままなので、`#id` で探すテストは通ってしまう。
  これまでは「id で探すので取り違えようがない」形だったのが、今回から要素を手で渡す形になり、
  取り違えの入り込む余地ができた
- **起きる状況:** ダイス・クロックの背景・名前の `<input>`・スコアのボタンなどを別の要素に渡すと、
  配置が崩れたり、押したボタンと動く部品がずれたりする
- **直し方の案:** `tests/browser/board.test.mjs` に 1 件足す。ページの中で各部品の `el.id` を、
  期待する名前（上の「確かめたこと」の一覧）と照らす。今回スクラッチで走らせたものがそのまま使え、
  68 か所を 1 回の `page.evaluate()` で見られる。`checker[p][i]` の `player` / `num` も同じ場所で見る。
  ダイスの入れ替えで落ちることを確かめる

### 3. 「キーは `Board` のフィールド名に揃え」が一部で合っていない

- **場所:** `CLAUDE.md:297`、`dom.js:233`（`build_dom()` の JSDoc）
- **問題:** `Board` のフィールドは `player_name`（`board.js:144`）と `player_clock`（`board.js:159`）だが、
  キーは `name` と `clock`。`clock_bg` / `name_input` / `dice` に対応するフィールドは `Board` に無い
  （ダイスは `roll_btn[p].dice`）
- **起きる状況:** `CLAUDE.md` を読んだ次のセッションが、`els.player_name` のように書いて `undefined` を渡す
- **直し方の案:** 次のどちらか。
  - 文を直す。例:「キーは `Board` のフィールド名に近い名前にする（`name` は `player_name`、
    `clock` は `player_clock` に渡す）」
  - キーを `player_name` / `player_clock` に変える（`board.js` と `main.js` の `els.name_input` はそのまま）

### 4. サーバが負の `ch` を受け付け、別のチェッカーに書き込む（今回の範囲外・変更前から）

- **場所:** `src/ytbg/gameinfo.py:176-178`（`put_checker()`）
- **問題:** 実装者が挙げた「範囲外の `ch`（999 など）が届く」は、実際には起きない。
  サーバの `put_checker()` が `IndexError` になり、`gameinfo` は送られないため。
  届くのは Python の負の添字で通ってしまう値だけで、実測では `-86`〜`-99` がプレーヤー 0、
  `-100`〜`-186` がプレーヤー 1 のチェッカーを書き換える（例: `-100` は `checker[1][0]`）
- **クライアントの差（実測）:** その値が届いたとき、変更前は `-86` / `-99` で `apply()` が TypeError に
  なり、盤面を配り直さずに止まっていた（`-100` だけは `p100` として引けていた）。
  変更後はどれも `undefined` になり、音を鳴らさず盤面は配り直す。**変更後の方が良い**ので、ここは直さなくてよい
- **直し方の案:** クライアントではなくサーバで `0 <= player < 2`、`0 <= i < 15` を確かめる。
  TODO-054 の範囲外なので、新しい項目にするかを管理者が判断する（TODO-055 は範囲が決まっている）

### 5. テストの中に、id の文字列から通し番号を取る書き方が残っている

- **場所:** `tests/browser/predict.test.mjs:210`, `:365`
- **問題:** `parseInt(ch.id.slice(1)) % 100`。TODO-054 がなくそうとした書き方で、getter があるので動くだけ
- **起きる状況:** 今は動く。id の付け方（`dom.js` の `c_id`）を変えると、ここだけ黙ってずれる
- **直し方の案:** `ch.num` に置き換える（2 行）

---

## 好みの範囲

### 6. `BgBase` の `id` の getter は残してよい

- **場所:** `ui/base.js:89-91`
- テストの `ch.id` / `btn.id` / `board.top_checker(6).id`（`board.test.mjs`、`drag.test.mjs`、`clicks.test.mjs`）に
  加え、`src` 側のログ（`drag.js:83`, `:110`、`actions.js:274`）も使っている。値を持たず `el.id` を返すだけなので、
  id から要素を探す仕組みが戻ることはない。テストを `.el.id` に直して消す理由は薄い

### 7. `CLAUDE.md:400` の段落が折り返されていない

- 足した文が前の行につながったまま 1 行になっていて、周りの行の長さと揃っていない
