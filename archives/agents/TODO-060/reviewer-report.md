# TODO-060 レビューの報告（reviewer）

対象は作業ツリーの差分（`git diff` と未追跡の `board_controller.js` / `board_view.js` /
`tests/browser/clock.test.mjs`）。消したファイルは `git show HEAD:<path>` で読んだ。
コードと作業ツリーは変えていない。実測に使ったスクリプトは scratchpad に置いた（リポジトリの外）。

## 直すべき

### 1. 振ったダイスの傾きが、次の描画で戻らなくなった（4 つ以外の挙動の変更）

- `src/ytbg/webroot/static/js/ui/dice.js:95-110`（`Dice.set()` が `move1(this.deg, 0)`）、
  `board_view.js:609-614`
- 変える前: `RollButton.set()`（HEAD の `ui/dice.js`）は、毎回まず `clear()` で
  4 個とも `Dice.set(0)` → `move0()` → `rotate(0)` を通していた。`rotate()` は
  `this.deg` も書き換えるので、`this.deg` は毎回 0 に戻り、続く `set(val)` は
  まっすぐ（プレーヤー 1 は 180°）に置いていた。つまり**振った直後だけ傾き、
  次に `gameinfo` が届くとまっすぐに戻る**
- 変えたあと: `clear()` が無くなり、`set()` は前回の `this.deg` のまま置く。
  さらに `move1()` がプレーヤー 1 に 180 を足した値を `rotate()` 経由で `this.deg` に
  書き戻すので、**プレーヤー 1 のダイスは描画のたびに 180° ずつ回る**
- 実測（`controller.roll()` のあと、別の操作で `set_playername` の返事を 2〜3 回届かせ、
  ダイスの `deg` と `style.transform` を読んだ。変える前は `page.route()` で
  `/static/js/**` を `git show HEAD:` の中身に差し替えて同じ手順を走らせた）:

  | | 振った直後 | 次の gameinfo | その次 |
  |---|---|---|---|
  | 変える前 p0 | 196°, 62° | 0°, 0° | 0°, 0° |
  | 変えたあと p0 | -50°, 29° | -50°, 29° | -50°, 29° |
  | 変える前 p1 | 523°, 338° | 180°, 180° | 180°, 180° |
  | 変えたあと p1 | -90°, 40° | 90°, 220° | 270°, 400° |

- 目の画像が 180° 回転で同じに見えるなら p1 の回り方は見た目に出ないが、p0 の
  「傾いたまま残る」は見た目に出る。テストは `shown_dice()` が z・画像名・opacity
  しか見ないので捕まらない

## 直した方がよい

### 2. `board_controller.js` は DOM の無い環境で import できない

- `src/ytbg/webroot/static/js/log.js:11` がモジュールの評価時に `location.search` を読む。
  `board_controller.js:15` がこれを import している
- 実測: Node で `import('.../board_controller.js')` → `ReferenceError: location is not defined`。
  `globalThis.location = {search: ''}` を先に置けば、偽の View と送信関数で
  `new BoardController()` → `set_clock_switch()` → `receive()` → `snapshot()` まで動いた
  （送ったのは `set_clock_switch` 1 通、View への呼び出しは `render_clock` / `render` / `play_effects`）
- レビューで見る 4 つのうち「rules と Controller が DOM なしで動く」に当たる。
  `board_controller.js` 自身は DOM・`document`・`window` を触っていない（grep で確認。
  使っているのは `setInterval` / `setTimeout` / `Date.now` だけ）ので、止まるのは
  `log.js` の 1 行だけ
- 付随: `effects_for()` は export しているが、使う側は同じファイルの中だけで、
  この理由で `tests/js/` からも読めない

### 3. `rules.test.mjs` が「つながり」を見なくなった

- `tests/browser/helper.mjs` の `judge()` / `pip_count()` / `dst_points()`（差分の 579〜650 行付近）は、
  ページの中で `rules/` を import し、`controller.gameinfo` を渡して直接呼ぶ形になった
