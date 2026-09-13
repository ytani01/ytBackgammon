# TODO-051 verifier の報告

管理者の指示（TODO.md の TODO-051 節、docs/design.md の「メッセージ」全体と
「クライアント」の「送信は actions.js にまとめる」「表示の更新は何も送らない」
「先行実行」）と、実装者の報告（archives/agents/TODO-051/implementer-report.md）
を突き合わせた。コードは直していない。

## 1. チェックボックス・箇条書きの確認

すべて実装とテストがある。無いもの・違うものは見つからなかった。

- `actions.js` を作り、ゲームを進める処理と「押してよいか」の判定を `ui/` から
  移した（存在確認、`roll` / `end_turn` / `move` / `resign` / `double` 等を実装。
  `ui/checker.js` は `can_pick_checker()` / `drop_checker()` を呼ぶだけになっている）
- `emit_msg` を import しているのは `ws.js`（定義側）と `actions.js` の 2 ファイルだけ
  （`grep -rl emit_msg src/ytbg/webroot/static/js/` で確認）。`ui/`・`board.js`・
  `main.js` からの import は無い
- `src/ytbg/message.py` に `history` フィールドは無い（`grep history message.py` 該当なし）
- `Board.set_turn()`（board.js:444）は `emit_msg` を呼ばない。`emit` 引数も無い。
  `apply()`（board.js:694）のシグネチャに `predict` 引数は無い。`winner_is()`
  （board.js:601）は `this.resign` を読むだけで書き換えない
- `predict_gameinfo()`（board.js:901）で使った目・使えなくなった目を両方
  11〜16 にして `gameinfo` へ書き込んでいる（`disable_unusable()` 呼び出しも含む）
- `apply()` の音とダイス回転は `last_op`（引数）の `type` / `data` から決めている
  （roll / move / put_checker / opening / end_turn の分岐を確認）
- サーバ側: `cube` / `set_turn` / `set_player_clock` / `start_clock` /
  `set_gameinfo` の type は `MESSAGE_TYPES`（server.py:614〜）に無い。
  `parse()` は `msg['history']` を読まない。`Clock.stop_all()` /
  `Clock.set_clock()` は `clock.py` に無い（grep 該当なし）。
  `GameInfo.cube()` / `GameInfo.set_turn()` は `gameinfo.py` に無い。
  `CubeData` / `TurnData` / `GameInfoData` / `PlayerClockData` は
  `message.py` に無い（`class .*Data` の一覧で確認済み）
- `GameInfo.from_dict()` / `BoardState.from_dict()` / `CubeState.from_dict()` に
  `strict` 引数は無い（grep 該当なし）。`_get()` も無い
- `tests/`・`tests/browser/` は新しい type に合わせて書き直されている
  （下の検証で全件通過を確認）
- `CLAUDE.md` の「状態と通信」は `actions.js` からの送信と `history` の無い
  メッセージに合わせて書き直されている（目視で design.md の記述と整合）

## 2. 検証コマンド（1 回ずつ）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 287 passed, 1 warning（exit 0）。warning は starlette/anyio の DeprecationWarning で無関係 |
| `uv run ruff check .` | All checks passed（exit 0） |
| `uv run mypy src` | Success: no issues found in 12 source files（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | 99 pass, 0 fail（exit 0） |
| `node --test tests/browser/` | 78 pass, 0 fail（exit 0） |

いずれも実装者の報告の件数と一致する。

## 3. 指示に無い壊し方 3 通り（実装者の一覧と重複しないもの）

作業前に `board.js` / `actions.js` を `/tmp` へ控え、1 つずつ壊してテストを
走らせ、`\cp` で元に戻したあと `diff` で完全一致（exit 0）を確認した。
最終的に `git status` の変更ファイル数（33、実装者の作業開始時と同じ）も
崩れていないことを確認した。

