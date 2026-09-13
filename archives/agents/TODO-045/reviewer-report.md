# TODO-045 レビュー報告（reviewer）

対象: `git diff`（`src/ytbg/webroot/static/js/ui/checker.js` の 1 ファイル）。
移す前は `HEAD` の同ファイル。

**結論: 要修正 0 件。** 挙動の違いは見つからなかった。検討 3 件、好みの範囲 1 件。

---

## 検討

### 1. `CLAUDE.md:340` と `rules/position.js:199` が `on_mouse_up_xy()` を指したまま

- 場所: `CLAUDE.md:340`（「`Checker.on_mouse_up_xy()` は、
  `Board.predict_gameinfo()` で…予測して作り、`apply()` に渡す」）、
  `src/ytbg/webroot/static/js/rules/position.js:199`
  （「`on_mouse_up_xy()` が `moves` に 2 手ぶん積む」）
- 問題: 予測を作るのも `moves` に 2 手ぶん積むのも、いまは `apply_move()`
- なぜ: 呼び出しの入口としては間違いではないが、読んだ人が
  `on_mouse_up_xy()` の本体を探しても見つからない。直すなら
  「`on_mouse_up_xy()` から呼ぶ `apply_move()`」くらいで足りる。
  `tests/browser/predict.test.mjs:8` のヘッダも同じ書き方だが、
  こちらは入口の説明として読めるので直さなくてよい
- 今回の範囲（1 ファイル）の外なので、直すかどうかは管理者の判断

### 2. テストが捕まえられない壊し方がある（キャンセル経路と勝ちの枝）

スクラッチの複製（`scratchpad/base`、`.venv` は複製側で作り直し）で
`node --test tests/browser/` を走らせた。壊す前は 55 件すべて通った。

| 壊し方 | 結果 | 落ちたテスト |
|--------|------|--------------|
| M1: `apply_move()` の `dice_check()` を `apply()` のあとへ移す | **落ちる** | predict の 1〜3 番目（使ったダイスが `[3,0,0,0]` のまま） |
| M2: `decide_dst()` がキャンセルでも `{dst_p, hit_ch: undefined}` を返す（2 か所とも） | **落ちない** | なし |
| M3: `after_move()` を呼ばない | **落ちる** | predict の 1〜4 番目（`dice` を送っていない） |
| 追加 M4: `after_move()` の `if ( score > 0 )` を `if ( false )` にする | **落ちない** | なし |
| 追加 M5: 2 つ目のキャンセル（`available_p.indexOf(dst_p) < 0`）で `cancel_move()` を呼ばない | **落ちない** | なし |
| 追加 M6: `after_move()` の `roll_btn[ch.player]` を `roll_btn[1 - ch.player]` にする | **落ちる** | predict の 1〜3 番目 |

- M2 と M5 は全体を走らせたとき `clicks.test.mjs` の
  「スコアの ▲ → set_score」が 1 件落ちたが、`clicks` と `predict` だけで
  走らせ直すと 35 件すべて通った。スコアのボタンはチェッカーのドラッグを
  通らないので、**CPU の取り合いによる揺れで、壊し方とは関係ない**と見ている
- 非 free move で `on_mouse_up_xy()` を通るのは
  `tests/browser/predict.test.mjs` の 4 件だけ（1〜3 番目はワンタッチ、
  4 番目はドラッグ）。`board.test.mjs` のドラッグは free move で、
  `clicks.test.mjs` と `opening.test.mjs` は `on_mouse_up_xy()` を通らない
- **通っていない経路:** 行けない場所で離したときのキャンセル
  （`decide_dst()` の 2 か所の `return undefined`）と、
  `after_move()` の勝ちの枝（`emit_turn(-1, -1, false)` と
  `score[].up()`）。どちらも**分ける前から通っていない**ので、
  今回の差分で増えた穴ではない
- M2 がとくに重い。**分けたことで、`decide_dst()` の返り値と
  呼び出し側の `undefined` の比較が、キャンセルとの間の唯一のつなぎに
  なった**（分ける前は `return` がその場で関数を抜けていた）。
  ここを取り違えると、行けない場所への `put_checker` がサーバへ飛ぶが、
  テストでは分からない。「行けない場所で離すと、元の位置に戻り、
  何も送らない」の 1 件を `predict.test.mjs` に足すかは要判断
- 1 つ目の `return undefined`（ワンタッチで `available_p` が空）は、
  `on_mouse_down_xy()` が同じポイントで `get_dst_points()` が空なら
  掴ませないので、掴んでから離すまでにダイスが変わらない限り通らない
  （コードを読んだだけ。実測はしていない）。テストを足すなら
  2 つ目（行けない場所へドラッグ）で作るのが素直

### 3. `TODO.md` の表の `after_move` の「ターンの受け渡し」

