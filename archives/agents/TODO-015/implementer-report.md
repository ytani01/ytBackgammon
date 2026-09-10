# TODO-015 実装担当の報告

サーバ → クライアントの受信を `gameinfo` 1 本にまとめた。

## 変えたファイルと変更点

### src/ytbg/yt_backgammon_server.py

- `emit_gameinfo()` (208-241) に `last_op=None` を足し、送る `data` に
  `'last_op': last_op` を入れた。docstring に「操作に紐づかない送信では
  None」と書いた
- `on_json()` の末尾 (672-678) を `await self.broadcast(msg)` から
  `sec = SEC_CHECKER_MOVE if msg['type'] == 'put_checker' else 0` +
  `await self.emit_gameinfo(sec, history_flag=False, last_op=msg)` に変えた
- `add_history` の扱い (669-671) は変えていない
- `set_clock_limit` の分岐のコメント (618-621) を直した。「ytbg.js の受信側は
  両方のクロックを reset() する。合わせる」は、その受信側を消したので
  事実でなくなった

### src/ytbg/webroot/static/ytbg.js

- `ws.onmessage` (4276-4294) から `gameinfo` 以外の 13 個の分岐を消し、
  `load_gameinfo()` に `msg.data.last_op` を渡すようにした
- `load_gameinfo()` の引数に `last_op=undefined` を足した (3527-3563)。
  先頭で `op_type` を求め、`put_checker` のときはチェッカーを配り直す前に
  `put_prev_p`（動かす前の point）を控える
- dice (3657-3668): `roll_btn[p].set(d[p], roll_player == p)` にした。
  `roll_player` は `op_type == "dice" && last_op.data.roll &&
  gameinfo.turn != -1` のときだけ `last_op.data.player`
- turn (3670-3677): `set_turn(gameinfo.turn, this.resign, op_type == "set_turn")`。
  第 3 引数が `sound` で、`set_turn()` 自身が「turn が変わったときだけ」
  鳴らす
- 末尾 (3683-3693): `put_checker` の操作だったときに put / hit の音を鳴らす。
  `this.turn != -1` のときだけ

### tests/

- `tests/test_on_json.py`
  - `test_put_checker_broadcasts_msg` →
    `test_put_checker_sends_gameinfo_with_last_op`。gameinfo が 1 通送られ、
    `last_op` が受け取った msg、`sec` が 0.2、`gameinfo` の checker が
    `[3, 0]` になっていることを見る
  - `test_fallthrough_types_broadcast_the_received_msg` →
    `test_fallthrough_types_send_gameinfo_with_last_op`。9 つの type ごとに
    「gameinfo が 1 通」「`last_op` が受け取った msg」「送られた gameinfo の
    どこがどう変わったか」「`sec` は put_checker のときだけ 0.2」を見る。
    変わった場所は parametrize に取り出し関数と期待値を足して指定した
  - `test_emit_gameinfo_message_shape`: キーの集合に `last_op` を足し、
    直接呼んだときは `None` であることを足した
  - `test_returning_types_do_not_broadcast_original_msg`: 送られた
    すべての msg で `last_op` が `None` であることを足した
  - 節のコメントを「末尾の add_history と emit_gameinfo まで落ちる」に直した
- `tests/test_clock.py`
  - `test_clock_state_carries_current_clock` に
    `last_op is None` を足した
  - `test_clock_ops_send_gameinfo_with_clock_state` を足した。
    `start_clock` / `stop_clock` が gameinfo で返り、`last_op` がその操作、
    `clock_state.active` と残り時間が付くことを見る（受信側の 5 つの分岐を
    消したので、クライアントはこれだけを頼りにクロックを合わせる）
  - `test_set_clock_limit_resets_both_clocks` の docstring を直した
    （消した受信側を根拠にしていた）

## 消した分岐とその行き先

| 消した分岐 (`ws.onmessage`) | 盤面 | 演出 |
|---|---|---|
| `put_checker` | `gameinfo.board.checker` → チェッカーを配り直す | `last_op` で put / hit の音（`turn == -1` では鳴らさない） |
| `cube` | `gameinfo.board.cube` → `cube.set(..., false)` | 無し（`Cube.set()` は引数 3 つで、`false` は元々読まれていない。音も鳴らさない） |
| `dice` | `gameinfo.board.dice` → `roll_btn[p].set()` | `last_op.data.roll` で回転と `sound_roll`（`turn == -1` では出さない） |
| `set_turn` | `gameinfo.turn` / `resign` → `set_turn()` | `set_turn()` の第 3 引数 `sound` を真にして turn_change の音 |
| `set_playername` | `gameinfo.board.playername` → `player_name[p].set()` | 無し |
| `set_score` | `gameinfo.score` → `score[p].set()` | 無し |
| `set_clock_switch` | `clock_state.sw` → `set_clock_switch()` | 無し |
| `set_clock_limit` | `gameinfo.clock_limit` → `clock_limit.set()`、止めて `clock_state.clock` を入れる（サーバが `_reset_clock()` 済み） | 無し |
| `set_player_clock` | `clock_state.clock[p]` → `player_clock[p].set()` | 無し |
| `resume_clock` / `start_clock` | `clock_state.active[p]` → `stop()` + `set()` + `resume()` | 無し |
| `stop_clock` | `clock_state.active[p]` が偽 → `stop()` + `set()` | 無し |
| `reset_clock` | `clock_state`（サーバが `_reset_clock()` 済み） | 無し |

