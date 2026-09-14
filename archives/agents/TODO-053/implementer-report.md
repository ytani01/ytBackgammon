# TODO-053 implementer の報告

## 変えたファイルと要点

- `src/ytbg/webroot/static/js/drag.js`（新規）— `Drag` クラス。掴む・動かす・離すと、掴んでいるもの・掴んだ位置を持つ
- `src/ytbg/webroot/static/js/settings.js:1-2, 106-` — `Settings` クラスを追加（`log` と `sound.js` を import）
- `src/ytbg/webroot/static/js/board.js`
  - `:1-16` import を差し替え（`actions.js` から `disable_unusable` を外し、`Drag` / `Settings` / `copy_gameinfo` / `rules/move.js` の `disable_unusable`）
  - `:76-80` `this.settings = new Settings(svr_id)`、`this.drag = new Drag(this)`。`free_move` / `disp_pip` / cookie / `sound` / `player` / `moving_checker` の初期化を削除
  - `:254` 反転の判定を `this.settings.player` に
  - `:261-` `load_sound_switch()` / `apply_sound_switch()` / `apply_free_move()` / `load_player()` / `set_player()` を削除。`apply_disp_pip()` は `settings.apply_disp_pip()` を呼んで PIP の表示だけ切り替える形に
  - `:673` `apply()` で手元へ戻す駒を `this.drag.checker` から取る
  - `:834, 856` `predict_gameinfo()` の複製を `copy_gameinfo()`、使えない目を `rule_disable_unusable()` の戻り値で置き換え
  - `:869-871` `inverse()` は `settings.set_player()`
  - `:925` `on_mouse_move_xy()` は `this.drag.move()`
- `src/ytbg/webroot/static/js/actions.js` — `copy_gameinfo` / `disable_unusable` を削除して `rules/` から import。`roll()` は戻り値を代入。`board.free_move` → `board.settings.free_move`（3 か所）、`board.player` → `board.settings.player`（3 か所）。`move()` の `board.moving_checker = undefined` を削除（下の「迷って決めたこと」）
- `src/ytbg/webroot/static/js/rules/move.js` — `disable_unusable(pos, player, dice_vals)` を追加。新しい配列を返す。`log` は呼ばない（`rules/` は外を import しない）
- `src/ytbg/webroot/static/js/rules/position.js` — `copy_gameinfo()` を追加
- `src/ytbg/webroot/static/js/ui/checker.js` — マウスの 3 つは `board.drag` を呼ぶだけ。`cancel_move()`、`src_x/src_y`、actions と log の import を削除
- `src/ytbg/webroot/static/js/ui/cube.js` — 同上。`moving`、`src_x/src_y`、離したときの判定（`drag.js` へ移した）を削除
- `src/ytbg/webroot/static/js/ui/label.js:107` — `PlayerPipCount` は `board.settings.disp_pip` を読む
- `src/ytbg/webroot/static/js/ui/base.js` — クラス階層図に `Drag` / `Settings` を追加。`get_xy()` はプレーヤー番号を `board.settings.player`（Board 自身は `this.settings.player`）から読む
- `src/ytbg/webroot/static/js/sound.js:37` — `board.settings.sound`
- `src/ytbg/webroot/static/js/main.js` — `board.settings.player`、Sound / Free のチェックボックスは `board.settings.apply_*()` へ。Pip は `board.apply_disp_pip()` のまま
- テスト: `tests/js/move.test.mjs`（`disable_unusable()` 3 件）、`tests/js/position.test.mjs`（`copy_gameinfo()` 1 件）、`tests/browser/` の board / predict / opening / player_cookie / clicks を移した先に合わせた（clicks は `board_attr` を `settings_attr` に置き換え）

## クラスの形

```js
class Drag {                // drag.js
  constructor(board)        // checker: Checker|undefined, cube: boolean, src_x, src_y
  move(x, y)                // 掴んでいるものをカーソルへ
  pick_checker(ch, x, y)    // can_pick_checker() → 先端の駒に持ち換えて掴む
  drop_checker(x, y)        // checker を外してから actions.drop_checker()。false なら src へ戻す
  hold_cube(x, y)           // can_hold_cube() → 掴む
  drop_cube(x, y)           // 位置から take / double / cancel_double を選んで呼ぶ
}
class Settings {            // settings.js
  constructor(svr_id)       // cookie, sound, free_move, disp_pip, player
  load_sound_switch() / apply_sound_switch() / apply_free_move() / apply_disp_pip()
  load_player() / set_player(player)
}
```

