# TODO-010 調査報告: プロトコルを一方向にする場合の波及範囲

対象:
- `src/ytbg/webroot/static/ytbg.js`
- `src/ytbg/yt_backgammon.py`
- `src/ytbg/yt_backgammon_server.py`

行番号は調査時点のもの。

## 1. `Board.load_gameinfo()` の完全性

`ytbg.js:3531-3618`。読んでいる `gameinfo` のキーと復元先:

- `gameinfo.board.checker`（3555-3570）→ 各 `Checker` を `put_checker()` で盤上へ再配置。
- `gameinfo.score[0]`, `gameinfo.score[1]`（3573-3574）→ `this.score[p].set()`。
- `gameinfo.resign`（3580）→ `this.resign` に代入するのみ（表示反映は後段の `set_turn()` 経由）。
- `gameinfo.clock_limit[0]`, `[1]`（3584-3585）→ `this.clock_limit.set()`。
- `gameinfo.board.clock[0]`, `[1]`（3588-3591）→ `history_flag` が false のときだけ `player_clock[p].stop()` してから `set()`。**`history_flag` が true のときはクロックの秒数を書き換えない**（3587 の `if (!history_flag)` の外側で何もしない）。
- `gameinfo.board.playername[0]`, `[1]`（3595-3596）→ `player_name[p].set()`。
- `gameinfo.board.cube`（3599-3601）→ `this.cube.set(value, side, accepted, false)`。
- `gameinfo.board.dice[0]`, `[1]`（3604-3607）→ `roll_btn[p].set(d[p], false)`。ダイスの値は 1-6 が使用可、11-16 が使用済み（`Dice.set()`, 2092-2107 および `Dice.disable()`, 2046-2049 が `value % 10 + 10` で符号化）なので、**使用済みフラグ自体は `gameinfo.board.dice` に載っており、`load_gameinfo()` で復元されている**。
- `gameinfo.turn`（3612-3613）→ `this.set_turn(gameinfo.turn, this.resign, false)`。
- 最後に `this.pip_count(0)`, `this.pip_count(1)`（3616-3617）でピップカウント表示を再計算（これは `gameinfo` 由来ではなく盤面から再計算）。

`load_gameinfo()` で戻らない状態（`gameinfo` に無い、または読んでいない値）:

- **クロックの動作中／停止中のフラグ (`PlayerClock.active`)。** `gameinfo` にはクロックの残り秒数 (`board.clock`) しか無く、動いているかどうかのブール値は存在しない。`load_gameinfo()` は `history_flag=false` のとき必ず `player_clock[p].stop()` を呼ぶ（3588-3589）。つまり `gameinfo` を読み込んだ直後は必ず「両クロック停止」の表示になり、実際に動かすかどうかは別途 `start_clock` / `resume_clock` メッセージ（`ytbg.js:4285-4287`, `4280-4282`）に依存する。この 3 メッセージ型は `yt_backgammon.py` 側にも `_gameinfo` を更新する処理が無い（`yt_backgammon_server.py:531-533` の `set_player_clock` は秒数のみ更新、`start_clock`/`stop_clock`/`resume_clock` は `on_json()` のどの `if` にも一致せず、536-540 の `add_history`/`broadcast` にそのまま落ちて転送されるだけ）。
- **`Board.free_move`。** `ytbg.js:2636` で初期値 `false`、`apply_free_move()`（2969-2977）で `document.getElementById("free-move").checked` から直接読む、純粋にローカル DOM 由来の値。`gameinfo` にキーが無く、`load_gameinfo()` でも触っていない。サーバへ送信もされていない（`emit_msg` 呼び出しが `free_move` 関連に無い）。
- **`Board.moving_checker`（ドラッグ中のチェッカー）。** `load_gameinfo()` で触れていない。ドラッグ中に `gameinfo` を受信した場合の状態は未定義。
- **`RollButton.dice_active`。** `Dice.set()`/`RollButton.set()` の副作用として `roll_btn[p].set(d[p], false)` 呼び出し時に更新されるため（1682, 1687 の分岐）間接的には追随するが、`load_gameinfo()` 自身が明示的に読んでいる `gameinfo` のキーではない。
- **`Board.clock_sw`（クロック機能そのものの ON/OFF）。** `gameinfo` に無く、`set_clock_switch` という別メッセージ型でのみ変わる（`yt_backgammon_server.py` の `on_json()` にはこのメッセージのハンドリングが無く、broadcast のみで転送。`ytbg.js:4262-4266` で受信）。
- ハイライト表示（移動可能マスの強調など）に相当するコードは `ytbg.js` 内に見当たらなかった（`grep "highlight"` はヒットなし）。現状は存在しない機能なので対象外。

## 2. ルール判定コードの所在

いずれも「手が打てるか」「ダイスの消費」を決めている。全て**ローカルの盤面状態**（`this.point[].checkers`、`this.roll_btn[].dice[].value` など）を読んで判定しており、サーバから判定結果をもらってはいない。