`dice` の分岐にあった `if (board.turn < 0) { player_name[0].off();
player_name[1].off(); }` は、`load_gameinfo()` が呼ぶ `set_turn()` が
両方の `player_name` を off にするので落ちていない。

## 判断に迷った点

- **`turn == -1` をいつの turn で見るか。** 消した分岐は「メッセージを
  受ける前の turn」で見ていた。今は `load_gameinfo()` の中なので、
  `gameinfo.turn`（受けた後）で見ている。`put_checker` と `dice` は
  turn を変えない操作なので、どちらで見ても同じ値になる
- **hit の音の判定に使う「動かす前の位置」。** `put_checker()` と同じく
  `ch.cur_point` から取る。先行適用した本人の画面では既に移動済みで
  put の音になり、他の画面では hit の音になる。**これは今までと同じ**
  （消した分岐も `board.put_checker()` に任せて同じ計算をしていた）
- **`cube` の演出。** TODO には `cube.set(..., false)` の第 4 引数が
  演出の抑制のように書かれているが、`Cube.set(val, player, accepted)` は
  引数を 3 つしか取らず、`false` は読まれていない。音も無いので、
  移すものは無かった
- **`CLAUDE.md` は触っていない。** 実装担当は文書を触らない決まりなので、
  下書きだけ置く（管理者へ）。「### 状態と通信」の

  > `type` の分岐はサーバの `on_json()` とクライアントの `ws.onmessage` の
  > **両方に同じ名前で書かれている**ので、`type` を足すときは両方直す。

  を、次のように差し替えるのが実装に合う:

  > `type` を書くのはクライアント → サーバの向きだけで、分岐はサーバの
  > `on_json()` にしかない（TODO-015）。サーバが返すのは `gameinfo` 1 本で、
  > `data` に直前の操作が `last_op`（受け取った msg そのまま）として入る。
  > クライアントは `gameinfo` で盤面を作り直し、音と dice の回転だけを
  > `last_op` から出す（`Board.load_gameinfo()`）。`type` を足すときは
  > `on_json()` に分岐を足し、演出が要るときだけ `load_gameinfo()` にも
  > 足す。

## 検証

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 90 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed!（0） |
| `uv run mypy src` | Success: no issues found in 5 source files（0） |
| `node --check src/ytbg/webroot/static/ytbg.js` | 出力なし（0） |

**わざと壊して、狙ったテストが落ちることを確かめた**（CLAUDE.md）:

- `last_op=msg` → `last_op=None`: 11 件 failed
- `sec` を常に 0 にする: 2 件 failed
- `emit_gameinfo(...)` を `broadcast(msg)` に戻す: 11 件 failed

いずれも元に戻して 90 passed を確認済み。

## 残る懸念

- **ブラウザでの確認はしていない**（別担当の範囲）。特に見てほしいのは、
  ダイスを振ったときの回転と音、チェッカーを置いたときの put / hit の音、
  手番が変わったときの音、クロックの発着（`start` / `stop` / `resume` /
  `reset` / スイッチ / limit 変更）が今までどおりか
- **操作 1 回ごとに `gameinfo` 全体が飛ぶようになった。** TODO の
  「気をつけること」にあるとおりで、通信量は増える
- `resign` の操作は、今まで受信側に分岐が無く画面に何も起きなかったが、
  これからは `gameinfo.resign` が `set_turn()` に渡って
  `resign_banner_btn` の表示に効く（`turn < 0` のとき）。**挙動が
  増える方向の変化**なので、レビューで見てほしい
- クロックは、操作のたびに `clock_state` で全員が値を入れ直すようになる
  （`player_clock[p].stop()` → `set()` → `resume()`）。サーバの
  `_cur_clock()` は 0.1 秒に丸めるので、表示が 0.1 秒単位で前後に
  跳ねることがありうる

---

# レビュー指摘の修正

`archives/agents/TODO-015/reviewer-report.md` の要修正 2 件と、直すと決めた
検討 2 件を直した。方針は管理者から渡されたとおり。

## 1【重大】勝負がついた盤面の stop_clock ↔ gameinfo のループ

- **直した場所**: `src/ytbg/webroot/static/ytbg.js:3143-3160`
  (`Board.set_turn()` の `winner >= 0` の枝)
- **直し方**: `emit_stop()` を
  `if ( this.player_clock[winner].active ) { ... }` で囲んだ。
  なぜ要るのか（`load_gameinfo()` が毎回 `set_turn()` を呼ぶこと、
  `stop_clock` では `turn` も `resign` も変わらず止まる条件が無いこと、
  サーバが `_clock_active` を false にすると次の `clock_state` で
  `resume()` されなくなり 1 巡で収まること）をコメントに書いた

