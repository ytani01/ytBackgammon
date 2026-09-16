# TODO-079. 画像ディレクトリの名前から `a` を外す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier（実装は main） |
| 実施 | Opus 5 / effort high | verifier（実装は main） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 2,960 | 47,604 | 68% |
| verifier | Sonnet 5 | medium | 5,726 | 46,287 | 32% |
| 合計 |  |  | 8,686 | 93,891 | 概算 $1.0 |

- verifier は `~/.claude/agents/verifier.md` の定義のまま（`model: sonnet`、
  `effort: medium`）。上書きしていない

## きっかけ

`src/ytbg/webroot/static/` にあるデザインは `images0a` / `images1a` /
`images2` / `images3` の 4 つで、`a` が付いているのは最初の 2 つだけだった。
名前の付け方を揃える。

`images2` / `images3` は変えない。旧名からのシンボリックリンクも残さない
（`~/.ytbg/` がまだ無く、古い設定ファイルが存在しないため）。

## やったこと

- `git mv` で `images0a/` → `images0/`、`images1a/` → `images1/`
- 参照していた 15 ファイルの `images0a` / `images1a` を置換

| ファイル | 中身 |
|---|---|
| `src/ytbg/__main__.py` | `DEFAULT_IMAGE_DIR` |
| `src/ytbg/webroot/templates/lobby.html` | 背景画像の URL |
| `src/ytbg/webroot/static/js/settings.js`、`js/dom.js` | JSDoc の例 |
| `ytbg.toml` | `image_dir` 2 箇所 |
| `tests/test_ws.py`、`test_lobby.py`、`test_cli.py`、`test_paths.py` | 17 箇所 |
| `tests/browser/helper.mjs`、`board.test.mjs`、`lobby.test.mjs` | 4 箇所 |
| `README.md`、`docs/Admin.md`、`CLAUDE.md` | 起動例、デザインの一覧、元ファイルの例 |

## 確かめたこと

verifier の報告は `archives/agents/TODO-079/verifier-report.md`。

- `uv run pytest`（392 passed）、`node --test tests/js/`（154）、
  `node --test tests/browser/`（108）、`uv run ruff check .`、
  `uv run mypy src`、`uv run basedpyright` がすべて成功
- `images0a` / `images1a` の残りは `TODO.md` の説明の 2 箇所だけ
  （その節も今回 archives へ移した）
- 実際に `uv run ytbg board -d -i images1` と `uv run ytbg lobby -c ytbg.toml` を
  起動し、ページと `/static/images1/board-base.png`、`/static/images1/bg.png` が
  200 で返ることを確認。`YTBG_DIR` は一時ディレクトリへ逃がし、終了は
  PID を確かめてから `kill`

## 分担の振り返り

- **verifier が見つけたこと**: 指摘は無し。検証一式と、テストでは分からない
  「画像が実際に出るか」（HTTP で 200 が返るか）を確かめた。ここが main では
  省きがちな部分で、分けた意味があったのはこの 1 点
- **見込みとの差**: 無し。挙動が変わらない機械的な置換なのでレビューは置かず、
  実装は main、確認だけ verifier という見込みどおりに進んだ。料金も $1.0 で
  収まった
- **次に同じ規模なら**: 同じ組み方でよい。置換だけの項目で implementer まで
  分けると、依頼文を書く分だけ高くつく。確認は分けたまま残す