- **`RollButton.get_active_dice()`**（`ytbg.js:1711-1725`, class `RollButton`）: `this.dice[]` の `value` が 1-6 の範囲のものだけを返す。ローカルの `Dice.value` を読む。
- **`RollButton.check_disable()`**（1731-1819, class `RollButton`）: `board.point[bar_p].checkers`（1738）、`board.point[p].checkers`（1766）など `Board.point[].checkers` を読み、`board.get_dst_points()` / `board.get_dst_point1()` を呼んで移動可否を判定し、使えないダイスに `dice[d].disable()` する。
- **`Checker.dice_check(active_dice, from_p, to_p)`**（2297-2353, class `Checker`）: 引数で渡された `active_dice` と `from_p`/`to_p` の差分だけで計算しており、盤面状態は直接読まない（純粋な差分計算＋ゾロ目対応）。ただし呼び出し元（`on_mouse_up_xy`）は `this.board.get_active_dice()` の戻り値を渡している。
- **`Checker.on_mouse_down_xy()`**（2374-2442, class `Checker`）: `this.board.turn`、`this.board.get_active_dice()`、`this.board.point[bar_p].checkers`、`this.board.get_dst_points()` を読んで、動かせるかを判定。
- **`Checker.on_mouse_up_xy()`**（2444-2584, class `Checker`）: `ch.board.chpos2point()`、`this.board.get_active_dice()`、`this.board.get_dst_points()`、`ch.board.point[dst_p].checkers`（ヒット判定）、`this.dice_check()`、`roll_btn.check_disable()`、`this.board.winner_is()` を呼ぶ。移動確定・ダイス消費・ヒット処理・勝敗判定まで一括でここに集約されている。
- **`Board.winner_is(player)`**（3244-3257, class `Board`）: `this.resign` と `this.pip_count(player)`（ローカルのチェッカー位置から計算、3183-3197）を読む。0 なら未勝利、`calc_gammon()` の値を返す。
- **`Board.calc_gammon(player)`**（呼び出しは `winner_is` から。`ytbg.js` 3220 付近、`this.point[].checkers` を読んでギャモン/バックギャモン判定）。
- **`Board.all_inner(player)`**（3260-3268）: `this.checker[player][i].is_inner()` を読む（ベアリングオフ判定に使用）。
- **`Board.closeout(player)`**（3275-3299）: `this.point[bar_point].checkers`、`this.point[p].checkers` を読み、クローズアウト（相手を出せない状態）かを判定。
- **`Board.get_active_dice(player)`**（3310-3312）: `this.roll_btn[player].get_active_dice()` に委譲。
- **`Board.get_dst_points(player, src_p, dice_vals)`**（3321 以降）と **`Board.get_dst_point1(player, src_p, dice_val)`**（3398 以降）: いずれも `this.point[].checkers` を読み、駒を置けるポイントを算出。`check_disable()` と `on_mouse_down_xy()`/`on_mouse_up_xy()` の両方から呼ばれる中核のルール関数。
- **`Board.chpos2point(ch)`**（3642-3651, class `Board`）: ルール判定ではなく、ドラッグ中の画面座標 (`ch.x`, `ch.y`) から `this.point[i].in_this()` を使ってポイント番号を逆算する純粋な幾何計算。ローカルの `Checker` 座標のみを読む。

サーバ側 (`yt_backgammon.py`, `yt_backgammon_server.py`) にはルール判定は一切無い。`dice_check` 相当、`winner_is` 相当、移動可否判定はいずれも存在せず、受け取ったメッセージをそのまま `_gameinfo` に反映して broadcast するだけ（`yt_backgammon_server.py:496-540`）。

## 3. 状態を書き換えるメソッドと描画するだけのメソッドの切り分け

### `Board`（`ytbg.js:2625-3726` 他）
状態プロパティと、それを書き換えるメソッド:
- `this.turn` … `set_turn()`（呼び出しは `load_gameinfo()` 内 3613、および `ws.onmessage` の `set_turn` ハンドラ 4247-4249）。
- `this.resign` … `load_gameinfo()`（3580, 代入のみ）、`winner_is()`（3247, `-1` にリセット）。
- `this.point[i].checkers` … `put_checker()`（呼び出し元は `load_gameinfo()` 3565、`ws.onmessage` の `put_checker` ハンドラ 4215-4220、`Checker.on_mouse_up_xy()` 内の先行実行 2557, 2572）。
- `this.free_move` … `apply_free_move()`（2969-2977, DOM チェックボックス直読み）。
- `this.moving_checker` … `Checker.on_mouse_down_xy()`（2431）、`on_mouse_up_xy()`（2582）、`cancel_move()`（2363）で設定/解除。
- `this.clock_sw` … `set_clock_switch()`（3003-3015）、`apply_clock_sw()`（3020-3025, DOM 直読み）。
- `this.clock_limit` … `ClockLimit.set()`（`load_gameinfo()` 3584-3585、`ws.onmessage` の `set_clock_limit` 4266-4270）。
- `this.player` (向き) … `set_player()`（`inverse()` 内 3624 から呼ばれる、対局者視点の回転用。`gameinfo.turn` とは別物）。

