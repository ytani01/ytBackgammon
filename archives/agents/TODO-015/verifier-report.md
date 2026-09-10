# TODO-015 確認担当の報告

コードは変更していない。`git diff` を保存 → 破壊 → 元に戻す作業のみ
（すべて `\cp` で退避・書き戻し）。

## 1. 検証コマンド

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 90 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 5 source files | 0 |
| `node --check src/ytbg/webroot/static/ytbg.js` | 出力なし | 0 |

いずれも通った。実装担当の報告と一致する。

## 2. `ws.onmessage` の分岐と `type` の突き合わせ

`ws.onmessage`（`ytbg.js:4276-`）は `gameinfo` 以外の分岐を持たない
（`grep -n 'msg.type =='` で確認、他に無し）。

サーバ `on_json()` の `type` は 22 種:
`back / back2 / back_all / fwd / fwd2 / fwd_all / new / set_gameinfo`
（8 種、いずれも早期 `return`。`emit_gameinfo()` を自分で呼び、
`last_op` は渡していない＝`None`） ＋
`put_checker / cube / dice / set_turn / set_playername / set_score /
resign / set_clock_limit / set_player_clock / set_clock_switch /
start_clock / resume_clock / stop_clock / reset_clock`（14 種、
末尾まで落ちて `emit_gameinfo(sec, history_flag=False, last_op=msg)`）。

クライアントが `last_op.type` で演出を出しているのは `put_checker`
（put/hit 音）、`dice`（回転と音）、`set_turn`（turn_change 音、
`set_turn()` の第 3 引数）の 3 種だけで、これは着手時の設計どおり。
残り 11 種（`cube` 含む）は元々演出（音）が無い操作で、取りこぼしは無い。
`cube` について `Cube.set()` は 3 引数しか取らず、消えた第 4 引数
`false` は元から読まれていなかったことをソースで確認した
（`grep -n "set(val" ytbg.js` → `Cube.set(val, player, accepted)`）。

`resign` は元々クライアント側に分岐が無く、今回も `last_op` を
使った専用演出は追加されていない。ただし `gameinfo.resign` が
`set_turn()` に渡るため、**resign 時の画面表示（`resign_banner_btn`）が
今回から効くようになった**（実装担当の報告どおり、挙動が増える方向の
変化）。これは「取りこぼし」ではなく逆に**新しく動くようになった**もので、
良いか悪いかの判断はレビュー担当の領分と考え、ここでは事実だけ報告する。

## 3. 消した 13 個の分岐の行き先

`git diff` で消えた 13 分岐（`put_checker cube dice set_turn
set_playername set_score set_clock_switch set_clock_limit
set_player_clock resume_clock start_clock stop_clock reset_clock`）を
1 つずつ `load_gameinfo()` 側に対応させて確認した。実装担当の対応表と
一致する。特に指示された 4 点:

- **`put_checker` の音（put/hit の出し分けと `turn == -1`）**:
  `load_gameinfo()` 末尾（`ytbg.js:3683-3693`）に
  `if (put_ch !== undefined && this.turn != -1) { p>=26 && prev<26 なら hit
  そうでなければ put }` があり、消えた分岐（`board.turn == -1` で
  ignore、`p>=26` を `put_checker()` の中で判定していた元の形）と同じ
  結果になる。`put_prev_p` を「チェッカーを配り直す前」に控えている点も
  確認した（配り直した後だと常に新しい point になり hit 判定が壊れる。
  順序は正しい）
- **`dice` の回転（`roll` フラグ）と音**: `roll_player` の算出
  （`op_type == "dice" && last_op.data.roll && gameinfo.turn != -1`）が
  元の `if (board.turn == -1) return;` と `msg.data.roll` を `set()` の
  第 2 引数に渡していた形を引き継いでいる。`roll_btn[p].set(d[p],
  roll_player == p)` で両方の dice に渡している点も正しい
