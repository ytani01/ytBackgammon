# TODO-022 verifier-report

## 走らせた検証

- `uv run pytest -q` → 終了コード 0（105 passed）
- `uv run ruff check .` → 終了コード 0（All checks passed!）
- `uv run mypy src` → 終了コード 0（Success: no issues found in 5 source files）
- `node --test tests/browser/`（timeout 600000 指定） → 終了コード 0
  （tests 5, pass 5, fail 0）

すべて通過。落ちた箇所は無い。

## 実サーバでの favicon 確認

`tests/browser/helper.mjs` の `start_server()` と同じ要領で、以下を自前スクリプトで再現した
（scratchpad に作成し、確認後に削除済み。リポジトリには残していない）。

- 空きポートを OS に選ばせ、`YTBG_DATA_DIR` を一時ディレクトリに設定
- `uv run ytbg -d -p <port> -i images1a verifytest` を `detached: true` で起動
- playwright の chromium（`executablePath: /usr/bin/chromium`）で新しい
  `browser.newPage()`（キャッシュを持たない新規プロファイル）を開き、
  `waitUntil: 'networkidle'` でロード
- 確認後、`process.kill(-child.pid, 'SIGTERM')`（応答なければ `SIGKILL`）で
  プロセスグループごと kill し、一時ディレクトリを `rm -rf` で削除

サーバのアクセスログ（`-d` 付きの uvicorn ログ）を全文確認した。抜粋:

```
INFO:     127.0.0.1:58794 - "GET / HTTP/1.1" 200 OK
INFO:     127.0.0.1:58772 - "GET /static/ytbg.js?ts=... HTTP/1.1" 200 OK
...(画像・CSS・sounds の各リクエスト、いずれも 200 か 206)...
INFO:     127.0.0.1:58794 - "GET /static/favicon.png HTTP/1.1" 200 OK
...
INFO:     Shutting down
```

- `/static/favicon.png` が 200 OK で取られていることを確認した。
- ログ全文を見た限り `/favicon.ico` へのリクエストは 1 件も出ていない
  （404 も出ていない）。favicon.ico をブラウザが要求すること自体が
  無くなっている。

後始末: 起動したサーバプロセスはプロセスグループごと kill 済み、一時データ
ディレクトリ（`/tmp/ytbg-favtest-*`）は削除済み。確認用に作った一時スクリプト
（`tests/browser/.tmp_verify/favicon_check.mjs`）もリポジトリから削除済み
（`git status` はクリーンな状態に戻っている、後述）。

## `console_errors()` から除外を外した状態でのブラウザテスト

上記 `node --test tests/browser/` の実行結果に含まれる
「コンソールエラーが出ていない」のテストが該当。除外を外した状態のまま
実行してエラー 0 件で通過している（favicon の 404 が実際に出ていないため）。

## 変更ファイルとその範囲

`git status --short`:

```
 M CLAUDE.md
 M src/ytbg/webroot/templates/index.html
 M tests/browser/helper.mjs
?? src/ytbg/webroot/static/favicon.png
```

指示にあった 4 箇所（favicon.png 追加、index.html の `<link>` 追加、
helper.mjs の除外削除、CLAUDE.md の記述更新）と一致しており、範囲外の
変更は無い。`git diff` の内容も確認した。

- `index.html`: `<link rel="icon" type="image/png" href="/static/favicon.png">`
  の 1 行追加のみ
- `helper.mjs`: `/favicon.ico` を除外していた docstring の段落とフィルタの
  `if` 節を削除しただけで、他のロジックは変わっていない
- `CLAUDE.md`: 該当の箇条書き 1 か所の書き換えのみ
- `favicon.png`: 64x64 の PNG（新規、バイナリのため diff 内容は確認していないが
  `file` コマンドで PNG 画像であることは確認した）

## 確かめられなかったこと・判断できないこと

- favicon.png の見た目（デザインとして適切か）は確認していない。画像の
  中身についての判断は求められていないため未確認。
- ブラウザのキャッシュ挙動（同一プロファイルを使い回した場合に
  favicon.ico を要求しないか）は確認していない。今回は指示どおり
  新規プロファイルでのみ確認した。