## 対応表

| 前 | 後 |
|----|----|
| `board.moving_checker` | `board.drag.checker` |
| `Cube.moving` | `board.drag.cube` |
| `Checker.src_x/src_y`、`Cube.src_x/src_y` | `board.drag.src_x/src_y` |
| `Checker.cancel_move()` | `Drag.drop_checker()` の中 |
| `Cube.on_mouse_up_xy()` の判定 | `Drag.drop_cube()` |
| `board.sound` / `board.free_move` / `board.disp_pip` / `board.player` | `board.settings.*` |
| `board.cookie`、`cookie_board_player`、`cookie_sound`、`el_sound` | `board.settings.cookie`、`cookie_player`、`cookie_sound`、`el_sound` |
| `board.load_sound_switch()` / `apply_sound_switch()` / `apply_free_move()` / `load_player()` / `set_player()` | `board.settings.*()` |
| `board.apply_disp_pip()` | 残す（値は `settings.apply_disp_pip()`、表示の切り替えは Board） |
| `actions.js` の `disable_unusable()`（書き換え） | `rules/move.js` の `disable_unusable()`（新しい配列） |
| `actions.js` の `copy_gameinfo()`、`predict_gameinfo()` の複製 | `rules/position.js` の `copy_gameinfo()` |

## 走らせたテスト

- `node --test tests/js/move.test.mjs tests/js/position.test.mjs` — 78 件通過、終了コード 0
- `node --test tests/browser/board.test.mjs predict clicks player_cookie opening sound last_op rules debug` — 85 件通過、終了コード 0。
  結果として `tests/browser/` の全ファイルを 1 回走らせた（settings.js・sound.js・log.js の循環 import に関わるので sound / debug / last_op も含めた）
- Python 側は触っていないので走らせていない

## 壊して確かめたこと（すべて戻した）

| 壊し方 | 結果 |
|--------|------|
| `disable_unusable()` が渡した配列をそのまま返す | move.test の 3 件が落ちる |
| `Drag.drop_checker()` で checker を外さない | board / predict の 7 件が落ちる |
| `Drag.drop_cube()` の take と redouble の条件を反転 | clicks のキューブの項目などが落ちる |
| `Settings.load_player()` の `parseInt` を外す | player_cookie が落ちる |
| `predict_gameinfo()` で使えない目を 11〜16 にしない | predict の 1 件が落ちる |
| `Drag.drop_checker()` で checker を外すのを actions を呼んだ**あと**にする | **落ちない** |
| `apply()` が掴んでいる駒を手元へ戻さない（`mv_ch = undefined`） | **落ちない** |
| `get_xy()` が `settings.player` を見ず 0 にする | **落ちない** |
| `SoundBase.play()` が `settings.sound` を見ない | **落ちない** |
| `PlayerPipCount` の初期表示を反転 | **落ちない** |

## テストで押さえられていないところ

- **ドラッグ中に gameinfo が届いたとき、掴んでいる駒が手元に残ること。** 既存テストに無い。
  scratchpad に使い捨てのスクリプトを書いて確かめた（free move で駒を掴んで動かし、
  `set_playername` を送って gameinfo を届かせる → 座標が変わらない。
  `apply()` 側を壊すと座標が戻って落ちる）。テストには足していない（範囲外）
- 離すときに checker を外す順番（上の表）
- プレーヤー 1 の向き（反転した画面）での座標の変換
- Sound のチェックを外したときに音が止まること、PIP の初期表示

## 迷って決めたこと

1. **`move()` の `board.moving_checker = undefined` を消し、`Drag.drop_checker()` が actions を呼ぶ前に外す。**
   actions.js が drag の状態を触らないようにするため。`true` / `false` のどちらでも最後は外れていたので、結果は同じ
2. **キューブを離したときの判定（take / double / cancel_double の選択）は `drag.js` に置いた。**
   キューブの座標（`y0` / `y1`）と掴んだ位置で決まるので「離す」処理として扱った。送信は actions.js のまま。
   actions.js へ移すべきならレビューで判断してほしい
