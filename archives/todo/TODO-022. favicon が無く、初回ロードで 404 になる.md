# TODO-022. favicon が無く、初回ロードで 404 になる

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |
| 実施 | Opus 5 / effort high | main + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 14,877 | 95,099 | 94% |
| verifier | Sonnet 5 | medium | 3,121 | 35,166 | 6% |
| 合計 |  |  | 17,998 | 130,265 | 概算 $2.9 |

- main は見込みでは Sonnet 5 だったが、利用者が Opus 5 のまま着手した
- verifier は定義のモデルが sonnet。上書きしていない。effort は定義の
  frontmatter どおり `medium`

## きっかけ

TODO-021 でブラウザの確認を作ったときに実測した。初回ロードで
`/favicon.ico` が 404 になる。

```
INFO: 127.0.0.1:35490 - "GET /favicon.ico HTTP/1.1" 404 Not Found
```

`static/` に favicon が無く、`__main__.py` のルーティングにも
`/favicon.ico` が無い。ブラウザは初回ロードのときだけ取りに行くので、
リロードでは出ない。

実害はコンソールにエラーが 1 件出ることだけだが、
`tests/browser/helper.mjs` の `console_errors()` がこれを既知として
除外していた。**除外があると、同じ経路の本当のエラーを見落としやすい。**

### 決めたこと

- **汎用の 1 枚を `static/favicon.png` に置き、`index.html` に
  `<link rel="icon">` を書く。** 画像ディレクトリ（`-i`）では変えない
- **絵柄は、チェッカー・ダイス・ボードの三角形を組み合わせて独自に作る。**
  既存の画像を縮めるのではなく、小さいサイズでも分かる形にする

## やったこと

- `src/ytbg/webroot/static/favicon.png` を新しく作った（64x64 の PNG）。
  緑の盤にポイントの三角形を 2 つ（明るいのを上から、暗いのを下から）、
  左下に白のチェッカー、右上にダイス、右下に赤のチェッカーを小さく置いた。
  512px で描いて 64px へ縮め、輪郭を滑らかにしてある。色は
  `images1a/` の `board-base.png`（緑）・`checker0.png`（白）・
  `checker1.png`（赤）から取った
- `templates/index.html` の `<head>` に
  `<link rel="icon" type="image/png" href="/static/favicon.png">` を足した。
  `<link>` があるとブラウザは `/favicon.ico` を取りに行かないので、
  Starlette 側にルートを足す必要は無かった
- `tests/browser/helper.mjs` の `console_errors()` から、`/favicon.ico` を
  除外していた `if` と、その説明の段落を消した。残る除外はサーバ以外から
  取るもの（font awesome の CDN）だけになった
- `CLAUDE.md` の「初回ロードで `/favicon.ico` が 404 になる」の記述を、
  今の状態に書き直した

画像の生成には Pillow を使ったが、**スクリプトはリポジトリに残していない**。
`images1a/` などと違い、画像ディレクトリごとに差し替えるものではないため。

## 確かめたこと

verifier が確かめた（報告は
[`archives/agents/TODO-022/verifier-report.md`](../agents/TODO-022/verifier-report.md)）。

- `uv run pytest -q`（105 passed）、`uv run ruff check .`、
  `uv run mypy src`、`node --test tests/browser/`（5 tests / 5 pass）が
  いずれも終了コード 0
- **実際にサーバを起動して、アクセスログを全文見た。**
  `tests/browser/helper.mjs` の `start_server()` と同じ要領で空きポートと
  一時ディレクトリを用意し、playwright の chromium の新しいページで開いた。
  `/static/favicon.png` が 200 で取られており、`/favicon.ico` への
  リクエストは 1 件も出ていない
- 除外を外した `console_errors()` のまま、ブラウザテストがエラー 0 件で通った

## 分担の振り返り

- **verifier が見つけたのは「問題が無いこと」だけ**だが、確かめ方の水準は
  上がった。main は `<link>` を足せば `/favicon.ico` は要求されない、と
  理屈で済ませるところだった。verifier が実プロセスを起こしてログを
  全文見たので、「ブラウザが要求しなくなった」ことを実測で言える
- **見込みと食い違ったのは main のモデルだけ**（Sonnet 5 の見込みで
  Opus 5 で実施）。料金の 94% が main で、そのうちの大半は `cache_read`。
  画像を作って目で見る往復が main に集中したため
- **次に同じ規模（画像 1 枚 + タグ 1 行）をやるなら、同じ組み方でよい。**
  ただし main を Opus で回すと割に合わない。画像の出来を見るのに
  何往復かするので、**着手前に `/model` で下げておく**のが効く。
  実装の担当を分けるのは逆に高くつく（画像を見せ合う往復が増える）