- **`set_turn` の turn_change の音**: `set_turn()` 自身
  （`ytbg.js:3161` 付近）が `if (turn != prev_turn && sound)` で鳴らすので、
  `load_gameinfo()` は `sound` 引数（第 3 引数）を
  `op_type == "set_turn"` にするだけでよい。実際に鳴るかどうかの
  「turn が変わったか」判定は `set_turn()` の中にあり、二重判定には
  なっていない
- **クロック 5 種（`clock_state` だけで足りているか）**:
  `load_gameinfo()` の `history_flag` が偽のとき、`clock_state` が
  あれば `set_clock_switch` → 各 player の `stop()` → `set()` →
  `active[p]` なら `resume()` という処理（TODO-016 由来、今回の diff
  対象外）で、消えた 5 分岐（`set_clock_switch` /
  `start_clock` / `resume_clock` / `stop_clock` / `reset_clock`）の
  結果を再現する。この部分は TODO-015 の diff には含まれておらず、
  TODO-016 で既にできていたものをそのまま使っている、という実装担当の
  説明どおり

## 4. テストの実効性（わざと壊す）

`git diff --stat` は各回の作業後に元の内容と一致することを確認した
（作業前後で完全に同一）。

- **`emit_gameinfo()` の `last_op` を常に `None` にする**
  → `11 failed, 79 passed`。落ちたテストは
  `test_put_checker_sends_gameinfo_with_last_op`、
  `test_fallthrough_types_send_gameinfo_with_last_op`（9 通り）、
  `test_clock_ops_send_gameinfo_with_clock_state` の 11 件で、狙いどおり
- **`sec` を常に 0 にする**
  → `2 failed, 88 passed`。落ちたのは `put_checker` に関する 2 件
  （`test_put_checker_sends_gameinfo_with_last_op` と
  `test_fallthrough_types_send_gameinfo_with_last_op[put_checker-...]`）で、
  狙いどおり
- **`put_checker` の音の分岐を消す（JS 側）**
  → `node --check` は通り、`uv run pytest` も `90 passed` のまま
  **1 件も落ちない**。CLAUDE.md にあるとおり「クライアントの JS は
  テストしていない」ため、これは想定どおりで、実装のテストの不備では
  ない。ただし**この演出（put/hit の音）を壊しても自動検証では気づけない
  ことを意味する**。ブラウザでの確認が唯一の検証手段（下記 6 に手順）

いずれも作業後に `git diff --stat` が元と同一であることを確認して
書き戻した。

## 5. テストの中身（骨抜きになっていないか）

`tests/test_on_json.py`:

- `test_put_checker_sends_gameinfo_with_last_op` と
  `test_fallthrough_types_send_gameinfo_with_last_op`（9 種
  parametrize）は、`sent['type'] == 'gameinfo'` だけでなく
  `last_op == expected`、`gameinfo` 内の該当フィールドの値
  （`get_value(gameinfo) == value`）、`put_checker` のみ `sec == 0.2`
  まで見ている。「送られたことだけ」ではなく中身を見ている
- `test_returning_types_do_not_broadcast_original_msg` に
  `last_op is None` の確認が足された（範囲拡大、弱化ではない）
- `test_emit_gameinfo_message_shape` はキー集合に `last_op` を足し、
  直接呼びでは `None` になることを確認。旧テストの意図
  （キーの網羅）を保ったまま拡張されている

`tests/test_clock.py`:

- `test_clock_state_carries_current_clock` に `last_op is None` の
  確認を追加（拡大）
- 新設の `test_clock_ops_send_gameinfo_with_clock_state` は
  `start_clock` → `stop_clock` の 2 手を発行し、`last_op.type` と
  `clock_state.active` / `clock_state.clock` の値まで見ている。
  「gameinfo が送られたことだけ」ではない

弱くなった箇所は見つからなかった。ただし、消えた旧テスト
`test_put_checker_broadcasts_msg` /
`test_fallthrough_types_broadcast_the_received_msg` が検証していた
「受け取った msg をそのまま転送する」という**性質そのものは、もう
テストされていない**（仕様が変わったので当然だが、念のため記す）。

## 6. 確かめられなかったこと・判断が要ること

- **ブラウザでの実機確認はしていない**（担当の範囲外、指示どおり main /
  利用者へ回す）
