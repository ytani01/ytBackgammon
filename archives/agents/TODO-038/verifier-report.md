# TODO-038 verifier 報告

## 1. 検証コマンド（すべて終了コード 0）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 227 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 57 pass / 0 fail |
| `node --test tests/browser/` | 50 pass / 0 fail |

失敗なし。出力の引用は省略（全て成功のため）。

## 2. main.js のラッパー削除で押せなくなったものが無いか

`git show 3c4aac5:src/ytbg/webroot/static/js/main.js` と今の `main.js` を diff。

- 消えた 14 個のラッパー（`new_game` / `backward_hist` / `back2` /
  `back_all` / `forward_hist` / `fwd2` / `fwd_all` / `clear_hist` /
  `board_inverse` の 9 個、`apply_sound_switch` など board 委譲 5 個）は
  すべて末尾の登録表（`addEventListener`）に直書きの形で残っており、
  **登録している DOM の id は変更前後で完全に一致**（15 個: `menu-inverse`,
  `menu-back`, `menu-back2`, `menu-back-all`, `menu-fwd`, `menu-fwd2`,
  `menu-fwd-all`, `menu-clear-hist`, `menu-new-game`, `sound-switch`,
  `free-move`, `disp-pip`, `clock_sw`, `clock_limit0`, `clock_limit1`）。
- `index.html` にあるクリック可能な id（`nav` 系のドロワー開閉を除く）と
  `main.js` の登録表を突き合わせ、漏れなし。
- `tests/browser/clicks.test.mjs` は `page.getByText(text, {exact:true})`
  でメニュー項目を文字列で押しており、メニュー 9 項目（ボード回転・
  1つ戻す・連続で戻す・連続で戻す(高速)・1つ進める・連続で進める・
  連続で進める(高速)・履歴を削除・New Game）とヘッダ 6 項目
  （sound-switch, free-move, disp-pip, clock_sw, clock_limit0/1）を
  すべて押しており、テストで押していない登録表の項目は無かった
  （全件突き合わせ済み）。
- 上記はすべて `node --test tests/browser/` の 50 件成功に含まれる。

## 3. GameInfo の更新メソッドを dataclass 受け取りに変えた件（6 つ）

- `set_playername` / `set_score` / `set_turn` / `resign` は
  `tests/browser/clicks.test.mjs` が実クリックで送受信を確認済み
  （名前欄・スコアの▲・パスバナー・投了バナー）。
- `dice` は `tests/browser/board.test.mjs` の「Roll ボタンでダイスが出る」で
  実クリック→サーバ→ `board.gameinfo` 反映まで確認済み。
- `cube` は既存の browser テストに含まれていなかったため、追加で確認スクリプト
  （`page.evaluate(() => board.cube.double(board.player))`、実際の
  emit_msg → WebSocket → server → `GameInfo.cube(CubeData)` →
  broadcast の経路をそのまま通す）を書いて実行した。
  結果: `before: {side: -1, value: 1, accepted: true}` →
  `after: {side: 1, value: 2, accepted: false}` で、ダブルが正しく
  盤面（`board.gameinfo.board.cube`）に反映されることを確認した。
  （マウスの生ドラッグではなく `Cube.double()` を直接呼んでいるが、
  それ以降のサーバ往復・dataclass 経由の更新は実経路そのまま。
  ドラッグ自体の座標判定は今回の変更対象ではない）

## 4. backward_hist() / forward_hist() を 1 本にまとめた件

- `back_all` / `fwd_all` について、追加の確認スクリプトで実際に
  ブラウザから「連続で戻す(高速)」「連続で進める(高速)」を押し、
  `board.gameinfo.sn` が 4 → 1 → 4 と実際に動くことを確認した。
  スコアを3回上げて履歴を4件積み、back_all で sn=1（score も
  0 に戻る）、fwd_all で sn=4 に戻ることを確認。
- `back2` / `fwd2` は個別には実ブラウザ確認していないが、
  `_replay_hist(pop, n, sleep_sec)` は `n` の値が違うだけで
  `back_all`/`fwd_all`（`n=0`）と全く同じコードパスを通る
  （`server.py:202-236`）。サーバ側の `n` ごとの分岐は
  `tests/test_replay.py` で pytest がカバーしており、227 件全て通過。
  実装担当の「わざと壊して確かめた」報告（`forward_hist()` が
  `self._hist.back` を渡すよう壊すと pytest 9 件が落ちる）も併せて、
  コードパスの一致から back2/fwd2 も動くと判断した
  （個別の実ブラウザ確認はしていない。必要なら追加で行う）。

## 5. git status / git diff --stat の確認

変更ファイル:

```
M CLAUDE.md
M docs/Developer.md
M src/ytbg/gameinfo.py
M src/ytbg/server.py
M src/ytbg/webroot/static/js/board.js
M src/ytbg/webroot/static/js/main.js
M src/ytbg/webroot/static/js/ui/base.js
M src/ytbg/webroot/static/js/ui/clock.js
M tests/browser/clicks.test.mjs
M tests/test_gameinfo_ops.py
?? archives/agents/TODO-038/
```

- 実装担当の報告に挙がっているファイル（`main.js`, `server.py`,
  `gameinfo.py`, `tests/test_gameinfo_ops.py`, `ui/clock.js`, `board.js`,
  `ui/base.js`, `tests/browser/clicks.test.mjs`）とすべて一致。
- **`CLAUDE.md` と `docs/Developer.md` は報告に載っていないが、diff の
  中身を見る限り TODO-038 の変更内容（`gameinfo.py` が `message.py` に
  依存するようになったこと、`clear_hist()` が `menu_emit()` になった
  こと、`ClockLimit` が `BgText` を継承しなくなったこと）を正確に
  反映した記述の追記・修正で、範囲外の変更ではないと判断した。
  ただし報告に書かれていない点は指摘しておく。
- `main.js` から未使用の `const dice` を消したのは管理者作業と聞いている
  範囲内。diff でも該当 1 行のみ消えていることを確認した。

## 確かめられなかったこと・判断が要る点

- `back2` / `fwd2`（n=2 の場合）は実ブラウザでは個別に押していない。
  コードパスが `back_all`/`fwd_all` と共通であることから動くと
  判断したが、厳密に確認したい場合は追加のブラウザ確認が要る。
- Cube のドラッグそのもの（マウスの座標に応じた `on_mouse_up_xy` の
  分岐）は今回の変更対象ではないため、`Cube.double()` を直接呼ぶ形で
  確認した。ドラッグの座標判定込みで確認する必要があるかは判断できない
  （今回の diff では `cube.js` 自体は変更されていない）。
