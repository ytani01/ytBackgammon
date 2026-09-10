# TODO-015 レビュー担当の報告

対象: 未コミットの `git diff`（`CLAUDE.md` / `ytbg.js` /
`yt_backgammon_server.py` / `tests/`）。
`TODO.md` の TODO-015 の節、`CLAUDE.md`、`implementer-report.md` を読んだうえで、
実際にサーバとヘッドレス Chromium を動かして確かめた。

**要修正 1 件（重大）、要修正 1 件（小）、検討 4 件。**

---

## 要修正

### 1. 勝負がついた盤面で `stop_clock` ↔ `gameinfo` の無限ループになる

- **どこ**: `ytbg.js:3145`（`Board.set_turn()` の中の
  `this.player_clock[winner].emit_stop()`）と
  `yt_backgammon_server.py:660-666, 678-679`（`stop_clock` の分岐が return せず
  `emit_gameinfo()` へ落ちる）の組み合わせ。
  入口は `ytbg.js:3677` で `load_gameinfo()` が毎回 `set_turn()` を呼ぶこと
- **何が起きる**:
  1. `turn < 0` かつ勝者が決まっている盤面（降参、または全部上がった状態）で
     `load_gameinfo()` が走る
  2. `set_turn()` の `turn < 0` の枝が `player_clock[winner].emit_stop()` を呼び、
     `stop_clock` をサーバへ送る
  3. サーバは `stop_clock` を処理したあと **`emit_gameinfo(last_op=stop_clock)`**
     で全員へ `gameinfo` を返す（TODO-015 の変更点）
  4. 受け取った全クライアントが `load_gameinfo()` → 1 に戻る
- **なぜ問題か**: 止まる条件が無い。`turn` も `resign` も
  `stop_clock` では変わらないので、盤面が動かないかぎり回り続ける。
  クライアントが増えるほど 1 巡あたりの本数も増える
- **実測**（ヘッドレス Chromium 1 枚 ＋ 観測用の WebSocket クライアント 1 本、
  いずれも localhost）:

  | 盤面 | 5 秒間にサーバが送った `gameinfo` の数 |
  |---|---|
  | 降参相当（`emit_turn(-1, 0)`）**変更後** | **607**（`set_turn` 1、`stop_clock` 606） |
  | 降参相当（`emit_turn(-1, 0)`）**変更前**（`git show HEAD:` の 2 ファイルで起動） | **2**（`set_turn` 1、`stop_clock` 1） |
  | 勝ち相当（プレーヤー 0 の 15 枚を全部ゴールに置いて `emit_turn(-1, -1)`）**変更後** | **558**（`set_turn` 1、`stop_clock` 557） |
  | 対照: 勝者のいない `emit_turn(-1, -1)`（初期配置） **変更後** | **1**（`set_turn` のみ） |

  対照が 1 通で止まることから、引き金は `set_turn()` の
  「`winner >= 0` のときに `emit_stop()` を呼ぶ」枝で確定。
  降参だけでなく**普通に勝負がついたときも起きる**ので、1 ゲーム終わるたびに
  必ず踏む
- **付随して**: `history: false` なので `save_data()` は走らない（ディスクは
  無事）。ただし全クライアントが毎秒 100 回以上 `load_gameinfo()`
  （チェッカー 30 枚の配り直し）を回すことになる
- 直し方は書かないが、判断が要るのは「`set_turn()` から `emit_stop()` を
  出すのをやめるのか」「`stop_clock` を受けたときだけ `gameinfo` を返さない
  のか」「クライアント側で `last_op` が自分の状態と同じなら送らないのか」の
  どれを採るか

### 2. サーバのコメントが 2 か所、変更後の事実と食い違う

- `yt_backgammon_server.py:587`
  「`# ここから下は return せず、末尾の add_history と broadcast まで落ちる`」
  → 落ちる先は `emit_gameinfo()`。`tests/test_on_json.py` の同じ文言の
  コメントは直っているのに、本体だけ残っている
