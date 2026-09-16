# TODO-077 verifier 報告

## 検証の一式（それぞれ 1 回）

すべて exit=0、全件成功。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 387 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 154 pass / 0 fail |
| `node --test tests/browser/` | 108 pass / 0 fail |

## 変更されたファイル

指示の「変更したファイル」一覧と一致（過不足無し）。

```
 CLAUDE.md                    |  2 +-
 docs/Admin.md                | 24 ++++++++++++----
 src/ytbg/__main__.py         | 31 +++++++++++++++++++--
 src/ytbg/app.py              | 19 +++++++++++--
 src/ytbg/paths.py            |  4 +--
 tests/browser/board.test.mjs | 54 ++++++++++++++++++++++++++++++++++--
 tests/test_cli.py            | 65 ++++++++++++++++++++++++++++++++++++++++++++
```

## 仕様との突き合わせ

- `resolve_image_dir()`（`src/ytbg/__main__.py`）: `/` を含むか `~` で
  始まれば `Path(...).expanduser()` をパスとして使う。そうでなければ
  まず `WEBROOT / 'static' / image_dir` が同梱にあるか見て、あればその
  名前 (`str`) をそのまま返す。無ければ `images_base / image_dir`
  （`images_base` は呼び出し側で `paths.images`、`paths.resolve()` が
  `--dir` > `YTBG_DIR` > `~/.ytbg` の順で決める）。どちらの経路でも
  最後に `path.is_dir()` を確かめ、無ければ `ClickException`。仕様どおり
- `create_app()`（`src/ytbg/app.py`）: `image_dir` が `Path` のときだけ
  `/static/images` を `Mount` で足し、`image_dir` を `'images'` に
  詰め替える。`Mount('/static/images', ...)` を **`/static` の `Mount` より
  前**（`*image_routes,` を `/static` の直前）に置いている。Starlette の
  `Mount` はリストの先頭から順にマッチするので、この並びで外の
  ディレクトリが優先される。実プロセスの確認でも動作を確かめた（後述）

## わざと壊す確認（4 通り、すべて元に戻した）

いずれも `tests/test_cli.py` または `tests/browser/board.test.mjs` の
TODO-077 のテストが落ちることを確認した。壊した後は都度
`\cp`（バックアップ）で元に戻し、`git diff` が壊す前の状態と一致することを
確認済み。

1. **`app.py` の `*image_routes,` を消す**
   `test_image_dir_served_as_static_images` が落ちた。
   ```
   >       assert (res.status_code, res.content) == (200, b'png')
   E       AssertionError: assert (404, b'Not Found') == (200, b'png')
   ```

2. **`app.py` の `image_dir = 'images'` の行を消す**
   `tests/test_cli.py` は通ってしまった（`data-image-dir` の値をページ内
   要素までは見ないため）が、`node --test tests/browser/board.test.mjs`
   の TODO-077 のテストが落ちた（img の `src` が
   `/static//tmp/ytbg-images-.../board-base.png` のような二重スラッシュ
   になり、全画像が 404）。
   ```
   +   { url: '.../static//tmp/ytbg-images-wBoEwM/board-base.png',
   +     text: 'Failed to load resource: the server responded with a
              status of 404 (Not Found)' },
   ... (15 件)
   -   []
   ```
   → **`tests/test_cli.py` 単体ではこの壊し方を検知できない。**
   ブラウザテストまで含めた一式で検知できている（指示どおり両方
   走らせているので実害は無いが、pytest だけでは見逃す点として記録）

3. **`resolve_image_dir()` の同梱を見る分岐を `elif True:` にする**
   `test_image_dir_name_under_base` と `test_image_dir_not_found[mydeck]`
   が落ちた。
   ```
   E       AssertionError: assert 0 != 0
   E        +  where 0 = <Result okay>.exit_code
   ```
   （同梱に無いはずの名前でも常に「同梱にある」ことにされ、エラーに
   ならなかった）

4. **`resolve_image_dir()` の `if not path.is_dir()` のエラーを消す**
   `test_image_dir_not_found` の両方（`mydeck` と `/nonexistent/mydeck`）が
   落ちた。
   ```
   E       assert 'mydeck' in ''
   E        +  where '' = <Result RuntimeError("Directory
              '/nonexistent/mydeck' does not exist")>.output
   ```
   click の `ClickException` では止まらなくなり、代わりに Starlette の
   `Mount` が `RuntimeError` を投げて非 0 終了にはなったが、メッセージに
   `mydeck` を含まないため assert が落ちた（＝エラーにはなるが、
   指示どおりの分かりやすいエラーメッセージでは止まらない、という
   狙いどおりの壊れ方）

落ちなかった壊し方は無し（4 通りとも検知した）。

## 実プロセスでの確認

一時ディレクトリに `src/ytbg/webroot/static/images1a` を 2 通りコピーし、
`YTBG_DIR=<一時>` で起動して確認。**すべてサーバは停止済み**
（`kill` 後に `pgrep -af "ytbg board"` で残っていないことを確認）。

1. `-i <一時>/copied_images1a`（パス）で起動
   - `curl http://127.0.0.1:<port>/` → `data-image-dir="images"`
   - `curl -o /dev/null -w '%{http_code}' .../static/images/board-base.png`
     → `200`
2. `<一時>/images/mydeck/` へコピーし `-i mydeck`（名前、同梱には無い）で起動
   - 同じく `data-image-dir="images"`、`board-base.png` が `200`
3. 存在しない名前 `-i nosuchdeck` で起動
   - サーバは起動せず、`Error: nosuchdeck: no such image directory`、
     `exit=1`

いずれも仕様どおり。

## docs/Admin.md の記述

