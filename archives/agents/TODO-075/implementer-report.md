# TODO-075 implementer 報告

## 変更ファイルと箇所

- `src/ytbg/webroot/static/js/rules/move.js`
  - `dst_points()`（118 行あたり、旧 141〜168 行）— 2 個目以降のダイスを足し
    込む 3 段の入れ子（2 個目・3 個目・4 個目）を、`i` を進める 1 つの
    `for` ループにまとめた。`dst_point()` が `undefined` を返したら打ち切る
    条件はそのまま残している。
  - `dice_for_move()`（旧 314〜326 行）— 3 個・4 個のゾロ目判定を
    `for (let n=3; n <= active_dice.length; n++)` の 1 つのループにした。
    `active_dice[0] * n` と比較し、一致すれば `n` 個ぶんの配列を作る。

- `src/ytbg/webroot/static/js/rules/judge.js`
  - `calc_gammon()`（47〜52 行）— `points` を組み立てる if/else を三項演算子
    1 行にした。

- `src/ytbg/webroot/static/js/board_view.js`
  - `render_turn()` の `update_roll`（619〜623 行あたり）— 直前の
    for ループで `roll_btn` を含め全部 `off()` にしているため、`update_roll`
    内の `off()` 呼び出しと、常に off 済みだった `pass_btn[1-player].off()`
    を削り、`on()` にする条件だけを残した。
  - コンストラクタの `PlayerScore` / `ScoreButton`（279〜293 行あたり）—
    プレーヤー 1・0 それぞれに書いていた代入を `for (const p of [1, 0])`
    のループにまとめた（元の実行順 1→0 は保った）。
  - コンストラクタの `PlayerName` の生成と `set("")`/`on()`（299〜310 行
    あたり）— 別々だった 2 つの `for` ループを 1 つに統合した。
  - `inverse()`（765〜774 行あたり）— `if/else` の `rotate(0,...)` /
    `rotate(180,...)` を `this.board.rotate(180 * this.settings.player, true, sec)`
    の 1 行にした。

- `src/ytbg/webroot/static/js/ui/cube.js`
  - `Cube.set()`（78〜97 行あたり）— `accepted` と else の両方にあった
    `side == 0 ? rotate(90) : rotate(-90)` の重複を、分岐の前の 1 回に
    まとめた（`this.rotate(side == 0 ? 90 : -90, true)`）。

範囲は依頼の 7 箇所のみ。他のファイルには触れていない。

## 検証結果

- `node --test tests/js/` — 154 件全て pass、fail 0（終了コード 0）
- `node --test tests/browser/` — 106 件全て pass、fail 0（終了コード 0、
  約 74 秒）

## 判断が要る点・気づいたこと

- 判断が必要な点は無かった。すべて依頼どおりの機械的な書き換えで、
  挙動は変えていない（各所でロジックを手でトレースして元の条件と
  一致することを確認済み）。
- 範囲外の気づき: `render_turn()` の `update_roll` から消した
  `this.pass_btn[1 - player].off()` は、呼び出し時点で既に off 済みの
  冗長なコードだったため今回削除に含めた。挙動には影響しない。