- 変える前は `board.winner_is()` / `closeout()` / `get_dst_points()` / `pip_count()` という
  `Board` の委譲を呼んでいたので、「`Board` が `rules/` を呼んでいるか」を見ていた。
  今は `BoardView.render_turn()` の `closeout()` / `winner_is()` の呼び方を壊しても、
  `rules.test.mjs` で落ちるのは PIP の表示を読む 2 件（`pip_text()`）だけのはず（未実測）。
  ほかのファイルがバナーの表示でそれを捕まえるかは未確認
- 委譲のメソッドを作らない設計なので、helper だけでは元の意味に戻せない。
  `rules.test.mjs` 冒頭のコメント（4〜13 行）と CLAUDE.md の説明を「`gameinfo` と
  ルール層の結果が合っているか」に改めるか、表示（バナー・PIP）から読む確認を足すかを、
  main が決める

### 4. CLAUDE.md の「テスト」の節で古くなった記述（main が直す）

- 79〜82 行: `rules.test.mjs` の「**`Board` がルール層につながっているか**」
  「ページの中の `Board` の判定を呼ぶ」（上の 3 と合わせて直す）
- 108〜109 行: `last_op.test.mjs` の「`apply()` に `last_op` を渡し」→ 今は `controller.receive()`
- 113〜115 行の `drag.test.mjs`: 掴んでいるキューブが残るかのテストが足された
- `clock.test.mjs` の項が無い（Clock のチェックボックスと、履歴の返事の `clock_state`）
- 227 行: `docs/design-4.md` の扱い（TODO.md のチェック項目どおり移すとき）
- 241 行: 「`Board` が複製して `this.bx` / `this.by` として持つ」→ `BoardView`

### 5. 足したキューブのテストの z は、壊しても落ちない（推論。未実測）

- `tests/browser/drag.test.mjs:93-119` は `x` / `y` / `z` / `left` / `top` を比べる
- テストの時点でキューブはテイク済み（`accepted: true`）で、`Cube.set()` はこの状態では
  `set_z()` を呼ばない（`ui/cube.js` の `set()`）。`z` は前のテストのダブルで付いた 100 のまま。
  `board_view.js:592-594` の z を戻す行を消しても、z はもともと変わらないので落ちない
- 座標のほうは、変える前のコードで落ちたことが実装の報告にある

## 好みの範囲

### 6. 書くだけで読まれないフィールド

- `board_controller.js:123`・`:281` の `opening_timer`、`:125` の `clock_timer` は、
  代入するだけでどこからも読まれない（grep で確認）。`dispose()` を作らない設計なので、
  控える理由はデバッグ用くらい

### 7. 古くなったコメント

- `rules/position.js:38-39` が、消した `Checker.get_pip()` を呼び出し元として挙げている
- `tests/browser/*.test.mjs` の先頭コメントに `Board` / `apply()` が残る
  （実装の報告のとおり。本体の外なので直してよい範囲）

## 実装の報告の「判断した点」1〜8 について

1. **`predict_moves()` の export を残した** — 本体の使う側は `rules/actions.js` の中の
   `plan_move()` だけで、外から使うのは `tests/js/actions.test.mjs` の 2 件だけ。
   `player` を渡さない枝は本体から通らなくなった。helper の `put_checker_local()` も
   これを使わず、`[point, checkers_at(point).length]` を自分で書いている
   （`predict_moves()` の `pos.count(mv.p)` と同じ値だが、`with_move()` の確認は通らない）。
   export を外して 2 件を消す／`plan_move()` 経由に書き換えるか、ルール層の単位として
   残すかは main の判断。どちらでも挙動は変わらない
2. `checker_geometry()` の第 1 引数が `point_geometry()` の 1 要素 — 式は旧
   `BoardPoint.add()` と同じ（`n2` / `n3` / `cx` / `y0` / `parseInt(Math.round())` / `z = index`）。
   当たり判定の `point_at()` も旧 `in_this()` の等号（`>=` と `<`）と、先頭から探す順を保っている。問題なし
