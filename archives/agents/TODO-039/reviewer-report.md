# TODO-039 レビュー報告（reviewer）

対象: 未コミットの `git diff`（`src/`, `tests/`, `CLAUDE.md`, `docs/Developer.md`）

要修正 1 件 / 検討 4 件 / 好みの範囲 3 件。

---

## 要修正

### 1. `src/ytbg/webroot/static/js/ui/base.js:34` — 消えたクラスへの参照が残っている

```
 * CookieBase, QueryStringBase .. cookie / querystring       settings.js
```

`QueryStringBase` はこの差分で削除されたのに、クラス階層図がそのまま。

根拠: `grep -rn QueryStringBase src tests` の結果、実体はどこにも無く、
残っているのはこの行と `sound.js:8` のコメント（こちらは「QueryString の
sound=」という説明で、クラス名ではないので実害なし）だけ。
`CLAUDE.md` は「クラス階層図は `ui/base.js` の先頭にある」と名指ししている
場所なので、ここがずれると次に読む人が探しに行く。

---

## 検討

### 2. `src/ytbg/webroot/static/js/settings.js:10-13` — `?sound=` の扱いが変わる（音が鳴る側に変わる）

旧 `QueryStringBase.get("sound")` を再現して新旧を突き合わせた（node 26 で
実測。主要なケースは chromium /usr/bin/chromium でも同じ値になることを確認済み）。
「鳴り方」は `sound.js:37` の `GlobalSoundSwitch === undefined` のときだけ鳴る、
という判定に照らしたもの。

| `location.search` | 旧 | 新 | 鳴り方 |
|---|---|---|---|
| （無し） | `undefined` | `undefined` | 同じ（鳴る） |
| `?sound` | `undefined` | `undefined` | 同じ（鳴る） |
| **`?sound=`** | **`""`** | **`undefined`** | **変わる（旧: 鳴らない → 新: 鳴る）** |
| `?sound=off` | `"off"` | `"off"` | 同じ（鳴らない） |
| `?sound=off&x=1` / `?x=1&sound=off` | `"off"` | `"off"` | 同じ |
| `?&sound=off` | `"off"` | `"off"` | 同じ |
| `?SOUND=off` | `undefined` | `undefined` | 同じ（鳴る） |
| `?sound=%E3%81%82` | `"あ"` | `"あ"` | 同じ |
| `?sound=a+b` | `"a+b"` | `"a b"` | 値は違うが同じ（鳴らない） |
| `?sound=a=b` | `"a"` | `"a=b"` | 値は違うが同じ（鳴らない） |
| `?sound=off&sound=on` | `"on"`（最後） | `"off"`（最初） | 値は違うが同じ（鳴らない） |
| **`?sound=&sound=on`** | **`"on"`** | **`undefined`** | **変わる（旧: 鳴らない → 新: 鳴る）** |
| `?sound=on&sound=` | `""` | `"on"` | 値は違うが同じ（鳴らない） |
| `?sound=%` / `?sound=%E0%A4%A` | **URIError を投げる** | `"%"` / `"�%A"` | 旧は例外で `window.onload` が
途中で止まる。新は止まらない（改善） |

- 鳴り方が変わるのは **`sound` の値が空文字になる書き方**（`?sound=`、
  および重複指定で空文字を採る場合）だけ。ほかの食い違いは値の文字列が
  変わるだけで、`undefined` かどうかは変わらないので音には出ない。
- TODO-039 は「今の扱いを保つ」と書いているが、`URLSearchParams` は
  `?sound` と `?sound=` を区別できない（どちらも `""`）ので、
  今の書き方では両方まとめて「鳴る側」になる。厳密に保つなら
  `location.search` を生で見る（例: `/[?&]sound=/.test(location.search)`）
  必要があり、標準機能に寄せる目的と相反する。
- 実運用への影響は無い見込み。`ytbg.html` が組み立てる URL は
  `?sound=off` と `?board=N&sound=off` の 2 種類だけで、どちらも新旧同値
  （`ytbg.html:16,95,108,121,134` を確認）。
