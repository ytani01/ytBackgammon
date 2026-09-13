# TODO-051 implementer の報告

TODO.md の TODO-051 のチェックボックスと箇条書きの注意を、全部実装した。
実装しなかった項目は無い。コミットはしていない。

## 変えたファイルと要点

### サーバ（Python）

- `src/ytbg/message.py` — `CubeData` / `TurnData` / `GameInfoData` /
  `PlayerClockData` を消した（`PlayerClockData` も `set_player_clock` の
  ためだけにあった）。`Message` から `history` を消した。`PlayerData` の
  docstring から start を消した
- `src/ytbg/server.py`
  - `_on_set_gameinfo` / `_on_cube` / `_on_set_turn` / `_on_set_player_clock` /
    `_on_start_clock` と、`MESSAGE_TYPES` の同じ 5 行を消した
  - `NAMED_TYPES` を消した。`on_json()` は `if msg_type.history:`（server.py:584）
  - `parse()` は `msg['history']` を読まない（server.py:655 以降）
  - 保存についての docstring とコメントから `history: false` の話を消した
- `src/ytbg/gameinfo.py` — `_get()`、`GameInfo.cube()` / `set_turn()` を消した。
  `CubeState` / `BoardState` / `GameInfo` の `from_dict()`（gameinfo.py:70, 89, 324）
  から `strict` を消し、常に `data[key]`（欠落は `KeyError`）
- `src/ytbg/clock.py` — `Clock.stop_all()` / `set_clock()` を消した
- `src/ytbg/storage.py` — `GameInfo.from_dict(..., strict=True)` の引数を消した

### クライアント（JS）

- `src/ytbg/webroot/static/js/actions.js`（新規）— 下の一覧
- `ws.js:29` — `emit_msg(type, data)`。`{src, type, data}` を送る
- `main.js:3, 36, 53` — メニューは `history_op()`、名前は `set_playername()`
- `board.js`
  - `emit_msg` の import、`emit_turn()`、`emit_put_checker()` を消した
  - パスのバナー（board.js:235）は `end_turn` だけ送る
  - コンストラクタ（board.js:181）は `apply_clock_sw()` を呼ばず、チェックボックスを
    読むだけ（前も未接続なので送信は捨てられていた）
  - `apply_clock_sw()` / `apply_clock_limit()`（board.js:366, 374）は
    `stop_clock` を送らず、`actions.js` を呼ぶ
  - `set_turn(turn, resign, sound)`（board.js:444）— `emit` 引数と `stop_clock` の送信と
    `prev_turn` を消した
  - `winner_is()`（board.js:601）— `resign` を書き換えない
  - `apply()`（board.js:694）— `predict` を消した。`roll` で回す（board.js:813）、
    手番の音は `opening` / `end_turn`、`move` の音は turn を見ずに `moves` の
    バーへの移動でヒットを決める（board.js:850）。`put_checker` は今のまま
  - `predict_gameinfo(moves, player, used_dice)`（board.js:901）— player を渡すと
    そのプレーヤーのダイスを `gameinfo` から取り、使った目と使えなくなった目を
    11〜16 にする。`roll_btn` から写すのはやめた
- `ui/checker.js` — `dice_check()` / `decide_dst()` / `apply_move()` / `after_move()` を
  消し、`can_pick_checker()`（checker.js:53）と `drop_checker()`（checker.js:92）を呼ぶ
- `ui/dice.js` — `Dice.on_mouse_down_xy()` は `click_dice()`（dice.js:137）。
  `RollButton` の `check_disable()` / `roll()` / `emit_dice()` と `clear()` の送信を消し、
  `on_mouse_down_xy()` は `roll()`（dice.js:307）。2 秒後の自動クリックはそのまま
- `ui/cube.js` — `emit()` / `double()` / `accept_double()` / `cancel_double()` を消し、
  判定は `can_hold_cube()`（cube.js:116）、送信は `take` / `double` / `cancel_double`
  （cube.js:155〜179）
- `ui/clock.js` — `ClockLimit.emit_set()`、`PlayerClock` の `change_turn()` /
  `pause_resume()` / `emit*()` を消し、`toggle_clock()`（clock.js:186）
- `ui/button.js` — `ResignButton` は `resign()`、`EmitButton` は `history_op()`、
  `ScoreButton` は `score_up()` / `score_clear()`
- `ui/label.js` — `PlayerName.emit()`、`PlayerScore.up()` / `clear()` / `emit()` を消した

`emit_msg` を import しているのは `actions.js` だけ（grep で確認）。

### テスト

