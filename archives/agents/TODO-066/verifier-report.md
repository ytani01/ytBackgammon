# TODO-066 verifier 報告

## 検証したこと

### 1. チェックリストのファイルがすべて消えているか

`git status --short` で確認。チェックリストに挙げられたものはすべて `D `
（削除が staged）として出ている。

- `_config.yml`, `bg.png`, `bg0.png`, `cloth_00043.png`, `twinkle_00028.png` — OK
- `docs/ytBackgammon2.png`, `docs/ytBackgammon3.png`, `docs/ytBackgammon-a.png`,
  `docs/ytbackgammon1-1.png`〜`1-3.png` — OK
- `docs/images0/` 以下 44 ファイル全部 — OK
- `docs/_config.yml` — OK
- `src/ytbg/webroot/static/sounds/{backgammon-src.mp3,computerbeep_12.mp3,
  computerbeep_43.mp3,computerbeep_58.mp3}` — OK
- `src/ytbg/webroot/static/images2/dice1a.png` — OK

`git status --short` に出たのはこの 62 件と `.gitignore` の変更のみ。
リストに無いファイルが消えていることは無い。

直下の `__pycache__/`（git 管理外）は `find . -maxdepth 1 -name "__pycache__"`
で該当無し。既に消えている（`src/ytbg/__pycache__/` と `tests/__pycache__/`
は別物で、`.gitignore` により無視されたまま残っている。これは削除対象では
ないので問題無い）。

`docs/images0.zip`（README がリンクしている方）は残っている
（`ls -la docs/images0.zip` で 297K を確認、`README.md:140` からリンクあり）。

### 2. 消したファイル名（basename）への参照が archives/ 以外に残っていないか

`git grep -F -l "<basename>"` を全消去対象ファイルについて実行し、
`archives/` を除外して確認した。

- ほとんどのファイル名は `TODO.md`（TODO-066 の記述自体）以外に参照無し。
- `bg.png` は `index.html` / `lobby.html` / `test_lobby.py` / `test_ws.py` に
  出るが、いずれも `static/images1a/bg.png` 等、**別ディレクトリに実在する
  同名の別ファイル**への参照であり、削除した直下の `bg.png` ではない
  （`find` で `src/ytbg/webroot/static/{images2,images0a,images3,images1a}/bg.png`
  の実在を確認済み）。
- `board-base.png` / `button-bak.png` / `button-fwd.png` / `button-inverse.png`
  も同様に、`dom.js` / `board.test.mjs` / `test_ws.py` が参照しているのは
  `static/images*/` 以下に実在する別ファイルで、削除した
  `docs/images0/board-base.png` 等ではない。
- `docs/images0.zip` 自身（zip アーカイブの中身）にもこれらのファイル名が
  含まれるが、これは意図して残したアーカイブなので問題無い。

参照漏れは見つからなかった。

### 3. テストと lint

いずれも 1 回ずつ実行し、全部通った。

- `uv run pytest` — `358 passed, 1 warning in 7.73s`
- `uv run ruff check .` — `All checks passed!`
- `node --test tests/js/` — `tests 156 / pass 156 / fail 0`
- `node --test tests/browser/` — `tests 105 / pass 105 / fail 0`

`uv run mypy src` と `uv run basedpyright` は依頼の完了条件に無いので走らせて
いない（必要なら追加で走らせる）。

### 4. `.gitignore` 整理後の `git status --ignored`

`.venv`、`node_modules`、`__pycache__`（`src/ytbg/__pycache__/` と
`tests/__pycache__/`）、`.pytest_cache`、`.mypy_cache`、`.codegraph` は
すべて `!!`（ignored）として出ている。`.ruff_cache` と `.claude/` も
ignore されている（これは `.gitignore` の別の既存行によるもので、
今回の整理では触っていない）。

テストを 1 通り走らせたあとの `git status --short` に `??`（未追跡）の
出力は無い。テストで生じた不要なファイルが追跡漏れで出てくることは無い。

消した行（Django・Flask・Scrapy 等のテンプレート由来）の中身を
`.gitignore` の diff で確認した。`*.log`、`.env`、`venv/`、`db.sqlite3`、
`instance/`、`.scrapy`、`docs/_build/`、`target/`、`.ipynb_checkpoints`、
`*.egg`、`.tox/`、`.hypothesis/` などが消えている。リポジトリ内を
`find` で探したが、これらに該当する実在ファイル・ディレクトリは
`.codegraph/daemon.log` の 1 件のみで、これは親の `.codegraph/`
自体が別行で ignore されているため実害は無い。他に必要だった行は
見当たらなかった。

## 判断できなかったこと・確認できなかったこと

- `uv run mypy src` / `uv run basedpyright` は依頼の完了条件に無いため
  実行していない。他の TODO 項目でこれらの指摘が 0 件と書かれているので、
  今回の削除だけで新たに指摘が出るとは考えにくいが、実際には確認していない。
- `.ruff_cache` と `.claude/` を無視している行が今回の整理前から
  存在していたか、それとも元々の長い `.gitignore` の別の行で無視されて
  いたかまでは diff から遡っていない（今回の変更対象ではないため）。