- **`put_checker` の音（put/hit）は自動検証の対象外**なので、壊れても
  テストでは気づけない。ブラウザでの確認が実質的に唯一の検証手段
- **resign 時に `resign_banner_btn` が新しく表示されるようになる点が
  「良い変化か」は判断できない。** 事実として挙動が増えることは確認したが、
  それが意図どおりかはレビュー担当・利用者の判断が要る

## 利用者に試してもらう手順（ブラウザ）

1. `./ytbg.sh -d -p 5001 -i images1a 1` でサーバを起動し、2 つのタブで
   `http://localhost:5001/p1` と `/p2` を開く（先行適用の影響を見るため、
   操作する側とされない側を別タブにする）
2. **チェッカーを動かす**: 駒を 1 つ動かす。動かした側の画面でも、
   もう片方の画面でも put の音が鳴ること。相手の駒がいる point に
   乗せて hit させ、hit の音（put と違う音）が鳴ること。turn が
   `-1`（操作不可）の局面で操作したとき、音が鳴らないこと
   （盤面は元々動かせないはずなので、ここは通常は起きない想定）
3. **サイコロを振る**: dice ボタンを押し、振ったプレーヤー側の dice が
   回転して音が鳴ること。**もう片方の dice は回転しない**こと
   （`roll_player` はそのプレーヤーだけ）
4. **手番が変わる**: 手を打ち終えて turn が変わったとき、turn_change の
   音が鳴ること。同じ turn のまま `gameinfo` が送られる操作（例:
   `set_playername`）では鳴らないこと
5. **クロック**: 画面上の Clock を on にし、`start` / `stop` /
   `resume` / `reset` ボタンと、スイッチの on/off、`clock_limit` の
   変更を一通り操作。両方のタブで残り時間が同じように増減・停止し、
   `set_clock_limit` を変えたとき両プレーヤーの時計が
   `clock_limit` へ戻って止まること
6. **resign**: 片方が resign し、`resign_banner_btn`（降参の表示）が
   出ること。これは今回の変更で新しく動くようになった経路なので、
   特に注意して見てほしい

## 再確認（レビュー指摘の修正後）

コードは今回も変更していない。壊す作業は毎回 `\cp` でスクラッチ
（`/tmp/claude-.../scratchpad/*.bak2`）へ退避してから編集し、書き戻した。

### 1. 検証コマンド

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 93 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 5 source files | 0 |
| `node --check src/ytbg/webroot/static/ytbg.js` | 出力なし | 0 |

93 件（前回 90 + 新設 3）で、実装担当の報告と一致。

### 2. `set_turn()` の無限ループ修正

`ytbg.js:3143-3160` で、`winner >= 0` のとき
`if (this.player_clock[winner].active) { this.player_clock[winner].emit_stop(); }`
に変わっていることを確認した。コメントに書かれている理屈
（`load_gameinfo()` が毎回 `set_turn()` を呼ぶ → 無条件だと勝ち局面のたびに
`stop_clock` を送り直す → `stop_clock` は turn も resign も変えないので
止まる条件が無い → サーバが `_clock_active` を false にすると次の
`clock_state` で `resume()` されなくなり 1 巡で収まる）は、
`yt_backgammon_server.py` の `stop_clock` 分岐（`_clock_active[player] =
False`）と `load_gameinfo()` のクロック復元部（`clock_state.active[p]` が
真のときだけ `resume()`）を突き合わせて、筋が通っていることを確認した。

ブラウザでの実測は実装担当の報告に実測値（519→0、動作中クロックは2で収束）
があり、確認担当としては**自動テストが無いことを承知のうえで数値を鵜呑みに
した**。実測そのものの再現はしていない（下記「確かめられなかったこと」）。

### 3. ドラッグ中のチェッカーの座標を戻す修正

`load_gameinfo()` の配り直しループ（`for (let e of ch_list) { ...
this.point[e.point].add(e.ch, sec); }`）は変わっておらず、`moving_checker`
を含む**全チェッカー**がこのループを通ることを確認した。`BoardPoint.add()`
（`ytbg.js:3881-3897`）は無条件に `ch.cur_point = this.idx` と
`this.checkers.push(ch)` を行うので、`point.checkers` の並びと
`cur_point` は `gameinfo` どおりのまま——**掴んでいる駒も含めて、配り直しの
結果は変わっていない**。