3. **ダイスを最後に置いた** — 旧 `apply()` では名前（`BgText.set()` が `clientWidth` を読む）の
   あとにダイスを置き、回転は `set()` の中で 1 回の `move1(deg, 0.5)` だったので、後ろで
   大きさを読んでも崩れなかった。新しい形は「`set()` と `animate_roll()` の間でスタイルを
   確定させない」ことに依存する。`receive()` が `render()` の直後に `play_effects()` を呼ぶので
   今は成り立つ。Developer.md にも書いてある。ただし上の 1 は、この分け方
   （`clear()` を無くした）から出ている
4. **リスナーを付ける部品を絞った** — PIP・時計の背景は `dom.js` で盤面の要素の子なので、
   押す・動かすは盤面の要素まで伝わり、そこの `touch2mouse()` で `preventDefault()` される。
   旧実装でも子の既定のハンドラは何もせず伝わっていたので、同じ。得点の文字は
   `pointer-events: none`（報告による。CSS は未確認）
5. 自動クリックのタイマーを取り消さない — 旧 `RollButton.on_mouse_down_xy()` も取り消していない。
   問題なし（フィールドの件は上の 6）
6. **最初の返事の前の時計** — 設計の「HTML の初期値から作る」どおり。旧実装は最初の返事まで
   不透明度に触れなかったが、HTML の既定はチェック済みなので通常は同じ。ブラウザがフォームの
   状態を戻したときだけ、返事の前から隠れる。返事で `sw` に揃うので問題は小さい
7. 読み込み前のキー入力で例外 — 旧実装と同じ（`board` が `undefined`）。問題なし
8. `rules/*.js` のコメント — 問題なし

## 範囲の確認（判断が要る点）

- `docs/design-4.md` の「検証と完了条件」の表には、4 つの挙動のほかに「受信でタイマーが増えない」
  「同じ盤面を描画し直すだけでは音が増えない」「掴んでいる状態を外す前に描画すると落ちること」
  「画像の応答を遅らせたときの寸法」「部品の実際の入力から同時ドラッグ」などがある。
  実装の依頼の完了条件には入っておらず、足されていない。TODO-060 の完了にこれを求めるかは main の判断

## 問題が無かった観点

- **import の循環**: `log.js` は何も import しない。`settings.js` → `log.js`、`ui/base.js` →
  `settings.js`（`get_image_dir()` だけ）、`dom.js` → `settings.js`。`rules/` は `rules/` の中だけ
  （`position.js` は import なし）。`board_view.js` と `ui/` は `board_controller.js` を import しない。
  辿った範囲で循環は無い
- **ui がゲームの状態や操作を参照しない**: `ui/*.js` の import は `base.js`・`log.js`・
  `settings.js` の `get_image_dir()` だけ。`Settings` のインスタンス・`gameinfo`・`rules/`・
  送信は読まない（`ui/base.js` の `get_image_dir()` は変える前からあり、画像のパスを読むだけ）
- **状態とタイマーの持ち主**: `gameinfo`・`hist_i` / `hist_n`・クロックの基準は
  `BoardController` のフィールドだけ。オープニングの `setTimeout` と 200 ms の `setInterval` は
  `board_controller.js` にしか無い（grep）。掴んでいる状態は `board_view.js` の `Drag` だけ
- **作らないと決めたもの**: `BoardModel`・`config.js`・`dispose()`・入力の解除・`present()` の
  中間の値・判定の無い `plan_*` は無い。`rules/actions.js` はコメント 1 行しか変わっていない
- **ドラッグの順番**: 掴めるか確かめてから先端の駒へ持ち替える（`board_view.js:108-123`）、
  `this.checker = undefined` のあとに Controller を呼ぶ（`:141`→`:149`）、成り立たなければ
  `checker_src` へ戻す（`:151`）、チェッカーとキューブの掴んだ位置を別に持つ。旧 `drag.js` と同じ
