# TODO-079 verifier report

## 検証の一式（それぞれ 1 回）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 392 passed, 1 warning（警告は starlette の `anyio.abc.BlockingPortal` の非推奨警告。今回の変更と無関係） |
| `node --test tests/js/` | 154 tests, pass 154, fail 0 |
| `node --test tests/browser/` | 108 tests, pass 108, fail 0 |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |

全項目、終了コードは 0（失敗なし）。

## `images0a` / `images1a` の残存確認

`.git`, `archives/`, `node_modules`, `.venv` を除いて grep した結果、
残っているのは `TODO.md` の 2 箇所だけ（指示どおり許容範囲）。

```
TODO.md:31:- [ ] `git mv` で `images0a/` → `images0/`、`images1a/` → `images1/`
TODO.md:37:`src/ytbg/webroot/static/` にあるデザインは `images0a` / `images1a` /
```

## `git status` / 変更ファイルの確認

- ステージ済み: `images0a/*` → `images0/*`、`images1a/*` → `images1/*` の
  `git mv`（rename としてすべて認識されている。中身の diff は無い）
- 未ステージ（`modified`）:
  `CLAUDE.md`, `README.md`, `docs/Admin.md`, `src/ytbg/__main__.py`,
  `src/ytbg/webroot/static/js/dom.js`, `src/ytbg/webroot/static/js/settings.js`,
  `src/ytbg/webroot/templates/lobby.html`,
  `tests/browser/board.test.mjs`, `tests/browser/helper.mjs`, `tests/browser/lobby.test.mjs`,
  `tests/test_cli.py`, `tests/test_lobby.py`, `tests/test_paths.py`, `tests/test_ws.py`,
  `ytbg.toml`

指示にあったファイル一覧（`__main__.py`, `lobby.html`, `settings.js`, `dom.js`,
`ytbg.toml`, `tests/*.py`, `tests/browser/*.mjs`, `README.md`, `Admin.md`, `CLAUDE.md`）
と一致している。指示に無いファイルの変更は見当たらない。

各ファイルの中身の diff（`images0a`/`images1a` → `images0`/`images1` の
機械的な置換になっているか）までは 1 行ずつ突き合わせていないが、
grep での残存確認（上記）と、テスト・型チェックが全部通っていることから、
参照漏れは無いと判断した。

## 実際に起動しての画像確認

`YTBG_DIR` を一時ディレクトリに設定し、`pgrep` で PID を確認してから
`kill`（`pkill` は不使用）で終了させた。

### `uv run ytbg board -d -p <空きポート> -i images1 1`

```
GET /                              -> 200 (3053 bytes)
GET /static/images1/board-base.png -> 200 (968642 bytes)
GET /static/images1/bg.png         -> 200 (33913 bytes)
```

起動ログにも `image_dir=images1` が出ており、`images1a` の参照は無い。
終了後、子プロセスは残っていないことを `pgrep -fl "ytbg board"` で確認した。

### `uv run ytbg lobby -c ytbg.toml`

`ytbg.toml` の設定どおり、`images2`（server 1）、`images0`（server 2）、
`images1`（server 3）、`images3`（server 4）の 4 台を起動するログを確認。
lobby は既定ポート 5000 で起動した。

```
GET /                        -> 200 (1676 bytes)
GET /static/images1/bg.png   -> 200 (33913 bytes)
```

終了は `kill -TERM -<PGID>` でプロセスグループごと送り、`pgrep -fl ytbg` で
子プロセス（lobby 本体・board ×4）が全部消えたことを確認した。

## 判断できなかったこと・懸念

- `images2` / `images3` は `ytbg.toml` に既にあった設定で、今回の TODO-079 の
  対象（`images0a`/`images1a`）ではない。存在や中身は確認していない
  （TODO-079 のスコープ外と判断）。
- 各変更ファイルの diff を 1 行ずつ「機械的な置換のみか」までは目視で
  全部は追っていない。grep の残存確認とテスト全通過で代替した。厳密な
  文字単位の突き合わせが必要なら追加で行う。
- starlette の `BlockingPortal` の非推奨警告は既存のもので、本件の変更とは
  無関係と判断した（コード側の変更点に該当箇所が無いため）。