- `yt_backgammon_server.py:634-637`
  「`転送は今までどおり続けるので、すでに開いている画面の動きは変わらない`」
  → 転送はやめたので、この文はもう成り立たない
- **なぜ問題か**: `CLAUDE.md` は直したのに、読み手が最初に見るコードの
  コメントが古い説明のまま残る。TODO-015 の作業範囲そのもの

---

## 検討

### 3. ドラッグ中のチェッカーが、他人のどんな操作でも定位置へ戻される

- **どこ**: `ytbg.js:3596-3604`（`load_gameinfo()` が `point.add()` で全 30 枚を
  無条件に `ch.move()` する）
- **実測**: `board.moving_checker` にチェッカーを入れて `(400, 300)` へ動かした
  状態で、別クライアントから `set_playername` を 1 通送ったところ、
  `left/top` が `392px/292px` → `457px/242px`（元の point の座標）に戻った。
  `board.moving_checker` はそのチェッカーのまま
- **なぜ問題か**: 変更前は、他人の操作で自分の画面のチェッカーが動くのは
  「そのチェッカー自身の `put_checker`」が届いたときだけだった。今は
  名前の変更でもクロックの発着でも全枚数が置き直されるので、**掴んでいる駒が
  一瞬戻る**。落とす位置はマウス座標から決まるので結果は狂わないが、
  見た目は乱れる。TODO-017 で `load_gameinfo()` の呼ばれる回数が少なかった
  頃には目立たなかった話が、操作のたびに起きるようになった
- 直すなら `moving_checker` を配り直しから除く、という手がある（未確認）

### 4. 操作 1 回ごとの重さ

- `gameinfo` 全体（手元の `~/ytbg-1.json` の 1 手ぶんで 700 バイト前後）が
  操作のたびに人数分流れる。加えて受け側は毎回チェッカー 30 枚の再配置と
  `pip_count()` ×2、`set_turn()` を走らせる
- `emit_gameinfo()` は `broadcast()` を通るので、**操作系も「いちばん遅い
  クライアント」を待つ**（`CLAUDE.md`／TODO-009 の制約）。変更前の
  `broadcast(msg)` も同じ `asyncio.gather()` を通っていたので**待ちの構造は
  変わらない**が、1 通が大きくなったぶん詰まりやすくなる
- 体感に響く経路として気になるのはチェッカーの連続移動
  （ヒット時は `put_checker` が 2 通続く）。ここは `sec=0.2` の
  アニメーションと重なる。**未確認**（実測していない）

### 5. クロックの入れ直しによる表示の跳ね

- 操作のたびに `player_clock[p].stop()` → `set(clock_state.clock[p])` →
  `resume()` が両プレーヤーぶん走る（`ytbg.js:3627-3641`）
- **実測**: クロックを動かした状態で 0.3 秒おきに 10 回操作を送り、
  ブラウザ側の `player_clock[0].clock` を 20ms 間隔で 175 回サンプリング
  したところ、**巻き戻り（値が増える向きの跳ね）は 0 回**（localhost）
- ただし `_cur_clock()` は `round(sec, 1)` なので最大 0.05 秒、これに片道の
  遅延が乗る。表示は `toFixed(1)` の 0.1 秒刻みなので、**回線が遅い環境では
  0.1 秒の単位で前後しうる**。localhost では出なかった、というところまでが
  実測
- 実害は小さいと見るが、気になるなら「動作中は表示を巻き戻さない」形にする
  判断が要る

### 6. テストの穴

- 追加・書き換えられたテストは骨抜きになっていない。実装担当の壊しテスト
  （`last_op=None` にすると 11 件 failed など）は妥当で、こちらでも
  `uv run pytest` は 90 passed を確認した
- ただし **要修正 1 のループはサーバ側テストでは絶対に捕まらない**
  （ループの片側がブラウザにある）。動作確認の担当には
  「降参したとき」「全部上がって勝負がついたとき」を**必ず**触らせること。
  そこを触らないと、いちばん重い不具合が素通りする