状態を持たず描画のみのメソッド: `rotate()`, `pip_count()`（表示計算だが読み取りのみで盤面は変更しない）、`chpos2point()`（幾何計算）。

### `Checker`（`ytbg.js:2204-2596`）
- `this.cur_point` … `put_checker()`（`Board.put_checker()` 経由、Checker 自身の値を設定する箇所は Board 側）。
- `this.x`, `this.y`, `src_x`, `src_y` … `move()`、`on_mouse_down_xy()`、`on_mouse_move_xy()`、`on_mouse_up_xy()` の中で直接代入。
- 描画専用: `is_inner()`（読み取りのみ）。

### `RollButton`（`ytbg.js:1565-1937`）
- `this.dice[].value` … `set()`（1667-1693, 引数の `dice_value` をそのまま書き込む＝サーバ/gameinfo 由来の値で上書きできる）。
- 使用済みフラグ（`Dice.value` の `+10` 符号化）… `check_disable()`（1731-1819）が**ローカルの盤面から自律的に判定して**書き込む。ここがサーバ由来ではなく、クライアントが独自に「使えない目」を判定している箇所。
- `this.dice_active` … `set()`（1682, 1687）、`another()` 呼び出し先などいくつかの箇所（1836, 1903）で書き換え。

### `Dice`（`ytbg.js:1997-2199`, class `Dice`, `RollButton` の内部で保持）
- `this.value` … `set(val, roll_flag)`（2092-2107）。`enable()`（2038-2041, `value % 10`）／`disable()`（2046-2049, `value % 10 + 10`）で使用可否を切り替え。

### `Cube`（`ytbg.js:1220-1465`）
- `value`, `side`, `accepted` 相当の状態 … `set(val, player, accepted)`（1266 付近、`load_gameinfo()` 3601 と `ws.onmessage` の `cube` ハンドラ 4223-4225 の両方から呼ばれる）。純粋にサーバ/gameinfo の値をそのまま書き込む形で、ローカル判定は無い。

### `PlayerClock`（`ytbg.js:540-756`）
- `this.clock`, `this.start_clock`, `this.start_time` … `set(clock)`（603-609）、`update_start_clock()`（622-625）。
- `this.active`（動作中フラグ）… `resume()`（654-658）、`start()`（663-666）、`stop()`（671-674）で切り替え。`gameinfo` には対応するキーが無い（1. 参照）。
- `update()`（629-651）はタイマー駆動の描画兼カウントダウン計算で、`this.active` と `this.board.clock_sw` を読んで `this.clock[]` 自体を書き換える（631-638）。**状態の書き換えと描画が同一メソッド内に同居している**唯一の例。

## 4. クロックの扱い

- タイマー本体: `Board` のコンストラクタ内、`ytbg.js:2761-2766`。
  ```
  const update_clock = () => {
      this.player_clock[0].update();
      this.player_clock[1].update();
  };
  setInterval(update_clock, 200);
  ```
  200ms 間隔でクライアントのローカルタイマーが両プレイヤーの `PlayerClock.update()` を呼び続ける。サーバ側には対応するタイマーは無い（`yt_backgammon_server.py` に `setInterval`/`asyncio` 定期タスクに相当するクロック処理は無し）。
- `PlayerClock.update()`（629-651）は `this.active`（ローカルのみのフラグ）と `this.board.clock_sw` を見て、`Date.now() - this.start_time` の経過時間から `this.clock[1]`（猶予秒）を減算し、0 を切ったら `this.clock[0]`（持ち時間）を減らす。**この減算計算はサーバに一切問い合わせず、クライアントだけで完結している。**
- `gameinfo` との同期点は 2 つだけ:
  1. `load_gameinfo()` 内、`history_flag=false` のときの `player_clock[p].set(gameinfo.board.clock[p])`（3588-3591）。これは「巻き戻し中でなければ、サーバから届いた秒数のスナップショットで上書きし、かつ停止状態にする」という一方向の反映。
  2. `emit()`（713-716, `PlayerClock.emit()`）が `set_player_clock` メッセージで現在の `this.clock` をサーバへ送り、`yt_backgammon.py:set_player_clock()`（154-159）が `_gameinfo['board']['clock'][player]` を更新して次の `emit_gameinfo()` に載る。
- 動作中／停止中（`active`）そのものは `gameinfo` に永続化されず、`start_clock`/`stop_clock`/`resume_clock` という**その場限りの操作メッセージ**でのみ伝播する（3 参照）。サーバはこれらを解釈せず、`_bg` の状態も更新しないまま素通しで broadcast する（`yt_backgammon_server.py:496-540` のどの `if` にも該当せず、536 の `add_history` は `msg['history']` フラグ次第、540 の `broadcast(msg)` は常に実行）。そのため、新規接続クライアントが `gameinfo` だけを受け取っても「今どちらのクロックが動いているか」は再現できない。