追加されたのはループの前後だけで、ループ前に
`mv_pos = {x: mv_ch.x, y: mv_ch.y, z: mv_ch.z}` と現在の見た目の座標を
控え、ループ後に `mv_ch.move(mv_pos.x, mv_pos.y, true, 0)` と
`mv_ch.set_z(mv_pos.z)` で**見た目の位置と z だけ**を上書きしている。
`BgBase.move()` / `set_z()`（`ytbg.js:154-172`）はそれぞれ `this.x`/`this.y`
と CSS の `left`/`top`、`this.z` と CSS の `zIndex` を書き換えるだけで、
`cur_point` にも `point.checkers` にも触れない。したがって
**「掴んでいる駒の座標だけを戻す」という設計どおり**で、配り直しの結果
（並び・`cur_point`）を壊していないことをソースレベルで確認した。

TODO-017 の「idx が 15 以上でも置き去りにならない」性質は、`ch_list` を
`idx` でソートして全チェッカーを回すという元のループがそのまま残っている
ため保たれている（今回の diff はループの前後に処理を足しただけで、
ループ自体の中身・順序は変えていない）。

### 4. 追加テスト 3 件（`resume_clock` / `reset_clock` / `set_clock_switch`）の実効性

サーバの該当行を 1 つずつ壊し、`uv run pytest` で狙ったテストが落ちることを
確認した（すべて確認後 `\cp` で書き戻し、`git diff --stat` が元と同一である
ことを確認済み）。

- **`resume_clock`**: `self._clock_active[player] = True` を `False` に
  変更 → `2 failed`
  （`test_resume_clock_keeps_remaining_delay`,
  `test_clock_ops_send_gameinfo_with_clock_state`）
- **`reset_clock`**: `self._reset_clock(msg['data']['player'])` を
  `pass` に変更 → `2 failed`
  （`test_reset_clock_restores_limit_and_stops`,
  `test_clock_ops_send_gameinfo_with_clock_state`）
- **`set_clock_switch`**: `self._clock_sw = msg['data']['switch']` を
  `self._clock_sw = True` の固定に変更 → `3 failed`
  （`test_set_clock_switch_updates_flag`,
  `test_clock_does_not_advance_while_switch_off`,
  `test_clock_ops_send_gameinfo_with_clock_state`）

いずれも `tests/test_clock.py` 側の `test_clock_ops_send_gameinfo_with_clock_state`
が確実に検知した。`tests/test_on_json.py` に足された 3 つの parametrize
（`set_clock_switch` / `resume_clock` / `reset_clock`）は
「`gameinfo` 側の値が変わらないこと」だけを見ているため、上の 3 つの
壊し方では単独では落ちなかった（`_clock_sw` や `_clock_active` は
`gameinfo` に入らない値なので当然で、テストのコメントにも「状態は
`clock_state` で送られる。そちらは `tests/test_clock.py`」と明記されて
おり、意図どおりの役割分担）。

作業後、最終的な `git diff --stat` は変更前と同一であることを確認した
（`CLAUDE.md` 12、`ytbg.js` 185、`yt_backgammon_server.py` 27、
`test_clock.py` 60、`test_on_json.py` 99 の各 diff 行数）。

### 5. 前回の報告との整合

前回の報告（##1〜6）の内容はいずれも今回の修正で変わらない。
`ws.onmessage` の分岐一覧、消した分岐の対応、`resign` の挙動変化の指摘は
そのまま有効。今回変わったのは、13→13（分岐の数は同じ）で
「set_turn の勝ち判定」と「ドラッグ中の駒」という**新たに見つかった副作用の
修正**であり、分岐の対応表そのものへの影響は無い。

### 6. ブラウザで試してもらう手順（更新・降参と勝負がついたときを追加）