実装と食い違いは見当たらなかった。「名前だけ→同梱→`<基準>/images/<名前>`」
「パス→そのディレクトリ」「どちらも無ければエラー」の説明は
`resolve_image_dir()` の分岐と一致している。`uv tool install --reinstall .`
が要らないという記述も、パス渡しなら妥当（同梱を経由しないため）。

## 確かめられなかったこと・判断が要る点

- 壊し方 2（`image_dir = 'images'` を消す）は、指示された検証の一式のうち
  **`uv run pytest`（`tests/test_cli.py`）だけでは検知できない**。
  `node --test tests/browser/` まで走らせて初めて検知できた。指示の
  一式には両方入っているので実害は無いが、`tests/test_cli.py` 単体の
  カバレッジとして弱い点として記録しておく。直すかどうかは管理者の
  判断
- 壊し方 4 でエラーメッセージの経路が `ClickException` から
  `RuntimeError`（Starlette 側）に変わった点は、テストとしては
  「落ちる」ことを確認できているので問題無いと判断したが、
  「その壊し方が意図どおりに検知される」以上の意味付け（メッセージの
  質など）までは見ていない

## 追加の修正（レビュー指摘への対応）の確認

対象差分: `src/ytbg/__main__.py`（`''`・`'.'`・`'..'` を弾くガード）、
`tests/test_cli.py`（parametrize の追加、`data-image-dir` の確認追加）、
`src/ytbg/app.py`・`docs/Admin.md`（コメント・説明のみ、挙動変更なし）。

### 検証の一式（それぞれ 1 回）

すべて exit=0、全件成功。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 390 passed（前回 387 から `''`・`.`・`..` の 3 件増） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/browser/board.test.mjs` | 11 pass / 0 fail |

### 仕様との突き合わせ

- `resolve_image_dir()` に `elif image_dir in ('', '.', '..')` を、
  `'/' in image_dir` の分岐と `WEBROOT / 'static' / image_dir` を見る
  分岐の**間**に追加。名前として同梱ディレクトリを見る前に弾いているので、
  指摘どおり `Path('.../static') / '..'` が webroot 自身になって
  `is_dir()` が真になる問題を防いでいる
- `tests/test_cli.py`: `test_image_dir_not_found` の `parametrize` に
  `''`・`'.'`・`'..'` を追加。`test_image_dir_served_as_static_images` に
  `page = client.get('/').text` と `assert 'data-image-dir="images"' in page`
  を追加。ページの中の `image_dir` の値まで見るようになった
- `app.py` と `docs/Admin.md` は挙動を変えるコードの差分は無く、
  コメント・説明の追加のみ。読んだ範囲で挙動とコードの不一致は無い

### わざと壊す確認（2 通り、終了後に元へ戻し、`git diff --stat` で
壊す前の状態と一致することを確認、`uv run pytest` が 390 passed に
戻ることも確認済み）

1. **`resolve_image_dir()` の `elif image_dir in ('', '.', '..')` の行を消す**
   → 新しい `parametrize` の 3 件（`''`・`'.'`・`'..'`）が落ちた。
   ```
   E       AssertionError:
   E       assert 0 != 0
   E        +  where 0 = <Result okay>.exit_code
   ```
   （`test_image_dir_not_found[]` / `[.]` / `[..]` の 3 件が FAILED、
   既存の `mydeck` / `/nonexistent/mydeck` の 2 件は passed のまま）

2. **`app.py` の `image_dir = 'images'` を消す**
   → 狙いどおり、今度は **`uv run pytest`（`tests/test_cli.py`）だけで
   落ちた**。
   ```
   >       assert 'data-image-dir="images"' in page
   E       assert 'data-image-dir="images"' in '<!DOCTYPE HTML>\n...'
   ```
   前回報告した「`tests/test_cli.py` 単体では検知できない」というギャップは、
   この追加修正で解消されている

落ちなかった壊し方は無し（2 通りとも検知した）。

### docs/Admin.md の追記の確認

- 「相対パスはプロセスの作業ディレクトリからの相対で、lobby から
  起動したボードでは lobby の作業ディレクトリが引き継がれる」
  → `src/ytbg/lobby.py` の `asyncio.create_subprocess_exec(*cmd)` は
  `cwd` を指定していないので、既定で親（lobby）の作業ディレクトリを
  引き継ぐ。記述は妥当
- 「`images` は `-i` のパス指定で使う名前なので、同梱のデザイン名には
  使えない」という記述は、**コードを読んだ限りでは実際の制約として
  確認できなかった**（下記「判断が要る点」に記載）

### 確かめられなかったこと・判断が要る点

- docs/Admin.md に追記された「`images` は同梱のデザイン名に使えない」は、
  実装を読んだ限りでは根拠を見つけられなかった。`resolve_image_dir()` で
  `-i images`（名前）を渡した場合、`WEBROOT / 'static' / 'images'` が
  あればそのまま文字列 `'images'` を返し、`create_app()` では
  `image_dir` が `str` のままなので `image_routes` の `Mount` は追加されず、
  同梱の `/static` マウントの中の `static/images/` がこれまで通り
  使われるだけに見える。外部パス指定時の `/static/images` マウントと
  衝突するのは、**同時に外部パスの `-i` を指定しつつ同梱に `images`
  という名前のディレクトリもある場合**だが、`-i` は 1 回に 1 つの値
  しか渡せないため、その状況自体が起こり得ないのではないか、と読める。
  実際に試すには同梱の `static/` に `images` という名前のディレクトリを
  一時的に作って確かめる必要があり、今回は行っていない。**この記述が
  正確かどうかは判断できない**ので、管理者の確認を求める