3. **`copy_gameinfo()` の置き場は `rules/position.js`。** actions.js と board.js の両方から使い、board.js → actions.js の import を無くすため。DOM を見ない純粋関数
4. **`Settings.disp_pip` の初期値はチェックボックスから読む。** 以前は `board.disp_pip = false` だが、`PlayerPipCount` はチェックボックスを直接読んで表示を決めていた。表示を変えないようにそちらに合わせた（ブラウザがチェックを復元したときだけ差が出る）。`free_move` は以前どおり `false` で始める
5. **`Board.player` は残さず `board.settings.player` に置き換えた**（getter で残す案もあったが、状態を 1 か所にするため）。`BgBase` が入れる `Board.player` は `undefined` のまま
6. `Drag.move()` はチェッカーとキューブの両方を動かす。以前の `Checker.on_mouse_move_xy()` はチェッカーだけ、`Cube` はキューブだけを動かしていたが、同時に両方掴めるのはマルチタッチで free move のときくらいなので 1 つにまとめた
7. `settings.js` が `log.js` と `sound.js` を import するので、`log.js` → `settings.js` → `log.js` の循環になる。
   トップレベルで呼ぶのは `log.js` の `get_debug_query()`（関数宣言なので先に使える）だけで、debug.test は通った

## 実装しなかったこと

- **`CLAUDE.md` の構成の説明は直していない。** implementer の定義で `CLAUDE.md` を触らないことになっているため。直す箇所の候補:
  - `:302` 付近の `actions.js` の説明（`disable_unusable` / `copy_gameinfo` の記述があれば）と、`drag.js` の項目の追加
  - `:311` `settings.js` の説明に `Settings`（音・free move・PIP・プレーヤー番号）を追加
  - `rules/` の `move.js` に `disable_unusable()`、`position.js` に `copy_gameinfo()` を追加
  - `:422` 「`Checker.on_mouse_up_xy()` は `actions.js` の `drop_checker()` を呼ぶだけ」→ `Drag.drop_checker()`。「`drop_checker()` が `false` を返したら … `Checker` が元の位置へ戻す」→ `Drag`
  - `main.js` の説明の `window.board` 以外に、`board.settings` / `board.drag` を触るテストの注意が要るか
- `docs/Developer.md`（TODO-055）
- 上の「押さえられていないところ」のテストの追加

## 残りの修正

管理者の指示（キューブの判定を actions.js へ、ドラッグ中の gameinfo のテスト、`CLAUDE.md`）で直した。

### 変えたところ

- `src/ytbg/webroot/static/js/actions.js:381-427` — `drop_cube(board, src_y, y)` を追加。
  take / double / cancel_double を選ぶ判定を `Drag.drop_cube()` からそのまま移した
- `src/ytbg/webroot/static/js/drag.js:9-10, 118-133` — import を `drop_cube` に差し替え、
  `Drag.drop_cube()` は掴んでいる状態を外して `actions.drop_cube(board, src_y, board.cube.y)` を呼ぶだけに。
  **離した位置は引数の `x, y` ではなく `board.cube.y`（最後に動かしたキューブの位置）を渡す。**
  TODO-053 より前の `Cube.on_mouse_up_xy()` も `this.y` を見ていたので、動きを変えないため
- `tests/browser/drag.test.mjs`（新規）— free move で `#p000` を掴んで動かし、page2 から
  `set_playername` を送って page1 に gameinfo を届かせ、`board.drag.checker` の id・x・y が変わらないことを見る
- `CLAUDE.md:119-120` テストの一覧に `drag.test.mjs`、`:304-320` `actions.js` に `drop_cube()` と `drag.js` の項目、
  `:323-331` `settings.js` に `Settings`（`board.settings.player`）、`:334-336` `rules/` に `copy_gameinfo()` / `disable_unusable()`、
  `:439-440, 447` 先行実行の説明を `Drag` 経由に

### 走らせたテスト

- `node --test tests/browser/drag.test.mjs tests/browser/clicks.test.mjs` — 44 件通過、終了コード 0

### 壊して確かめたこと（戻した）

| 壊し方 | 結果 |
|--------|------|
| `Board.apply()` の `const mv_ch = this.drag.checker` を `undefined` に | drag.test の 1 件が落ちる（「掴んでいる駒が定位置へ戻った」） |
| `actions.drop_cube()` の take / redouble の条件を反転 | clicks のリダブル・テイクなど 4 件が落ちる |

### 残る懸念

- 「チェッカーを離すとき、actions を呼ぶ前に `checker` を外す」順番は、今もテストで守られない。
  `CLAUDE.md` の `drag.js` の項目にそう書いた
- `CLAUDE.md:88` の `rules.test.mjs` の「ほかの 2 つはドラッグを free move で行う」は、ファイルが増えた今は数が合わない（範囲外なので触っていない）

