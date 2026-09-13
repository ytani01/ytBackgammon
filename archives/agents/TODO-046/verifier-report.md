# TODO-046 確認報告

対象: 作業ツリーの `git diff`（`board.js` / `layout.js`）。
コードは変更していない（一時的に壊した箇所は元に戻した）。

## 1. 変更範囲

`git status --short` の結果:

```
 M src/ytbg/webroot/static/js/board.js
 M src/ytbg/webroot/static/js/layout.js
?? archives/agents/TODO-046/
```

指示どおり `board.js` / `layout.js` ＋ `archives/agents/TODO-046/` のみ。
範囲外の変更なし。

## 2. 検証（各 1 回）

- `node --test tests/browser/` → `tests 56 / pass 56 / fail 0`（終了コード 0）
- `node --test tests/js/` → `tests 99 / pass 99 / fail 0`（終了コード 0）

いずれも全件成功。

## 3. 配置を HEAD と突き合わせ（本題）

手順:

1. `git worktree add /tmp/claude-649/todo046-head HEAD` で移す前の版を用意し、
   `uv sync` で `.venv` を作成。`node_modules` は作業ツリーからシンボリック
   リンクして playwright を共有した（テスト実行のみに使用、書き込みなし）
2. 使い捨てスクリプト `/tmp/claude-649/scratch/capture.mjs` を書き、
   `tests/browser/helper.mjs` の `start_server()` / `launch_browser()` /
   `open_board()` を使って、両方のツリーでサーバを起動しページを開き、
   以下を JSON に書き出した
   - `board.point[p]` の `x, y, w, h, direction, max_n, cx, y0`（28 個）
   - `board.score[p]` / `board.score_btn[p].up,.down` / `board.player_name[p]` /
     `board.player_clock[p]` / `board.pip[p]` の `x, y, w, h` と、
     対応する DOM 要素の `getBoundingClientRect()`
   - 全チェッカー（30 枚）の `x, y, z`
   - `document.body.style.width/height`
3. 作業ツリー（変更後）の結果を `work.json`、`HEAD`（変更前）の結果を
   `head.json` として保存し、再帰的なキー突き合わせで比較

**結果: 差分は 0 件（完全一致）。**

## 4. 比較スクリプトが差分を捕まえることの確認

作業ツリーの `layout.js` の `point_geometry()` で、ポイント 27 の
`direction` を `-1` から `1` に書き換えて再度キャプチャ（`broken.json`）し、
`head.json` と比較した。結果:

```
DIFF root.points[27].direction 1 != -1
DIFF root.points[27].y0 30 != 280
```

狙った箇所（`direction`）と、それに連動する `y0`（`BoardPoint` の
コンストラクタが `direction` から計算する値）の 2 か所が検出された。
比較の仕組みが実際に差を捕まえることを確認できた。直後に `layout.js` を
元に戻した。

## 5. 後始末

- `layout.js` を壊す前の内容に戻した後、`git diff --stat` は壊す前と
  同じ（`board.js` 154 行差分・`layout.js` 98 行差分、変更なし）ことを確認
- `git worktree remove /tmp/claude-649/todo046-head --force` で worktree を削除、
  `git worktree list` で作業ツリーのみになったことを確認
- 一時ファイル（`node_modules` シンボリックリンク、`capture.mjs`、
  JSON 3 つ）はすべて `/tmp/claude-649/` 配下のスクラッチに置き、
  リポジトリには残していない

## 確かめられなかったこと・判断が要る点

- レビュー報告にある「層をまたぐ座標のテストが無い」という検討事項は、
  TODO-046 の指示範囲外（テスト追加は指示に含まれない）と理解しており、
  本確認でも新規テストは追加していない。要否は管理者の判断
- レビュー報告にある「Pip count」コメントの文言変更は、目視で
  `git diff` を見て存在を確認したが、実害の有無の判断はレビュー報告と同じく
  「指摘のみ・要修正ではない」という評価に同意する（自分でも再確認した）
- ブラウザは 1 回のみ起動して比較した（`CLAUDE.md` の「通常は 1 回」の
  方針に沿った）。乱数やタイミングに依存する値は対象に含めていない
  （座標は固定値の計算なので、複数回の実行で揺れるとは考えにくいが、
  複数回試したわけではない）
