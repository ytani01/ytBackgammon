# TODO-075 verifier への依頼

implementer が実装した TODO-075（同じ処理を短く書き直す）を確認してください。
依頼内容は `archives/agents/TODO-075/implementer-request.md`、実装報告は
`archives/agents/TODO-075/implementer-report.md` にあります。

## 確かめること

1. `node --test tests/js/` と `node --test tests/browser/` を実際に走らせ、
   終了コードを記録する。
2. `git diff` で変更ファイルと箇所が依頼どおりか確認する（7 箇所の一覧は
   implementer-request.md 参照）。
3. **dst_points() と dice_for_move() は、挙動が変わっていないかを実測で
   確かめる。** src をわざと壊して（ループの境界を 1 つずらす、など）、
   狙ったテストが落ちるかを見る。壊した後は必ず元に戻すこと。
4. implementer-report.md に「範囲外の気づき」として、`render_turn()` の
   `update_roll` から `pass_btn[1-player].off()` の冗長な呼び出しを削除した
   旨が書かれている。これは依頼の 7 箇所には無い変更なので、実際に
   挙動へ影響が無いか（呼び出し時点で本当に既に off 済みか）を diff とコードで
   確認し、報告に明記すること。

## 報告

`archives/agents/TODO-075/verifier-report.md` に書くこと。
返事は5行以内。