- Python: `test_on_json.py`（消えた type のテストを削除、`history` を見ないテストを追加）、
  `test_message.py`、`test_named_ops.py`、`test_clock.py`（`start_clock` を `_clock.start()`
  の直接呼び出しと `end_turn` に置き換え）、`test_clock_unit.py`、`test_gameinfo_ops.py`、
  `test_save_load.py`、`test_replay.py`、`test_ws.py`、`test_history.py`（docstring）。
  メッセージから `history` のキーを消した
- ブラウザ
  - `helper.mjs` — `send_msg()`（ページの中で `ws.js` を import して `emit_msg()`）と
    `set_turn()`（TODO.md の箇条書きの type で turn を変える）を足した
  - `predict.test.mjs` — 送った `move` 1 通の中身を見るよう書き直し、3 件足した
    （予測に失敗したら送らない / 使えなくなった目も 11〜16 / 勝ちの点数）
  - `clicks.test.mjs` — `history` の期待値を消し、`assert_only_sent()`（1 通だけか）を
    足した。パスは `end_turn {player: 0}`。キューブ（double）、Roll（roll）、
    クロック（stop / resume）、投了ボタン（resign）の 4 件を足した
  - `last_op.test.mjs`（新規）— 音とダイスの回転を `last_op` から決めているか
  - `opening.test.mjs` / `player_cookie.test.mjs` / `board.test.mjs` /
    `rules.test.mjs` — 新しい type と、`winner_is()` が `resign` を書き換えないことに合わせた
- `CLAUDE.md` — ブラウザのテストの一覧と盤面の用意、`gameinfo.py` の説明、
  `actions.js` と `ui/` の説明、「状態と通信」（送信・履歴・`last_op` の音・先行実行・
  `parse()`・ハンドラの数）、「クロック」を直した。`docs/Developer.md` は触っていない

## actions.js の関数

| 関数 | 送る type | 中身 |
|------|-----------|------|
| `disable_unusable(position, player, dice)` | — | 使えない目を 11〜16 にする（`predict_gameinfo()` も使う） |
| `roll(board, player)` | `roll` | キューブが受けられていなければ false。目を決め、使えない目を 11〜16 |
| `click_dice(board, player, i)` | `dice` / `opening` / `end_turn` | free move は目を 1 つ進める。turn ≥ 2 は目を比べて opening。それ以外はダイスが残っていなければ end_turn |
| `end_turn(board, player)` | `end_turn` | パスとダイスを使い切ったとき |
| `can_pick_checker(board, ch)` | — | 掴んでよいか（旧 `Checker.on_mouse_down_xy()` の判定） |
| `drop_checker(board, ch, drop_p)` | `put_checker` / `move` | free move は put_checker。それ以外は `decide_dst()` → `move()`。false なら何も送っていない |
| `put_checker(board, ch, p)` | `put_checker` | free move |
| `decide_dst(board, ch, drop_p, active_dice)` | — | 行き先とヒット（値を返すだけ） |
| `move(board, ch, dst_p, hit_ch, active_dice)` | `move` | 予測 → idx・dice・score を求めて 1 通 → `apply()`。予測に失敗したら false |
| `can_hold_cube(board)` | — | キューブに触れてよいか |
| `double(board, player, redouble=false)` | `double` | リダブルでなければ値が 64 以上で送らない |
| `take(board, player)` | `take` | |
| `cancel_double(board, player)` | `cancel_double` | player は掛けた側 |
| `resign(board)` | `resign` | 点数はキューブから求める |
| `score_up(board, player)` / `score_clear(board, player)` | `set_score` | |
| `set_playername(board, player, name)` | `set_playername` | |
| `toggle_clock(board, player)` | `stop_clock` / `resume_clock` | |
| `set_clock_switch(board, sw)` | `set_clock_switch` | |
| `set_clock_limit(board, index, limit)` | `set_clock_limit` | |
| `history_op(type, data)` | 履歴の操作 8 つ | メニューと盤面のボタン |

## テストで壊して確かめたこと

壊し方はスクリプトで 1 つずつ入れて対象のテストを走らせ、そのたびに元へ戻した。
最後に `src/` を作業前に控えた写しと `diff -r` で比べ、差が無いことを確かめた。

