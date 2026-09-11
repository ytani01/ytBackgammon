# TODO-030 implementer の報告

表示更新の経路を 1 本にする（`Board.apply()`）。

## いまの作業ツリーの状態

**実装・テスト・文書とも終わっている。残作業は無い。** コミットはしていない。

```
 M CLAUDE.md                                  「状態と通信」に追記
 M src/ytbg/webroot/static/js/board.js        apply() / predict_gameinfo()
 M src/ytbg/webroot/static/js/ui/checker.js   on_mouse_up_xy() の先行実行
?? tests/browser/predict.test.mjs             新しく足した (4 件)
?? archives/agents/TODO-030/                  この報告
?? .codegraph/                                索引 (触っていない)
```

わざと壊した版は残っていない（`git status` と
`grep -rn BROKEN src tests` で確認。控えは scratchpad に取り、
そこから戻した。`git checkout` / `restore` / `stash` は使っていない）。

## 変更したファイルと箇所

### `src/ytbg/webroot/static/js/board.js`

| 箇所 | 内容 |
|------|------|
| `apply()` (869) | 旧 `load_gameinfo()` の中身。**表示を変えるのはここだけ** |
| `apply()` の clock の節 (977) | `clock_state` が無いときはクロックに触らない |
| `load_gameinfo()` (1055) | `apply()` へ渡すだけの入口になった |
| `predict_gameinfo()` (1083) | 新規。動かしたあとの gameinfo を作る |
| `emit_put_checker()` (1148) | `idx` を渡せるようにした（省くと今までどおり表示から数える） |
| `put_checker()` (1173) | 予測を作って `apply()` へ渡すだけになった |

### `src/ytbg/webroot/static/js/ui/checker.js`

`on_mouse_up_xy()` (320-413)。`put_checker()` の直呼びをやめ、
予測 → 送信 → `apply()` → 表示以外、の順に組み直した。

### `CLAUDE.md`

「状態と通信」に、表示更新の経路が `apply()` 1 本になったことと、
先行実行の仕組み（予測の作り方、ヒットの 2 手ぶん、`clock_state` と
`last_op` を渡さない理由、ダイスの `disable()` を `apply()` のあとで
行う理由）を書いた。`load_gameinfo()` を指していた 2 か所も直した。

## `apply()` の形

```js
apply(gameinfo, {sec=2, history_flag=false,
                 clock_state=undefined, last_op=undefined} = {})
```

中身は TODO-017 以降の `load_gameinfo()` そのままで、変えたのは
**クロックの節だけ**。`clock_state` が `undefined` のときは
`clock_limit.set()` も `player_clock[p].stop()/set()/resume()` も
呼ばない。予測のたびにクロックへ触ると、動いているクロックが
「最後にサーバから届いた残り時間」から数え直しになるため。

`load_gameinfo(gameinfo, sec, history_flag, clock_state, last_op)` は
**残した**。ws から届く gameinfo の入口で、並びの引数を名前付きに直して
`apply()` へ渡すだけ（中身は持たない）。消さなかった理由は下の
「判断が要る点」。

## 予測した gameinfo の作り方（`predict_gameinfo(moves)`）

`moves` は `[{ch: Checker, p: point}, ...]` を**動かす順**に並べたもの。

1. `this.gameinfo`（`apply()` が最後に受け取ったもの）を
   `JSON.parse(JSON.stringify(...))` で複製する。
   **`sn` は触らない。** 予測はサーバの通し番号を進めない
2. `Position.from_gameinfo()` で盤面を作り、1 手ごとに
   - `idx = pos.count(mv.p)`（移す前の、そのポイントの枚数）
   - `pos = pos.with_move(ch.cur_point, mv.p, ch.player)` で
     **動かせるかを確かめる**（駒が無ければ例外。TODO-027）
   - `gameinfo.board.checker[player][ch_i] = [mv.p, idx]`
     （`ch_i` は `ch.id` から。**チェッカーの ID で書き換える**。
     `with_move()` が動かすのは「そのプレーヤーの先端の 1 枚」で、
     UI が掴んでいる駒とは限らないため、確認と枚数の勘定だけに使う）