- **判断**: 項目の但し書き「`?sound=何か` のときだけ止める」の解釈として
  `?sound=` を「何か」に含めるかどうか。含めないなら今のままでよいが、
  その場合は settings.js のコメント（「今までどおり…を保つ」）が
  `?sound=` については正しくないので、そこも直したい。

### 3. `docs/Developer.md:193` — index.html にヘッダが付くことが反映されていない

```
キャッシュ避けはサーバ側で、`/static` は `Cache-Control: no-cache` で返す。
```

`CLAUDE.md` 側（`index.html` 自身にも `index()` が同じヘッダを付ける）は
更新されたが、`docs/Developer.md` は `/static` だけのまま。表の
`settings.js` の行は直っているので、直し漏れに見える。

### 4. `?sound` の扱いを守るテストが無い

- `grep -rn "sound=" tests` は 0 件。`tests/js/` は `rules/` 限定
  （`CLAUDE.md`）なので置き場所は `tests/browser/`。
- 実装担当は playwright で手で確かめたが、スクリプトは残していない
  （報告に明記あり）。音の鳴り方を決める分岐なのに、次に触ったときに
  落ちるものが何も無い。`CLAUDE.md` の「テストが通ることだけを見ない／
  わざと壊して落ちることを確かめる」に照らすと、
  `?sound=off` で `GlobalSoundSwitch` が `"off"` になり、クエリ無しで
  `undefined` になる、を見る 1 本があってよい。
- なお `ws_url()` は browser test が実際に WebSocket をつないでいるので
  間接的に守られている。`get_dst_points()` は `rules.test.mjs:137` が通る。

### 5. `ytbg.html:6-8` に同じ `<meta http-equiv>` 3 行が残っている

項目は「`index.html` の 3 行」としか書いていないので範囲外の判断は妥当。
ただし `ytbg.html` はサーバを経由しない静的ページなので、消しても
`Cache-Control` ヘッダで置き換えられない（置き換え先が無い）。
このまま残すか、別項目にするかは管理者の判断。

---

## 好みの範囲

### 6. `src/ytbg/app.py:70-79` — `headers=` で 1 行にできる

`Jinja2Templates.TemplateResponse` の signature に `headers` がある
（starlette 1.6.0 で実測）ので、
`templates.TemplateResponse(request, 'index.html', {...},
headers={'Cache-Control': 'no-cache'})` と書けば変数に受けずに済む。
一方、今の「作ってから `response.headers[...]` に代入する」形は
`NoCacheStaticFiles.file_response()`（`app.py:41-44`）と同じ書き方なので、
リポジトリの作りとは揃っている。どちらでもよい。

### 7. `src/ytbg/webroot/static/js/settings.js:30` — コメントアウトされた `log()` が残る

`log` の import は消えたので、この行を復活させると ReferenceError になる。
`CookieBase.load()` の `// log(...)` のこと。

### 8. `settings.js:12` — `return v ? v : undefined;` は `return v || undefined;` で足りる

`v` は `string|null` なので挙動は同じ。

---

## 確認して問題が無かったもの

### `ws_url()`（`ws.js:14-18`）— 旧実装と同値

新旧を突き合わせた（node で全ケース、うち 4 ケースは chromium でも実測）。

| ページの URL | 旧 | 新 |
|---|---|---|
| `http://localhost:5001/p1` | `ws://localhost:5001/ws` | 同じ |
| `http://localhost:5001/p2?sound=off` | `ws://localhost:5001/ws` | 同じ（クエリは付かない） |
| `https://ex.com/p1` | `wss://ex.com/ws` | 同じ |
| `https://ex.com:8443/p2` | `wss://ex.com:8443/ws` | 同じ |
| `http://ex.com:80/` / `https://ex.com:443/p1` | 既定ポートは省略 | 同じ |
| `https://ex.com:80/` | `wss://ex.com:80/ws` | 同じ（非既定ポートは残る） |
| `http://[::1]:5001/p1` | `ws://[::1]:5001/ws` | 同じ |
| `http://user:pw@ex.com:5001/p1` | `ws://ex.com:5001/ws` | `ws://user:pw@ex.com:5001/ws`（差あり） |