- 場所: `TODO.md` TODO-045 の表、`after_move(ch)` の行
- 問題: `after_move()` がターンに触るのは勝ったときの
  `emit_turn(-1, -1, false)` だけで、相手への受け渡しはしていない
  （分ける前の末尾も同じ）
- なぜ: コードの JSDoc（「勝っていれば turn を -1 にして得点を足し、
  そうでなければダイスの状態を履歴に積む」）の方が正しい。
  コードは直さなくてよく、archives に移すときに表の言い回しを
  合わせる程度

---

## 好みの範囲

### 4. `apply_move()` の JSDoc と本文のコメントが順番の縛りを 2 回書いている

- 場所: `checker.js:236-240` と、本文の `dice_check()` の前・
  `disable()` の前のコメント
- JSDoc で一覧できるのは分けた意味があるので、残してよい。
  片方だけ直されてずれる心配がある程度

---

## 見て問題が無かった点（見てほしい点 1〜4）

### 1. 挙動が変わっていないか

分ける前の 140〜304 行と、分けたあとを 1 行ずつ突き合わせた。

- **呼ぶ順番:** `ch.move()` → `chpos2point()` → free move の分岐 →
  `get_active_dice()` → sort → `get_dst_points()` → ワンタッチの補完 →
  `indexOf` のキャンセル → `checkers_at()` のヒット判定 → `moves` →
  `predict_gameinfo()` → `emit_put_checker()` → `dice_check()` →
  `moving_checker = undefined` → `apply()` → `disable()` →
  `check_disable()` → `roll_btn.get()` → `winner_is()` → `emit_msg("dice")`。
  分けたあとも同じ
- **`dice_check()` は `apply()` より前、`disable()` は `apply()` のあと:**
  保たれている（`apply_move()` の中で同じ並び）。M1 で壊すと落ちることも確認
- **キャンセルの 2 か所:** どちらも `cancel_move(ch)` のあと
  `return undefined`、呼び出し側が `dst === undefined` で return するので、
  `apply_move()` / `after_move()` は呼ばれない。`hit_ch` を `let` で
  宣言する前に return するので、TDZ にも触れない
- **`after_move()` の `dice_value`:** 分ける前は、`apply()` の前に取った
  `roll_btn = this.board.roll_btn[ch.player]` で `get()` していた。
  分けたあとは `after_move()` で `this.board.roll_btn[ch.player]` を引き直す。
  `this.board.roll_btn` に代入しているのは `board.js:287` の
  コンストラクタだけで、`apply()` は配列もその要素も差し替えない
  （`board.js` の `roll_btn` を grep して確認）。`ch.player` も途中で
  変わらない。よって同じオブジェクトで、`check_disable()` のあとの値
- **`this.player` と `ch.player`:** `emit_msg("dice", { player: this.player,
  ...})` は 2 か所とも `this.player` のまま。`get_active_dice()`、
  `get_dst_points()`、`roll_btn[]`、`winner_is()`、`score[]` は
  `ch.player` のまま。揃えていない。`dice_check()` の中の `this.player`
  （`dice_for_move(this.player, ...)`）も、`this` を変えずに
  `this.apply_move()` から呼んでいるので同じ
- **消えた処理:** `apply_move()` の `hit_ch.id` の重複ログのほかは、
  `let dice_value = [];`（使う前に必ず代入されていた）と、
  sort の比較関数に `koujun` という名前を付けていたこと（同じ比較の
  アロー関数にした）だけ。ログの見出しが `Checker.on_mouse_up_xy>` から
  各メソッド名に変わり、離した場所のログが `dst_p=` から `drop_p=` に
  変わった。どちらも表示だけ
- **名前の衝突:** `decide_dst` / `apply_move` / `after_move` は
  `ui/base.js` ほか `src/` のどこにも無い（grep で確認）

### 2. 表どおりか

名前・引数・返り値は表どおり。`apply_move()` が `dice_check()` と
`apply()` まで持つのは、表の「予測・送信・使ったダイスの消費」に
含まれる範囲で、順番の縛りを 1 つのメソッドに閉じ込められるので妥当。
違いは上の検討 3 の言い回しだけ。

### 3. テスト

上の検討 2 の表。

### 4. 慣習

- JSDoc は周りと同じ形（`@param` / `@return`、`(TODO-045)` の番号参照）
- 閉じ括弧のコメント `} // Checker.decide_dst()` も揃っている
- コメントは「なぜ」を書いている（順番の縛りの理由、`undefined` の意味）
- 表示幅 80 桁を超える行は無い。行末の空白は差分の外（22, 85 行）の既存分だけ
- `{ dst_p: dst_p, hit_ch: hit_ch }` の省略しない書き方は、
  コンストラクタの `{board: board, player: player}` と揃っている