3. 最後に `gameinfo.board.dice` を
   `[roll_btn[0].get(), roll_btn[1].get()]` で**画面の値に差し替える**。
   使ったダイスの `disable()` は先に画面へ入り、サーバへ届くのは
   そのあとなので、**土台の gameinfo の dice は画面より古いことがある**。
   差し替えないと、`apply()` が使用済みのダイスを使える状態に戻してしまう

**ヒットのときは 2 手ぶん**（相手をバーへ、自分を移動先へ）を
1 回の `predict_gameinfo()` に渡す。順に処理するので、2 手目の `idx` は
「相手が抜けたあとの枚数」になり、TODO-030 より前に
`put_checker()` してから数えていた値と同じになる。

サーバへ送る `put_checker` の `idx` も、この予測から読む
（`emit_put_checker(ch, p, add_hist, idx)`）。**送るメッセージは
TODO-030 より前と同じ**で、テストで値ごと押さえてある。

`predict_gameinfo()` が例外を投げたときは、`on_mouse_up_xy()` が
ログに出して**先行実行をあきらめる**（表示はサーバから届く gameinfo で
決まる）。例外を外へ投げると、掴んだままの状態で操作が止まる。

## 先行実行の中の「表示以外」をどこで呼ぶようにしたか

`on_mouse_up_xy()` の順番（README の 4 番）:

1. `hit_ch` の判定（TODO-030 より前と同じ）
2. `moves` を組む（ヒットがあれば 2 手ぶん）→ `predict_gameinfo()`
3. `emit_put_checker()` を `moves` の順に送る（`idx` は予測から）
4. **`dice_check(active_dice, ch.cur_point, dst_p)`** ←★ `apply()` より前
5. `this.board.moving_checker = undefined` → `apply(predicted, {sec: 0.2})`
6. **使ったダイスの `disable()`** ←★ `apply()` のあと
7. `roll_btn.check_disable()` → `roll_btn.get()` → `winner_is()` →
   `emit_msg("dice", ...)` / `emit_turn(-1, -1)` / `score.up()`

理由:

- **4 を前にする**のは、`dice_check()` が `ch.cur_point`（移動元）を
  見るため。`apply()` はチェッカーを配り直して `cur_point` を
  移動先に変えるので、あとで呼ぶと使ったダイスの目がずれる
- **6 を後にする**のは、`apply()` が dice を gameinfo の値に戻すため。
  先に `disable()` すると使用済みが消え、7 で送る `dice` メッセージも
  使える状態のまま送られてしまう（壊して確かめた。下の 4 番）
- **7 はすべて `apply()` のあと**。`check_disable()` も `winner_is()` も
  「置いたあとの盤面」を見るので、TODO-030 より前（`put_checker()` の
  あと）と同じ位置になる
- 5 で `moving_checker` を先に外すのは、`apply()` が
  **掴んでいるチェッカーを手元の座標へ戻す**ため（TODO-015）。
  外さないと、離した駒がカーソルの位置に残る。
  `moving_checker` はこのあと誰も見ないので、末尾にあった
  同じ代入は消した。free move の早期 return はそのまま

**free move は今までどおり先行実行しない**（emit して return）。

## 消した二重実装

- `Board.put_checker()` — チェッカーの付け替え・座標・pip・closeout の
  判定を自前で持っていた。いまは
  `predict_gameinfo()` → `apply()` を呼ぶだけ。音は
  `last_op`（`sound` が true のときだけ組み立てる）から `apply()` が出す
- `Board.load_gameinfo()` — 中身は `apply()` へ移り、引数を名前付きに
  直して渡すだけになった

つまり**配置・pip・バナー・音の実装は `apply()` の 1 か所だけ**になった。

## 足したテスト

`tests/browser/predict.test.mjs`（4 件）。既存の `board.test.mjs` /
`clicks.test.mjs` のドラッグは free move なので先行実行を通らない。
ページは 1 枚だけ開く（他のテストと CPU を取り合うため）。

1. **サーバの応答が無くても、離した瞬間に表示が変わる** —
   `WebSocket.prototype.send` を止めてから point 6 の先端を
   ワンタッチでムーブ。移動先・両ポイントの枚数・pip（167 → 164）・
   予測した gameinfo の `[3, 0]`・**`sn` が進んでいないこと**・
   ダイスが使用済み（`[13,0,0,0]`、active は空）・
   `apply()` が 1 回だけ（`last_op` も `clock_state` も無い）・
   送ったメッセージ（`put_checker {ch,3,0,false}` と
   `dice {0,[13,0,0,0],false,true}`）を見る
