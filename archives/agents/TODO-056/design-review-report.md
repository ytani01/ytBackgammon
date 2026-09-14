# TODO-056 設計レビュー報告

## 担当

- 担当: reviewer（設計と現行コードの照合。変更はこの報告だけ）
- 起動時の役割定義: `gpt-5.6-sol` / reasoning effort `high`
- 実行時のモデル表示: GPT-5
- 実際に処理したモデル: 上記2つの表示が一致しないため未確認

## 確認範囲

`docs/design-4.md` を、現在の `src/ytbg/`、`tests/`、`CLAUDE.md`、
`AGENTS.md` に照らして確認した。重点は依存方向、状態とタイマーの所有者、
現行動作の維持、段階移行が実際に成立するかである。設計・ソースの変更と
テスト実行はしていない。

## 指摘

### 1. 時計の定期更新を起動する境界が決まっていない（重大度: 高）

- 場所: `docs/design-4.md:53-55`, `docs/design-4.md:114-123`
- 問題: Model が時計の基準値と基準時刻を持ち、`snapshot(now)` が表示値を
  計算する一方、200ms ごとに誰が `snapshot(now)` と `View.render()` を
  呼ぶかが定義されていない。View は Model を参照しない方針だが、描画用
  タイマーは View の所有とされているため、このままでは View が時計の基準を
  複製するか、Model を参照する必要がある。
- 根拠: 現在は `Board` の interval が `PlayerClock.update()` を呼び
  (`src/ytbg/webroot/static/js/board.js:170-175`)、`PlayerClock` 自身が
  `start_clock` と `start_time` を使って経過時間を計算する
  (`src/ytbg/webroot/static/js/ui/clock.js:54-58`, `124-154`)。この責務を
  Model へ移すなら、定期的に現在時刻を渡す経路が要る。
- 修正案: Controller が interval を所有し、tick ごとに
  `view.render_clock(model.snapshot(now))` を呼ぶ形にするか、View に
  `requestSnapshot(now)` コールバックを注入する形を明記する。後者でも
  時計の基準値は Model だけに置き、`dispose()` が interval を確実に解除する。

### 2. 第2段階の「旧 Board を View として使い、状態を二重所有しない」が現行 Board の形では成立しない（重大度: 高）

- 場所: `docs/design-4.md:190-194`
- 問題: 第2段階で Model を状態の所有者にした時点でも、旧 `Board` は
  `apply()` で `this.gameinfo` を置換し、その値を描画・操作判定・予測の各所から
  直接読む。このため旧 Board をそのまま View として残すと Model と Board の
  二重所有になり、二重所有を避けて Board から状態参照を外すと第3段階の
  大部分を同時に実施することになる。
- 根拠: `Board.apply()` は `this.gameinfo = gameinfo` を行う
  (`src/ytbg/webroot/static/js/board.js:608-610`)。`position()`、
  `checker_order()`、ダイス参照、勝敗判定、予測も同じフィールドを読む
  (`board.js:404-410`, `424-443`, `491-500`, `533-553`, `811-841`)。
  ブラウザテストも `board.apply` と `board.load_gameinfo` を差し替えて受信と
  先行実行を観測している（`tests/browser/predict.test.mjs:94-116`,
  `tests/browser/clicks.test.mjs:49-57`）。
- 修正案: 第2段階より前に旧 Board の `gameinfo` を Model への getter に替え、
  `apply()` を snapshot の描画だけにする移行用 adapter を独立した段階として
  定義する。あるいは第2・3段階を一つにまとめ、Model 導入と View 化を同じ
  TODO で完了させる。各段階で `window.board` が何を公開するかも固定する。

### 3. 純粋関数へ移す操作判断の公開範囲が現行 actions.js を覆っていない（重大度: 中）

- 場所: `docs/design-4.md:56`, `docs/design-4.md:77-80`,
  `docs/design-4.md:125-128`
- 問題: `rules/actions.js` の公開関数として挙げられているのは駒の操作だけで、
  後段で `plan_cube_drop()` が追加されている。しかし、キューブを掴める条件、
  roll、ダイスクリック、end_turn、score、resign など、現在 `actions.js` が持つ
  操作条件を rules と Controller のどちらへ置くかが未定義である。実装時に
  Controller へ条件式が散ると、「純粋な判断を rules に移す」という境界と
  食い違う。
