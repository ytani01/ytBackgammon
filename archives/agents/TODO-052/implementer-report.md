# TODO-052 implementer 報告

## 変えたファイルと要点

- `src/ytbg/webroot/static/js/actions.js`
  - `:36` `copy_gameinfo()` を足した（予測した盤面を作るときの複製）
  - `:71` `roll()`、`:113` `click_dice()`、`:191` `can_pick_checker()`、`:381` `can_hold_cube()`、
    `:417` `double()`、`:457` `resign()`、`:483` `score_up()`、`:497` `score_clear()` が
    `board.gameinfo` を読む。`gameinfo` が無ければ `false` を返すか何もしない
    （`can_pick_checker()` は free move でも `false`）
  - `click_dice()` の free move（`:120` 付近）: `gameinfo` を複製して目を 1 つ進め、
    `board.apply(predicted, {sec: 0})` で表示してから `dice` を送る
  - `:513` `set_score()`: `board` を受け取り、得点を変えた盤面を `apply()` してから
    `set_score` を送る（▲ と ▼ の両方がここを通る）
  - `can_hold_cube()`: `cube.side >= 0 && side != board.player` で弾く。以前の
    `if (cube.accepted) { ... if (cube.player && cube.player != board.player) }` の 2 つ目は、
    手前の「相手側にあるキューブは触れない」で必ず先に弾かれていて通らないので、書き直すときに外した
- `src/ytbg/webroot/static/js/board.js`
  - `:74` `this.resign`、`:98` `this.turn` を消した（`gameinfo` のコメントを足した）
  - `:442` `set_turn()`: `this.turn` / `this.resign` への代入を消し、`closeout(1 - turn)` は引数を使う
  - `:596` `winner_is()`: `gameinfo.resign` と `gameinfo.board.cube` を読む。無ければ 0
  - `:638` `get_active_dice(player)`: `gameinfo.board.dice[player]` の 1〜6 を返す。無ければ `[]`
  - `:653` `has_dice(player)` を足した（0 より大きい目が 1 つでもあるか。旧 `dice_active` と同じ意味）
  - `apply()`（`:781`〜）: `this.resign` への代入を消し、ログは `gameinfo.score`、
    `set_turn()` に `gameinfo.resign`、put_checker の音の判定は `gameinfo.turn`
- `src/ytbg/webroot/static/js/ui/cube.js`
  - `value` / `accepted` / `player` を消した。`set(val, side, accepted)` は引数だけで表示を作る
  - `on_mouse_up_xy()`: `this.board.gameinfo.board.cube` の `side` / `accepted` で take / redouble /
    cancel_double / double を決める（掴めた時点で `gameinfo` はある）
  - 消した属性を出していたログ 2 行を削り、1 行は `board.player` だけにした
- `src/ytbg/webroot/static/js/ui/dice.js`
  - `Dice.value` を消した（`enable()` / `disable()` は opacity だけ）
  - `RollButton.dice_active` / `get()` / `get_active_dice()` / `another()` を消した。
    `get()` と `get_active_dice()` は `Dice.value` を読むだけのもので、`another()` は
    `dice_active` を読むためだけに使われていた
  - `update()` は `gameinfo.turn` と `gameinfo.board.dice[player]` を読む。`set()` はパスのバナーを
    引数の `dice_value` から決める。自動クリックの判定は `board.has_dice(1 - player)`
- `src/ytbg/webroot/static/js/ui/label.js:154,170` `PlayerScore.score` を消した
- `tests/browser/helper.mjs:332` `shown_dice(page, p)`、`:347` `dice_from_els()` を足した。
  画面に出ているダイスの目を要素（z が負なら 0、画像のファイル名の数字、opacity 0.5 なら +10）から読む
- `tests/browser/clicks.test.mjs`
  - `:220` `turn()`（`board.gameinfo.turn`）。`board_attr('turn')` 3 か所を置き換え
  - `:458` ▲ のテストは `board.gameinfo.score[0]` を読む
  - `:470` `press_n()`: 1 回の evaluate の中で要素を n 回 mousedown し、その直後の gameinfo と表示を返す
  - `:487` 新規「スコアの ▲ を返事の前に 2 回押す → 2 回ぶん足される」
  - `:512` 新規「free move でダイスを返事の前に 2 回押す → 目が 2 つ進む」（5→6→1）
  - どちらも、押した直後に gameinfo と表示が 2 つ進んでいること、送った 2 通の値、
    サーバの返事が出揃ったあとの盤面を見る
  - 使えないダイスのテストは `gameinfo.board.dice[0]` を待つ
- `tests/browser/board.test.mjs:87,94` Roll のダイスは `shown_dice()` で読む
- `tests/browser/predict.test.mjs` 表示のダイス（`dice`）は `shown_dice()`、`set_turn_dice()` は gameinfo、
  `active_dice` は `board.get_active_dice(0)`
- `tests/browser/opening.test.mjs` `board.turn` / `roll_btn[].get()` を gameinfo に。コメントの
  `this.value` の記述を直した
