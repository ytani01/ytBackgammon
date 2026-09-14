# TODO-060 実装の報告（implementer）

## 結果

`Board`（`board.js`）・`actions.js`・`drag.js`・`ui/point.js` を消し、
`BoardController`（`board_controller.js`）と `BoardView`（`board_view.js`）に置き換えた。
依頼の 4 つの挙動を変え、足したテストが変える前のコードで落ちることを確かめた。
関係するテストはすべて通る。コミットはしていない。

## 作ったファイルと主なクラス・関数

`src/ytbg/webroot/static/js/board_controller.js`

- `effects_for(previous, next, last_op)` — :48。`{sounds: [...], roll_player}` を返す。音の順は旧 `apply()` と同じ（roll → turn_change → put_checker → move）
- `class BoardController` — :92
  - `constructor(view, send, settings, clock_init)` :100。200 ms の interval を持つ。`clock_init` は main.js がヘッダの HTML の初期値から作る
  - `snapshot(now)` :139、`tick(now)` :172（動いていない間は基準時刻を今にする）
  - `receive(data)` :188（`clock_state` があれば、履歴の返事でも sw・active・残り時間・limit を全部反映）、`predict(gameinfo, {sec})` :224（クロックと演出に触れない）
  - 操作: `roll` :251（送信 → `view.hide_roll_button()` → 相手のダイスがあれば 2 秒後に `click_dice(player, 0)`）、`click_dice` :296、`pass_turn` :319、`can_pick_checker` :335、`checkers_at` :349、`plan_move` :368（予測の入口）、`drop_checker` :390、`put_checker` :419、`can_hold_cube` :436、`drop_cube` :450、`resign` :466、`score` :483、`set_playername` :497、`toggle_clock` :510、`set_clock_switch` :525（送るだけ）、`set_clock_limit` :536、`history` :553

`src/ytbg/webroot/static/js/board_view.js`

- `class Drag` :44（旧 drag.js を移した。判定は `view.input` = Controller を ID とポイント番号で呼ぶ）
- `class BoardView` :217
  - `constructor(els, header, settings, x, y)` :226（部品の生成順は旧 `Board` と同じ）
  - `to_xy(e)` :402（旧 `get_xy()` の座標変換）、`listen(part, {down, up, move})` :421、`connect(input)` :444
  - `top_checker(point)` :501、`render(snapshot, {sec, clock})` :521、`render_turn(gi, pos)` :623（旧 `set_turn()`・`RollButton.update()`）、`render_clock(clock)` :701、`play_effects(effects)` :719、`roll_dice(player)` :733、`hide_roll_button` :744、`hide_pass_banner` :753、`show_pip` :760、`apply_disp_pip` :776、`inverse` :787

`src/ytbg/webroot/static/js/layout.js`

- `checker_geometry(point, index, size)` :71（旧 `BoardPoint.add()` の式そのまま）
- `point_at(points, x, y)` :93（旧 `BoardPoint.in_this()` + `chpos2point()`）

## 変えたファイル（主な箇所）

- `main.js`: `Settings`・`BoardView`・`BoardController` を組み、`view.connect(controller)`。`window.board = {controller, view}`。受信は `controller.receive(msg.data)`。キーボードは `view.roll_btn[p].active` / `view.pass_btn[p].active` を見て `controller.roll()` / `pass_turn()`。ヘッダの Clock は `controller.set_clock_switch(checked)` だけ。`build_dom()` をモジュール評価時に呼び、`window.onload` で `wait_images()` のあとに組む順番は変えていない
- `log.js`: `new URLSearchParams(location.search).has("debug")` を直接読む。`settings.js` の `get_debug_query()` と循環の注意書きを消した
- `sound.js`: `SoundBase(settings, file)`（board を受け取らない）
- `ui/base.js`: `BgBase` から board・settings・リスナー登録・`on_mouse_*_xy`・`in_this()`・`inverse_xy()` を消し、`get_xy(e, to_xy)` にした。`BgImage` の `this.e` を消した
- `ui/button.js`: `ScoreButton`（押す処理なし）、`BannerButton`（`click()` が `on_click` を呼ぶ）、`RollButton`（ダイスを持たない。ここへ移した）。`InverseButton` / `ResignButton` / `EmitButton` は消し、ただの `BgImage` にした
- `ui/dice.js`: `Dice.set(val)` と `animate_roll()`。`RollButton` は button.js へ
- `ui/clock.js`: `PlayerClock.show(clock, limit, running)` の表示だけ。`ClockLimit` と計算は消した
- `ui/checker.js` / `ui/cube.js` / `ui/label.js`: board への参照を消した（`Cube(el, bx, by, board_h)`、`PlayerName(..., board_rect)`、`PlayerName.edit()`）。`Checker.get_pip()` は使う側が無いので消した
- `dom.js`・`ws.js`・`settings.js`・`rules/*.js`: コメントの `Board` / `actions.js` を直しただけ
- `src/ytbg/server.py`: `emit_gameinfo()` の引数と `data` から `history_flag` を消した。呼ぶ側 3 か所（:201、:360 の位置引数 `False` を含む、:590）
- `docs/Developer.md`: 状態の持ち方、登録表、先行実行（離したときの流れ・順番の縛り）、クロック（クライアントの節を足した）、クライアント側のモジュール表と構成図、気をつけること（循環の項を消し、ドラッグ中の受信・ダイスの回転の順番・リスナー・タイマーを足した）、ルール層、表示部品の図と説明

