# TODO-053 reviewer の報告

対象: 未コミットの差分（`git diff` と新規の `drag.js` / `tests/browser/drag.test.mjs`）。
変更前は `git show HEAD:<path>` と照らした。テストの一式は走らせていない
（使い捨てのスクリプトを scratchpad で 2 本だけ走らせた）。

## 要修正

### 1. `drag.js:25-26, 38-45, 67, 115, 131` — チェッカーとキューブを同時に掴むと、動きが変わる

**問題:** `Drag` は掴んだ位置を `src_x` / `src_y` の 1 組だけで持ち、
`move()` は掴んでいるもの全部を動かす。変更前は `Checker.src_x/src_y` と
`Cube.src_x/src_y` が別々で、`Checker.on_mouse_move_xy()` はチェッカーだけ、
`Cube.on_mouse_move_xy()` はキューブだけを動かしていた（両方動かすのは
`Board.on_mouse_move_xy()` だけ）。

**起きる状況:** チェッカーとキューブを同時に掴んでいるとき。
キューブは「ダイスが無い」ときしか掴めず、チェッカーは free move でない限り
「使えるダイスがある」ときしか掴めないので、実際には **free move で、
マルチタッチ（指 2 本）** のとき。touch イベントは触り始めた要素に届くので、
指ごとに `Cube` と `Checker` のハンドラが呼ばれる。

- キューブを掴む → チェッカーを掴む → キューブを離す: `src_y` がチェッカーの
  位置に書き換わっており、`drop_cube()` の `src_y == cube_ui.y1[p]` が
  外れて **take / redouble が送られない**
- 指を動かすと、どちらの指の `touchmove` でもチェッカーとキューブの両方が
  その指の位置へ飛ぶ（コードを読んで確認。実機のタッチでは未確認）
- 逆順（チェッカー → キューブ）で、チェッカーを戻す場面があれば、
  キューブの元の位置へ戻る（free move では `drop_checker()` が必ず `true` を
  返すので、今の条件では起きない。コードを読んで確認）

**根拠（実測）:** scratchpad のスクリプトで、プレーヤー 1 にダブルを
掛けさせ（`side: 0`, 未テイク）、free move で
`board.drag.hold_cube()` → `board.drag.pick_checker()` → キューブを `y0 + 30`
へ動かして `drop_cube()`。

| 手順 | `src_y` | 送ったもの |
|------|---------|------------|
| チェッカーを掴まない（対照） | 392.5（= `y1[0]`） | `take` |
| 間でチェッカーを掴む | 205 | なし |

実装者の「迷って決めたこと」6 は、この差を承知でまとめている。
リファクタリングで動きを変えない指示に対して、変わっている。

**直し方の案:** 掴んだ位置をチェッカー用とキューブ用に分けて持つ
（例: `checker_src` と `cube_src_y`）。`move()` も `move_checker()` /
`move_cube()` に分け、`Checker` / `Cube` は自分の側だけ、`Board` は両方を
呼ぶ（変更前と同じ）。テストは、上の手順を `clicks.test.mjs` か
`drag.test.mjs` に 1 件足せば、壊し方を判別できる。

## 検討

### 2. `CLAUDE.md:88-89` — `clicks.test.mjs` のドラッグは free move ではない

**問題:** 「`board.test.mjs` と `clicks.test.mjs` のドラッグは free move で
行うので、ルール判定を通らない」と書き直したが、`clicks.test.mjs` の
ドラッグはキューブ（`tests/browser/clicks.test.mjs:585-630`）で、free move に
していない。free move でチェッカーをドラッグするのは `board.test.mjs` と
新しい `drag.test.mjs`。`predict.test.mjs` はルール判定を通るドラッグをしている。

**起きる状況:** 次のセッションが「ルール判定を通るドラッグは
`rules.test.mjs` しか見ていない」と誤読する。

**直し方の案:** 「`board.test.mjs` と `drag.test.mjs` はチェッカーのドラッグを
free move で行う（ルール判定を通るドラッグは `predict.test.mjs`）」のように直す。
実装者の報告では「範囲外なので触っていない」とあるが、差分では直している
（管理者が直したものか、未確認）。

### 3. `settings.js:1-2` — import の循環が 2 つ増えた

**問題:** `settings.js` が `log.js` と `sound.js` を import したので、
`log.js → settings.js → log.js` と `log.js → settings.js → sound.js → log.js`
の循環ができた（HEAD には無い。import 文を機械的に辿って確認）。

**起きる状況:** 今は動く。`main.js` が最初に `log.js` を読むので、評価順は
`sound.js` → `settings.js` → `log.js` になり、`sound.js` と `settings.js` は
トップレベルで `log()` を呼ばない。`log.js` のトップレベルが呼ぶ
`get_debug_query()` は関数宣言なので、どの順でも呼べる。
**`sound.js` か `settings.js` のトップレベルで `log()` を呼ぶ、
`get_debug_query()` を `const` の関数に書き換える、のどちらかで
TDZ の `ReferenceError` になる。**

**直し方の案:** `set_global_sound_switch(get_sound_query())` を
`main.js` の `sound-switch` のハンドラ側で呼び（`main.js` は両方を既に
import している）、`settings.js` から `sound.js` の import を外す。
`log.js` との循環は残るので、残すなら `settings.js` の先頭に
「トップレベルで `log()` を呼ばない」と一言書く。

### 4. `rules/move.js:276-279` — バーから出られないとき、0 の目が 10 になる（既存の挙動）