- `url.protocol = "ws:"` は通る。`ws` / `wss` は URL 標準の special scheme
  なので、`http` / `https` からの差し替えが許される（chromium で実測:
  `ws://localhost:5001/ws`、`wss://ex.com/ws`）。既定ポートの省略・復元も
  setter の中で正しく行われている。
- 食い違うのは URL に userinfo がある場合だけだが、ブラウザの
  `location.href` に userinfo は現れないので実害なし。

### `get_dst_points()` の `[...new Set(dst_p)]`（`board.js:719`）— 到達しうる入力では旧と同じ結果

- 1 周目のループに**離れた重複は出ない**。`RollButton.roll()`（`dice.js:457`）
  は、非ゾロ目なら 2 個、ゾロ目なら 4 個とも同値を置くので、
  `get_active_dice()` が返す並びは「高々 2 種類」か「全部同値」。
  つまり重複は常に隣り合い、旧ループと `Set` の結果が一致する。
- 例外は free move でダイスを個別にクリックして値を変えた場合
  （`dice.js:134-160`）。`[3,5,3,3]` のような並びが作れ、ここだけ
  旧 `[a,b,a]` / 新 `[a,b]` と差が出る。ただし呼び出し側は
  `length == 0`（`checker.js:162`、`dice.js:376`）、`[0]`（`checker.js:230`）、
  `indexOf`（`checker.js:238`）しか見ておらず、
  `Set` は挿入順（＝旧ループの最初の出現順）を保つので `available_p[0]` は
  変わらない。重複を消しても空にはならないので `length == 0` も変わらない。
- 末尾の「合わせ技」を push したあとに重複が残る点（ベアオフで複数の目が
  同じゴールに丸まる場合など）は**旧実装でも同じ**で、この差分で
  変わっていない。上と同じ理由で呼び出し側は困らない。

### そのほか

- `settings.js` から消した `log` の import は、他に使い所が無い
  （実行される `log()` 呼び出しはこのファイルに残っていない）。
- `ws.js` の `log` は他で使っているので import は必要。
- `QueryStringBase` の import 漏れ・参照漏れは `src` / `tests` に無い
  （残るのは上の 1 件のコメントだけ）。
- `CLAUDE.md` の `settings.js` の記述（`CookieBase`、`get_sound_query()`）は
  実装と一致。`index.html` の `Cache-Control` の追記も実装と一致。
- 指示に無い変更は混ざっていない。
- `tests/test_ws.py::test_index_no_cache` は通る（`uv run pytest
  tests/test_ws.py -k index` → 3 passed）。

---

## レビュー中に作業ツリーが変わった（要対応）

レビューの途中（報告を書き終えた時点）で、`src/` の変更が作業ツリーから
消えていた。私は `git checkout` / `git stash` を実行していない。

```
$ git status --short
 M CLAUDE.md
 M docs/Developer.md
 M tests/test_ws.py
?? __sound_check_tmp.mjs
?? archives/agents/TODO-039/

$ git stash list
stash@{0}: WIP on starlette: 23973f1 ...

$ git stash show --stat stash@{0}
 src/ytbg/app.py                        |  4 ++-
 src/ytbg/webroot/static/js/board.js    | 15 +++--------
 src/ytbg/webroot/static/js/main.js     |  5 ++--
 src/ytbg/webroot/static/js/settings.js | 47 ++++++++--------------------------
 src/ytbg/webroot/static/js/ws.js       | 11 +++-----
 src/ytbg/webroot/templates/index.html  |  3 ---
```

- **TODO-039 の実装は `stash@{0}` にある**（戻すのは管理者の判断。
  同時に走っている担当がいるなら、その担当が pop するはず）。
- `tests/test_ws.py` の新しいテストだけが作業ツリーに残っているので、
  **この状態で `uv run pytest` を走らせると `test_index_no_cache` が落ちる**
  （`app.py` のヘッダ追加が消えているため）。
- リポジトリ直下に `__sound_check_tmp.mjs`（605 bytes、未追跡）がある。
  実装担当の報告には「実行後に削除済み」とあるので、
  **コミット前に消すか、消えていることを確かめること。**
- 上のレビューは、stash される前の作業ツリー（`git diff` の内容 =
  この stash と同じ差分）を読んで書いたもので、内容は有効。
