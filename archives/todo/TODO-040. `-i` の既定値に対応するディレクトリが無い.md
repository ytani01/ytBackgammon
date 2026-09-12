# TODO-040. `-i` の既定値に対応するディレクトリが無い

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |
| 実施 | Opus 5 / effort high | main + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 6,176 | 54,392 | 83% |
| verifier | Sonnet 5 | medium | 3,453 | 37,998 | 17% |
| 合計 |  |  | 9,629 | 92,390 | 概算 $1.2 |

- main のモデルは利用者が Opus 5 のまま着手したので、見込みの Sonnet 5 とは違う
- 集計の範囲に TODO-037 の implementer（並行して走らせていた）が混じるので、
  その行は除いて割合を出し直した。main の分には TODO-037 の依頼を書いた分も
  含まれるため、実際より多めに出ている

## きっかけ

`__main__.py` の `--image_dir` の既定値が `images1` だったが、
`src/ytbg/webroot/static/` にあるのは `images0a` `images1a` `images2` `images3`
の 4 つで、`images1` は無い。`-i` を付けずに起動すると画像が全部 404 になる。

## やったこと

`src/ytbg/__main__.py` の既定値を `images1a` に直した（1 行）。
`images1` に一番近い名前で、README や `ytbg.sh` の例でも使っている。

## 確かめたこと

確認は verifier に分けた（報告は
[archives/agents/TODO-040/verifier-report.md](../agents/TODO-040/verifier-report.md)）。

- `uv run pytest`（231 passed）/ `uv run ruff check .` / `uv run mypy src` /
  `uv run basedpyright` / `node --test tests/js/`（59 tests）がすべて終了コード 0
- **`-i` なしで実際に起動して確かめた。** 空きポートで `uv run ytbg -p 49727 verify1`
  を立て、`/` の応答に `data-image-dir="images1a"` が入ること、
  `/static/images1a/board-base.png` が 200 で返ることを curl で確認した。
  `YTBG_DATA_DIR` を一時ディレクトリへ逃がし、`setsid` で起動して
  プロセスグループごと落としている
- `git diff` が `__main__.py` の 1 行だけであることを確認

## 分担の振り返り

- verifier は、読むだけでは分からない「既定値で起動すると本当に画像が返るか」を
  実際にサーバを立てて確かめた。ここが分けた意味のあった部分で、
  main が自分で見ていたら diff を読んで終わりにしていた可能性が高い
- 見込み（main + verifier）と食い違いは無い。1 行の変更なので implementer は
  立てず、main が直して verifier に渡す形で足りた
- 次に同じ規模（1 行、挙動が変わる）の項目をやるなら、同じ組み方でよい。
  ただし**他の項目と並行して走らせない**こと。トークンの集計が担当ごとに
  切れなくなり、この項目でも implementer の行を手で除く羽目になった
