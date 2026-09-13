# TODO-046. `Board` のコンストラクタから配置を切り出す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 7,997 | 17,018 | 65% |
| verifier | Sonnet 5 | medium | 7,209 | 53,450 | 19% |
| reviewer | Sonnet 5 | high | 12,064 | 59,640 | 15% |
| 合計 |  |  | 27,270 | 130,108 | 概算 $2.6 |

- reviewer も verifier も定義のまま（Sonnet 5）。座標の式を写すだけで、
  分岐の意味が変わる余地が小さいので上書きしなかった
- 順番は TODO-044 の振り返りどおり reviewer → verifier

## きっかけ

`Board` のコンストラクタが 380 行あり、その多くがポイント 28 個・スコア・
名前・クロック・PIP の座標の計算だった。

## やったこと

`layout.js` に**座標を返す関数だけ**を 3 つ足し、`Board` のコンストラクタは
それを読んで部品を `new` するだけにした（`board.js` −154 行、`layout.js` +98 行）。

| 関数 | 返り値 |
|------|--------|
| `point_geometry(bx, by, board_h)` | 28 個ぶんの `{x, y, w, h, direction, max_n}` |
| `score_geometry(bx, by)` | プレーヤーごとの `{label, up, down}` |
| `label_geometry(bx, by, board_h)` | 名前・クロック・PIP の `{x, y, deg}`（プレーヤーごと） |

**部品の生成は `Board` に残した**（TODO-042 で決めたとおり）。`layout.js` は
何も import しない。部品を作る順番、要素の id、`ScoreButton` の `player`
引数（全部 0。TODO-048 で直す）は変えていない。

## 確かめたこと

| 対象 | 結果 |
|------|------|
| `node --test tests/browser/` | 56 件すべて成功 |
| `node --test tests/js/` | 99 件すべて成功 |

**配置を HEAD と突き合わせた。** verifier が `git worktree` で移す前の版を
別に作り、両方でサーバを起動してページを開き、ポイント 28 個の
`x, y, w, h, direction, max_n, cx, y0`、スコア・ボタン・名前・クロック・PIP の
座標と `getBoundingClientRect()`、全チェッカーの座標、`<body>` の大きさを
書き出して比べた。**差分は 0 件。**

比べる仕組みが差を捕まえることも、ポイント 27 の `direction` をわざと
変えて確かめた。

## 残ること

- `layout.js` の 3 つの関数を数値で固定するテストは足していない。
  `tests/js/` は `rules/` の純粋関数だけを見る決まりで、配置の確認は
  ブラウザで行う。今回の突き合わせは使い捨てのスクリプトで、
  リポジトリには残していない

## 分担の振り返り

- **reviewer が見つけたもの**: 要修正 0 件。「数値のテストが無い」を
  検討として挙げた
- **verifier が見つけたもの**: 無し（配置は完全一致）。
  **「テストが通る」ではなく「HEAD と画面の値を突き合わせる」を
  依頼したのが効いた。** 既存のブラウザテストは座標を細かく見ていないので、
  通るだけでは配置のずれを捕まえられない
- **見込みとの食い違い**: main のモデルが Sonnet の見込みに対して Opus
  （切り替えるのは利用者）。料金は $2.6 で、ここまでの項目でいちばん軽い
- **次に同じ規模でやるなら**: 見た目を変えないリファクタリングは、
  reviewer を省いて **verifier の突き合わせ 1 本**でもよかった。
  式の写し間違いは突き合わせで必ず出るし、reviewer の指摘は 0 件だった。
  ただし `~/.claude/CLAUDE.md` は分岐や条件式が変わる項目にレビューを
  求めていて、`point_geometry()` は `if` の並びを書き直しているので、
  今回は入れて正しかった
