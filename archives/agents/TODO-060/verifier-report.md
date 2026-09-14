# TODO-060 確認の報告（verifier）

前回の verifier が途中で止まった件を受け、最初からやり直した。壊した箇所は
すべて scratchpad へ `\cp` で控えてから壊し、確認後に `\cp` で戻して
`cmp` で同じであることを確認した（すべて `SAME`）。最終的な `git status` /
`git diff --stat` は、作業開始時のスナップショットと一致する。

## 1. 検証の一式（1 回ずつ）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 292 passed |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | tests 156 / pass 156 / fail 0（見込みの 156 と一致） |
| `node --test tests/browser/`（1 回目） | 1 | tests 97 / pass 96 / fail 1 |

### tests/browser/ の 1 回目で落ちた 1 件（判断が要る）

```
✖ 掴んでいるキューブも手元の座標と z に残る (2342.159302ms)
  AssertionError [ERR_ASSERTION]: キューブを掴めていない
      at TestContext.<anonymous> (file:///home/ytani/work/ytBackgammon/tests/browser/drag.test.mjs:112:20)
```

`drag.test.mjs` 単体で再実行すると 3 件とも通った（`tests 3 / pass 3 / fail 0`）。
また後述の壊す確認（指摘 3 の 2 回、合わせて `tests/browser/` を通しでもう 2 回
走らせた）ではどちらも `tests 97 / pass 97 / fail 0` で、このテストも含めて
全部通っている。**1 回目だけ「キューブを掴めていない」で落ちたのは、full 実行時の
負荷・タイミングによるものと見られる（推測）。** コードを壊していない状態での
落ちなので、実装のバグとは考えにくいが、**再現性が低く原因を特定できていない**。
テストの前提（ファイル全体を通しで走らせ、前のテストが作るキューブの状態を使う）
に、タイミング的な脆さが無いかは main か実装側の判断が要る。
ブラウザテストは「1 回だけ」の指示のため、これ以上は繰り返していない
（指摘 3 の確認で `tests/browser/` を計 2 回追加で走らせているが、これは
別の目的（コードを壊した状態を見る）のためで、この 1 件の再現性を確かめる
目的の繰り返しではない）。

## 2. 壊して落ちるかの確認（a〜f）

いずれも、壊す→対象のテストを実行→落ちたことを確認→`\cp` で戻す→
`cmp` で一致を確認、の順で行った。

### a. Clock のチェックボックス（`board_controller.js` の `set_clock_switch()`）

差分:
```diff
     set_clock_switch(sw) {
+        this.clock.sw = Boolean(sw);
         this.send("set_clock_switch", { switch: Boolean(sw) });
     } // BoardController.set_clock_switch()
```

`node --test tests/browser/clock.test.mjs` → **落ちた**（想定どおり）:
```
✖ Clock のチェックボックスは、返事が届くまで計算も表示も変えない (1277.655612ms)
  AssertionError [ERR_ASSERTION]: 返事の前に時計が消えた
```
戻して `cmp` → `SAME`。

### b. 履歴の返事の `clock_state`（`receive()` で `limit` だけ反映）

差分:
```diff
         const cs = data.clock_state;
         if ( cs !== undefined ) {
-            this.clock.sw = cs.sw;
             this.clock.limit = [cs.limit[0], cs.limit[1]];
-            for (let p=0; p < 2; p++) {
-                this.clock.active[p] = Boolean(cs.active[p]);
-                this.clock.base[p] = [cs.clock[p][0], cs.clock[p][1]];
-                this.clock.base_time[p] = now;
-            }
         }
```

`node --test tests/browser/clock.test.mjs` → **2 件落ちた**（想定どおり）:
```
✖ Clock のチェックボックスは、返事が届くまで計算も表示も変えない (5050.573383ms)
  Error: resume_clock: timeout. last value=false
✖ 履歴の返事でも clock_state を全部反映する (6307.596681ms)
  Error: page2 sw: timeout. last value=true
```
戻して `cmp` → `SAME`。

### c. 掴んでいるキューブ（`board_view.js` の座標と z を戻す行を消す）

差分:
```diff
         if ( cube_pos !== undefined ) {
-            cube.move(cube_pos.x, cube_pos.y, true, 0);
-            cube.set_z(cube_pos.z);
         }
```

`node --test tests/browser/drag.test.mjs`（ファイル全体） → **落ちた**（想定どおり）:
```
✖ 掴んでいるキューブも手元の座標と z に残る (1696.463943ms)
  AssertionError [ERR_ASSERTION]: 掴んでいるキューブが手元の座標と z に残っていない
  + actual { x: 240, y: 167.5, z: 100, ... }
  - expected { x: 105, y: 290, z: undefined, ... }
```
戻して `cmp` → `SAME`。

### d. ダイスの傾き（`ui/dice.js` の `Dice.set()`）

差分:
```diff
-        this.move1(0, 0);
+        this.move1(this.deg, 0);
```

