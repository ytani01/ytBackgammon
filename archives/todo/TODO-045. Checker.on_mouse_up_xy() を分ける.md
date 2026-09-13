# TODO-045. `Checker.on_mouse_up_xy()` を分ける

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 14,561 | 514,129 | 81% |
| reviewer | Opus 5 | high | 12,438 | 63,507 | 14% |
| verifier | Sonnet 5 | medium | 3,560 | 50,289 | 4% |
| 合計 |  |  | 30,559 | 627,925 | 概算 $6.9 |

- reviewer は定義の `sonnet` を Opus 5 に上書きした（挙動を変えない分割だが、
  順番の縛りがあるため）
- **TODO-044 の振り返りに従い、reviewer を先、verifier をあとにした**
  （並行にするとレビュー中に作業ツリーが壊れる）
- main の `cache_creation` が大きいのは、途中でアカウントの切り替え
  （`/login`）と中断が挟まり、会話のキャッシュを作り直したため。
  項目の重さとは関係ない

## きっかけ

`Checker.on_mouse_up_xy()` が 150 行あり、行き先の決定・ヒット判定・
予測・送信・ダイス消費・勝敗・得点を 1 つの関数でやっていた。

## やったこと

`src/ytbg/webroot/static/js/ui/checker.js` の `on_mouse_up_xy()` を
3 つに分け、本体は順に呼ぶだけにした。

| メソッド | すること | 返り値 |
|----------|----------|--------|
| `decide_dst(ch, drop_p, active_dice)` | 行き先の決定（ワンタッチのときの補完、行けない場所ならキャンセル）とヒット判定 | `{dst_p, hit_ch} \| undefined` |
| `apply_move(ch, dst_p, hit_ch, active_dice)` | 予測・送信・使ったダイスの消費 | なし |
| `after_move(ch)` | 勝敗と得点（勝っていれば turn を -1 にする） | なし |

`TODO.md` の表では `after_move` を「勝敗・得点・ターンの受け渡し」と
書いていたが、相手へターンを渡す処理は分ける前から無い
（勝ったときに `emit_turn(-1, -1, false)` するだけ）。上の表は実際に合わせた。

**挙動は変えていない。** `dice_check()` を `apply()` より前、使ったダイスの
`disable()` を `apply()` のあと、という順番の縛り（TODO-030）はそのまま。
`emit_msg("dice", { player: this.player })` の `this.player` と
`ch.player` の使い分けも揃えていない（`this` と `ch` は別の駒のことがある）。
消したのは重複していたログ 1 行だけ。

`CLAUDE.md` の「先行実行」と `rules/position.js` の docstring が
`on_mouse_up_xy()` を指していたので、`apply_move()` に直した。

## 確かめたこと

| 対象 | 結果 |
|------|------|
| `node --test tests/browser/` | 56 件すべて成功 |
| `node --test tests/js/` | 99 件すべて成功 |
| `uv run pytest` | 227 passed |
| `uv run ruff check .` | 指摘なし |

reviewer がスクラッチの複製で 6 通り壊した。

| 壊し方 | 結果 |
|--------|------|
| `dice_check()` を `apply()` のあとへ移す | 落ちる |
| `decide_dst()` がキャンセルでも `{dst_p, hit_ch}` を返す | **落ちない** |
| `after_move()` を呼ばない | 落ちる |
| `after_move()` の勝ちの枝を通らなくする | **落ちない** |
| 2 つ目のキャンセルで `cancel_move()` を呼ばない | **落ちない** |
| `after_move()` で相手の `roll_btn` を読む | 落ちる |

**キャンセルの経路にテストが無かった。** 分けたことで、`decide_dst()` の
返り値と呼び出し側の `undefined` の比較が、キャンセルとの唯一のつなぎに
なった（分ける前は `return` がその場で関数を抜けていた）。取り違えると
行けない場所への `put_checker` がサーバへ飛ぶが、気づけない。
そこで `tests/browser/predict.test.mjs` に
「行けない場所で離すと、元に戻って何も送らない」を足した。

verifier が作業ツリーで同じ 2 通りを壊し、**足したテストが両方で落ちる**
ことを確かめた。

## 残ること

- `after_move()` の勝ちの枝（`emit_turn(-1, -1, false)` と
  `score[].up()`）を通るテストが無い。**分ける前から通っていない**
- `decide_dst()` の 1 つ目のキャンセル（ワンタッチで行き先が無い）は、
  掴んでから離すまでにダイスが変わらない限り通らない
  （`on_mouse_down_xy()` が同じ条件で掴ませない）

## 分担の振り返り

- **reviewer が見つけたもの**: 「壊しても落ちない」経路が 3 つ。
  うち **`decide_dst()` の返り値の取り違え**は、分けたことで新しく生まれた
  弱点で、これを見つけたのが今回の要点。ほかに文書の参照先が古い件、
  `TODO.md` の表の言い回しの誤り。**依頼文で「スクラッチの複製で壊す」と
  明示した**ので、作業ツリーを揺らさずに済んだ
- **verifier が見つけたもの**: 無し（足したテストが狙いどおり落ちた）。
  壊し方は reviewer が「落ちない」と報告したものをそのまま渡したので、
  **TODO-043 で書いた「すでに押さえてある枝を選んでしまう」は起きなかった**
- **見込みとの食い違い**: 担当は見込みどおりで、順番だけ
  reviewer → verifier に変えた。料金の 81% が main で、アカウントの
  切り替えでキャッシュを作り直したぶんが大きい
- **次に同じ規模でやるなら**: この組み方（main が実装、reviewer が
  複製で壊して穴を探す、verifier がその穴を塞いだテストの効きを
  作業ツリーで確かめる）をそのまま使う。verifier の依頼は
  reviewer の報告を読ませるだけで短く書けた