## レビュー後の修正

前の担当が途中で止まっていた。始めた時点で `drag.js` / `ui/checker.js` / `ui/cube.js` の
要修正 1 のコードは入っていたが、テストと 2〜4 は入っていなかった。

### 変えたところ

1. **要修正 1（掴んだ位置を分ける）**
   - `src/ytbg/webroot/static/js/drag.js:24-29, 38-65, 87, 146, 162` — `checker_src` / `cube_src_y` を別に持ち、
     `move()` を `move_checker()` / `move_cube()` に分けた（前の担当の分。中身を確かめた）。
     `ui/checker.js:53` は `move_checker()`、`ui/cube.js:109` は `move_cube()`、`board.js:925` は `move()`
   - `tests/browser/drag.test.mjs:81-116` — 1 件足した。プレーヤー 1 がダブル（キューブは 0 の側で未テイク）、
     free move で `hold_cube()` → `pick_checker()` → キューブを `y0 + 30` へ → `drop_cube()` → `take` を送ったか
2. **検討 3（循環を 1 つ減らす）**
   - `src/ytbg/webroot/static/js/settings.js:1-4` — `sound.js` の import を外し、先頭に「トップレベルで `log()` を呼ばない」と書いた。
     `apply_sound_switch()` から `set_global_sound_switch(get_sound_query())` を外した
   - `src/ytbg/webroot/static/js/main.js:183-187` — `sound-switch` のハンドラで `set_global_sound_switch(get_sound_query())` を呼んでから
     `board.settings.apply_sound_switch()`。HEAD にあった `GlobalSoundSwitch=` のログ 1 行は無くした
3. **好みの範囲 5・6**
   - `settings.js:113-114` — 「チェックボックスを読んで値を持つ。PIP の表示は変えない」
   - `rules/position.js:4-5` — 「受け取るのは gameinfo・Position・player・出目のような単純な値だけ」
4. **テストの穴 2 つ** — `tests/browser/settings.test.mjs`（新規、3 件）
   - Sound を外す → 開き直しても `board.settings.sound` が false、チェックも外れたまま
   - Pip のチェックが外れていれば PIP の opacity は 0
   - Pip にチェックが入っていれば最初から 1。チェックは `addInitScript()` で `DOMContentLoaded` のときに入れる
     （`page.route()` で `index.html` を書き換える形を先に試したが、fulfill したページは
     `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` で `/ws` へつなげず、待ちがタイムアウトした）
5. `CLAUDE.md` — テストの一覧（`drag.test.mjs` の追記、`settings.test.mjs` の項目）、`drag.js` の掴んだ位置の説明、
   `settings.js` の循環と `set_global_sound_switch()` の置き場

### 走らせたテスト

- `node --test tests/browser/drag.test.mjs tests/browser/sound.test.mjs tests/browser/settings.test.mjs tests/browser/clicks.test.mjs tests/browser/debug.test.mjs tests/browser/player_cookie.test.mjs`
  — 57 件通過、fail 0

### 壊して確かめたこと（戻した）

| 壊し方 | 結果 |
|--------|------|
| `Drag.pick_checker()` で `cube_src_y` もチェッカーの y で上書きする（1 組で持っていた形） | drag.test の足した 1 件が落ちる（`take を送っていない: put_checker`） |
| `Settings.apply_sound_switch()` の `cookie.set()` を外す | settings.test の Sound の 1 件が落ちる |
| `PlayerPipCount` の初期表示を `if ( false )` に | settings.test の「最初から出る」が落ちる |
| `PlayerPipCount` の初期表示を `if ( true )` に | settings.test の「最初は出ない」が落ちる |

2 行目と 3 行目は、戻し損ねて 2 つの壊し方が重なった状態でも走らせてしまった（Sound の 1 件も同時に落ちている）。
そのあと手で戻し、4 行目は単独で走らせた。最後の 57 件はすべて戻したあと。

### 残る懸念

- `sound-switch` のハンドラで `?sound` を読み直すことは、テストで押さえていない（`sound.test.mjs` は起動時の値だけを見る）。
  もともと起動時にも読んでいて、ページの中で URL は変わらないので、読み直しを消しても動きは変わらないはず
- マルチタッチで両方を動かしたときに、指ごとに自分の側だけが動くこと（`move_checker()` / `move_cube()`）はテストに無い。
  足したテストは `Drag` のメソッドを直接呼んでいて、touch イベントは通していない
