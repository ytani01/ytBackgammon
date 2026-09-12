# TODO-039 実装報告（implementer）

## 変更したファイル

- `src/ytbg/webroot/static/js/settings.js`
  - `QueryStringBase` / `CookieBase` のうち `QueryStringBase` を削除し、
    `get_sound_query()` に置き換えた（`log` の import も不要になったので削除）。
    `URLSearchParams.get()` が値の無い `?sound` に空文字を返す点を吸収し、
    空文字は `undefined` として返すことで、今までの「値が無ければ無視して鳴らす」
    挙動を保っている。
- `src/ytbg/webroot/static/js/board.js:4`
  - import を `QueryStringBase` → `get_sound_query` に変更。
  - `apply_sound_switch()`（旧 369-370 行付近）で
    `new QueryStringBase().get("sound")` を `get_sound_query()` に置き換え。
  - `get_dst_points()` の「重複削除」の手書きループ（旧 718-727 行）を
    `dst_p = [...new Set(dst_p)];` に置き換え。合わせ技（2 個・3 個・4 個の
    ダイスの目を足した行き先）を push する前の時点での重複削除なので、
    位置・挙動の範囲は指示どおり「今の重複削除の位置」のまま。
- `src/ytbg/webroot/static/js/main.js`
  - import を `QueryStringBase` → `get_sound_query` に変更。
  - `window.onload` 内の `QueryStringBase` 経由の読み取りを
    `get_sound_query()` の呼び出しに置き換え。
- `src/ytbg/webroot/static/js/ws.js:14-18`
  - `ws_url()` を `new URL("/ws", location.href)` を組み立てて
    `protocol` を `ws:`/`wss:` に差し替える形に置き換え。`document.domain`
    （非推奨）を使わなくなった。
- `src/ytbg/webroot/templates/index.html:5-8`
  - `<meta http-equiv="Pragma">` / `Cache-Control` / `Expires` の 3 行を削除。
- `src/ytbg/app.py`
  - `index()` のレスポンスに `Cache-Control: no-cache` ヘッダを追加
    （`TemplateResponse` を変数に受けてヘッダを足してから return）。
- `tests/test_ws.py`
  - `test_index_no_cache` を追加。`client.get('/')` の応答ヘッダに
    `Cache-Control: no-cache` が付くことを確認。

## 検証

- `uv run pytest` — 227 passed
- `uv run ruff check .` — All checks passed!
- `uv run mypy src` — Success: no issues found in 12 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- `node --test tests/js/` — 57 passed
- `node --test tests/browser/` — 44 passed（1 回のみ）
- **`?sound` の手動確認**（playwright で実ブラウザを開き、console.log の
  `GlobalSoundSwitch=...` を確認。スクリプトは実行後に削除済み・保存していない）
  - `/`（クエリ無し）→ `GlobalSoundSwitch=undefined`（鳴る側）
  - `/?sound`（値無し）→ `GlobalSoundSwitch=undefined`（鳴る側、今までの挙動を保持）
  - `/?sound=off` → `GlobalSoundSwitch=off`（鳴らない側）

## 判断・懸念

- `get_dst_points()` の Set 化は、依頼どおり元の「重複削除」ループの位置に
  そのまま入れた。関数の末尾では合わせ技の行き先を push した後に重複削除を
  していない点は元のコードのままで、依頼の範囲外として触っていない
  （ブラウザテストの `rules.test.mjs` は通っている）。
- 範囲外だが気づいたこと: 特になし。