- `tests/browser/rules.test.mjs:115〜` `board.resign` を `board.gameinfo.resign` に
- `tests/browser/player_cookie.test.mjs:73` `board.gameinfo.turn`
- `CLAUDE.md`
  - `:94` clicks.test.mjs の説明に 2 回押すテストを足した
  - `:125` テストで状態を読む先（`board.gameinfo`、`shown_dice()`）
  - `:411` 「盤面の状態は `board.gameinfo` にしか持たず、判定もそこを読む」の段落
  - `:447` 先行実行の箇条に「free move のダイスと得点の ▲▼ は先行実行する」を足し、
    「free move のときは先行実行しない」をチェッカーに限った。予測で戻すものの記述も直した

## 消した属性ごとの置き換え先

| 消した属性 | 置き換え先 |
|---|---|
| `Board.turn` | `board.gameinfo.turn`（`set_turn()` の中は引数の `turn`） |
| `Board.resign` | `board.gameinfo.resign` |
| `Cube.value` / `accepted` / `player` | `board.gameinfo.board.cube` の `value` / `accepted` / `side`（-1 が中央） |
| `PlayerScore.score` | `board.gameinfo.score[player]` |
| `Dice.value` | `board.gameinfo.board.dice[player][i]`、`Board.get_active_dice()` |
| `RollButton.dice_active` | `Board.has_dice(player)`（`RollButton.set()` の中は引数の `dice_value`） |
| （付随）`RollButton.get()` / `get_active_dice()` / `another()` | `gameinfo.board.dice`、`Board.get_active_dice()`、`Board.has_dice()`。テストの表示は `shown_dice()` |

## 壊して確かめたこと（すべて戻した）

| 壊したもの | 落ちたテスト |
|---|---|
| `click_dice()` の free move で `apply()` を外す | clicks「free move でダイスを返事の前に 2 回押す」 |
| `set_score()` で `apply()` を外す | clicks「スコアの ▲ を返事の前に 2 回押す」 |
| `Cube.on_mouse_up_xy()` のテイクを `take(board, 1 - side)` にする | clicks「テイク」（続く Roll も巻き添えで落ちる） |
| `Board.winner_is()` の `resign` を常に -1 にする | rules「winner_is() が投了の勝ちを返し…」 |
| `Board.has_dice()` を常に `false` にする | opening の 2 件（clicks は全件通った） |
| `Dice.set()` で 11〜16 のとき `disable()` しない | predict の表示のダイス（「表示のダイス」で落ち、送信を止めたまま終わるので後続の it も巻き添えで落ちる） |

上 3 つは clicks.test.mjs、`has_dice` と `winner_is` と `get_active_dice`（1〜6 の絞り込みを外す）を
まとめて壊したときは rules 1 件・opening 2 件・predict 6 件が落ちた。

## 検証の結果

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 終了コード 0（291 passed。警告 1 件は starlette の testclient の DeprecationWarning で、Python は触っていない） |
| `uv run ruff check .` | 0（All checks passed） |
| `uv run mypy src` | 0（no issues） |
| `uv run basedpyright` | 0（0 errors, 0 warnings） |
| `node --test tests/js/` | 0（99 pass） |
| `node --test tests/browser/`（1 回） | 0（83 pass, 0 fail） |

`git grep` で `dice_active`、`board.turn` / `board.resign`、`this.turn` / `this.resign`、
`.score[p].score`、`this.accepted`、`this.value`、`roll_btn[].get()` / `get_active_dice()` の読み書きが
残っていないことを確かめた（`board.js:134` の `this.score = []` は `PlayerScore` の配列で、消す対象ではない。
`board.js:648` はコメントの中の旧名）。

## 迷って決めたこと

- **`RollButton.get()` / `get_active_dice()` も消した。** `Dice.value` を消すと読むものが無くなるため。
  テストの「表示のダイス」は gameinfo に置き換えると表示を見なくなるので、`shown_dice()` で要素から読む形にした
- **`gameinfo` が無いとき、free move でもチェッカーは掴めない**ようにした（「何も操作できない」を字義どおりに取った）
- **先行実行の `apply()` は `sec: 0`**（駒は動かないので見た目は変わらない）
- 2 回押すテストでは、表示を押したのと同じ evaluate の中で読む。evaluate を分けると、1 通目への
  返事（6）が届いて表示が一度 6 に戻り、それを読んでしまう（最初はそれで落ちた。サーバの返事が
  順に届く途中の状態で、不具合ではない）
- `can_hold_cube()` の通らない条件を外した（上の actions.js の項）
- 役割の定義では `CLAUDE.md` を触らないことになっているが、今回は依頼と TODO-052 のチェックボックスに
  入っていたので直した

## 実装しなかったこと・残る懸念

- **`gameinfo` が届く前の操作を見るテストは無い。** つないだ直後にしか起きず、ブラウザのテストで
  作りにくいため。ガードを外しても落ちるテストは無いはず
- **`can_hold_cube()` の「ダイスが出ていたら触れない」を見るテストは無い**（`has_dice` を常に
  `false` にしても clicks は通った）
