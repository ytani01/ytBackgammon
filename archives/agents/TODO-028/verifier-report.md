# TODO-028 確認担当の報告

対象は作業ツリー（`390e397` からの差分、未コミット）。実装は implementer/reviewer
報告のとおりに終わっている前提で、通ることとその意味だけを確かめた。

## 1. 通常の検証

| コマンド | 結果 | 終了コード |
|----------|------|-----------:|
| `uv run pytest` | 211 passed, 1 warning（starlette のものと同じ、無害） | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | no issues found in 12 source files | 0 |
| `node --test tests/browser/`（1 回目） | 30 pass / 0 fail | 0 |
| `node --test tests/browser/`（2 回目） | 30 pass / 0 fail | 0 |
| `node --test tests/browser/`（3 回目） | 30 pass / 0 fail | 0 |

3 回とも揺れなかった。

## 2. わざと壊して確かめた

`static/js/` を scratchpad に丸ごと控えてから 1 つずつ壊し、`diff -r` で
控えと一致することを確かめてから戻した。**終わったあと `diff -r` で
全ファイル一致、`grep -rn "removed for test" src tests` で 0 件**を確認済み。

| # | 壊し方 | `node --test tests/browser/` |
|---|--------|-------------------------------|
| 1 | `ui/button.js` の `export class EmitButton` から `export` を消す | 落ちる（終了コード 1。モジュールの読み込みが壊れ、`open_board()` の `waitForFunction` がタイムアウトして 3 件失敗） |
| 2 | `main.js` の `Object.assign(window, {` を `Object.assign({}, {` にする | 落ちる（終了コード 1。30 件中 21 件失敗。`board_inverse is not defined` などのコンソールエラーが実際に出た） |
| 3 | `board.js` の戻すボタンの data を `{n: 1}` から `{n: 2}` にする | 落ちる（終了コード 1。30 件中 2 件失敗。「盤面の戻すボタン → back {n: 1} を送る」が `actual: {n:2}` で失敗、スコアのテストは順番依存で連鎖して失敗） |
| 4 | `BannerButton.on_mouse_down_xy()` の `this.on_click(this)` を消す | 落ちる（終了コード 1。**10 回連続で実行し、10 回とも** 30 件中 4 件失敗。パスのバナー、スペースキー、投了・勝ちのバナーの計 4 件） |
| 5 | `board.js` の `on_pass` から `player_clock[player].change_turn()` を消す | 落ちる（終了コード 1。**10 回連続で実行し、10 回とも** 30 件中 2 件失敗。「パスのバナー → …change_turn() を呼び…」「スペースキー → …change_turn() を呼び…」の 2 件が確実に失敗し、揺れなし） |

5 つとも、狙ったところで落ちることを確認した。壊した版が残っていないことは
`git diff --stat` が壊す前と同一であることでも確かめた。

## 3. 実プロセスでのスクリーンショット比較

`git worktree add` で `390e397` を `scratchpad/ytbg-before` に出し、
同じ `images1a`、同じビューポート（1400×1000）、`fullPage: true` で
初期配置のままスクリーンショットを撮った（scratchpad の `shot.mjs`。
`start_server` は `tests/browser/helper.mjs` と同じ作り）。

- `before.png`（`390e397`）と `after.png`（今の作業ツリー）は
  **サイズが同じ（1400×1000、ともに 921KB）で、`md5sum` が完全一致**
  （`16ac550eebe31f75e2302356ca2106ab`）
- Python の `PIL.ImageChops.difference()` の `bbox` が `None`
  （差分ゼロ、ピクセル単位で完全一致）

要素の位置・大きさ・重なりだけでなく、ピクセル単位で分割前と変わっていない
ことを確認した。**worktree は作業後に `git worktree remove --force` で消した**
（`git worktree list` で本体の 1 件だけであることを確認済み）。

## 4. `/static` のキャッシュ

実プロセス（`uv run ytbg`、`YTBG_DATA_DIR` を一時ディレクトリへ）に対して
`curl` で確認した。

- `/static/js/main.js` の初回応答: `cache-control: no-cache`（`etag` も付く）
- `If-None-Match` にその `etag` を付けて再要求: `304 Not Modified`、
  `cache-control: no-cache` は 304 にも付く
- `/static/ytbg.css` も同様に、初回 `200`（no-cache）→ `If-None-Match` で
  `304`（no-cache 付き）

「キャッシュが効きつつ、毎回問い合わせが起きる」という狙いどおりの挙動を
実測で確認した。確認後、サーバは停止させ、一時データディレクトリも削除した。

## 5. 変更範囲

`git status` / `git diff --stat` は、確認作業の前後で完全に同一
（作業ツリーを壊しても必ず元に戻したことの裏付けにもなっている）。

- staged: `src/ytbg/webroot/static/ytbg.js` の削除
- 変更: `CLAUDE.md`、`src/ytbg/app.py`、`src/ytbg/clock.py`、
  `src/ytbg/server.py`、`src/ytbg/webroot/templates/index.html`、
  `tests/test_clock.py`、`tests/test_clock_unit.py`、
  `tests/test_save_load.py`、`tests/test_ws.py`
- 未追跡: `archives/agents/TODO-028/`、`src/ytbg/webroot/static/js/`、
  `tests/browser/clicks.test.mjs`

いずれも README・implementer-report・reviewer-report に書かれている範囲に
収まっている。`CLAUDE.md` の差分は、reviewer の R4（Python 側コメントの
`ytbg.js` 参照）・R5（`clicks.test.mjs` の説明不足）・実装担当が案として
出していた「構成」「書き方の慣習」の書き直しに対応する内容で、範囲外の
記述は見当たらなかった。

`archives/agents/TODO-029/` は未追跡のまま作業ツリーにあるが、指示のとおり
TODO-029 の準備であり、この項目の範囲外として扱った（コミットからは main が
外す前提）。

`git diff --stat -- TODO.md` は差分なし。`TODO.md` は変更されていない。

`grep -rn "壊した版" src tests` に相当する確認として、5 通りの壊し方で
使った文字列（`removed for test`、リテラルの `{n: 2}` の断片など）が
`src/` と `tests/` に残っていないことを、復元直後に毎回 `diff -r` と grep
で確かめた。

## 確かめられなかったこと・判断が要ること

- implementer-report / reviewer-report に書かれている「判断が要る点」
  （`CLAUDE.md` の直し方、`BoardArea` を消したこと、部品側の引数を
  options にしなかったこと、クリックでの確認を `tests/` に足すかどうか）
  は、すでに main が答えて `CLAUDE.md` の更新とテストの追加という形で
  反映されているように見えるが、**main が実際にどう判断したかの記録
  （README や TODO.md への追記）は見当たらなかった**。この点は
  確認担当の範囲を超えるので、main に確かめてもらう必要がある
- reviewer の R1・R2（`clicks.test.mjs` の assert が弱い点。バナーの
  「消える」判定が揺れる、`history` を比べていない）は、**この項目の
  指示にある確認対象（5 つの壊し方）には入っていない**ため、通ることと
  意味の確認はしたが、R1・R2 自体を直すべきかどうかの判断はしていない
- スクリーンショットの比較は初期配置の 1 画面だけ。チェッカーを動かした
  後の見た目や、2 枚目のタブでの同期の見た目までは比較していない
  （指示の「同じ盤面で」に沿って初期配置のみを見た）
