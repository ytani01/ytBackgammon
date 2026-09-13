# TODO-046 レビュー報告

対象: `git diff` の `src/ytbg/webroot/static/js/board.js` と
`src/ytbg/webroot/static/js/layout.js`（コミット前、作業ツリーの差分）。

## 座標の突き合わせ（実測）

移す前（`git show HEAD:src/ytbg/webroot/static/js/board.js`）の式と、
`point_geometry()` / `score_geometry()` / `label_geometry()` の式を
1 つずつ手計算で突き合わせた。

- **`point_geometry()`**: p=0〜27 の全 28 分岐（バー 26・27 を含む）を確認。
  26 は `{x: bx[3], y: y_mid, w: bar_w, direction: 1}`、27 は
  `{x: bx[3], y: by[0], w: bar_w, direction: -1}` で、移す前の
  `pw = this.bx[4] - this.bx[3]` によるローカルの幅の再定義も含めて
  一致。0〜25 のゴール・両陣営の分岐も式・向きとも一致
- **`score_geometry()`**: player 0 が `by[7] - offset - h`、player 1 が
  `by[2] + offset` で、移す前の `sy2` / `sy1` と一致。ラベルの
  `x_up + 3` / `y + h - 4`、ボタンの `up` / `down` の x/y/w/h も一致
- **`label_geometry()`**: name/clock は player 0 が `deg: 0`、player 1 が
  `deg: 180` で移す前と一致。PIP の y も player 0 が `board_h - offset`、
  player 1 が `offset` で一致

差分は見つからなかった。**未確認なのは実ブラウザでの表示比較**
（本レビューでは式の突き合わせのみで、スクリーンショット等の実行は
していない。これは verifier の役割と理解している）。

## 部品を作る順番・引数

- `PlayerScore` は移す前と同じく `score[1]` → `score[0]` の順
- `ScoreButton` の `player` 引数は 4 箇所とも `0` のまま
  （TODO-046 の指示どおり。TODO-048 で直す予定なので今回変えていないのは正しい）
- `PlayerName` / `PlayerClock` / `PlayerPipCount` / `BoardPoint` の
  id 文字列（`p0name` 等、`BoardPoint` は `""`）は移す前と同じ
- 生成順序（player_name は 0→1、clock は 0→1、pip は 0→1、point は 0→27）も
  移す前のまま

指摘: なし。

## `layout.js` の import

`ui/` にも `Board` にも依存していない（`import` 文自体が無い）。
TODO-046 の「座標の置き場所という今の役割から外れない」という制約を満たす。

## `CLAUDE.md` の慣習との整合

- 新しい 3 関数の JSDoc（`@param` / `@return`）と、末尾の
  `}; // foo()` という書き方は、既存の `rules/move.js` の書き方と
  揃っている（**好みの範囲・良い点**として記録。指摘ではない）
- コメント「座標は layout.js にある (TODO-046)」は TODO 番号を添えており、
  `CLAUDE.md` の「なぜそうしたか」を番号で参照する書き方に沿っている
- `node --input-type=module --check` で両ファイルとも構文エラー無し（実測）

## 気になった点（検討）

- **層をまたぐ座標のテストが無い。** `tests/js/` は `CLAUDE.md` の
  記述どおり `rules/` の純粋関数だけを見る対象で、`layout.js` は
  対象外。`tests/browser/` 側もスクリーンショットのバイト数や
  ドラッグ座標は見ているが、`point_geometry()` 等の返り値そのものを
  数値で確認するテストは無い（grep で確認）。今回は式を手で
  突き合わせて一致を確認できたが、今後この関数を触ったときに
  数値のズレを機械的に検出する手段が無い。TODO-046 の指示には
  テスト追加は含まれていないため**要修正ではない**が、次にこの関数を
  触る際は検討してよいと思う
- （好みの範囲）新しいコメント「// 座標は layout.js にある (TODO-046)」の
  近くにあった元の「Pip count XXX」というコメントが「Pip count」に
  変わっている（TODO-046 の指示範囲外の小さな変更）。中身は変えておらず
  実害は無いので指摘のみ

## 重大度まとめ

- 要修正: 0 件
- 検討: 1 件（層をまたぐテストが無い点）
- 好みの範囲: 1 件（コメント文言の些細な変更）
