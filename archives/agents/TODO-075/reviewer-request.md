# TODO-075 reviewer への依頼

implementer が実装した TODO-075（同じ処理を短く書き直す）の差分をレビュー
してください。依頼内容は `archives/agents/TODO-075/implementer-request.md`、
実装報告は `archives/agents/TODO-075/implementer-report.md` にあります。
対象は `git diff` に出る変更全体です。

条件式・分岐が変わる項目なので、特に次を見てください。

- `rules/move.js` の `dst_points()` / `dice_for_move()` のループ化で、
  元の入れ子と分岐の意味（打ち切り条件、ゾロ目の判定）が変わっていないか
- `rules/judge.js` の `calc_gammon()` の三項演算子化で、if/else の分岐と
  一致しているか
- `board_view.js` の `render_turn()` の `update_roll` で、`off()` を削って
  `on()` の条件だけ残した結果、元と同じボタン状態になるか
- implementer-report.md に「範囲外の気づき」として書かれている
  `pass_btn[1-player].off()` の削除。依頼の 7 箇所に無い変更なので、
  規約違反（範囲を自分で広げない）にあたるかどうかも含めて判断すること
- CLAUDE.md のコーディング規約・書き方の慣習に沿っているか

## 報告

`archives/agents/TODO-075/reviewer-report.md` に、重大度（要修正/検討/
好みの範囲）順で書くこと。返事は5行以内。