`node --test tests/browser/last_op.test.mjs` → **落ちた**（想定どおり）:
```
✖ 振ったダイスが傾くのは振った直後だけで、次の描画でまっすぐに戻る (95.178808ms)
  AssertionError [ERR_ASSERTION]: 振った傾きが残っている: [...]
```
戻して `cmp` → `SAME`。

### e. DOM なしの Controller（`log.js` を `location.search` に戻す）

差分:
```diff
-const DEBUG = new URLSearchParams(globalThis.location?.search).has("debug");
+const DEBUG = new URLSearchParams(location.search).has("debug");
```

`node --test tests/js/controller.test.mjs` → **落ちた**（想定どおり。モジュール読み込みで例外）:
```
ReferenceError: location is not defined
    at file:///home/ytani/work/ytBackgammon/src/ytbg/webroot/static/js/log.js:12:35
✖ tests/js/controller.test.mjs (57.590483ms)
```
戻して `cmp` → `SAME`。

### f. `history_flag`（`server.py` の `emit_gameinfo()` に足す）

差分:
```diff
                     'hist_n': self._hist.total(),
+                    'history_flag': False,
                     'last_op': last_op,
```

`uv run pytest tests/test_on_json.py -q` → **8 件落ちた**（想定どおり）:
```
FAILED tests/test_on_json.py::test_put_checker_sends_gameinfo_with_last_op
FAILED tests/test_on_json.py::test_back_sends_sec_for_checker_move
FAILED tests/test_on_json.py::test_fwd_sends_sec_for_checker_move
FAILED tests/test_on_json.py::test_back_all_leaves_one_entry
FAILED tests/test_on_json.py::test_fwd_all_moves_history_to_the_end
FAILED tests/test_on_json.py::test_clear_hist_leaves_one_entry
FAILED tests/test_on_json.py::test_new_keeps_score_playername_limit_and_resets_board
FAILED tests/test_on_json.py::test_emit_gameinfo_message_shape
8 failed, 33 passed in 0.87s
```
戻して `cmp` → `SAME`。戻したあと `uv run pytest tests/test_on_json.py -q` は
`41 passed`。

**a〜f はすべて、指示どおりのテストで落ちることを確認できた。**

## 3. レビューの指摘 3 の確認（`render_turn()` の `closeout()` / `winner_is()`）

`board_view.js` を退避してから、2 通りをそれぞれ壊し、`node --test tests/browser/`
全体を 1 回ずつ走らせた。

### 3-1. `closeout()` を常に false にする

```diff
-        if ( closeout(pos, 1 - turn) ) {
+        if ( false && closeout(pos, 1 - turn) ) {
```

`node --test tests/browser/` → **`tests 97 / pass 97 / fail 0`。1 件も落ちなかった。**

### 3-2. `winner_is()` の score を常に 0 にする

```diff
-                    score = winner_is(pos, p, {
-                        resign: gi.resign,
-                        cube_value: gi.board.cube.value,
-                        cube_accepted: gi.board.cube.accepted,
-                    }).score;
+                    score = 0;
```

`node --test tests/browser/` → **`tests 97 / pass 97 / fail 0`。1 件も落ちなかった。**

どちらも戻して `cmp` → `SAME`。

**レビューの指摘 3（`rules.test.mjs` が「つながり」を見なくなった）は実測でも
裏付けられた。** `render_turn()` の中で `closeout()` を無効化しても、
`winner_is()` の結果を潰しても、`node --test tests/browser/` の 97 件は
1 件も落ちない。パスのバナーが出るはずの場面で出ない、勝ちのバナーが
出るはずの場面で出ない、という挙動の変化を、いまのブラウザテストは
捕まえられない。

## 4. 変更範囲の確認

`git status` / `git diff --stat` は、作業開始時点（依頼に添付されたスナップショット）
と一致した。依頼の対象範囲（`src/ytbg/webroot/static/js/` 配下と対応する
`tests/`、`server.py`、`tests/test_on_json.py`）に収まっている。
`CLAUDE.md` / `TODO.md` / `docs/design-4.md`（rename）は依頼どおり main の担当分。
これ以外に変わったファイルは無い。

## 判断できないこと・判断が要る点

- **tests/browser/ の 1 回目に出た「キューブを掴めていない」の失敗**は、
  単体では再現せず、その後の 2 回の通し実行でも再現しなかった。
  コードを壊していない状態でのタイミング起因の失敗に見えるが、断定はできない。
  再現性の低い失敗をどう扱うか（無視する／`drag.test.mjs` の待ち方を見直す）は
  判断が要る
- **レビューの指摘 3 は実測で裏付けられた**（`closeout()` / `winner_is()` を壊しても
  ブラウザテストが 1 件も落ちない）。これをどう埋めるか（`rules.test.mjs` の説明を
  改めるだけにするか、バナーの表示を読む確認を足すか）は reviewer 報告のとおり
  main の判断
- 指摘 1（ダイスの傾きが振った直後以外でも残る／プレーヤー 1 は描画のたびに
  180° ずつ回る）は、依頼の壊す確認の対象（d）には入っておらず、こちらでは
  実測していない。reviewer 報告の実測を踏まえた判断が要る