- クロック 5 種のうち `resume_clock` / `reset_clock` / `set_clock_switch` は
  `gameinfo` で返ることを見るテストが無い（`start_clock` / `stop_clock` だけ）。
  `test_fallthrough_types_send_gameinfo_with_last_op` の parametrize に
  並べれば足りる

---

## 問題なしと判断したもの（依頼の観点への回答）

### 消した 13 分岐の演出（依頼 2）

**取りこぼしは見つからなかった。** 1 つずつ確かめた結果:

- `put_checker` の hit / put: `load_gameinfo()` の先頭で配り直す前に
  `cur_point` を控え、末尾で `p >= 26 && prev < 26` を見ている。
  `Board.put_checker()`（`ytbg.js:3752-3777`）と同じ式で、先行適用した本人の
  画面では put、他の画面では hit になるのも変更前と同じ
- `dice` の `roll` フラグ: `RollButton.set(dice, roll_flag)` が
  `sound_roll.play()` と `Dice.set()` の回転（`move1(deg, 0.5)`）を持つので、
  第 2 引数を渡す新しい形で演出は出る。値は `gameinfo.board.dice` から
  取っているが、`ytBackgammon.dice()` は受け取った配列をそのまま入れるだけ
  なので `msg.data.dice` と同じ
- `set_turn` の音: `Board.set_turn()` の第 3 引数 `sound` は
  `turn != prev_turn` と組で効くので、`op_type == "set_turn"` で渡す形で足りる
- 消えた `if (board.turn < 0) { player_name[0].off(); ... }` は
  `set_turn()` の冒頭が両方 off にするので落ちていない
- `cube` の第 4 引数: `Cube.set(val, player, accepted)` は 3 引数で、
  `false` は読まれていない（`ytbg.js:1264-1266` で確認）。移すものは無い
- クロック 5 種と `set_clock_limit` / `set_player_clock`: `clock_state` で
  賄えている。`set_clock_limit` はサーバ側の `_reset_clock(0/1)` が唯一の
  決め手になったが、`PlayerClock.reset()` と同じ「`clock_limit` に戻して止める」
  なので変更前と同じ結果

### `turn == -1` の見方を変えた点（依頼 3）

問題なし。`on_json()` で `turn` を変えるのは `set_turn` と `new` /
`set_gameinfo` だけで、`put_checker`（`yt_backgammon.py:87-101`）も
`dice`（同 103-111）も `gameinfo['turn']` に触らない。したがって
「受ける前の turn」と「`gameinfo.turn`」は一致する。
`set_turn` と混ざる場合も、メッセージは 1 本ずつ順に処理されるので、
`set_turn` の `gameinfo` を受けた時点で `this.turn` が更新され、次の
`put_checker` の判定はその値になる（変更前は「1 つ前のメッセージまでを
反映した `board.turn`」だったので、やはり同じ）。

なお `set_turn` の docstring は `<= -1` を「操作不可」としているのに、
判定は変更前も変更後も `== -1` のまま。`-2` 以下を送る経路は
`ytbg.js` に無いので実害は無い（**好みの範囲**）。

### `resign` で挙動が増えるか（依頼 1 の 1 つめ）

**実質は増えていない。** 理由は 2 つ。

- `ytbg.js` は `type: "resign"` を**一度も送っていない**
  （`emit_msg("resign"` は 0 件）。降参は
  `emit_turn(-1, this.board.player)` すなわち `set_turn` の `data.resign` で
  伝わる
- その `set_turn` は、変更前も受信側で `board.set_turn(msg.data.turn,
  msg.data.resign)` を呼んでいた（消した分岐）。`resign_banner_btn` は
  そのときから出ていた

つまり新しく効くのは「サーバへ直接 `resign` を送った場合」だけで、
現状そこへ来る経路が無い。**ただし `gameinfo.resign` が
`set_turn()` に渡ること自体が、要修正 1 のループの入口の 1 つになっている**
（降参した盤面でループが回る）。

