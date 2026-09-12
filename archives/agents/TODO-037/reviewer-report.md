# TODO-037 レビュー報告

対象: 未コミットの `git diff`（`CLAUDE.md` の変更は main が入れたもの）。
コードは直していない。

## 要修正

### 1. `src/ytbg/message.py:147` — docstring に消したはずの `reset` が残る

`PlayerData` の docstring が
「resign と、クロックの start / resume / stop / reset。」のまま。
`reset_clock` は `DATA_TYPES` からも `_handlers` からも消えたので、
**存在しない type を指している**。main が `CLAUDE.md` の個数を直したのと
同じ種類の消し漏れ。根拠: 実際のコード（`DATA_TYPES` に `reset_clock` は
無い。下の「確認したこと」の集合比較）。

## 検討

### 2. `tests/js/position.test.mjs:187-194` — 書き換えで捕まえられなくなった壊れ方が 1 種類ある（実測）

`assert.deepEqual(pos2.players(6), [0, 1])` を
`owner(6)==0` / `count(6)==2` に置き換えたテスト
（「動かすのは、そのポイントの上にある自分のチェッカー」）。

`owner` + `count` が同じでも中身が違う組み合わせが 1 つある。
`[0,1,0]` から 1 枚動かした結果が `[0,1]`（正しい）でも `[0,0]`
（**相手の駒を代わりに取り除いた**）でも、owner=0・count=2 で一致する。

実測: `with_move()` を「混在ポイントでは相手の駒を取り除く」に書き換えて
`node --test tests/js/` を走らせたところ **57 件すべて通った**
（`pt[6]` は `[0,0]`。元の `deepEqual(..., [0,1])` なら落ちる）。
`points_of(1)` が `[6]` → `[]` に変わるので、その 1 行を足せば埋まる。

これは仮想の壊れ方ではない。`position.js` の docstring 自身が
「free move では 1 つのポイントに両プレーヤーの駒が乗る」
「黙って積むと 15 枚から増えて盤面が静かに壊れる」と書いている場面。

なお、他の 3 つの現実的な壊し方は実測で捕まる（判別力は落ちていない）:

| 壊し方 | 結果 |
|---|---|
| `lastIndexOf(player)` → `indexOf(player)` | 1 件 fail（当該テスト） |
| 相手の駒を取り除く（全ポイントで） | 8 件以上 fail |
| `to_p` に `push` → `unshift` | 1 件 fail |

`judge.test.mjs:63` の `Position.empty()` → `make_position({})` と、
`count_all` の `count_of()` 合計 → `points_of(player).length` は
**完全に同じ値**（helper を読んで確認）。判別力の変化なし。

### 3. `src/ytbg/webroot/static/js/ui/clock.js:199` — `PlayerClock.reset()` が誰からも呼ばれていない

`emit_reset()` を消したことで `reset_clock` の送り元は無くなったが、
`PlayerClock.reset()` 自体は残っている。実測: `src/` `tests/` 全体の grep で
定義以外の参照は無い（HEAD の時点でも `emit_reset()` とは無関係に未参照
だった。`git grep -n reset HEAD -- .../js/` で確認）。
TODO-037 の箇条書きは `emit_reset()` しか名指ししていないので範囲外とも
読めるが、「`reset_clock` の経路」として一緒に消すかどうかは判断が要る。
消すなら `src/ytbg/clock.py:100` の
「(ui/clock.js の PlayerClock.reset())」という参照も直す必要がある。

### 4. コメントアウトの残り — 「塊」は全部消えたが、1 行のものは 30 か所以上残る

実測: JS 全体で**複数行のコメントアウトされたコードは 0 件**になった
（`/*` 〜 `*/` の中にコードがあるものを走査）。指示の「塊」は満たしている。
一方、`// log(...)` / `//this.off();` のような 1 行のものは 30 か所以上残る。
このうち `ui/label.js:20` の `// this.def_name = \`Player ${this.player}\`;` は、
今回消した `PlayerScore.default_text` と紛らわしい位置にある
（`PlayerName.def_name` は生きているフィールドなので、行自体は
「別の既定値の案」を残したもの）。**範囲の解釈の確認だけ。**

## 確認したこと（問題なし）

- **登録表の片落ちは無い。** `DATA_TYPES` と `_handlers` はどちらも 22 個で
  キーの集合が一致（スクリプトで集合比較）。`tests/test_message.py` は
  `SAMPLES == DATA_TYPES`、`DATA_TYPES == _handlers`、
  `NO_HISTORY_TYPES ⊆ DATA_TYPES` の 3 つを見ているので、
  片方だけ消していれば落ちていた
- **`Clock.reset()` は生きていて、テストも残っている。**
  `server.py:130-131`（new_game）と `server.py:472-473`（set_clock_limit）
  から呼ばれる。実測: `Clock.reset()` を no-op にすると
  `uv run pytest` が **6 件 fail**（`test_clock_unit.py` 2 件、
  `test_clock.py` の set_clock_limit / new、`test_save_load.py` など）。
  `test_clock.py` から消した `test_reset_clock_restores_limit_and_stops` は
  `on_json` 経由（消えた経路）だけを見ていたので、削除は妥当
- **`CLAUDE.md` の数は実装と合っている。** クロック系 6 つ
  = `NO_HISTORY_TYPES` の 6 件、`float` を返すハンドラ 13 個
  = 22 − `None` を返す 9 個。`server.py` の「ここから 4 つ」、
  `tests/test_on_json.py` の「クロック系の 4 つ」、
  `tests/test_clock.py` の「6 つ」も、直後の一覧の件数と一致
- **`docs/Developer.md` に `reset_clock` は無い。** 個数を書いた箇所も無い
  ので、直す必要は無い。`dice_histogram` / `default_text` / `def_name`
  （`PlayerScore` の方）も `src/` `tests/` `docs/` から消えている
- **`board.js` の `this.score = [0, 0]` 削除は安全。** 上書きする
  `this.score = []` は 47 行あと（「直後」ではない）だが、その間に
  `board.score` を読むコードは無い。読むのは `ui/checker.js:344` と
  `ui/button.js:44` の 2 か所だけで、どちらも操作時に走る
- **意味のある説明コメントは消えていない。** 消えた JSDoc は消した関数の
  ものだけ。`main.js:247` の「this.board か、受け取った board を使うこと
  (TODO-028)」のような注意書きは残っている
- **指示に無い変更は混ざっていない。** `mylog.py` は無変更
- `uv run pytest` 226 passed / `node --test tests/js/` 57 pass を再実行して確認
  （ブラウザテストは verifier の担当なので走らせていない）