## 消したもの

`board.js`、`actions.js`、`drag.js`、`ui/point.js`（git の作業ツリーから削除。ステージはしていない）。
委譲の `Board.has_dice()` / `position()` / `winner_is()` などは `Board` ごと無くなった。

## 足したテストと、変える前に落ちた出力

足したテスト:

- `tests/browser/clock.test.mjs`（新規）:65「Clock のチェックボックスは、返事が届くまで計算も表示も変えない」、:113「履歴の返事でも clock_state を全部反映する」、:165 コンソールエラー
- `tests/browser/drag.test.mjs`:93「掴んでいるキューブも手元の座標と z に残る」
- `tests/test_on_json.py`: `history_flag` を見ていた 8 か所を「`data` に無い」に変え、:546 のキーの一覧から外した

変える前のコード（helper は旧 `Board` 向けに足した状態）での出力:

```
✖ Clock のチェックボックスは、返事が届くまで計算も表示も変えない
  AssertionError: 返事の前に時計が止まった   (背景が rgb(136, 136, 136) = #888)
✖ 履歴の返事でも clock_state を全部反映する   (この 1 件だけ走らせたとき)
  AssertionError: 履歴の返事の clock_state を反映していない
  + checked: true            - checked: false
  + opacity: '1'             - opacity: '0'
  + text: '&nbsp;120.0/12.0&nbsp;'   - text: '&nbsp;120.0/10.8&nbsp;'
✖ 掴んでいるキューブも手元の座標と z に残る
  AssertionError: 掴んでいるキューブが定位置へ戻った
  actual: { x: 45, y: 505, z: 100, left: '20px', top: '480px' }
  expected: { x: 105, y: 465, z: 100, left: '80px', top: '440px' }
pytest tests/test_on_json.py: 8 failed, 33 passed
```

履歴の返事のテストは、変える前のコードでは前半（残り時間・sw）で落ちるので、後半の active の確認までは届いていない。

## helper を直した箇所（`tests/browser/helper.mjs`）

- 足した関数: `shown_clock()` :1057（DOM から読むので構成に依らない）、`hold_received()` :1075 / `release_received()` :1087（`controller.receive` を差し替える）、`holding_cube()` :1099
- `board.X` を `board.controller` / `board.view` に: `set_turn`、`shown_dice`、`wait_board`、`gameinfo`、`settings`、`checkers`、`stack`、`dragging`、`shown_parts`（`clock_active` / `clock_limit` は Controller から）、`part_el_ids`、`press_n`、`press_pass_banner`、`show_banner` / `hide_banner`、`drop_cube_while_holding_checker`、`set_free_move`
- `server_id()`: `document.body.dataset.serverId` を読む（旧 `board.svr_id` と同じ値）
- `judge()` / `pip_count()` / `dst_points()`: ページの中で `rules/` を import し、`controller.gameinfo` で呼ぶ。**`pip_count()` は表示を更新しなくなった**（旧 `Board.pip_count()` は表示も書き換えていた）。`rules.test.mjs` の「pip の表示」は `render()` が書いた表示を読むことになり、確認はむしろ強くなる
- 受信・予測: `apply_gameinfo()` と `effects_of_apply()` は `controller.receive()`、`record_received_src()` は `controller.receive` を包む。`record_apply()` は `receive` と `predict` の 2 つを包む（`has_last_op` / `has_clock_state` を取るため）。`corrupt_prediction()` / `fail_prediction()` / `restore_prediction()` は `controller.plan_move` の 1 か所
- `effects_of_apply()` のダイスの記録は `view.roll_dice` を包む
- `send_put_checker()` は `controller.put_checker(id, point)`、`put_checker_local()` は gameinfo の写しを書き換えて `controller.predict()`（旧 `Board.put_checker()` は音の last_op を付けていたが、テストは PIP しか見ていない）
- `press_part()` は `controller.roll(player)` / `controller.resign()`