2. **ヒットのときは 2 手ぶん動かし、2 本送る** — 相手のブロットを
   置いてから同じムーブ。先行実行の時点で自分が 3、相手が 27（バー）に
   居ること、送ったのが `[100,27,0]` → `[ch,3,0]` の順であること、
   サーバの返事でも同じ盤面になることを見る
3. **予測が外れても、サーバの gameinfo で表示が戻る** —
   `board.predict_gameinfo()` を包んで**わざと外し**（移動先を 20 に
   すり替える）、先行実行が 20 に描いたことを確かめたうえで、
   サーバから届く gameinfo で 3 に戻り、20 が空になることを見る
4. コンソールエラーが出ていない

先行実行とサーバの返事を取り違えないように、`board.apply()` を包んで
「呼ばれたときの盤面」を貯め、1 回目（予測）を名指しで見ている。

## 検証の結果

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 終了コード 0。211 passed |
| `uv run ruff check .` | 終了コード 0 |
| `uv run mypy src` | 終了コード 0 |
| `node --test tests/js/` | 終了コード 0。59 件、警告 0 |
| `node --test tests/browser/` | 終了コード 0。**43 件**（39 + 新しい 4 件）。**3 回続けて** |

**既存の 39 件は 1 行も変えていない**（`tests/browser/` も `tests/js/` も）。

なお `clicks.test.mjs` の「スコアの ▲ → set_score」は、ページを 3 枚
開いていた版の predict.test.mjs で 1 度落ちた（README 7 番の、前から
ときどき落ちるもの）。predict.test.mjs を 1 ページに減らしてからは、
上の 3 回とも落ちていない。

## わざと壊して確かめた結果

**6 通り、それぞれ 10 回続けて落ちることを確かめた**（10/10。
「通ってしまった」は 0）。**うち 4 つが先行実行を狙ったもの**。
壊し方と戻し方は scratchpad の `break/patch.py` で行い、
`git checkout` などは使っていない。

| # | 壊し方 | 落ちたテスト | 結果 |
|---|--------|--------------|------|
| 1 | `predict_gameinfo()` が checker を書き換えない（予測を作らない） | predict の 3 件 | 10/10 |
| 2 | `on_mouse_up_xy()` が `apply(predicted)` を呼ばない（予測を反映しない） | predict の 3 件 | 10/10 |
| 3 | ヒットの 1 手ぶんを `moves` に積まない | predict の 2 件 | 10/10 |
| 4 | ダイスの `disable()` を `apply()` より**前**へ動かす | predict の 3 件 | 10/10 |
| 5 | `emit_put_checker()` の `idx` を予測から取らず表示から数える | predict の 2 件 | 10/10 |
| 6 | `put_checker()` が `apply()` を呼ばない | `rules.test.mjs` の「pip の表示が、計算し直した値になる」 | 10/10 |

4 番については、最初に**「前へ動かす」ではなく「前にも足す」**という
壊し方をしてしまい、10 回とも通ってしまった。`apply()` のあとの
`disable()` が残っていて結果が同じになるためで、**壊し方の誤り**。
`apply()` より前へ**移す**形に直したら 10/10 で落ちた。
1〜5 は、テストを 1 ページ構成に直したあとの版で取り直してある。

## 判断が要る点・範囲外だが気づいたこと

1. **`load_gameinfo()` と `put_checker()` を消さなかった。**
   README 1 番は「`put_checker()` は消す」だが、どちらも既存の
   `tests/browser/` が名指しで使っており、消すと**テストを直すことに
   なる**（`clicks.test.mjs:48` が `board.load_gameinfo` を包んで
   `settle()` の目印にしている。`rules.test.mjs:92` が
   `board.put_checker()` を直に呼ぶ）。「1 行も変えずに通す」を優先し、
   **中身を `apply()` へ移して薄い口として残した**。二重実装は消えている。
   消すなら、テストを直す項目として別に立てるのがよい
2. **`put_checker()` は、いま `src/` の中から呼ばれていない**
   （呼ぶのは `rules.test.mjs` だけ）。1 の判断次第で、
   テストごと整理できる