- 先行実行の `apply()` は `set_turn()` を通るので、バナーと Roll ボタンが一度 off → 出し直しになる。
  見た目は変わらない想定だが、目で見ては確かめていない
- `Board.apply()` の `this.cube.set(c.value, c.side, c.accepted, false)` の 4 つ目の引数は
  以前から使われていない（範囲外なので残した）
- `predict.test.mjs` の先頭の it は、落ちると送信を止めたまま（`record_sent(page, true)`）終わり、
  後続が巻き添えで落ちる。以前からの作りで、範囲外なので直していない

## レビュー後の修正

管理者の指示（reviewer-report.md / verifier-report.md への対応）で直したもの。

### 変更したファイルと箇所

- `CLAUDE.md:458-463`（要修正 1）予測の土台を「`this.gameinfo`。予測を `apply()` したあとは
  予測そのもので、次の予測はそれを土台にする」に書き直した。続く「画面の方が新しい値は
  1 往復ぶん巻き戻る」の説明はそのまま残した
- `CLAUDE.md:454-455`（検討 2）「返事が 1 通も届かない間に続けて押した分は消えない。途中で
  返事が届くと消えることがある（変更前と同じ）」を足した
- `CLAUDE.md:416-419`（検討 3）「何も操作できない」を「盤面を読む操作（ロール、ダイス、
  チェッカー、キューブ、投了、得点）は何もしない」に絞り、名前・クロック・履歴の操作は送ると書いた
- `CLAUDE.md:456-457`（検討 5）Roll の直後に ▲ / free move のダイスを押すと Roll ボタンが
  もう一度出ることがある、の 1 文を足した
- `CLAUDE.md:125-128`（好み 9）`set_turn()` の注意（0 / 1 / -1 から 2 へは戻せず…）を先に置き、
  `board.gameinfo` / `shown_dice()` の説明をそのあとへ移した
- `src/ytbg/webroot/static/js/ui/dice.js:202`（好み 7）`RollButton.update()` を
  `this.board.has_dice(this.player)` を呼ぶ形にした。`copy_gameinfo()` は指示どおり触っていない
- `tests/js/move.test.mjs:227`（好み 8）コメントの `Dice.value` を `gameinfo.board.dice の値` にした
- `tests/browser/clicks.test.mjs:686`（検討 4）「ダイスが出ているときにキューブを動かす →
  何も送らない」を Roll の項目の直後に足した。盤面はテイクの項目のまま（自分の側でテイク済み、
  turn 0）で、ダイスが無ければ `double` を送る状態。盤面を変えないので後続の項目に影響しない
- `tests/browser/clicks.test.mjs:825`（検討 4）「`gameinfo` が届く前にキューブ・▲・Roll を押す →
  何も送らず、エラーも出ない」を末尾に足した。同じ browser で別ページを開き、
  `page.routeWebSocket(/\/ws$/)` でサーバへはつながずにページが送ったものだけを受ける。
  キューブ（mousedown + mouseup）・`#score_up0`・`#rollbutton0` を押したあと、
  **つながっていて送れることの確かめ**として `#button-back`（gameinfo を読まずに送る）を押し、
  受けたのが `back` の 1 通だけであること、`board.gameinfo` が `undefined` のままであること、
  `pageerror` が 0 件であることを見る。ガードを外すと、送らずに `gameinfo` を読んで
  TypeError になる経路があるので、エラーの件数も見ている

### 検証

| コマンド | 結果 |
|---|---|
| `node --test tests/browser/clicks.test.mjs`（テストを足したあと） | 43 pass / 0 fail、終了コード 0 |
| `node --test tests/js/move.test.mjs`（コメントを直したあと） | 48 pass / 0 fail |
| `node --test tests/browser/clicks.test.mjs tests/browser/opening.test.mjs`（`RollButton.update()` を直したあと） | 46 pass / 0 fail、終了コード 0 |

一式は指示どおり走らせていない。

わざと壊して `clicks.test.mjs` だけを走らせた（`actions.js` を scratchpad に控え、毎回戻して
`cmp` で一致を確認した）。

| 壊し方（`actions.js`） | 結果 |
|---|---|
| `can_hold_cube()` の `has_dice(p)` を `false` に | 終了コード 1。「ダイスが出ているときにキューブを動かす」だけが落ちた |
| `can_hold_cube()` の `gi === undefined` を `false` に | 終了コード 1。「gameinfo が届く前に…」だけが落ちた |
| `score_up()` の `gi === undefined` を `false` に | 同上 |
| `roll()` の `gi === undefined \|\|` を外す | 同上（`pageerror` に `Cannot read properties of undefined (reading 'turn')`） |

### 判断が要る点・残る懸念

- エージェント定義では `CLAUDE.md` を触らないことになっているが、管理者の明示の指示で直した
- 届く前のテストが見ているのは、キューブ・▲・Roll の 3 つだけ。ダイスのクリック・チェッカー・
  投了・▼ のガードは、このテストでは押さえていない（指示の範囲外）
- 検討 4 で挙がった `cancel_double` のクリックのテストは、指示に無いので足していない
