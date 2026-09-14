# TODO-059 レビューの依頼（reviewer）

## 目的

TODO-059（`TODO.md` の節）で、盤面の参照と操作の判定・予測を `rules/` の純粋関数へ移し、
`Board` と `actions.js` から委譲する形にした。**挙動を変えるのは目が 0 のダイスだけ**という
前提が守られているか、設計と規約に合っているかを見る。コードは直さず、見つけたことを報告する。

- 依頼: `archives/agents/TODO-059/implementer-request.md`
- 実装の報告: `archives/agents/TODO-059/implementer-report.md`
- 設計: `docs/design-4.md`（「クライアントの構成」「変える挙動」「実装項目の分け方」の 3）
- 差分: `git diff` と未追跡の `src/ytbg/webroot/static/js/rules/actions.js`、`tests/js/actions.test.mjs`
  （**作業ツリーを書き換えないこと。** `git stash` や checkout もしない。変更前のコードは `git show HEAD:<path>` で読む）

## 見ること

1. **移した判定の条件が変わっていないか。** `git show HEAD:src/ytbg/webroot/static/js/actions.js` と
   `board.js` の `predict_gameinfo()` / `checker_order()` を、`rules/actions.js` / `rules/position.js` と
   1 つずつ突き合わせる。等号・`>=`、`turn` の範囲、キューブの `side` / `accepted` / 上限、
   リダブルのプレーヤー番号、`src_y` の比較、free move の目の進め方、先手決めの比較、
   ワンタッチのムーブ、ヒットの判定、`idx`、使ったダイスの +10、勝ちの点数
2. **送る内容と順番。** 各操作で送る `type` / `data` の値と型（`parseInt` の位置）、
   move は送ってから予測、free move のダイスと得点は予測してから送る順、予測に失敗したら送らない
3. **予測の土台。** `plan_move()` の移動元が gameinfo から読まれていること（`ch.cur_point` を使わない）、
   渡した gameinfo を書き換えない・`sn` を進めないこと
4. **目が 0 のダイスの直し方。** `usable_dice()` のバーの分岐を変えたことで、1〜6 の目や 11〜16 の目の
   結果が変わっていないか。直したのが呼ぶ側全部の通り道になっているか
5. **実装の報告の「判断が要る点」**（`predict_moves()` の公開、`Board.plan_move()` の名前、
   到達しないとされた 2 つの経路、ログが減ったこと）が妥当か。到達しないという判断が正しいか、
   呼ぶ側を grep して確かめる。`debug.test.mjs` がログの件数に依存していないかも見る
6. **helper の差し替え。** `corrupt_prediction()` が送る `idx` を壊さなくなった点で、
   `predict.test.mjs` の本体が見ていることが弱まっていないか
7. **設計との整合。** `rules/` が `rules/` の外を import していない、設計の表に無い公開関数や
   使われない export が無い、判定の無い操作が plan 関数になっていない、`tests/js/helper.mjs` の
   初期配置を使っている
8. **テストの足りなさ。** 設計の「検証と完了条件」の表の 1 行目に対して `tests/js/actions.test.mjs`
   が足りているか。成り立つ・成り立たない条件の両側があるか
9. **`docs/Developer.md` の説明が今のコードと合っているか。** TODO の番号を書いていないか

## 報告

`archives/agents/TODO-059/reviewer-report.md` に、指摘（ファイル:行、何が問題か、
挙動が変わるならその入力と結果）を重い順に書く。問題が無かった観点も 1 行ずつ書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