- 根拠: 現在の `can_hold_cube()` は turn、cube.side、accepted、画面の
  player、両者の dice をまとめて判定する
  (`src/ytbg/webroot/static/js/actions.js:353-379`)。`roll()` と
  `click_dice()` にも cube、turn、free move、opening、使用可能ダイスの条件が
  ある (`actions.js:44-72`, `86-141`)。これらは表示処理ではない。
- 修正案: `rules/actions.js` に移す操作ごとの plan/can 関数を一覧化し、返り値を
  「送信メッセージ、予測盤面、一時表示指示」のどこまで含めるか決める。
  `can_hold_cube(gi, player)` と `plan_cube_drop(...)` は少なくとも同じ層に置く。
  追加テストには cube 上限、accepted、side、turn、ダイス表示中の各条件も含める。

### 4. Clock スイッチの先行更新で、計算と表示のどちらを即時反映するかが曖昧（重大度: 中）

- 場所: `docs/design-4.md:120-123`
- 問題: Model の `sw` を送信前に更新することは明記されたが、その直後に
  View を再描画するかは決まっていない。現在はチェックボックスと時計計算は
  即時に変わる一方、時計要素の表示・非表示はサーバ応答時に変わる。この差を
  一括 render で処理すると、短時間だが現行動作が変わる。
- 根拠: `apply_clock_sw()` はローカルの `clock_sw` を更新して送るだけ
  (`src/ytbg/webroot/static/js/board.js:300-303`)。`PlayerClock.update()` は
  その値を直ちに計算へ使う (`ui/clock.js:129-150`) が、要素の on/off は
  `set_clock_switch()` がサーバ応答の `apply()` から呼ばれた時だけ行う
  (`board.js:282-294`, `689-704`)。
- 修正案: 現行動作を厳密に維持するなら、送信前更新は Model の時計計算だけに
  適用し、表示・非表示は通常応答で確定すると明記する。即時表示へ変えるなら
  挙動変更として別に決め、応答を止めたブラウザテストを追加する。

## 補足

`plan_cube_drop(gi, player, geometry)` は DOM 要素を受けず、現在使っている
`src_y`、最後の `cube.y`、`y0`、`y1[]` を値で渡すため、現行の境界条件と
リダブル時の player を再現できる。`src/ytbg/webroot/static/js/actions.js:389-427`
および `drag.js:129-156` との対応に矛盾は見つからなかった。ただし上記3の
とおり、掴み始めの可否判定も同じ純粋関数層に含める必要がある。

サーバの `Applied` / `Ignored` / `Handled` と要求単位の `publish` は、現在の
`None` の二義性、履歴再生の専用送信、`last_op` の要求ローカル値を分けられる。
Replayer の lock 内 cancel、n手処理、cancel時保存、New Gameが再生を止めない点も
設計に明記されており、現行 `server.py:316-362`, `replay.py:38-102` と整合する。
未確認事項は、実装後の非同期処理の割込み順と全テストの成否である。

## 指摘反映後の再確認

2026-09-14 に、上記4点の反映箇所だけを再確認した。いずれも設計上は
解消しており、新たに利用者の判断が必要な点はない。

1. 時計の定期更新は Controller 所有の200ms interval とし、
   `snapshot(now)` から `render_clock()` だけを呼ぶ経路、`dispose()` での解除が
   `docs/design-4.md:53-55`, `133-137` に明記された。Model と View の状態を
   二重にせず、現行 `Board` / `PlayerClock` の定期更新を移せる。
2. BoardModel・Controller・BoardView は同じ実装項目で導入し、旧 Board を
   状態所有者として並存させない形へ `docs/design-4.md:215-228` が改められた。
   `window.board` と受信・予測テストの切替時期も同じ段階に定まり、移行中の
   二重所有という矛盾は解消した。
3. `can_hold_cube` と roll、ダイスクリック、end_turn、cube、resign、score、
   free move の駒について、pure な can/plan 関数の入力と返り値の範囲が
   `docs/design-4.md:82-99` に追加された。表示指示を返さず Controller が
   一時表示とタイマーを扱うため、rules と Controller の境界も整合する。
4. Clock スイッチは送信前に Model の計算だけへ反映し、時計要素の表示・非表示は
   通常応答後に反映すること、無効中の各tickで基準時刻を更新することが
   `docs/design-4.md:142-148` に明記された。現行 `apply_clock_sw()` と
   `PlayerClock.update()` の一時的な表示差を維持できる。

この再確認では指定どおり該当箇所以外の追加調査とテスト実行はしていない。