3. `put_checker(..., sound=true)` の音は、`apply()` を通すようになった
   ぶん **`turn == -1` のときは鳴らなくなった**（`apply()` の音は
   turn を見る。TODO-015）。`src/` からは `sound=false` でしか
   呼ばれていないので、実際の動きは変わらない
4. **`get_dst_points()` / `get_dst_point1()` / `all_inner()` は
   触っていない**（README 5 番のとおり）。`Position` を使えば
   `board.point[]` を見ずに書けるが、別項目にする話
5. `apply()` は毎回 dice を `gameinfo` の値に戻すので、**「画面の方が
   新しい値」を持つものは、予測でも写す必要がある**。今は dice だけ。
   同じ性質のものを足すときは `predict_gameinfo()` の末尾も直すこと
6. **連続してムーブすると、予測は 1 つ前の予測の上に積まれる**
   （`this.gameinfo` が予測で置き換わるため）。サーバの返事が届けば
   上書きされるので、ずれても自然に直る。3 番のテストで、
   ずれた状態から戻ることを押さえてある

---

# reviewer の指摘に対応した（追記）

main から渡された 3 件。**要修正は 0 件だったが、1 の実測で
「送るメッセージが変わる」場面が見つかったので直した。**

## 1. B-2 の実測 —— **飛んだ。直した**

### 何を作ったか

`set_turn()` の `turn < 0` かつ勝者がいる枝（`board.js:604` あたり）が、
`player_clock[winner].emit_stop()` を**送る**。予測でここを通るかを、
実サーバ＋chromium で作って確かめた
（scratchpad の `exp_b2.mjs` / `exp_b2b.mjs`）。

手順（`exp_b2b.mjs`。**ページは 1 枚**）:

1. 仕込み: player0 の 15 枚を全部ゴール（point 0）へ送り、
   `turn = 1`、player1 に `dice = [3,0,0,0]`、
   `player_clock[0].emit_start()` でクロックを動かす。
   `winner_is(0)` が 3、`player_clock[0].active` が true であることを確認
2. player1 の駒（point 12 の先端）を**掴む**（mousedown）
3. **自分の `send` を止める。** 自分が送る `stop_clock` がサーバへ届くと、
   返事の `clock_state` で `active` が false になり、場面が消えてしまう
4. 掴んでいる間に、包んでいない `send` で
   `set_turn {turn: -1}` を直に流す（＝他の人が turn を変えた）
5. 届いた `gameinfo` で `set_turn(-1)` が走り、`stop_clock` を 1 本
   送ろうとする（**これは TODO-030 より前からの動き**）。
   送信は止めてあるので `active` は true のまま
6. **離す**（mouseup）→ 予測 → `apply()` → `set_turn(-1)`

### 結果（直す前）

```
仕込み: {"turn":1,"active0":true,"win0":3}
gameinfo (turn=-1) を受けたときに送ろうとしたもの: ["stop_clock"]
  player_clock[0].active = true
離したときに送ったもの: [["put_checker",{"ch":112,"p":15,"idx":0}],
                        ["stop_clock",{"player":0}],
                        ["dice",{"player":1,"dice":[13,0,0,0],"roll":false}]]
>>> 予測で stop_clock が飛ぶか: true
put_checker() を直に呼んだときに送ったもの: [["stop_clock",{"player":0}]]
>>> put_checker() で stop_clock が飛ぶか: true
```

**飛んだ。** `Board.put_checker()` を直に呼ぶ経路（`rules.test.mjs` と
同じ）でも飛んだ。`43193fc` の `put_checker()` は `set_turn()` を
呼んでいないので、**これは TODO-030 で増えたメッセージ**
（README 6 番「送るメッセージを変えない」に反する）。

最初に 2 枚のタブで試した版（`exp_b2.mjs`）では飛ばなかった。
**もう 1 枚のタブが先に `stop_clock` を送ってしまい**、その返事で
`active` が false になって枝に入らなくなるため。
「送信を止めた 1 枚」にして初めて再現した。

### 直し方

`apply()` に `predict` を足し、`set_turn()` に「送ってよいか」を渡す。