**問題:** `usable_dice()` はバーから出られない盤面で全部 `false` を返すので、
`disable_unusable()` は空きの 0 も `0 % 10 + 10 = 10` にする。

**根拠（実測）:** プレーヤー 0 がバーにいて 19〜24 が塞がれた盤面で
`disable_unusable(pos, 0, [3, 5, 0, 0])` → `[13, 15, 10, 10]`。
変更前の `actions.js` の版も同じ条件で同じ書き換えをする（コードを読んで確認）
ので、**TODO-053 で変わったものではない**。10 が表示やサーバで問題に
なるかは未確認。

**直し方の案:** この項目では動きを変えないので、別の項目にするか見送るか。
足した 3 件のテストはこの盤面を含まない。

## 好みの範囲

### 5. `settings.js:111-112` — 「表示は変えない」とあるが、`load_sound_switch()` はチェックボックスを書き換える

`this.el_sound.checked = this.sound`（`settings.js:146`）。「PIP の表示は変えない」
程度に絞るとずれない。

### 6. `rules/position.js:4-5` — 先頭の説明と `copy_gameinfo()` が合わない

「受け取るのは Position と player と出目のような単純な値だけ」とあるが、
`copy_gameinfo()` は gameinfo を受け取る（`Position.from_gameinfo()` も既に
そうなので、ずれは以前からある）。

## 確かめて問題なかったこと

- **チェッカーのドラッグ（1 本の指・マウス）**
  - 掴めない場面: `pick_checker()` は `can_pick_checker()` を先に見て、
    掴まずに戻る。変更前と同じ
  - 先端の駒への持ち換え、`src` の記録、`set_z(1000)`: 同じ
  - 離す順番（「迷って決めたこと」1）: 変更前は `move()` の中で
    `apply()` の直前に、`put_checker` の経路では送ったあとに、キャンセルでは
    `cancel_move()` で外していた。どれも同期の処理の中なので、先に外しても
    結果は同じ
  - 盤の外に離す: `mouseup` がどの `Checker` / `Cube` にも届かなければ
    掴んだまま残るのは変更前と同じ（`Board.on_mouse_up_xy()` は基底の no-op）
  - ドラッグ中に `gameinfo` が届く: `apply()` が `this.drag.checker` を読む。
    `drag.test.mjs` がこれを見ている
  - 掴んだまま別のチェッカーを押す: 掴むものと `src` が上書きされるのは
    変更前と同じ
- **キューブ:** `can_hold_cube()` → 掴む、の順は同じ。`drop_cube()` に
  `board.cube.y` を渡すのは、変更前の `Cube.on_mouse_up_xy()` が `move()` を
  呼ばずに `this.y` を見ていたのと同じ値。判定の分岐も写したまま
  （`this.board.player` → `board.settings.player` だけ）。置き場を
  `actions.js` にしたのは、`docs/design.md` の「行き先の判定と送信は
  `actions.js` に任せる」に合う。`Cube.on_mouse_down_xy()` の `return false` が
  消えたが、`BgBase.on_mouse_down()` は戻り値を見ていない
- **設定**
  - cookie の名前（`board{id}_player` / `board{id}_sound`）、音の読み込みと
    保存、`?sound` の再読み込み: 同じ。`apply_sound_switch()` から
    `el_sound.checked = this.sound` が消えたが、読んだ要素そのものへの
    書き戻しなので意味は無かった
  - `disp_pip` の初期値（「迷って決めたこと」4）: HEAD で `board.disp_pip` を
    読むのは `apply_disp_pip()` の中だけ（`git grep` で確認）なので、初期値を
    チェックボックスから取っても動きは変わらない
  - プレーヤー番号: `Settings.load_player()` に `parseInt` が残っている
    （TODO-050）。`Board` の末尾で 1 なら 0 にしてから `inverse(0)` する流れも同じ
  - `Board.player` を無くしたこと（「迷って決めたこと」5）: `src/` と `tests/` に
    `board.player` を読むところは残っていない。`get_xy()` の `Board` 自身は
    `this.settings.player` を読むので、反転した画面の座標変換も変わらない
- **ルール層:** `disable_unusable()` と `copy_gameinfo()` はどちらも DOM も
  `Board` も見ず、import も増やしていない（`rules/` の import は
  `position.js` だけ）。`disable_unusable()` は `map` で新しい配列を返し、
  `usable_dice()` は常に `dice_vals` と同じ長さを返すので、変更前の
  書き換えと結果は同じ。`predict_gameinfo()` と `roll()` は戻り値を
  代入している
- **依存の向き:** `board.js` → `actions.js` の import は **残っている**が、
  中身は `end_turn` / `set_clock_switch` / `set_clock_limit` の送信だけで、
  TODO が問題にした `disable_unusable` は無くなった。`actions.js` は
  `board.js` / `drag.js` を import しないので、`board → drag → actions` に
  循環は無い（循環は上の 3 だけ）
- **`ui/base.js` のクラス階層図:** `Drag` と `Settings` は `BgBase` の
  派生ではないので、`CookieBase` / `SoundBase` と同じ並びに置いたのは正しい
- **`CLAUDE.md` の `drag.js` / `settings.js` / `rules/` / 先行実行の節:**
  コードと合っている。ただし「この順番はテストでは守られない」は、
  `drag.test.mjs` を足したあとには測り直していない（`drag.test.mjs` は
  駒を離さないので、今も守られないはず。未確認）