### 先行適用との関係（依頼 4）

`Checker.on_mouse_up_xy()` は同期関数で、`emit_msg()` →
`put_checker()`（先行適用）→ `check_disable()` / `winner_is()` →
`moving_checker = undefined` まで一気に走る。JS は単一スレッドなので、
その途中に `ws.onmessage` が割り込むことはない。返ってきた `gameinfo` は
先行適用と同じ結果になるので、上書きされて困ることは無い。
**ドラッグ中の駒が戻される件だけは別**で、それが検討 3。

### 書き方の慣習（`CLAUDE.md`）

- 追加行に 79 桁（全角 2 桁換算）を超える行なし、行末の空白なし
- ログの追加・変更なし（`{}` と引数の形は崩れていない）
- コメントは「なぜ」を書いている（`last_op` を添える理由、配り直す前に
  `cur_point` を控える理由）。ただし要修正 2 の 2 か所だけ、古い「何を」の
  説明が残っている
- `CLAUDE.md` の書き換えは実装と合っている

---

## 確かめ方（再現手順）

1. `env HOME=<一時ディレクトリ> .venv/bin/python -m ytbg -p 5099 zz` で起動
   （`DATAFILE_DIR` は `$HOME` なので、利用者の `~/ytbg-*.json` は触らない）
2. `chromium --headless=new --remote-debugging-port=9444
   --user-data-dir=<一時ディレクトリ>` で開き、CDP の `Runtime.evaluate` で
   `board.emit_turn(-1, 0, false)` を実行
3. 別に `ws://localhost:5099/ws` へ観測用のクライアントをつなぎ、
   5 秒間に届いた `gameinfo` の数と `data.last_op.type` を数える
4. 変更前との比較は、`git show HEAD:src/ytbg/webroot/static/ytbg.js` と
   `git show HEAD:src/ytbg/yt_backgammon_server.py` を別ディレクトリへ書き出し、
   `PYTHONPATH` を通してポート 5098 で起動

使ったスクリプトは一時ディレクトリに置いたもので、リポジトリには入れていない。
起動したサーバとブラウザは終了済み、`~/ytbg-*.json` は 1〜4 のまま増えていない。

---

# 再レビュー（修正後）

2026-09-11。要修正 2 件と検討 3 件を直した差分を見た。
**要修正は 0 件。検討 3 件（うち 1 件は利用者の判断が要る）。**

`uv run pytest` 93 passed、`uv run ruff check .` 0 件、`uv run mypy src` 0 件、
`node --check ytbg.js` エラーなしを確認した。

## 1. 無限ループの直し方（依頼 1）— 妥当。あらゆる場合で収束する

`ytbg.js:3143-3157` の
`if ( this.player_clock[winner].active ) { ... emit_stop(); }`。

### なぜ収束するか（コードで確かめたこと）

- `load_gameinfo()` は**クロックの復元（3655-3676）を `set_turn()`（3695）より
  先に**行う。したがって `set_turn()` が見る `active` は、いま受け取った
  `clock_state.active`（＝サーバの `_clock_active`）そのもの
- クライアントの `PlayerClock.active` に代入する箇所は 3 つだけ。
  コンストラクタ（`false`）、`resume()`（`true`）、`stop()`（`false`）
- `resume()` の呼び出し元は `load_gameinfo()` の
  `if (clock_state.active[p])` と `PlayerClock.start()` の 2 つだけ。
  `start()` は TODO-015 で呼び出し元が無くなった（後述の検討 3）ので、
  **`active` が真になるのはサーバが真を返したときだけ**
- サーバの `_clock_active[p]` が真になるのは `start_clock` と `resume_clock`
  の分岐だけで、この 2 つを送るのは `PlayerClock.change_turn()`（ダイスの
  クリック）と `pause_resume()`（クロックのクリック）＝**利用者の操作だけ**。
  `load_gameinfo()` の中からは呼ばれない