既存の `test()` の本体は変えていない。テストファイル先頭のコメントに旧 `Board` / `apply()` の名前が残っている（本体の外。直していない）。

## 画像の待ち

組み立ての順番（`build_dom()` をモジュール評価時、`wait_images()` のあとに組む）には触れていないので、
画像の応答を遅らせる実測はしていない。変えたのは `Settings` を作る場所（`Board` の中から `main.js` の
`window.onload` の中へ。`wait_images()` のあと）だけ。

## テストの件数

| 対象 | 変える前 | 変えたあと |
|------|----------|------------|
| `uv run pytest`（全体） | 292 passed | 走らせていない（verifier の担当） |
| `uv run pytest tests/test_on_json.py tests/test_ws.py` | — | 52 passed |
| `node --test tests/js/` | 154 pass | 154 pass |
| `node --test tests/browser/` | 92 pass | 96 pass（足した 4 件） |

## 走らせた結果（最後に 1 回ずつ）

- `uv run pytest tests/test_on_json.py tests/test_ws.py` — 終了コード 0、52 passed
- `node --test tests/js/` — 終了コード 0、154 pass / 0 fail
- `node --test tests/browser/` — 終了コード 0、96 pass / 0 fail

ruff・mypy・basedpyright・pytest 全体は依頼どおり走らせていない。

このほか、振ったダイスの動きを 1 回だけ手で確かめた（テストには足していない）。
`controller.roll(0)` の返事を描画した次のフレームで、出たダイスに `left,top,transform,z-index` の
transition が掛かっていた（隅から出てくる動きが残っている）。

## 判断した点・判断が要る点

1. **`predict_moves()` の export は外していない。** `tests/js/actions.test.mjs` の `describe('predict_moves()')` の
   2 件が直接 import している。外すなら、この 2 件を消すか書き換える必要がある
   （1 件目の「位置が壊れていれば例外」は、`plan_move()` 経由だと `Position.from_gameinfo()` が先に投げ、
   `predict_moves()` の確認にならない）。2 件目は `player` を渡さない枝のテストで、その枝を使う本体は無くなった
2. `checker_geometry(point, index, size)` の `point` は、ポイント番号ではなく `point_geometry()` の 1 要素にした
   （盤面の高さが要るため）。当たり判定は `point_at(points, x, y)`
3. `render()` の中で**ダイスを最後に置いた**（旧 `apply()` は PIP より前）。`play_effects()` の回転を、
   `set()` の 0 秒の移動とスタイル確定の前にまとめるため。間に `clientWidth` を読む処理
   （名前・PIP の `BgText.set()`）が入ると、ダイスが隅から出てくる動きが消える。Developer.md に書いた
4. 入力のリスナーは、押す処理を持つ部品と盤面の要素にだけつないだ。つないだ部品には押す・離す・動かすの
   3 つとも登録し、`preventDefault()` を保った。PIP・得点の数字・時計の背景にはつないでいない
   （PIP は盤面の要素に中で押されたイベントが伝わり、そこで止まる。得点は `pointer-events: none`）。
   旧実装は全部品に登録していた
5. 先手決めの自動クリックのタイマーは `opening_timer` に控えるが、前のものを取り消していない
   （旧実装も取り消していなかった。取り消すと、続けて Roll を押したときの挙動が変わる）
6. 最初の返事の前の時計: Controller の生成時に 1 回描画し、sw（HTML の初期値）で表示・非表示を決める。
   旧実装は最初の返事まで表示・非表示に触れていなかった。HTML の既定はチェック済みなので見た目は同じだが、
   ブラウザがチェックを外した状態に戻したときは、返事の前から時計が隠れる（設計の「HTML の初期値から作る」に沿った）
7. ページを読み込み終わる前にキーを押すと、旧実装と同じく `undefined` を読んで例外になる（直していない）
8. `rules/*.js` の先頭コメントの「DOM も Board も見ない」を「DOM も表示部品も見ない」にした（コメントだけ）
