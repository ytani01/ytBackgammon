# TODO-064 reviewer の報告

対象: 作業ツリーの未コミットの差分（`git diff` 19 ファイル）。コードは書き換えていない。

**要修正: 0 件。検討: 3 件。好みの範囲: 1 件。**

## 検討

### 1. `docs/Admin.md:59`・`src/ytbg/app.py:57` — 「空の段（`//`）は書けない」と書いてあるが、前後の `//` は通る

- 何が起きるか: `normalize_prefix()` は先に `strip('/')` するので、途中の `//` だけが誤りになる。
  実測で `'//'` → `''`（プレフィクス無し）、`'//foo//'` → `'/foo'`。
  `--prefix //` と書くとエラーにならず、黙ってプレフィクス無しで起動する
- 根拠: `uv run python -c` で `normalize_prefix()` に渡して確かめた。implementer の報告にも同じことが書いてある
- 直し方の案: 文書を実装に合わせる（「前後の `/` はいくつあっても取る。空の段が書けないのは途中だけ」）。
  前後も弾くなら `prefix.strip('/')` の前に `'//' in prefix` を見る。どちらでもよいが、今は文書と実装が食い違っている

### 2. `tests/test_lobby.py:193-200` — `lobby.html` の背景画像と favicon のプレフィクスを見るテストが無い

- 何が起きるか: `lobby.html:8`（favicon）と `lobby.html:10`（`url({{ prefix }}/static/images1a/bg.png)`）の
  `{{ prefix }}` を消しても、落ちるテストが無い（コードを読んで判断。壊して走らせてはいない = 未確認）
  - `test_lobby_prefix_routes` が見ているのは `lobby.js` の `src` だけ
  - `tests/browser/lobby.test.mjs` はコンソールエラーも読み込み先も集めていない（`browser.newPage()` のまま）
- ボード側は `test_ws.py` の `test_prefix_in_index` が `'"/static/' not in text` と `url(/foo/static/...)` で
  テンプレート全体を押さえているので、lobby だけ抜けている
- 直し方の案: `test_lobby_prefix_routes` に `test_prefix_in_index` と同じ 2 行
  （`'url(/lb/static/images1a/bg.png)' in page.text` と `'"/static/' not in page.text`）を足す

### 3. `src/ytbg/app.py:90-91`・`docs/Developer.md:123` — `/foo` → `/foo/` のリダイレクトは Mount ではなく外側の Router がしている

- 何が起きるか: 文書では「`Mount` がリダイレクトする」とあるが、実際は Starlette の `Router` の
  `redirect_slashes`（`.venv/.../starlette/routing.py:705-717`）が、`/foo/` にすると一致するルートを探して 307 を返している。
  外側の `Starlette(...)` の既定に頼っているので、将来 `redirect_slashes` を切ると `/foo` が 404 になる。
  読む人が Mount 側を探して迷う
- 根拠: 上の Starlette のソースと、実測（`/foo` → `307 Location: http://127.0.0.1:<port>/foo/`）
- 直し方の案: 「Starlette（Router の `redirect_slashes`）が `/foo/` へリダイレクトする」と書き直す。挙動の変更は要らない

## 好みの範囲

### 4. `tests/test_ws.py:231-232` — 節の区切りコメントの前の空行が 1 行

`tests/test_lobby.py:209-213` の `# --- 実プロセス ---` は前に 2 行空けている。揃えるなら 2 行。ruff は指摘しない。

## 見てほしい点について、確かめて問題が無かったこと

- **prefix の検査**: `[A-Za-z0-9._~-]` の fullmatch で、`\n`・全角・`%`・`"`・`<` は弾き、`...`・`..a` は通す（実測）。
  CLI（`__main__.py` の callback）と設定（`lobby.py` の `load_config()`）は同じ `normalize_prefix()` を通している。
  この文字だけならテンプレートの属性値・CSS のクォート無し `url()` を壊さない
- **ルート**: prefix 無しでは `with_prefix()` がルートの配列をそのまま返すので、今までと同じ。
  prefix 付きのボードを実プロセスで起動し、`/foo/p1`・`/foo/p2?sound=off`・`/foo`（リダイレクト経由）の
  どれから開いても gameinfo が届き、自サーバへの読み込みは全部 `/foo/` の下、コンソールエラー 0 件（playwright で実測）。
  `/foo/../p1` は 404
- **JS の相対 URL**: モジュールは全部 `static/js/` 直下（`ui/`・`rules/` の中からは使っていない）ので、
  `../../ws`・`../sounds/`・`../{dir}/`・`../../api/` はどのページの URL からでも同じ所へ行く。
  コメントも「なぜ相対にしたか」を書いている
- **Cookie の path**: `docs/Developer.md` の記述どおり、`/foo`・`/foo/`・`/foo/p1` のどれから開いても
  path は `/foo`（chromium で `context.cookies()` を読んで実測）
- **lobby**: 子プロセスへ `--prefix` を渡すのは `BoardProcess.start()` だけで、lobby 自身の `--prefix` は渡らない。
  `url` の `//`・`/\` を弾き、パスだけの値は `new URL(b.url, location.href)` で解決する。URL は DOM のプロパティ
  （`a.href`・`iframe.src`）で入れているので、`innerHTML` を通らない
- **`test_start_passes_prefix`**: `_watch.cancel()` を待たずに終わるが、`PytestUnraisableExceptionWarning` を
  エラーにして走らせても警告は出なかった
- **文書**: Admin.md の nginx の例は `proxy_pass` に URI を付けておらず、パスを外さない前提と合っている。
  Admin.md・Developer.md に TODO の番号は無い
- **過剰な実装**: 見当たらない。`with_prefix()` は board と lobby の 2 か所で使っている。`/\` の検査は 1 行で、理由のコメントがある
