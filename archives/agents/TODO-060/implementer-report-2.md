# TODO-060 実装の報告 2 巡目（implementer）

`reviewer-report.md` の指摘 1・2・5・6・7 と、判断 1 を直した。指摘 3・4 は依頼どおり直していない。
コミットはしていない。

## 1. 振ったダイスの傾き（指摘 1）

- `src/ytbg/webroot/static/js/ui/dice.js:109` — `Dice.set()` は描画のたびに `move1(0, 0)` で置く
  （`move1()` がプレーヤー 1 に 180 を足す）。変える前の `clear()` → `rotate(0)` → `move1(this.deg=0, 0)` と同じ角度になる
- `ui/dice.js:117` — `animate_roll()` は `move1(乱数, 0.5)` だけにした。`this.deg` に乱数を控える行と、コンストラクタの `this.deg = 0` を消した（控えた値を読む箇所が無くなったため）
- テストを足した: `tests/browser/last_op.test.mjs:148`「振ったダイスが傾くのは振った直後だけで、次の描画でまっすぐに戻る」。
  helper に `dice_transforms(page, player)`（`tests/browser/helper.mjs:360`。要素の `style.transform` を読む）を足した。
  roll の last_op 付きで両プレーヤーのダイスを受け取らせたあと、last_op 無しで 2 回描画し、
  p0 は `rotate(0deg)`、p1 の出ている 2 個は `rotate(180deg)` になるかを見る。

  直す前のコードで落ちた出力:

  ```
  ✖ 振ったダイスが傾くのは振った直後だけで、次の描画でまっすぐに戻る
    AssertionError: 振った傾きが残っている: [["rotate(-204deg)","rotate(284deg)",...],["rotate(21deg)","rotate(-177deg)",...]]
    + 'rotate(-204deg)', 'rotate(284deg)'   - 'rotate(0deg)', 'rotate(0deg)'      (p0、1 回目)
    + 'rotate(201deg)', 'rotate(3deg)'      - 'rotate(180deg)', 'rotate(180deg)'  (p1、1 回目)
    + 'rotate(381deg)', 'rotate(183deg)'    - 'rotate(180deg)', 'rotate(180deg)'  (p1、2 回目。180° ずつ回る)
  ```

- 角度の実測（レビューの表と同じ手順）: `set_turn()` で手番をそのプレーヤーにして `controller.roll(p)`、
  返事のあと 0.7 秒待って読み、`set_playername` の返事を 2 回届かせてそのたびに読んだ。
  出ているダイスの `deg`（`style.transform`）。スクリプトはリポジトリの外（scratchpad の `angle.mjs`）。

  | | 振った直後 | 次の gameinfo | その次 |
  |---|---|---|---|
  | 直したあと p0 | 186°, -3° | 0°, 0° | 0°, 0° |
  | 直したあと p1 | 31°, 56° | 180°, 180° | 180°, 180° |

- 振ったダイスが隅から出てくる動きも、1 巡目と同じ方法で確かめた（振ったダイスに `left,top,transform,z-index` の transition が掛かっている）

## 2. log.js と、DOM なしの Controller のテスト（指摘 2）

- `src/ytbg/webroot/static/js/log.js:12` — `new URLSearchParams(globalThis.location?.search).has("debug")`。
  `location` が無ければ `URLSearchParams(undefined)` になり、ログは出ない
- テストを足した: `tests/js/controller.test.mjs`（3 件）。偽の View（呼ばれたメソッド名を貯める）と偽の送信関数を渡す
  - `receive()` の `clock_state` から `snapshot()` が時刻どおりに残り時間を出す（猶予を使う、使い切ったら持ち時間から引く、マイナスになる。止まっている側は減らない）
  - `sw` が無効なら `active` でも減らない
  - `set_clock_switch()` は `set_clock_switch` を 1 通送るだけで、View を呼ばず、`sw` も計算も変えない
- interval の扱い: `node:test` の `mock.timers.enable({apis: ['setInterval', 'setTimeout', 'Date']})` を `beforeEach` で掛け、
  `afterEach` で `reset()`。本物のタイマーを作らないので、プロセスは終わる（`timeout 60` を付けて走らせ、すぐ終了した）。
  時間は `mock.timers.tick()` で進める
- `log.js` を元の 1 行に戻すと、このファイルは `ReferenceError: location is not defined` で落ちる（確かめて戻した）

## 3. 掴んでいるキューブの z（指摘 5）

- テストの本体を変えた: `tests/browser/drag.test.mjs:93`。手番を 0 にしたあと、**新しく開いた画面（page3）**でテイク済みのキューブを掴む。
  このときキューブの z は決まっていない（`Cube.set()` はテイク済みでは `set_z()` を呼ばない）。
  掴んでいる間に page2 から `double {player: 0}` を送り、届いた描画が z を 100 にしても、手元の座標と z が残るかを見る
