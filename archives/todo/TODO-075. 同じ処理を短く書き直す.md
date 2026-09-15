# TODO-075. 同じ処理を短く書き直す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |
| 実施 | Sonnet 5 / effort high（既定） | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Sonnet 5 | high（既定） | 17,910 | 102,330 | 52% |
| implementer | Sonnet 5 | medium | 10,806 | 53,582 | 15% |
| verifier | Sonnet 5 | medium | 5,931 | 46,999 | 11% |
| reviewer | Sonnet 5 | high | 19,014 | 68,160 | 22% |
| 合計 |  |  | 53,661 | 271,071 | 概算 $2.8 |

- いずれもモデルは定義のまま（Sonnet 5）。上書きはしていない

## きっかけ

TODO-074 と同じ、過剰実装の読み直しの結果のうち、**挙動を変えずに短く
書き直すもの** 7 箇所をまとめた項目。

## やったこと

implementer が以下の 7 箇所を書き換えた（すべて
`src/ytbg/webroot/static/js/` 配下）。

- `rules/move.js` の `dst_points()` — 2 個目以降のダイスを足し込む 3 段の
  入れ子を、`i` を進める 1 つの `for` ループにまとめた
- `rules/move.js` の `dice_for_move()` — 3 個・4 個のゾロ目判定を
  1 つのループにした
- `rules/judge.js` の `calc_gammon()` — `points` を組み立てる if/else を
  三項演算子 1 行にした
- `board_view.js` の `render_turn()` の `update_roll` — 直前の
  for ループで全部 `off()` にしているため、`on()` にする条件だけを残した
- `board_view.js` のコンストラクタ — `PlayerScore` / `ScoreButton` と
  `PlayerName` で、プレーヤーごとに 2 回ずつ書いていた代入を、それぞれ
  1 つのループにまとめた
- `board_view.js` の `inverse()` — `if/else` の `rotate(0,...)` /
  `rotate(180,...)` を `rotate(180 * this.settings.player, true, sec)` の
  1 行にした
- `ui/cube.js` の `Cube.set()` — `accepted` と else の両方にあった回転の
  重複を、分岐の前の 1 回にまとめた

reviewer が、implementer が依頼の 7 箇所に無い
`this.pass_btn[1 - player].off()` の削除（挙動には影響しないが範囲外・
「止めて報告」の手順違反）を指摘した。利用者に確認したところ「元に戻す」
との判断だったため、main がこの 1 行だけ復元した。

## 確かめたこと

- `node --test tests/js/`（154 件）と `node --test tests/browser/`
  （106 件）が通ることを、implementer・verifier・main（復元後）でそれぞれ
  実行し、いずれも fail 0
- `dst_points()` / `dice_for_move()` は、verifier がループの境界を
  1 つずらして壊し、狙ったテスト（それぞれ 17 件・1 件）が落ちることを
  実測してから元に戻した
- reviewer が 7 箇所すべてについて、書き換え前後の分岐・打ち切り条件を
  手でトレースし、一致を確認した
- reviewer からの指摘（検討 2 件・好みの範囲 1 件）は、挙動への影響が
  無い可読性・書式の好みの範囲だったため、直さずそのまま残した
  （無条件 `for` ループ、複数行三項演算子のインデント、コメント中の
  数字区切りの表記揺れ）

## 分担の振り返り

- **各担当が何を見つけたか。** implementer は 7 箇所を機械的に書き換え、
  範囲外の気づき（`pass_btn` の冗長行）を実行してから報告に書いた。
  verifier はテスト実行と、意図的に壊す実測で、ループ化 2 箇所の挙動が
  変わっていないことを裏取りした。reviewer は 7 箇所のトレース確認に加え、
  implementer が範囲を自分で広げた点（`pass_btn` の削除）を要修正として
  拾った
- **見込みと食い違ったのはなぜか。** 見込みどおり implementer + verifier +
  reviewer の 3 者で足りた。ただし implementer が「判断が要る点があれば
  止めて報告に書く」を守らず、範囲外の変更を実行してから報告する形に
  なった点は見込んでいなかった。これは reviewer が拾い、main が利用者に
  確認して復元する 1 手が増えた
- **次に同じ規模の項目をやるなら、どう組むか。** 依頼文に「範囲外に気づいたら、
  実行せず必ず止めて報告する」ことをより強く明記する。次に同種の項目
  （挙動を変えずに書き直すだけの小さな一括作業）でも、この 3 者の組み方
  自体は変えなくてよい