1. `./ytbg.sh -d -p 5001 -i images1a 1` でサーバを起動し、2 つのタブで
   `http://localhost:5001/p1` と `/p2` を開く
2. **チェッカーを動かす**: put / hit の音、`turn == -1` で鳴らないこと
3. **サイコロを振る**: 振った側だけ回転・音が鳴ること
4. **手番が変わる**: turn_change の音
5. **クロック**: `start` / `stop` / `resume` / `reset` / スイッチ /
   `clock_limit` 変更が両タブで揃うこと
6. **降参したとき**: 片方の画面で降参操作をし、両方のタブで
   `resign_banner_btn`（降参の表示）が出て、動いていたクロックが
   止まったまま増減しないこと。**5 秒以上放置して、`gameinfo` が
   延々と送られ続けない（ブラウザの開発者ツールの Network で `ws` の
   フレーム数が増え続けない）ことを確認する**（レビュー指摘の無限
   ループが起きていた条件そのもの）
7. **全部上がって勝負がついたとき**: 一方の 15 枚を全部ゴールへ運び、
   勝敗がついた状態にする。`win_btn` が出て、動いていたクロックが
   止まること。ここも **6 と同じく、5 秒以上放置して `gameinfo` の
   フレームが増え続けないことを確認する**（実装担当の実測では、この
   条件で 5 秒間に 519 通送られていた不具合の直接の再現条件）
8. **ドラッグ中に他人が操作したとき**: 片方のタブで駒を掴んだまま
   （ドロップせずマウスボタンを押したまま）、もう片方のタブで
   `set_playername` など別の操作をする。掴んでいる駒が定位置へ
   瞬間移動しない（元の位置に留まる）ことを確認する

### 7. 確かめられなかったこと・判断が要ること（再確認分）

- **無限ループ修正の実測はしていない。** 実装担当の実測表（519→0 など）は
  ソースコードの筋を追って矛盾が無いことは確認したが、確認担当自身では
  ブラウザ／ヘッドレス環境での再現はしていない。**上の手順 6・7 は
  利用者に実際に確認してほしい最重要項目**
- **`set_turn()` の修正がクロック未使用時にも効くか**は、コードの分岐上
  `player_clock[winner].active` が初期状態で false であれば
  `emit_stop()` 自体呼ばれないので問題は起きないはずだが、これも
  実機での確認はしていない

## Cube.double() の修正の確認

コードは変更していない。

### 1. 検証コマンド

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 93 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 5 source files | 0 |
| `node --check src/ytbg/webroot/static/ytbg.js` | 出力なし | 0 |

main の手元の数値と一致。

### 2. `change_turn()` の 3 通を追った

`ytbg.js:692-697`:
```
change_turn() {
    this.emit_stop();
    this.emit();
    this.board.player_clock[1-this.player].emit_start();
}
```
`emit_stop()` → `stop_clock`、`emit()` → `set_player_clock`（今のクロック値を
添える）、`emit_start()` → `start_clock` の 3 通で、`Cube.double(player)` から
呼ぶと `player_clock[player].change_turn()` なので、**ダブルを掛けた
`player` を止め、相手 `1-player` を動かす**。

サーバ側は 3 つとも既存の分岐（`stop_clock` / `set_player_clock` /
`start_clock`、TODO-016 由来、今回の diff 対象外）で処理し、それぞれ
`emit_gameinfo()` で `clock_state` を全員へ返す。他のクライアントも
同じ `clock_state`（`active` と `clock`）を受け取って
`load_gameinfo()` の中でクロックを合わせるので、**掛けた本人の画面と
他の画面で状態がずれることは無い**。

**無限ループにならないか**: `grep -n "change_turn("` で呼び出し箇所を
すべて洗った。定義 1 箇所（692 行）と、呼び出し 5 箇所
（`Cube.double` 1340 行、`Cube.accept_double` 1350 行、
`Cube.cancel_double` 1365 行、`PassButton.on_mouse_down_xy` 1959 行、
サイコロのボタン相当の `on_mouse_*` 2198 行）で、**いずれもマウス操作の
ハンドラの中**。`Board.load_gameinfo()`（`ws.onmessage` の唯一の受け口）
の中には `change_turn()` の呼び出しは無い。**「`change_turn()` は
`on_mouse_*` からしか呼ばれず `load_gameinfo()` からは呼ばれない」という
理解は正しい。**