- **キューブを離す条件**: `src_y` は掴んだときの `cube.y`、`y` は最後に動かした `cube.y`、
  `y0` / `y1` は `Cube` の値をそのまま渡す（`:186-187`）。判定は `rules/actions.js` の
  `plan_cube_drop()` のままで、条件式は触っていない
- **送る順と予測の順**: `drop_checker()` は送ってから `predict()`、free move のダイス
  （`click_dice()`）と得点（`score()`）は `predict()` してから送る、free move の駒は予測しない。
  `predict()` は `render(..., {clock: false})` だけで、クロックの基準と `play_effects()` に触れない
- **演出の判定**: `effects_for()` の条件は旧 `apply()` と同じ（`roll` は `turn != -1`、
  `opening` / `end_turn` は新しい `turn` が 0 / 1、`put_checker` は変更前の盤面の位置、
  `move` は `moves` のバーへの移動）。音の順も roll → turn_change → put/hit で同じ。
  範囲外の ID は旧実装と同じく鳴らさない。演出は `receive()` の中だけなので、描画し直しや予測では増えない
- **オープニング**: 予約の条件（`has_dice(gi, 1 - player)`、送る前の盤面）と、実行時に
  `click_dice(player, 0)` が最新の `gameinfo` で判定する点は旧実装と同じ。受信では予約しない
- **キーボード**: `view.roll_btn[player].active` / `view.pass_btn[player].active` のときだけ。
  パスはバナーを隠してから `end_turn` を送る（旧 `on_pass` と同じ）
- **座標変換と反転**: `BoardView.to_xy()` は旧 `get_xy()` / `inverse_xy()` と同じ式
  （原点と大きさは盤面、向きは `settings.player == 1`）。`touch2mouse()` と `preventDefault()` も残る
- **画像の待ち**: `build_dom()` はモジュールの評価時、`Settings`・`BoardView`・`BoardController` は
  `wait_images()` のあと。`Settings` は旧 `Board` のコンストラクタの中と同じく、
  `set_global_sound_switch()` のあと・部品を作る前に作られる。メニューやヘッダの
  `change` が読み込み前に起きたときに `undefined` を読むのは旧実装と同じ
- **4 つの挙動**: Clock のチェックボックスは送るだけ（`main.js`、`set_clock_switch()`）、
  `receive()` は `clock_state` があれば履歴の返事でも全部反映、掴んでいるキューブは
  座標を残す、`server.py` から `history_flag` を消した（呼ぶ側 3 か所。位置引数で 2 番目を
  渡している呼び出しは残っていない）。`tests/` と `src/` に `history_flag` は残っていない
  （`docs/design-4.md` と CLAUDE.md の経緯の記述だけ）。`clock.test.mjs` の 2 件は、
  返事を止めた状態・履歴の返事で、表示と `active` / `checked` を見ていて、変える前のコードで落ちる形
- **クロックの計算**: `snapshot()` / `tick()` は旧 `PlayerClock.update()` と同じ式
  （猶予がマイナスなら持ち時間から引く、止まっている間は基準時刻を今にする）
- **helper**: `record_apply()` は `receive` と `predict` の両方を包み、予測では
  `has_last_op` / `has_clock_state` が偽になる（旧 `apply()` の opts と同じ意味）。
  予測を外す・失敗させる helper は `controller.plan_move` の 1 か所を差し替える。
  `drop_checker()` は `this.plan_move()` で引くので差し替えが効く。`pip_count()` が表示を
  変えなくなった点は、`rules.test.mjs` の表示の確認が `render()` の書いた値を読むことになり、
  弱くはなっていない（つながりの件は上の 3）。`put_checker_local()` の音はテストが見ていない
- **Developer.md**: 構成図・モジュール表・受信と描画の流れ・ドラッグ・時計の説明が新しい構成と
  合っている。TODO の番号は書かれていない（grep で `TODO-` 0 件）。`Board` / `actions.js` /
  `drag.js` / `RollButton` の古い参照は残っていない