| # | 壊し方 | 結果 |
|---|---|---|
| 1 | `board.js` の `apply()` で、ヒット音の判定 `last_op.data.moves.some((mv) => mv.p >= 26)` を `false` に固定（move のヒット音をバーへの移動で決めないようにする） | `node --test tests/browser/last_op.test.mjs` の「move で moves にバーへの移動がある → ヒットの音」が失敗（`sound_hit` を期待して `sound_put` が返る）。他は通過 |
| 2 | `predict_gameinfo()` の `disable_unusable(pos, player, dice);` 呼び出しをコメントアウト（予測で使えなくなったダイスを書き込まない） | `node --test tests/browser/predict.test.mjs` の「動かしたあとに使えなくなったダイスも 11〜16 にして送る」が失敗（`[15, 1, 0, 0]` を返し期待は `[15, 11, 0, 0]`）。他 7 件は通過 |
| 3 | `actions.js` の `end_turn()` で `emit_msg("end_turn", { player: parseInt(player) })` を `{ player: String(player) }` に変更（送る値を文字列にする） | `node --test tests/browser/clicks.test.mjs` の「パスのバナー」「スペースキー」の 2 件が失敗（`player: '0'` を送り、期待の `player: 0`（数値）と一致しない）。他は通過 |

3 通りとも、狙った箇所のテストだけが落ち、無関係なテストは通ったままだった。
`diff /tmp/board.js.orig src/ytbg/webroot/static/js/board.js` と
`diff /tmp/actions.js.orig src/ytbg/webroot/static/js/actions.js` は
いずれも復元後に差分なし（exit 0）。

## 4. `LOAD_ERRORS` の `TypeError`

`src/ytbg/storage.py` の `LOAD_ERRORS` に `TypeError` が入っていることを確認
（既存のテストには `"board": null` のケースは無いため、使い捨てスクリプトで
確かめた）。

scratchpad に `"h"` エントリの `"board": null` を含む `.jsonl` を作り、
`Storage(path).load()` を呼んだところ、例外にならず
`([], [], None)`（履歴 0 件・進む側 0 件・クロック None）が返った。
ログには `WARNING ... TypeError:'int' object is not iterable.` が出ており、
`_load_jsonl()` の `except LOAD_ERRORS` で拾われていることが分かる。
壊れたファイルとして扱われ、起動失敗にはならない。

## 5. 手元の保存ファイル

`~/ytbg-1.jsonl` `~/ytbg-2.jsonl` `~/ytbg-3.jsonl` `~/ytbg-4.jsonl`
`~/ytbg-test.jsonl` を `\cp` で scratchpad にコピーし、そのコピーに対して
`Storage.load()` を呼んだ。元ファイルは一切書き込んでいない
（コピー前後で `md5sum ~/ytbg-1.jsonl` `~/ytbg-3.jsonl` を確認、コピー操作は
読み取り専用の `cp` のみ）。

| ファイル | 結果 |
|---|---|
| ytbg-1.jsonl | OK, history=17, fwd=0, clock 読めた |
| ytbg-2.jsonl | OK, history=1, fwd=0, clock 読めた |
| ytbg-3.jsonl | OK, history=66, fwd=0, clock 読めた |
| ytbg-4.jsonl | OK, history=1, fwd=0, clock 読めた |
| ytbg-test.jsonl | OK, history=1, fwd=0, clock 読めた |

いずれも実装者の報告の件数（17 / 1 / 66 / 1 / 1）と一致する。

## 確かめられなかったこと・判断が要る点

- 実装者の報告にある「迷って決めたこと」6 項目（free move の ▲▼ で手元の値も
  変える、リダブルで 64 の上限を見ない、`opening.test.mjs` が `new` を使う、
  ブラウザテストの盤面の用意の作り方、`predict.test.mjs` の追加 2 件の作り方、
  `test_clock.py` の書き換え方）は、いずれも TODO-051 の指示や design.md に
  反しないと読めたが、**良し悪しの判断（レビュー）はしていない**。
  分岐の意味が変わったかどうかの評価は reviewer の担当と理解している
- 「範囲外で気づいたこと」に書かれている
  「free move で盤の外に離すと `KeyError` になる」「ダイスを使い切った画面で
  手番でないプレーヤーのダイスを押すと `end_turn` を送り捨てられる」の 2 点は、
  実際に手を動かして再現は確認していない（TODO-051 の指示範囲外と判断し、
  報告の記述をそのまま引用するに留めた）
- `docs/Developer.md` に古い説明が残っている点（TODO-055 送り）は
  TODO-051 の範囲外なので確認していない