| # | 壊し方 | 落ちたテスト |
|---|--------|--------------|
| 0 | `move` の score を常に 0 | predict「勝ちになる move は…点数を載せる」 |
| 1 | 予測で使えなくなった目を 11〜16 にしない | predict「使えなくなったダイスも 11〜16」 |
| 2 | 予測で使った目を 11〜16 にしない | predict の 4 件（表示が変わる・ヒット・外れ・使えなくなった目） |
| 3 | 予測に失敗しても move を送る | predict「予測に失敗したら何も送らず」 |
| 4 | move の音で turn == -1 を見る | last_op「move → turn が -1 でも鳴らす」 |
| 5 | move のヒットの音を出さない | last_op「moves にバーへの移動 → ヒット」 |
| 6 | 手番の音を turn が変わったときだけ鳴らす | last_op「opening / end_turn → 変わっていなくても鳴る」2 件 |
| 7 | free move の dice の roll でも回す | last_op「free move の dice → 回さない」 |
| 8 | 投了で stop_clock も送る | clicks「投了ボタン → resign だけ」 |
| 9 | パスで stop_clock も送る | clicks「パスのバナー」「スペースキー」2 件 |
| 10 | Clock の切り替えで stop_clock も送る | clicks「ヘッダ Clock」（と続くクロックの 1 件） |
| 11 | `emit_msg` が history を送る | clicks の Ctrl-Z / Ctrl-Y / キューブ / Roll / クロック |
| 12 | resign の player を数に直さない | player_cookie |
| 13 | ダブルで掛ける側を取り違える | clicks「キューブを動かす」（と続く Roll） |
| 14 | `winner_is()` が resign を戻す | rules「winner_is() … resign は書き換えない」 |
| 15 | opening の勝者を取り違える | opening「2 秒後に先手が決まる」 |
| 16 | `on_json()` が表の history を見ない（常に積む） | test_clock の 4 件、test_named_ops の 2 件 |
| 17 | `parse()` が history を必須にする | test_message の `test_parse_does_not_need_history` ほか |
| 18 | `GameInfo.from_dict()` が turn の欠落を既定値にする | test_save_load `test_jsonl_missing_key_is_broken_file[turn]` |
| 19 | `BoardState.from_dict()` が cube の欠落を既定値にする | 同 `[cube]` |
| 20 | Roll が roll ではなく dice を送る | clicks「Roll ボタン」 |
| 21 | クロックを押しても resume_clock を送らない | clicks「クロックを押す」 |

## 検証の結果

最終の状態で 1 回ずつ走らせた。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 287 passed, 1 warning（exit 0）。warning は starlette の anyio の DeprecationWarning で、作業前（316 passed）にも出ていた。件数が減ったのは、消した type のテストを消したため |
| `uv run ruff check .` | All checks passed（exit 0） |
| `uv run mypy src` | no issues（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | 99 pass（exit 0） |
| `node --test tests/browser/` | 78 pass（exit 0）。作業前は 62 |

手元の保存ファイル（`~/ytbg-1〜4.jsonl` と `~/ytbg-test.jsonl`）を `Storage.load()` で
読むだけ試し、5 つとも読めた（17 / 1 / 66 / 1 / 1 件）。書き込みはしていない。

## 迷って決めたこと（管理者の確認をお願いしたい）

1. **free move のダイスと得点の ▲▼ は、送る前に手元の値も変える**のを残した
   （`click_dice()` の `d.set(val)`、`score_up()` の `s.score = ...`）。変えないと、
   返事が届く前に続けて押したとき、同じ値を 2 回送って 1 回ぶん消える
   （今までは手元を変えていたので起きなかった）。TODO-052 で写しを消すときに、
   この挙動をどうするか決める必要がある
2. **リダブルでは 64 の上限を見ない**（`double(board, player, true)`）。今のコードも
   ダブルのときだけ `value < 64` を見ていたのに合わせた（上限はサーバが抑える）
3. **`opening.test.mjs` は、turn が 2 未満なら `new` で戻す。** TODO.md の箇条書きの
   type だけでは、先手が決まったあと turn を 2 に戻せない。`new` は残る type なので
   テスト専用の type ではない
4. ブラウザのテストの盤面の用意は、ページの中で `/static/js/ws.js` や
   `/static/js/actions.js` を動的に import して呼ぶ形にした（main.js と同じ URL
   なので同じ WebSocket を使う）
5. `predict.test.mjs` の追加 2 件（使えなくなった目、勝ちの点数）は、サーバへ送らずに
   手元で `apply()` した盤面で、送信を止めたままワンタッチで動かして見ている
   （盤面を 30 枚ぶん `put_checker` で作らないため）。最後に元の `gameinfo` を
   `apply()` し直す
6. `test_clock.py` などの `start_clock` / `set_player_clock` は、サーバのクロックを
   直接動かす形（`_clock.start()`、`_clock.clock[p] = ...`）に置き換えた。
   `start_clock` そのものの確かめは `end_turn` で猶予が戻るテストにした

## 範囲外で気づいたこと・残る懸念