### 実測

ポート 5009・`server_id` は `zz9`、`HOME` を一時ディレクトリにして起動
（利用者の `~/ytbg-1..4.json` は触っていない）。ヘッドレス Chromium を
1 枚開き、別に観測用の WebSocket を 1 本つないで、5 秒間に届いた
`gameinfo` の数と `last_op.type` を数えた。

| 盤面 / 操作 | 修正前 | 修正後 |
|---|---|---|
| 勝ち相当（プレーヤー 0 の 15 枚をゴールへ、`emit_turn(-1, -1)` の状態で画面を再読み込み） | **519**（すべて `stop_clock`） | **0** |
| 降参相当（`emit_turn(-1, 0, false)`。クロックは停止中） | 2（reviewer 実測） | **1**（`set_turn` のみ） |
| 勝負がついた盤面で、動いているクロックを止める場合（`player_clock[1].emit_start()`） | 回り続ける | **2**（`start_clock` 1 + `stop_clock` 1 で収束） |

修正前の 519 通は、修正後のファイルから `active` の判定だけを外し、
同じサーバのまま画面を再読み込みして測った（reviewer の 558 / 606 と同じ
現象）。最後の行が示すとおり、**「動いているクロックを止める」という
本来の役目は残っている**（1 巡で収まる）。

起動したサーバ (PID 946318) とブラウザ (PID 946467) は `ps -p` で確かめてから
kill し、一時 `HOME` の `ytbg-zz9.json` も消した。ポート 5009 は閉じている。

## 2 サーバのコメントの食い違い

- `src/ytbg/yt_backgammon_server.py:587-588`:
  「末尾の add_history と broadcast まで落ちる」→
  「末尾の add_history と emit_gameinfo まで落ちる (TODO-015)」
- `src/ytbg/yt_backgammon_server.py:635-638`:
  「転送は今までどおり続けるので、すでに開いている画面の動きは変わらない」→
  「TODO-015 で転送をやめたので、すでに開いている画面も、ここで作った状態を
  clock_state で受け取って合わせる」

## 3 ドラッグ中のチェッカーが定位置へ戻される

- **直した場所**: `src/ytbg/webroot/static/ytbg.js:3565-3591`
  (`load_gameinfo()` の配り直しの前後)
- **直し方**: 配り直しの前に `this.moving_checker` の座標と z を控え、
  配り直しのあとに `move(x, y, true, 0)` と `set_z(z)` で戻す。
  `point.checkers` の並びと `cur_point` は `point.add()` に作らせたままなので、
  `gameinfo` どおりになる
- **実測**（同じ環境）: `moving_checker` に `p000` を入れて `(400, 300)` へ
  動かし（`left/top = 392px/292px`、z = 1000）、別のクライアントから
  `set_playername` を 1 通送った結果:
  - `left/top` は **392px/292px のまま**（修正前は reviewer 実測で
    457px/242px へ戻っていた）、z も 1000 のまま
  - 一方で `playername` は `"Tester"` に更新され、`point[0].checkers` は
    `p000..p014` と `gameinfo` どおりに並んでいる

## 4 テストの穴

- `tests/test_on_json.py` の
  `test_fallthrough_types_send_gameinfo_with_last_op` の parametrize に
  `set_clock_switch` / `resume_clock` / `reset_clock` を足した（12 通りに
  なった）。この 3 つは `gameinfo` を変えないので、gameinfo 側は
  「変わらない」ことを見ている
- 状態そのものは `clock_state` に出るので、`tests/test_clock.py` の
  `test_clock_ops_send_gameinfo_with_clock_state` を伸ばし、
  `resume_clock`（猶予を戻さず再開）、`reset_clock`（limit へ戻して停止）、
  `set_clock_switch`（`sw` が false）まで、`last_op` と `clock_state` の
  両方を見るようにした

## 検証（修正後）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 93 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed!（0） |
| `uv run mypy src` | Success: no issues found in 5 source files（0） |
| `node --check src/ytbg/webroot/static/ytbg.js` | 出力なし（0） |
| 実際に動かしての確認 | 上の実測表のとおり |

## 残る懸念（今回の修正について）

- **ループの片側はブラウザにあるので、pytest では捕まらない**
  （reviewer の指摘 6 のとおり）。今回は実際に動かして確かめたが、
  自動テストは無い
- 修正 1 は「クライアントが自分の `active` を見る」形なので、
  **`clock_state` が届く前に `set_turn()` が走る順序**に依存する。
  `load_gameinfo()` はクロック → `set_turn()` の順に処理しており、
  この順番が変わると成り立たなくなる（コメントに理由を書いてある）
- 修正 3 は `moving_checker` の 1 枚だけを戻す。掴んでいる駒が
  `last_op` の `put_checker` の対象でもある場合は、先行適用で
  `moving_checker` が既に `undefined` になっているので当たらない
