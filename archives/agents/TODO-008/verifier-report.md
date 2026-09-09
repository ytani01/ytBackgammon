# TODO-008 verifier 報告

## 変更内容の確認

`git status` / `git diff HEAD`:

- 削除: `src/ytbg/webroot/static/menu.css`
- 削除: `src/ytbg/webroot/templates/top.html`
- 変更: `src/ytbg/yt_backgammon_server.py`（`app_top()` メソッドを削除、7 行減）

指示（`TODO.md` の TODO-008 節）どおり、`app_top()` と `top.html` の削除、
`menu.css` の削除の 3 点のみ。指示に無いファイルの変更は無し。

## 1. 消し残しが無いか — ○

`grep -rn "app_top\|top\.html\|menu\.css"` を `src`、`*.html`
（`ytbg.html` 含む）、`README.md`、`docs/` に対して実行（`archives/` と
`TODO.md` は対象外）。**ヒット無し。**

`render_template` の import（`src/ytbg/yt_backgammon_server.py:16`）は
残っており、`app_index()`（430 行目）が使い続けている。○

なお、`src/ytbg/__main__.py` の `/` のルート関数名が `top()` のままだが、
中身は `svr.app_index()` を呼んでおり `app_top` とは無関係（削除前から
この名前だったと見られる）。指示の対象外なので直さないが、参考として記録。

## 2. 検証コマンド — ○（増えていない）

- `uv run pytest` → **10 passed**（変更前と同数）
- `uv run ruff check .` → **Found 19 errors**（変更前と同数）
- `uv run mypy src` → **Found 7 errors in 1 file**（変更前と同数）

いずれも `app_top` / `top.html` に起因する指摘は含まれていない。

## 3. 実際に動くか — ○

`./ytbg.sh -d -p 5099 -i images1a 99` を `run_in_background` で起動し、
ログをファイルへ落として確認。

- `GET /` → 200、本文に `ytbg.js` の読み込みと `<title>ytBackgammon</title>`
  を含む `index.html` が返っている（`top.html` ではない）
- `GET /p1` → 200、同上
- `GET /p2` → 200、同上
- `GET /static/menu.css` → **404**（想定どおり。他のページから参照されて
  いないため問題無し）
- ログに `TemplateNotFound` などの例外は無し。`app_top` の呼び出しも
  発生していない（`app_index()` のログのみ）

ログ抜粋:

```
09/10 03:03:12 🐞 DEBUG __main__.py:54 top()>
09/10 03:03:12 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:03:12] "GET / HTTP/1.1" 200 10852 0.011654
09/10 03:03:12 🐞 DEBUG __main__.py:60 index_p1()>
09/10 03:03:12 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:03:12] "GET /p1 HTTP/1.1" 200 10852 0.001084
09/10 03:03:12 🐞 DEBUG __main__.py:66 index_p2()>
09/10 03:03:12 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:03:12] "GET /p2 HTTP/1.1" 200 10852 0.000935
127.0.0.1 - - [2026-09-10 03:03:12] "GET /static/menu.css HTTP/1.1" 404 331 0.001878
```

作業後、PID を確認してから kill（`pgrep -af ytbg` → 該当 PID 2 個を
`kill`）、`~/ytbg-99.json` を `\rm` で削除済み。他サーバ（5001〜5004）は
無関係のため触っていない。

## 確かめられなかったこと・判断が要る点

- 特に無し。指示された確認項目はすべて実施し、いずれも問題無し。
- 参考情報として、`__main__.py` の `/` のルート関数名が `top()` のまま
  残っている点を記録した（TODO-008 の指示対象外なので、直すかどうかは
  管理者の判断）。

---

## 追記: 再確認（`top()` → `index_top()` へのリネーム）

`git diff HEAD -- src/ytbg/__main__.py`:

```diff
 @app.route('/')
-def top():
+def index_top():
     _log.debug('')
     return svr.app_index()
```

`index_p1` / `index_p2` と揃える 1 行だけの変更。他のファイルの差分は
前回から増えていない（`git status` で確認済み）。

### エンドポイント名を文字列で参照している箇所 — ○ 無し

`grep -rn "url_for"` を `src/ytbg`、`src/ytbg/webroot`、`ytbg.html` に
対して実行 → **ヒット無し**。`grep -rn "\"top\"\|'top'"` でも
**ヒット無し**。Flask の `url_for('top')` のような、変更前のエンドポイント
名 `top` を文字列で参照している箇所は無い。

### 検証コマンド — ○（前回と同数）

- `uv run pytest` → **10 passed**
- `uv run ruff check .` → **Found 19 errors**
- `uv run mypy src` → **Found 7 errors in 1 file**（`__main__.py` の
  行番号は変わらず。関数名変更によるエラーの増減も無し）

### 実サーバでの確認 — ○

`./ytbg.sh -d -p 5099 -i images1a 99` を再度起動して確認。

```
09/10 03:06:45 🐞 DEBUG __main__.py:54 index_top()>
09/10 03:06:45 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:06:45] "GET / HTTP/1.1" 200 10852 0.012284
09/10 03:06:45 🐞 DEBUG __main__.py:60 index_p1()>
09/10 03:06:45 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:06:45] "GET /p1 HTTP/1.1" 200 10852 0.001399
09/10 03:06:45 🐞 DEBUG __main__.py:66 index_p2()>
09/10 03:06:45 🐞 DEBUG yt_backgammon_server.py:429 app_index()>
127.0.0.1 - - [2026-09-10 03:06:45] "GET /p2 HTTP/1.1" 200 10852 0.000982
```

ログに `index_top()` という関数名が出ており、リネームが反映されている
ことも確認できた。`/`、`/p1`、`/p2` いずれも 200、本文は `ytbg.js` の
読み込みと `<title>ytBackgammon</title>` を含む `index.html`。例外ログ無し。

作業後、PID を確認してから `kill`（`pkill` は不使用）、
`~/ytbg-99.json` を `\rm` で削除済み。

### 確かめられなかったこと・判断が要る点

特に無し。追加の変更は指示どおりで、問題は見つからなかった。
