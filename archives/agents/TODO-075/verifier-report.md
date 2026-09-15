# TODO-075 verifier 報告

## 1. 検証コマンドと終了コード

- `node --test tests/js/` — 154 件 pass、fail 0、終了コード 0
- `node --test tests/browser/` — 106 件 pass、fail 0、終了コード 0（約 75 秒）

いずれも落ちた箇所は無い。

## 2. git diff と依頼範囲の照合

`git diff --stat`:

```
 src/ytbg/webroot/static/js/board_view.js  | 38 +++++++--------------------
 src/ytbg/webroot/static/js/rules/judge.js |  9 +++----
 src/ytbg/webroot/static/js/rules/move.js  | 43 ++++++++++---------------------
 src/ytbg/webroot/static/js/ui/cube.js     | 19 +++++---------
 4 files changed, 33 insertions(+), 76 deletions(-)
```

依頼の 7 箇所（`move.js` の `dst_points()` / `dice_for_move()`、`judge.js` の
`calc_gammon()`、`board_view.js` の `render_turn()` の `update_roll`・
コンストラクタの `PlayerScore`/`ScoreButton`・`PlayerName`・`inverse()`、
`cube.js` の `Cube.set()`）と、実際の diff の箇所は一致している。
範囲外のファイルへの変更は無い。

`board_view.js` の diff は implementer-report が書いた 4 箇所（`update_roll`、
`PlayerScore`/`ScoreButton` のループ化、`PlayerName` の 2 ループ統合、
`inverse()`）に加えて、依頼どおりコンストラクタの「名前の 2 つのループを 1 つに」
も反映されている。すべて依頼の記述内で説明できる変更で、逸脱は見当たらない。

## 3. dst_points() / dice_for_move() の挙動確認（意図的に壊して確認）

`src/ytbg/webroot/static/js/rules/move.js` を一時的に書き換え、壊した後は
`\cp` で元に戻した（`git diff --stat` が壊す前と同じ差分に戻ることを確認済み）。

- **dst_points() のループ境界を 1 つずらす**
  （`if ( i >= dice_vals.length )` → `if ( i > dice_vals.length )`）:
  `node --test tests/js/` → **154 件中 137 pass / 17 fail**（`Position.count()` で
  `undefined` を読んで例外になるテストを含む）。狙った箇所が落ちることを確認。
- **dice_for_move() のゾロ目判定ループの境界を 1 つずらす**
  （`for (let n=3; n <= active_dice.length; n++)` →
  `for (let n=3; n < active_dice.length; n++)`）:
  `node --test tests/js/` → **154 件中 153 pass / 1 fail**。狙った箇所が落ちることを確認。
- 両方とも復元後は `git diff --stat` が元の差分（4 ファイル、+33/-76）と一致し、
  `node --test tests/js/` は 154 pass / 0 fail に戻ることを確認した。

以上から、この 2 関数の書き換えは「テストが素通りしているだけ」ではなく、
実際に挙動を見張れていることを確認した。

## 4. 範囲外の気づき（`pass_btn[1-player].off()` の削除）について

`render_turn()` の先頭（`board_view.js` 610〜616 行）で、`turn` の値に関わらず
毎回無条件に両プレーヤーぶんの `roll_btn[p].off()` / `pass_btn[p].off()` /
`win_btn[p].off()` / `resign_banner_btn[p].off()` / `player_name[p].off()` を
実行してから、その後で `update_roll()` が呼ばれている
（呼び出し箇所は 654〜655 行と 666 行）。つまり `update_roll` が実行される
時点で `pass_btn[0]` と `pass_btn[1]` は必ず既に `off()` 済みであり、
`update_roll` 内にあった `this.pass_btn[1 - player].off()` は実行結果に
影響しない冗長な呼び出しだった。

新旧のロジックを突き合わせても等価と確認できた。

```
旧: if (gi.turn != player && gi.turn < 2) { off(); return; }
    if (has_dice(gi, player)) { off(); return; }
    pass_btn[1-player].off();  // 常に off 済みなので無意味
    roll_btn[player].on();

新: if ((gi.turn == player || gi.turn >= 2) && !has_dice(gi, player)) {
        roll_btn[player].on();
    }
```

`gi.turn != player && gi.turn < 2` の否定は `gi.turn == player || gi.turn >= 2`
で、`!has_dice` との論理積も一致するため、`on()` になる条件は元と同じ。
明示的な `off()` を削っても、呼び出し前の一括 `off()` が効いているため
挙動は変わらない。implementer-report の記述どおりで、挙動への影響は無いと判断できる。

## 確かめられなかったこと・判断が要る点

- 特に無し。依頼された 4 項目（js/browser テストの実行、diff の範囲照合、
  dst_points/dice_for_move の実測確認、pass_btn 削除の裏取り）はすべて
  実際に動かして確認できた。
