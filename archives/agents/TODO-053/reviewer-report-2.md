# TODO-053 reviewer の報告（2 回目: レビュー後の修正）

対象: `implementer-report.md` の「レビュー後の修正」。`drag.js`（全文）、
`main.js` / `settings.js` / `rules/position.js` の差分、`tests/browser/drag.test.mjs`、
`tests/browser/settings.test.mjs`。変更前は `git show HEAD:...` の `board.js` /
`ui/checker.js` / `ui/cube.js` / `main.js` と照らした。
テストは走らせていない（指示どおり）。以下の判断はコードを読んだもので、実測はしていない。

## 要修正

なし。

## 検討

### 1. `tests/browser/drag.test.mjs:103-108` — `Drag` を直接呼ぶので、`Checker` / `Cube` から `Drag` へのつなぎは見ていない

**問題:** 足したテストは `board.drag.hold_cube()` などを直接呼ぶ。`ui/cube.js:101,117` や
`ui/checker.js:37,45` が別のメソッドを呼ぶように壊れても、このテストは落ちない
（コードを読んで確認。壊して走らせてはいない）。

**判断:** 放っておいてよい。ただ、テストの呼び先を
`board.cube.on_mouse_down_xy()` / `ch.on_mouse_down_xy()` /
`board.cube.on_mouse_up_xy()` / `ch.on_mouse_up_xy()` に変えれば、
追加の手間なしで表示部品のつなぎも見られる（touch イベントは要らない。
`BgBase.on_mouse_down()` などは `get_xy()` のあとにこれらを呼ぶだけ。`ui/base.js:225-244`）。

実装者が挙げた残る穴の 2 つ目（指ごとに自分の側だけが動くか）は、**テストにしても
区別がつかない**ので放っておいてよい。チェッカーとキューブの要素は `#board` の子で
（`dom.js:101-185` の `board_el.appendChild`）、`stopPropagation()` はどこにも無い。
`mousemove` / `touchmove` は `Checker` か `Cube` のハンドラのあと `#board`（`Board`）へ
伝わり、`Board.on_mouse_move_xy()` が両方を同じ位置へ動かす。**変更前も同じ**
（HEAD の `Board.on_mouse_move_xy()`）。つまり `move_checker()` / `move_cube()` を
取り違えても、画面に出る結果は変わらない（未確認。実機・ブラウザでは見ていない）。

## 好みの範囲

### 2. `tests/browser/drag.test.mjs:91-92` — `sleep(500)` は要らない

`clicks.test.mjs:617-619` の `sleep(500)` は、画面の位置を押すために CSS の
transition が終わるのを待っている。こちらは `cube.x` / `cube.y` を JS から読んで
`Drag` に渡すだけで、`BgBase.move()`（`ui/base.js:104-105`）は `x` / `y` をその場で
書き換える。コメントの「0.3 秒かけて動く」も、この呼び方では理由にならない。
害は無い。

## 確かめて問題なかったこと

- **掴んだ位置を分けたこと（前回の要修正 1）**
  - `pick_checker()` は `checker_src` だけ、`hold_cube()` は `cube_src_y` だけを書く。
    `drop_cube()` は `cube_src_y` を渡す。前回の手順（キューブ → チェッカー → キューブを
    離す）で、`src_y` がチェッカーの y に書き換わることは無くなった
  - 動かす: `Checker` → `move_checker()`、`Cube` → `move_cube()`、`Board` → `move()`
    （両方）。HEAD の `Checker.on_mouse_move_xy()` / `Cube.on_mouse_move_xy()` /
    `Board.on_mouse_move_xy()` と対応が一致する
  - 片方を離す: `drop_checker()` は `checker` だけ、`drop_cube()` は `cube` だけを外す。
    HEAD でも `Checker.on_mouse_up_xy()` は `moving_checker` だけ、
    `Cube.on_mouse_up_xy()` は `moving` だけを見ていた。離していない側は掴んだまま残り、
    `Board` の移動で動き続けるのも同じ
  - キャンセル: `checker_src` へ戻す。HEAD は `ch.src_x/src_y`（`pick` のときに先端の駒へ
    書いたもの）へ戻していたので、戻る先は同じ。チェッカーを掴み直すと上書きされるのも同じ
  - 離したキューブの位置: `board.cube.y`。HEAD の `this.y` と同じ値で、どちらも
    離した座標へは動かさずに判定する
- **`?sound` の効き方**
  - HEAD で `set_global_sound_switch()` を呼ぶのは、起動時の `main.js` と
    `Board.apply_sound_switch()`（呼び元は `sound-switch` のハンドラだけ）の 2 か所。
    今は起動時の `main.js:119-120` と `sound-switch` のハンドラ（`main.js:183-187`）で、
    呼ぶ時点も「チェックボックスを読む前」で同じ
  - `settings.js` は `sound.js` を import しなくなり、残る循環は `log.js` との 1 つ。
    先頭のコメントの「トップレベルで `log()` を呼ばない」は、今の `settings.js` で
    守られている（トップレベルは import と関数・クラスの宣言だけ）
- **残る穴の 1 つ目（`sound-switch` で `?sound` を読み直す）は放っておいてよい。**
  URL はページの中で変わらず、起動時に同じ値を入れているので、読み直しは今でも
  何も変えない。消しても `sound.test.mjs` は通るはずだが、消しても動きは変わらないので、
  守るべき動きがそもそも無い。テストを足す価値は無い
- **`settings.test.mjs`**
  - Sound: `apply_sound_switch()` の保存を外す壊し方で落ちる（実装者が実測）。
    開き直したあとのチェックボックスも見ているので、`load_sound_switch()` の
    書き戻しを外しても落ちる形
  - PIP: 「最初は出ない」「最初から出る」の 2 件で、`PlayerPipCount` の初期表示を
    どちらに固定しても片方が落ちる（実装者が実測）。`Settings.disp_pip` の初期値を
    `false` に戻す壊し方も「最初から出る」で落ちる形（コードを読んで確認）。
    `addInitScript()` の `DOMContentLoaded` は、`Board` を作る `window.onload` より前なので、
    チェックを入れる時点として正しい
- **`drag.test.mjs` の足した 1 件:** 掴んだ位置を 1 組に戻す壊し方で落ちる（実装者が実測）。
  `includes('take')` なので、チェッカーを離して送る `put_checker` が混ざっても誤判定しない
- **好みの範囲 5・6 の直し:** `settings.js:111-112` の説明と `load_sound_switch()`、
  `rules/position.js:4-5` の説明と `copy_gameinfo()` は合っている
- **`CLAUDE.md`:** `drag.js` の節（掴んだ位置を分ける理由、動かすメソッドの対応）、
  `settings.js` の循環と `set_global_sound_switch()` の置き場、テストの一覧は
  コードと合っている。前回の検討 2（`clicks.test.mjs` は free move ではない）も
  「`board.test.mjs` と `drag.test.mjs`」に直っている