- **`"board": null` のような壊れた `.jsonl` を読むと、`TypeError` で起動に失敗する。**
  前は `None or {}` から `KeyError` になり、壊れたファイルとして初期配置で始めていた
  （そのあと保存で上書きされる）。`LOAD_ERRORS` に `TypeError` は入っていない。
  キーの欠落ではないので TODO の範囲外として触っていない
- ダイスを使い切った画面で、手番でないプレーヤーのダイスを押すと `end_turn` を送り、
  サーバが捨てて警告を出す（前は手番を変えていた）。TODO-050 の捨てる条件どおり
- free move で盤の外に離すと `p` が undefined のまま `put_checker` を送り、サーバで
  `KeyError` になる（前から同じ）
- `PlayerClock.start()`（ui/clock.js）は前からどこからも呼ばれていないが、残した
- `docs/Developer.md` には古い `emit_msg` / `set_turn` などの説明が残っている（TODO-055）

## レビュー後の修正

レビュー（`reviewer-report.md`）の要修正 1・2 を直した。

### 変えたところ

- `src/ytbg/storage.py:35-40` — `LOAD_ERRORS` に足していた `TypeError` を戻した。
  コメントに、dict でないものは `from_dict()` の入口で `KeyError` にしている旨を足した
- `src/ytbg/gameinfo.py:61-70` — `_require_dict()` を足した（dict でなければ `KeyError`）。
  `CubeState.from_dict()`（:84）、`BoardState.from_dict()`（:108）、
  `GameInfo.from_dict()`（:348）の先頭で呼ぶ
- `tests/test_save_load.py:295-340` — `test_jsonl_not_dict_is_broken_file`。
  `"board": null` / `"cube": null` / `"cube": 3` / `"h": []` の 4 通りで、
  `Storage.load()` が `([], [], None)` を返し、`make_bg_server()` で起動して
  初期配置（履歴 1 件、得点 0-0）になることを見る
- `tests/browser/clicks.test.mjs:517-583` — `drag_cube()` / `wait_cube()` と 2 件
  - リダブル: `set_turn(1)` → `double {player: 1}` で自分の側に未テイクで置き、
    中央より上へドラッグ → `double {player: 0}` だけ
  - テイク: `take {player: 1}` → `double {player: 1}` で置き、5px だけドラッグ →
    `take {player: 0}` だけ。最後に `set_turn(0)` で Roll の項目へつなぐ
  - `drag_cube()` はドラッグ前に 0.5 秒待つ（返事で置き直したキューブは 0.3 秒かけて
    動くので、途中の位置を押すと掴めない。待たないとテイクの項目が落ちた）。
    マウスは 20 刻みで動かす（2 刻みではキューブが指から外れて mouseup が届かない）
- `tests/browser/clicks.test.mjs:612-627` — 使えるダイスが無いときにダイスを押す:
  `dice {player: 0, dice: [13, 15, 0, 0]}` で置き、`#dice00` を押す → `end_turn {player: 0}` だけ
- `CLAUDE.md:94-95`（clicks.test.mjs の説明）、`CLAUDE.md:255-258`（`from_dict()` の説明）

### 壊して確かめたこと（確かめたあと元に戻した）

| 壊し方 | 結果 |
|--------|------|
| `_require_dict()` の `raise` を外す | `test_jsonl_not_dict_is_broken_file` の 4 件が `TypeError` で落ちる |
| `CubeState.from_dict()` の `_require_dict()` だけ外す | `cube-null` / `cube-int` の 2 件が落ちる |
| `actions.js` の `take()` で `1 - player` を送る | テイクの項目が落ちる（後続の Roll も連鎖で落ちる） |
| `ui/cube.js` のリダブル `double(this.board, 0, true)` を `1` に | リダブルの項目が落ちる（後続も連鎖） |
| `actions.js` の `click_dice()` で `end_turn(board, 1 - player)` | ダイスを押す項目だけが落ちる |

### 検証（すべて終了コード 0）

- `uv run pytest` — 291 passed（警告 1 件は starlette の `testclient.py` の DeprecationWarning で、今回の変更と関係ない）
- `uv run ruff check .` / `uv run mypy src` / `uv run basedpyright` — 指摘 0 件
- `node --test tests/js/` — 99 pass
- `node --test tests/browser/`（1 回） — 81 pass

### 残る懸念

- `"score": 5` のように list であるべき所が list でないファイルは、今も `list(5)` の
  `TypeError` で起動に失敗する（変更前も同じ。今回の範囲外）。`"dice": null` は読めてしまう（同じく変更前から）
- `actions.js` の `double()` 自体の `player` を壊した場合は、中央からのダブルの項目で捕まる想定（今回は試していない）
