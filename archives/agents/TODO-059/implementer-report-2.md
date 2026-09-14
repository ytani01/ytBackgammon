# TODO-059 実装の報告 2 巡目（implementer）

`reviewer-report.md` の指摘 1・2・4・5・6 を直した。指摘 3 は依頼どおり直していない。

## 変えた箇所

### 指摘 1: 手番を見ていないテスト

- `tests/js/actions.test.mjs:79` 「手番でないプレーヤーの駒は掴めない」を、両方のプレーヤーにダイス
  `[3, 5, 0, 0]` がある盤面にした。turn 0 と turn 1 の両方で、手番の駒は掴めて相手の駒は掴めないことを見る

### 指摘 2: 足したテスト（既存の it に足したものを含む）

- `tests/js/actions.test.mjs:149` 新しい it「自分の駒が 1 枚のポイントへ動かしてもヒットにならない」
  （8 → 5、5 には自分の駒が 1 枚。`hit_id` が null で、move は 1 手、idx 1）
- `tests/js/actions.test.mjs:354` 「相手側 (side) のキューブは触れない」に、`side: 0` のキューブを
  player 1 が掴めない（turn 1）、player 0 は掴める（turn 0）を足した
- `tests/js/actions.test.mjs:425` 「未テイクで自分の側…」に、player 1（`side: 1`）が y1[0] から掴んだ
  リダブルは `double` の player が 0、y1[1] からなら 1 を足した

### 指摘 4: 「actions.js が直接送る」

- `docs/Developer.md:385-389` と `src/ytbg/webroot/static/js/rules/actions.js:12-14` を、plan の関数を
  作らないこと、`take` / `cancel_double` とダイスを使い切ったあとの `end_turn` は `plan_cube_drop()` /
  `plan_dice_click()` が返すこと、パスのバナーの `end_turn` と名前・履歴・時計の設定は `actions.js` が
  直接送ること、に書き直した

### 指摘 5: 古いコメント（コメントだけ。テストの中身は変えていない）

- `src/ytbg/webroot/static/js/actions.js:4-6` 判定と送る内容は rules/actions.js にあり、ここはそれを呼んで送る
- `tests/browser/predict.test.mjs:8-10` `drop_checker()` が `plan_move()` で予測と move を作り、送ってから `apply()`
- `tests/browser/predict.test.mjs:356` `decide_dst()` は undefined ではなく null を返す（`plan_move()` も null）
- `tests/browser/board.test.mjs:141` 積み順の持ち主を `rules/position.js` の `checker_order()` に

### 指摘 6: has_dice

- `src/ytbg/webroot/static/js/rules/position.js:132` に `has_dice(gameinfo, player)` を足した
- `rules/actions.js` の内部の `has_dice` を消し、position.js から import する形にした
- `board.js:543` の `Board.has_dice()` は `rule_has_dice()` を呼ぶ（gameinfo が無ければ false はそのまま）
- `tests/js/position.test.mjs:120` に `has_dice()` のテスト 1 件を足した
- `docs/Developer.md` のルール層の表の `position.js` の行に `has_dice()` を足した

## わざと壊して落ちるかの確認

`rules/actions.js` を 1 か所ずつ壊し、`node --test tests/js/` を走らせて、戻した。

| 壊し方 | 落ちたテスト |
|---|---|
| `if ( gi.turn != player ) return false;` を消す | 手番でないプレーヤーの駒は掴めない（1 件） |
| `checkers[0].player != player` を `true` に | 自分の駒が 1 枚のポイントへ動かしてもヒットにならない（1 件） |
| `cube.side >= 0` を `> 0` に | 相手側 (side) のキューブは触れない（1 件） |
| y1[0] 側の `plan_double(gi, 0, true)` を `plan_double(gi, player, true)` に | 未テイクで自分の側: 中央を越えなければ take、越えればリダブル（1 件） |

戻したあと 153 件すべて通ることを確かめた（has_dice を移す前の時点）。

## 走らせた結果

- `node --test tests/js/` — 154 pass / 0 fail、終了コード 0（1 巡目の 152 件から、指摘 2 の it 1 件と has_dice 1 件で +2）
- `node --test tests/browser/`（フォアグラウンドで 1 回）— 92 pass / 0 fail、終了コード 0

## 判断が要る点・残る懸念

- なし。指摘 3（15 枚より多い壊れた盤面での idx とヒットの違い）は依頼どおり直しておらず、1 巡目の報告の
  「15 枚より多いときの挙動は同じ」は書き換えていない（main が決着のファイルに書く）
