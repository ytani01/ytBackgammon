# TODO-075 implementer への依頼

TODO-074 と同じ読み直しの結果のうち、**挙動を変えずに短く書き直すもの**。
以下の 7 箇所だけを直す。範囲を広げないこと。

- `static/js/rules/move.js` の `dst_points()` — 目を足していく 3 段の入れ子を
  1 つのループにする
- `static/js/rules/move.js` の `dice_for_move()` — 3 個と 4 個のゾロ目の判定を
  1 つのループにする
- `static/js/rules/judge.js` の `calc_gammon()` — `points` の if/else を三項演算子にする
- `static/js/board_view.js` の `render_turn()` の `update_roll` — 直前で全部
  `off()` にしているので、`on()` にする条件だけを残す
- `static/js/board_view.js` のコンストラクタ — プレーヤーごとに 2 回ずつ書いている
  スコアと ▲▼ をループにし、名前の 2 つのループを 1 つにまとめる
- `static/js/board_view.js` の `inverse()` — `rotate(180 * player, ...)` の 1 行にする
- `static/js/ui/cube.js` の `Cube.set()` — 2 回ある回転の if/else を分岐の前の 1 回にする

（実際のファイルパスは `static/js/` 配下を `find`/`grep` で確認してから直すこと。
上記は TODO.md に書かれた記述をそのまま転記したもので、パスが違っていたら
実物に合わせてよい。）

## 確認すること（自分で通す）

- `node --test tests/js/`
- `node --test tests/browser/`

## 判断が要る点があれば

止めて報告に書くこと。憶測で進めない。

## 報告

`archives/agents/TODO-075/implementer-report.md` に、変更ファイルと箇所
（`ファイル:行`）、検証結果、判断が要る点を書くこと。