- helper の `holding_cube()` に `z_index`（`style.zIndex`）を足した
- これに合わせて 2 か所を変えた:
  - `ui/base.js:96-98` — `set_z(undefined)` は `style.zIndex` を空にする（z を決めない状態に戻せるように）
  - `board_view.js:592` — キューブの z を戻すのを、`z` が `undefined` のときも行う（1 巡目は `undefined` なら飛ばしていた。飛ばすと、決まっていなかった z が 100 になる）
- `board_view.js:592` の行を消して `drag.test.mjs` を走らせると落ちる（確かめて戻した）:

  ```
  ✖ 掴んでいるキューブも手元の座標と z に残る
    AssertionError: 掴んでいるキューブが手元の座標と z に残っていない
    + z: 100, z_index: '100'    - z: undefined, z_index: ''
  ```

  このテストだけを `--test-name-pattern` で走らせると、前の 2 件が作るキューブの状態（プレーヤー 0 の側でテイク済み）が無いので待ちで落ちる。ファイル全体で走らせること

## 4. 読まれないフィールド（指摘 6）

- `board_controller.js:123` — `this.clock_timer =` を消し、`setInterval()` を呼ぶだけにした
- `board_controller.js:278` — `this.opening_timer =` を消した。コンストラクタの `this.opening_timer = undefined` も消した

## 5. 古いコメント（指摘 7）

- `rules/position.js` — `get_pip()` の注（消した `Checker.get_pip()` を挙げていた 38〜41 行）を消した
- 先頭コメント（`test()` の外）を直した:
  - `rules.test.mjs` — 「ページの中の gameinfo と、ルール層の結果が合っているかの確認」にし、helper が rules/ を直接呼ぶので `BoardView` がルールを呼ぶ経路（バナーの判定など）は見ていないこと、PIP の表示だけは `render()` が書いた値を読むことを書いた。`describe` の名前も「gameinfo とルール層の結果」にした
  - `last_op.test.mjs`（冒頭と `apply_with()` の説明）、`drag.test.mjs`、`debug.test.mjs`、`opening.test.mjs`、`predict.test.mjs`（冒頭と `apply_local()` の説明）、`player_cookie.test.mjs`
  - `clicks.test.mjs:291`・`:415`（`it` と `it` の間のコメント）
- **`test()` の本体の中のコメントは直していない**（`board.test.mjs:142`・`:158`、`opening.test.mjs:134`、`last_op.test.mjs:132`、`settings.test.mjs:64`、`predict.test.mjs:251` に `Board` / `apply()` / `RollButton` が残る）。直してよければ直す

## 6. predict_moves()（判断 1）

- `rules/actions.js:157` — export を外し、`player` を渡さない枝（`if ( player !== undefined )`）を消した。`player` と `used_dice` は必須にした（呼ぶのは `plan_move()` だけ）
- `tests/js/actions.test.mjs`
  - `describe('predict_moves()')` の 2 件を消し、import から外した
  - 「位置が壊れていれば例外」は、`plan_move()` の既存のテストに同じ確認が無かったので、`plan_move()` 経由に書き換えた（:217 付近、「gameinfo の位置が壊れていれば例外 (呼んだ側は何も送らない)」）。例外は `decide_dst()` の `Position.from_gameinfo()` から出る
  - 「player を渡さなければダイスは変えない」は、その枝が無くなったので消した
- `docs/Developer.md` のルール層の表から `predict_moves()` を外した

## 走らせたテスト

| コマンド | 結果 |
|----------|------|
| `node --test tests/js/` | 終了コード 0、156 pass / 0 fail（154 − 2 + 1 + 3） |
| `node --test tests/browser/drag.test.mjs last_op.test.mjs rules.test.mjs predict.test.mjs opening.test.mjs board.test.mjs debug.test.mjs clock.test.mjs` | 終了コード 0、45 pass / 0 fail |
| `node --test tests/browser/clicks.test.mjs` | 終了コード 0、43 pass / 0 fail |

ブラウザのテストは、変えたところ（ダイス・キューブ・log・Controller のタイマー・コメント）に関係するファイルだけを走らせた。
`settings` / `player_cookie` / `sound` のテストと、pytest・lint は走らせていない（verifier の担当）。
ブラウザのテスト全体の件数は、1 巡目の 96 件に `last_op.test.mjs` の 1 件を足して 97 件になるはず（全体では走らせていない）。

## 残る懸念

- `set_z(undefined)` で `style.zIndex` を空にするのは、今はキューブの z を戻すときにしか起きない
- `controller.test.mjs` は `mock.timers` に頼る。Node の版が変わって `mock.timers` の API が変わると、テストが落ちるかプロセスが終わらなくなる