- よって 1 巡で必ず `active` が偽になり、次からは `emit_stop()` を送らない。
  クライアントが N 枚なら、最初の `gameinfo` が行き渡るまでに最大 N 通の
  `stop_clock` が出るが、そこで止まる

### 実測（サーバ ＋ ヘッドレス Chromium、localhost）

`gameinfo` を数えたのは、どちらにも属さない観測用の WebSocket
クライアント 1 本。「5 秒間」で数えた。

| 場面 | 通数 | 内訳 |
|---|---|---|
| 勝ち（クロック停止中）に `turn=-1` | 1 | `set_turn` |
| **勝者のクロックが動作中**のまま `turn=-1` | **2** | `set_turn`, `stop_clock` |
| 同上、**ブラウザ 2 枚** | 3 | `set_turn`, `stop_clock` ×2 |
| `clock_sw` が off で勝ち | 1 | `set_turn` |
| **勝負がついたあとにクロックをクリック**（`pause_resume`） | 4 | `resume_clock`, `set_player_clock`, `stop_clock` ×2 |
| 降参（`turn=-1, resign=0`） | 1 | `set_turn` |
| 勝ちの局面を含む履歴を `back_all` で再生 | 17（再生そのもの） | 追加の `stop_clock` なし。その後 5 秒で 0 通 |

**修正前は同じ場面で 5 秒に 606 通・558 通**だったので、直っている。
複数クライアントでも通数はクライアント数ぶんで頭打ちになることを、
2 枚で確かめた。

### 付随してわかったこと（問題ではない）

- **勝負がついた盤面ではクロックを動かし続けられない。** 動かすと
  次の `gameinfo` で必ず止められる（上の表の 4 通のケース）。
  これは変更前も同じ（無条件に `emit_stop()` していた）ので、
  今回の修正で変わった点ではない
- 履歴の再生中（`history_flag` が真）はクロックの復元を飛ばすので、
  `active` がサーバとずれることがある。ずれたまま勝ちの局面を通ると
  余分な `stop_clock` が 1 通出るか、逆に出ないかのどちらかだが、
  次の通常の `gameinfo` で必ず揃うので発散しない

## 2. ほかに「受信処理の中から送信する」経路（依頼 2）— `set_turn()` だけ

確かめ方: `emit_msg(` の呼び出し 20 か所と、`.emit*()` を呼ぶ 40 か所を
機械的に洗い出し、`load_gameinfo()` から辿れるものだけを残した。

- `load_gameinfo()` が呼ぶのは
  `search_checker` / `point.add`（→ `move` / `set_z`）/
  `score[p].set` / `clock_limit.set` / `player_clock[p].stop|set|resume` /
  `set_clock_switch` / `player_name[p].set` / `cube.set` /
  `roll_btn[p].set`（→ `clear(emit=false)` / `off` / `Dice.set` /
  `closeout` / `pass_btn.on`）/ `set_turn` / `pip_count` / 音の `play`
- このうち emit を含むのは **`set_turn()` の `emit_stop()` だけ**。
  `set()` 系はどれも emit を持たず、送信は別名のメソッド
  （`PlayerName.emit()` / `PlayerScore.emit()` / `ClockLimit.emit_set()` /
  `Cube.emit()` / `RollButton.emit_dice()`）に分かれている。
  `RollButton.set()` が呼ぶ `clear()` の emit 引数は既定の `false`
- 残りの emit はすべて `on_mouse_*` / `apply_*` / ボタンの関数、つまり
  **利用者の操作からしか呼ばれない**

### ただし、別の形の副作用が 1 つある（**判断が要る**）

- **どこ**: `ytbg.js:1336`（`Cube.double()` の
  `this.board.player_clock[player].stop();`）
- **何が起きる**: ここは**サーバへ知らせずに自分の画面のクロックだけ**
  止めている。TODO-015 でその直後の `cube` の送信が `gameinfo` を返すように
  なったので、返ってきた `clock_state.active` で `resume()` され、
  **止めたはずのクロックがすぐ動き出す**
