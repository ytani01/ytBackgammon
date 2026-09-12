# TODO-039 確認報告（verifier）

## 1. 検証コマンド（すべて終了コード 0）

- `uv run pytest` — 227 passed
- `uv run ruff check .` — All checks passed!
- `uv run mypy src` — Success: no issues found in 12 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- `node --test tests/js/` — 57 passed
- `node --test tests/browser/` — 44 passed（1 回のみ）

いずれも落ちなかった。出力の引用は省略（全件成功のため）。

## 2. `?sound` の扱い（本題）

`sound.js` の `SoundBase.play()` は
`this.board.sound && GlobalSoundSwitch === undefined` で鳴らすかどうかを
決める。つまり `GlobalSoundSwitch` が `undefined` なら鳴る側、それ以外の
値（空文字を含む）なら鳴らない側になる。

実際にサーバを起動し（`YTBG_DATA_DIR` を一時ディレクトリへ、ポートは
OS に選ばせ、`setsid` で起動してプロセスグループごと kill）、playwright で
4 通りの URL を開いて `console.log` の `GlobalSoundSwitch=...` を見た。

**変更後（今の作業ツリー）:**

| URL | GlobalSoundSwitch | 鳴る/鳴らない |
|---|---|---|
| `/p1` | `undefined` | 鳴る |
| `/p1?sound` | `undefined` | 鳴る |
| `/p1?sound=off` | `off` | 鳴らない |
| `/p1?sound=` | `undefined` | **鳴る** |

**変更前**（`git stash push -- src/ytbg/webroot/static/js/settings.js
src/ytbg/webroot/static/js/main.js src/ytbg/webroot/static/js/board.js
src/ytbg/webroot/static/js/ws.js src/ytbg/webroot/templates/index.html
src/ytbg/app.py` で該当ファイルだけ戻し、サーバは起動したまま同じ
`__sound_check_tmp.mjs` で確認。終わったら `git stash pop` で必ず戻した）:

| URL | GlobalSoundSwitch | 鳴る/鳴らない |
|---|---|---|
| `/p1` | `undefined` | 鳴る |
| `/p1?sound` | `undefined` | 鳴る |
| `/p1?sound=off` | `off` | 鳴らない |
| `/p1?sound=` | `''`（空文字） | **鳴らない** |

**`/?sound=`（`=` はあるが値が空）だけ、変更前後で挙動が変わっている。**
変更前は `QueryStringBase.get()` が `''` を返し、`GlobalSoundSwitch = ''`
（`undefined` ではない）になるので鳴らない側。変更後は `get_sound_query()`
が `v ? v : undefined` で空文字を `undefined` に丸めてしまうため、
`GlobalSoundSwitch = undefined` になり鳴る側に変わる。

実装報告（`archives/agents/TODO-039/implementer-report.md`）が確認したのは
`/`・`/?sound`・`/?sound=off` の 3 通りで、`/?sound=` は試していない
（報告書にもその旨が書かれている）。今回のこの 1 点だけが、依頼で
「一致しなければ書け」と言われた不一致に該当する。

他の 3 通りは変更前後で一致していた。

## 3. WebSocket の接続・同期

`node --test tests/browser/` の `2 枚目のタブに同期する` が通っている
（`ws_url()` を変更した後の状態で実行）。加えて、サーバを実際に起動し
2 つの playwright ページ（`/p1`）を開いて Roll → 反映を確認する追加の
手作業は行っていない。**同じテストが `ws_url()` 変更後のコードに対して
1 回通ったことのみを確認しており、それ以上の独立した手作業の再現は
していない。** 必要であれば追加で行える。

## 4. `Cache-Control: no-cache`（`index.html`）

サーバを起動し（`YTBG_DATA_DIR` を一時ディレクトリへ、空きポート、
`setsid` 起動、`kill -TERM -<pgid>` でプロセスグループごと終了）、
`curl -sD - -o /dev/null http://127.0.0.1:<port>/` のヘッダを確認。

```
cache-control: no-cache
```

付いていることを確認した。

## 5. 変更ファイルの一致

`git status` / `git diff --stat`:

```
 CLAUDE.md                              |  9 ++++---
 docs/Developer.md                      |  2 +-
 src/ytbg/app.py                        |  4 ++-
 src/ytbg/webroot/static/js/board.js    | 15 +++--------
 src/ytbg/webroot/static/js/main.js     |  5 ++--
 src/ytbg/webroot/static/js/settings.js | 47 ++++++++--------------------------
 src/ytbg/webroot/static/js/ws.js       | 11 +++-----
 src/ytbg/webroot/templates/index.html  |  3 ---
 tests/test_ws.py                       | 12 +++++++++
 9 files changed, 40 insertions(+), 68 deletions(-)
```

実装担当の報告に書かれたファイル（`settings.js` / `board.js` / `main.js` /
`ws.js` / `index.html` / `app.py` / `tests/test_ws.py`）と一致する。
`CLAUDE.md` と `docs/Developer.md` は依頼どおり管理者（main）の変更で
範囲内。指示に無いファイルの変更は無い。

## 確かめられなかったこと・判断が要ること

- **`/?sound=` の挙動が変わったことは事実として確認したが、これが
  「直すべき不具合」かは判断できない。** `=` だけ付けて値を空にする
  URL を実際に使う場面があるかどうかは、利用者しか分からない。
  直すなら `get_sound_query()` を `v !== null ? v : undefined`
  （`URLSearchParams.get()` が無い場合に返す `null` だけを
  `undefined` に丸め、空文字はそのまま返す）にすれば、旧
  `QueryStringBase` と同じ「`''` は鳴らさない」に戻ると見立てられるが、
  これは推定であり実装・検証はしていない
- WebSocket の実際の手動確認（サーバを立てて 2 タブで Roll を押す）は
  `node --test tests/browser/` の再実行にとどめた。独立した手作業での
  再現までは行っていない