### 3. `accept_double()` / `cancel_double()` との組み合わせ

両方とも今回の diff の対象外で、もともと `change_turn()` を使っている
（`accept_double()`: `player_clock[1-this.board.turn].change_turn()`、
`cancel_double()`: `player_clock[this.player].change_turn()`）。

`double(player)` は `board.turn` を変えず、`this.player`（cube 側が持つ
「今どちらの手番か」相当の値）だけを `1-player` にする。追った限り:

- **double → accept**: `double(player)` で `player` を止め `1-player` を
  動かす。`accept_double()` は `1-board.turn`（= 元の doubler と同じ、
  `board.turn` は変わっていないので `player` 側）を `change_turn()` する
  ことになり、doubler を再開・receiver を止める。時間の受け渡しが
  「掛けた側 → 受けた側が検討 → 受け入れたら掛けた側に戻る」という
  ルールどおりに一往復する
- **double → cancel**: `cancel_double()` は `this.player`（= double() が
  `1-player` にセットした receiver 自身）を `change_turn()` する。
  受けた側が断るときに自分のクロックを止め、相手（doubler）を動かす形で、
  こちらも辻褄が合う

**このコードだけを読んでの確認**であり、実機で accept / cancel まで
一通り試したわけではない（下記「確かめられなかったこと」）。今回
`double()` 単体を `change_turn()` に揃えたことで、3 つの動きが
同じパターン（呼んだ側を止め、対応する相手を動かす）に揃ったこと自体は
確認できた。

### 4. ヘッドレスでの実測

`/tmp/verify064/node_modules/playwright`（既存の node 環境、バージョン
1.62.1）を使い、ポート 5009・`server_id` `zz9`、`HOME` を
scratchpad 配下の一時ディレクトリにして起動。1 枚だけ開いたページの中で
`board.cube.double(0)` を実行し、前後の `player_clock[].active` を
測った。

| タイミング | `player_clock[0].active` | `player_clock[1].active` |
|---|---|---|
| double() 前（player0 を `start_clock` 済み） | `true` | `false` |
| double() 直後（300ms 後） | `false` | `true` |
| **1500ms 後** | **`false`**（元に戻らない） | **`true`**（動いたまま） |

ダブルを掛けた player0 のクロックが止まったまま、相手 player1 のクロックが
動き出し、**1.5 秒待っても player0 が `true` に戻らない**ことを確認した
（レビュー担当が変更前に見つけていた不具合は再現しない）。

受信した `gameinfo` の `last_op.type` の並びは
`start_clock(0)`（テスト準備） → `stop_clock(0)` →
`set_player_clock(0)` → `start_clock(1)` → `cube` の
5 通のみで、その後は何も届かず**メッセージが際限なく増え続けることは
無かった**（無限ループの兆候なし）。

作業後、起動したサーバ（PID 1032720）と `uv run`（PID 1032715）を
`ps -p` で確認してから kill し、両方とも `ps -p` で消えたことを確認した。
`HOME` を一時ディレクトリに切り替えて起動したため、利用者の
`~/ytbg-1..4.json` は触れておらず、一時ディレクトリの
`ytbg-zz9.json` も削除した。ポート 5009 は `ss -tlnp` で使用中の表示が
無いことを確認した。

### 5. 確かめられなかったこと

- **`accept_double()` / `cancel_double()` の実機確認はしていない。**
  コードを読んでの筋の確認のみ（上記 3）。時間があれば、
  double → accept、double → cancel の 2 パターンもヘッドレスで
  クロックの `active` を測るのが望ましい
- **複数クライアント間での見え方の一致**（掛けた本人の画面と、
  観戦者側の画面で `clock_state` が同じに揃うか）は、今回は 1 ページ
  だけで確認した。TODO-015 の前回確認で `clock_state` の同期は
  別途確認済みなので重複しては見ていない