- **実測**: クロックを動かした状態で `board.cube.double(0)` を実行 →
  直後は `player_clock[0].active` が `false`、1.5 秒後
  （`cube` の `gameinfo` が届いたあと）は `true` に戻った
- **なぜ問題か**: ダブルを掛けた側の画面でクロックが止まらなくなる。
  変更前は（その画面だけとはいえ）止まっていた。
  なお `accept_double()` と `cancel_double()` は `change_turn()` を使って
  いて `emit_stop()` / `emit_start()` を送るので、こちらは影響を受けない
- **判断**: `Cube.double()` を `emit_stop()` に直すのが筋に見えるが、
  「ダブルを掛けた時点でクロックを止めるのが正しいのか」はルールの話なので
  利用者に確かめたい。TODO-015 の範囲外として別項目にする手もある
- これは「受信の中から送信する」形ではなく、**手元だけで変えた状態が
  返ってきた `gameinfo` で上書きされる**形。同じ形が他にないかも洗ったが、
  盤面・スコア・名前・ダイス・キューブはどれも emit と対で変えており、
  `free_move` と `disp_pip` は `gameinfo` に無いので影響を受けない。
  見つかったのは `Cube.double()` の 1 か所だけ

## 3. ドラッグ中の駒の直し方（依頼 3）— 妥当。穴は 1 つ

`ytbg.js:3618-3640`。配り直しの前に `moving_checker` の `x` / `y` / `z` を
控え、ループのあとで `move(x, y, true, 0)` と `set_z(z)` で戻す。

### 実測（point 6 の先端の駒を掴んで point 8 のあたりへ動かし、他クライアントから `set_playername` / `set_score` / 別の駒の `put_checker` を送った）

| 見たもの | 操作を受ける前 | 3 回受けた後 |
|---|---|---|
| `x, y` | 315, 198 | 315, 198 |
| `left, top` | 307px, 190px | 307px, 190px |
| `z` | 1000 | 1000 |
| `cur_point` | 6（`gameinfo` どおり） | 6（`gameinfo` どおり） |
| `point[6].checkers` | p000..p004 | p000..p004（並びも同じ） |
| 同 `z` | 0,1,2,3,1000 | 0,1,2,3,1000 |
| `transitionDuration` | 0s | 0s |

`point.checkers` の並びと `cur_point` は `gameinfo` どおりのまま、
見えている位置と重なり順だけが手元の値に戻っている。**狙いどおり。**
`add()` の `move(..., sec)` と戻しの `move(..., 0)` は同じ JS のタスクの中で
続けて実行されるので、途中の座標が描画されることはない（`0s` で確認）。

### 前回の見立ての訂正

前回この件を「見た目の乱れ」と書いたが、**行き先にも影響していた**。
離したときの行き先は `chpos2point(ch)`＝`ch.x` / `ch.y` だけで決まるので
（`ytbg.js:3748-3757`）、修正前は配り直しで `ch.x` / `ch.y` が定位置に
書き換わり、そのあとマウスを動かさずに離すと**元の point に落ちて手が
消える**ことがありえた。修正はその 2 つを掴んだ位置に戻すので、
こちらも直っている（コードでの確認。**掴んで離すところまでの通しは未確認**
＝ヘッドレスの座標系では `chpos2point()` が `undefined` を返し、
`emit_put_checker()` が例外になった。これは掴んだ位置がどの point の
`in_this()` にも入らなかったためで、差分とは関係ない）

### 穴（**検討**）

- `moving_checker` が `undefined` に戻らないまま残ると、**その駒だけ
  `gameinfo` で位置が直らなくなる**。`Board` には `on_mouse_up_xy()` の
  上書きが無く（基底の空実装）、マウスを離すのが盤の外だと
  `moving_checker` が残る
- 修正前は、次の `gameinfo` が来れば定位置に戻って自己修復していた。
  修正後は戻らないので、その駒は画面上に取り残される
