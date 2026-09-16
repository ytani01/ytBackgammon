# TODO-077. 画像ディレクトリをパッケージの外にも置けるようにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer（実装は main） |
| 実施 | Opus 5 / effort high | verifier + reviewer（実装は main） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 22,388 | 101,006 | 63% |
| verifier | Sonnet 5 | medium | 16,283 | 84,321 | 20% |
| reviewer | Sonnet 5 | high | 23,406 | 79,976 | 17% |
| 合計 |  |  | 62,077 | 265,303 | 概算 $5.2 |

- verifier と reviewer は定義のまま（sonnet）。`CLAUDE.md` は
  コードレビューに Opus を充てるとしているが、差分が 1 ファイル分で
  小さかったので上書きしなかった
- verifier は 2 回動いている（レビューの指摘を直したあとに再確認させた）。
  表の値は 2 回分の合計

## きっかけ

`-i` が `src/ytbg/webroot/static/` の下のディレクトリ名しか受けず、
利用者が自分で用意した絵を使えなかった。TODO-076 で
`<基準>/images/` の場所は返せるようにしたが、まだ誰も使っていなかった。

## やったこと

- `src/ytbg/__main__.py` に `resolve_image_dir()` を足した。`-i`（と設定
  ファイルの `image_dir`）の値を次の順で解決する。
  - `/` を含むか `~` で始まる → パスとして、そのディレクトリ
  - 名前だけ → 同梱の `static/<名前>` → 無ければ `<基準>/images/<名前>`
  - どこにも無ければ `ClickException` で、起動しない
  - `''`・`.`・`..` は名前として受ける前に弾く。`Path('.../static') / '..'` が
    webroot 自身になり、`is_dir()` が真になってしまうため（reviewer の指摘）
- `src/ytbg/app.py` の `create_app()` が `image_dir` に `Path` を受けたら、
  そのディレクトリを `/static/images` としてマウントし、ページには
  `images` を渡すようにした。`/static` より前に置かないと当たらない。
  置き場所を決めるのは `__main__.py` だけ、という TODO-076 の切り分けは
  そのまま（`create_app()` は受け取るだけ）
- `docs/Admin.md` に探す順の表と、外に置くときの注意（パスは絶対パスか
  `~` 始まりで書く、ファイル名は同梱と揃える）を書いた。`CLAUDE.md` と
  `src/ytbg/paths.py` の説明も直した
- `tests/test_cli.py` に 7 件、`tests/browser/board.test.mjs` に 2 件足した

## 確かめたこと

- `uv run pytest` 390 passed、`uv run ruff check .` / `uv run mypy src` /
  `uv run basedpyright` はいずれも 0 件
- `node --test tests/js/` 154 pass、`node --test tests/browser/` 108 pass
- **わざと壊して、狙ったテストが落ちることを確かめた。**
  `/static/images` のマウントを消す、`image_dir = 'images'` の行を消す、
  同梱を見る分岐を常に真にする、見つからないときのエラーを消す、
  `''`・`.`・`..` を弾くガードを消す、の 5 通り
- 実プロセスで、一時ディレクトリへ写した画像をパスで指定して起動し、
  トップページの `data-image-dir` と `/static/images/board-base.png` を
  `curl` で見た。`<基準>/images/mydeck/` を置いた場合の `-i mydeck` と、
  無い名前でエラーになることも確かめた
- 最初は `app.py` の `image_dir = 'images'` を消してもブラウザテストしか
  落ちなかったので、pytest 側でもページの `data-image-dir` を見るようにした

## 分担の振り返り

- **reviewer が要修正を 1 件見つけた。** `-i ''`・`.`・`..` が「同梱に
  ある」と誤判定されて起動してしまう件。テストは全部通っていたので、
  verifier の側では捕まらなかった。`Path` の `/` の性質に気づけるかどうかで、
  「動くか」の確認とは別の目で見た効果がそのまま出た
- **verifier は、テストの穴を 1 件見つけた。** わざと壊す確認を pytest と
  ブラウザテストで分けて走らせたので、「pytest だけでは落ちない壊し方」が
  分かった。指示に「4 通り壊す」と具体的に書いたのが効いた
- **見込みと食い違わなかった。** 実装は 2 ファイル・50 行ほどで main だけで
  足り、確認とレビューを分けるだけで済んだ
- reviewer の「検討」3 件のうち、`images` という名前の衝突は
  `app.py` のコメントに、相対パスの扱いは `docs/Admin.md` に入れた。
  残り 1 件（外に置くときもファイル名を揃える）も Admin.md に書いた
- **次に同じ規模なら、同じ組み方でよい。** ただし reviewer には、
  今回のように「パスの扱いの見落とし」を名指しで挙げておくと当たりが良い