- `board.js:875-880` — `apply(gameinfo, {..., predict=false})`
- `board.js:1033-1034` — `set_turn(turn, resign, sound, ! predict)`
- `board.js:549-558` — `set_turn(turn, resign=-1, sound=true, emit=true)`
- `board.js:604-607` — `if ( emit && this.player_clock[winner].active )`
- `checker.js:379` — `apply(predicted, {sec: 0.2, predict: true})`
- `board.js:1193` — `put_checker()` も `predict: true`

**予測のときは「表示を変えるだけで、サーバへ何も送らない」**という
形にした。`clock_state` が無いことで暗に判定せず、明示の引数にしてある
（reviewer が「null の扱いが揃っていない」と書いていた場所と同じ関数なので、
暗黙の判定を増やしたくなかった）。

直したあとの実測（同じ `exp_b2b.mjs`）:

```
gameinfo (turn=-1) を受けたときに送ろうとしたもの: ["stop_clock"]
  player_clock[0].active = true
離したときに送ったもの: [["put_checker",...],["dice",...]]
>>> 予測で stop_clock が飛ぶか: false
put_checker() を直に呼んだときに送ったもの: []
>>> put_checker() で stop_clock が飛ぶか: false
```

サーバから届いた `gameinfo` では**今までどおり送る**（5 行目は変わらず
`["stop_clock"]`）。

### 足したテスト

`predict.test.mjs` に 5 件目「予測はサーバへ何も送らない
（turn が -1 に変わっていても）」を足した（上の手順そのまま）。
サーバの `gameinfo` では `stop_clock` を送ること、予測では
`put_checker` と `dice` しか送らないこと、`put_checker()` を直に
呼んでも何も送らないことを見る。

わざと壊して確かめた（**それぞれ 10 回続けて落ちた。10/10**）:

| # | 壊し方 | 落ちたテスト | 結果 |
|---|--------|--------------|------|
| 7 | `set_turn()` が `emit` を見ない（予測でも送る） | 5 件目だけ | 10/10 |
| 8 | `apply()` に `predict: true` を渡さない | 5 件目だけ | 10/10 |

どちらも**狙った 1 件だけ**が落ちた（他の 4 件は通った）。

## 2. コードのコメントを直した（reviewer の「そのほか 3」）

- `board.js:924` —「`put_checker()` の `splice(-1, 1)` が無関係な駒を
  配列から外す」を削除（**いまの `put_checker()` に `splice` は無い**。
  「どの point にも入らないまま画面に残る」までを残した）
- `board.js:596, 598` —「`load_gameinfo()` から毎回呼ばれる」→ `apply()`
- `rules/position.js:114` —「積み順は `Board.load_gameinfo()` と同じ」
  → `Board.apply()`
- `rules/position.js:228` —「今の `put_checker()` の呼び方と同じ」
  → 「`ui/checker.js` の `on_mouse_up_xy()` が `moves` に 2 手ぶん積む」

テスト側のコメント（`clicks.test.mjs`、`tests/js/position.test.mjs`）は
**触っていない**（「1 行も変えない」の約束）。

## 3. `predict.test.mjs` の冒頭コメントを直した（A-2）

「見るのは 5 つ」に直したうえで、**作れている外れ方は「行き先が違う」
1 種類だけ**であることと、見ていない外れ方を並べた
（2 枚のタブ＝**verifier の担当**、ヒットの扱い違い、`turn` の変化、
`score` / `playername` / `cube`）。

## 直さなかったもの（指示どおり）

B-1 / B-3（予測がダイス以外を 1 往復ぶん巻き戻す）、B-4（例外時に駒が
浮く）、好みの範囲 2 件（ID の変換が 3 か所、null の扱い）。
`CLAUDE.md` と `TODO.md` は触っていない。

## 対応後の検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 終了コード 0（211 passed） |
| `uv run ruff check .` | 終了コード 0 |
| `uv run mypy src` | 終了コード 0 |
| `node --test tests/js/` | 終了コード 0。59 件、警告 0 |
| `node --test tests/browser/` | 終了コード 0。**44 件**（39 + 新しい 5 件）。1 回 |

変更したファイルは `board.js` / `ui/checker.js` / `rules/position.js` /
`tests/browser/predict.test.mjs`。既存の `tests/` は 1 行も変えていない。
壊した版は残っていない（`git status` と `grep -rn BROKEN src tests` で確認。
`git checkout` / `restore` / `stash` は使っていない）。コミットはしていない。