- ただし `Board.on_mouse_move_xy()` が `moving_checker` を追従させるので、
  盤の上でもう一度離せば `Checker.on_mouse_up_xy()` が走って直る。
  実害は小さいと見るが、直すなら「`gameinfo` を受けたときに
  `moving_checker` の妥当性を見る」形になる（未確認）

## 4. 前回の検討 4・5（依頼 4）— 状況は変わらない

- **検討 4（操作 1 回ごとの重さ）**: 変わらない。今回の修正で増えたのは
  `load_gameinfo()` の座標の控えと戻し（数行）だけで、無視できる
- **検討 5（クロックの跳ね）**: 変わらない。前回の実測どおり localhost では
  巻き戻りは出なかった。ただし**依頼 2 で見つけた `Cube.double()` の件は、
  この「クロックは `clock_state` が唯一の正」という作りの裏返し**で、
  手元だけで変えたクロックの状態は必ず上書きされる

## 5. コメントと規約（依頼 5）— 沿っている

- 追加行に 79 桁（全角 2 桁換算）超えなし、行末の空白なし
- 新しいコメントは「なぜ」を書いている。特に `set_turn()` の
  ガードのコメントは、**なぜ `active` を見れば止まるのか**（サーバが
  `_clock_active` を偽にすると次の `clock_state` で `resume()` されない）と
  **踏んだ症状の実測値**（5 秒で 606 通）を残していて、同じ穴を
  もう一度掘らないための情報になっている
- 要修正 2 で直した 2 か所（`yt_backgammon_server.py:587-588`、`634-638`）は
  現状と合っている

## 6. テスト（前回の検討 6）

- `test_clock_ops_send_gameinfo_with_clock_state` にクロック 5 種が
  すべて入り、`resume_clock` で猶予が戻らないこと、`reset_clock` で
  `[120, 12]` に戻ること、`set_clock_switch` で `sw` が偽になることを
  見ている。**穴は埋まった**
- ただし `test_fallthrough_types_send_gameinfo_with_last_op` に足した
  3 件（`set_clock_switch` / `resume_clock` / `reset_clock`）の
  `get_value` / `value` は、**どれも初期値と同じ値**を見ているので、
  サーバの処理を壊しても落ちない。この 3 件で実際に効いているのは
  「`gameinfo` が 1 通」「`last_op` が受け取った msg」の 2 つだけ
  （中身は `test_clock.py` 側が見ているので**重複はしていない**）。
  コメントにそう書いてあるので誤解は無いが、期待値が「変わらないこと」で
  あることは、あとから読む人には分かりにくい（**好みの範囲**）
- 相変わらず**ループはサーバ側のテストでは捕まらない**ので、
  動作確認では「降参」「全部上がって勝負がつく」「勝負がついたあとに
  クロックを触る」を必ず触ること

## 7. 気づいた小さなこと（**好みの範囲**）

- `PlayerClock.start()` と `PlayerClock.reset()` は、TODO-015 で
  受信側の分岐を消したことで**呼び出し元が無くなった**
  （`start_clock` / `set_clock_limit` / `reset_clock` の受信で使っていた）。
  同じ動きはサーバの `start_clock` の分岐と `_reset_clock()` が持っている。
  消すかどうかは TODO-015 の範囲外でよい（`emit_reset()` は変更前から
  呼ばれていない）

## 確かめ方

前回と同じ手順（一時ディレクトリを `HOME` にしたサーバをポート 5099 で
起動し、`--user-data-dir` を分けたヘッドレス Chromium を CDP で操作、
観測用の WebSocket クライアントで `gameinfo` を数える）。
2 枚目のブラウザは `curl -X PUT http://localhost:9445/json/new?<url>` で開いた。
使ったスクリプトは一時ディレクトリのみに置き、リポジトリには入れていない。
起動したサーバとブラウザは終了済み、`~/ytbg-*.json` は 1〜4 のまま。
