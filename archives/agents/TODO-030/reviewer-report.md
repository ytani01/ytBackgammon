# TODO-030 reviewer の報告

対象: 作業ツリーの `git diff`（`CLAUDE.md`、`board.js`、`ui/checker.js`）
と、追加された `tests/browser/predict.test.mjs`。変更前は `43193fc`。

**要修正は 0 件。** 挙動・設計とも README の 7 点に沿っている。
以下は「直したほうがよいもの」6 件と「好みの範囲」2 件。

実測は 2 本のスクリプトで行った（scratchpad の `race.mjs` / `exp2.mjs`。
どちらも `tests/browser/helper.mjs` を import して、空きポートに実サーバを
立て、`YTBG_DATA_DIR` を一時ディレクトリへ逃がしている）。
`node --test tests/browser/` は 43 件すべて通った（1 回）。

---

## A. 予測が外れたときに表示が戻るか

### A-1. 2 枚のタブで実測した（`race.mjs`）

**結論: 収束する。** 4 通り試して、すべてサーバの `gameinfo` で
正しい表示になった。

| # | 起こした食い違い | 結果 |
|---|------------------|------|
| A1 | P1 の `send` を止めて 1 手動かし（`6 → 2` の予測）、そのあと P2 が別の駒を `8 → 4` へ動かす | P1 の予測は取り消され、両タブとも `p0 = 6,6,6,6,6,8,8,4,…` で一致。P1 のダイスも `[3,14,0,0]`（4 が使用済み）から `[3,4,0,0]` へ戻った |
| A2 | 2 枚のタブで**同時に**同じポイントの先端を `Promise.all` で動かす | 両タブの `checker[][].cur_point`・`point[].checkers.length`・pip がすべて一致。駒の総数も 30 のまま |
| A3 | 名前の変更が飛んでいる間に予測 | 下の B-1 を見ること（この形では再現できず、代わりに同期実行で確かめた） |
| A4 | `predict_gameinfo()` が例外を投げる | 表示は動かないが、`put_checker` は送られ、返事で正しい位置になった |

A2 の実測値（両タブ同一）:
`counts = 0,2,1,1,1,0,3,0,2,0,0,0,5,5,0,0,0,3,0,5,0,0,0,0,2,0,0,0`、
`pip = [156, 167]`、`dice0 = [13,14,0,0]`。

収束する理由はコードからも裏が取れている。`apply()` は
`board.js:893` で全ポイントを空にしてから `board.js:949` で 30 枚を
配り直しており、**駒を置くコードは `ui/point.js:53-54` の
`Point.add()` 1 か所だけ**（`grep` で確認）。予測は
`this.gameinfo` を `JSON.parse(JSON.stringify(...))` で複製してから
書き換えるので、元の `gameinfo` は壊れない。

### A-2. `predict.test.mjs` が作れている「外れ方」は 1 種類だけ（**検討**）

3 番目のテストは `board.predict_gameinfo` を包んで
**移動先を 20 にすり替える**、つまり「行き先が違う」1 種類しか
作っていない。ページも 1 枚なので、次の外れ方は見ていない。

| 外れ方 | テストの有無 | 私の実測 |
|--------|--------------|----------|
| 行き先が違う | あり（3 番目） | — |
| 他の人が同時に動かした（2 枚のタブ） | **無し** | A1・A2 で確認。収束する |
| ヒットの扱いが違う（ヒットを予測したが実際はヒットでない、逆も） | **無し** | 未確認 |
| `turn` が変わっていた | **無し** | B-3 で「予測が `turn` を古い値へ戻す」ことは確認。収束は未確認 |
| 予測そのものが例外になった | **無し** | A4 で確認（下の B-4） |
| `score` / `playername` / `cube` が飛んでいる | **無し** | B-1 / B-2 で巻き戻ることを確認 |

いちばん値打ちがあるのは **2 枚のタブ**だと思う。README の分担でも
verifier に「2 枚のタブでドラッグの同期を見る」と書いてあるので、
そちらに任せる判断でもよい。ただし `predict.test.mjs` の
冒頭コメント（4〜19 行）は「ここで見るのは次の 4 つ」と書いており、
**2 枚のタブを見ていないことがコメントから読み取れない**。

---

## B. 先行実行の中の「表示以外」の順番

`43193fc` の `on_mouse_up_xy()` と 1 文ずつ突き合わせた。
**順番と条件は保たれている。**

| 項目 | `43193fc` | いま | 判定 |
|------|-----------|------|------|
| `hit_ch` の判定 | `put_checker` より前 | 同じ | ○ |
| `emit_put_checker`（ヒット→自分の順） | 2 本、`add_hist=false` | 同じ順・同じ `add_hist` | ○ |
| `dice_check(active_dice, ch.cur_point, dst_p)` | ヒットの `put_checker` の後・自分の `put_checker` の**前**（＝`cur_point` は移動元） | `apply()` の**前**（`checker.js:364`） | ○ |
| 使ったダイスの `disable()` | `put_checker` の後 | `apply()` の**後**（`checker.js:386-393`） | ○ |
| `roll_btn.check_disable()` → `get()` → `winner_is()` | `put_checker` の後（＝置いたあとの盤面） | `apply()` の後 | ○ |
| `emit_msg("dice")` / `emit_turn(-1,-1)` / `score.up()` | 末尾 | 同じ | ○ |
| free move の早期 return | `emit` して return | 同じ（`checker.js:266-270`） | ○ |
| `moving_checker = undefined` | 関数の末尾 | `apply()` の**前**（`checker.js:377`） | ○（下に理由） |

裏取り:

- **ダイスの `disable()` が `apply()` の後にある**ことは実測で確認した。
  A1 で、予測直後の `roll_btn[0].get()` が `[3,14,0,0]`（4 が使用済み）
  になっていた。`apply()` が `gameinfo` の値へ戻すなら `[3,4,0,0]` に
  なるので、順番は正しい。`predict.test.mjs` の 1 番目も
  `[13,0,0,0]` で同じことを押さえている
- **`winner_is()` が予測後の盤面を見ている**ことを実測した（`exp2.mjs` の
  B3）。player0 の駒を 14 枚ゴール・1 枚を point 3 に置き、ダイス 3 で
  ワンタッチのムーブをすると、送られたメッセージは
  `put_checker{ch:0,p:0,idx:14}` → `dice{[13,0,0,0]}` →
  `set_turn{turn:-1}` → `set_score{player:0,score:2}` だった。
  `apply()` の前に `winner_is()` を呼んでいたら勝ちにならない
- **`moving_checker` を前に外すのは正しい。** `apply()` は
  `board.js:941-952` で `moving_checker` の座標と z を**手元へ戻す**ので、
  外さずに `apply()` を呼ぶと離した駒がカーソル位置に残る。
  外した後に読む場所は無い（`grep moving_checker` で
  `on_mouse_move_xy` と `board.js:1191` だけ。どちらもこの経路には
  入らない）

### B-1. 予測は、動かした駒とダイス以外を「最後に届いた gameinfo」へ巻き戻す（**検討**）

`apply()` は `score` / `playername` / `cube` / `resign` / `turn` を
必ず `gameinfo` から書き直す。予測はその土台が
**最後にサーバから届いた `gameinfo`** なので、
**画面の方が新しい値は、ダイス以外すべて巻き戻る。**

実測（`exp2.mjs`、同じ tick の中で実行したので、サーバの返事は挟まらない）:

```
B1 score before/after predict = {"before":{"score":3,...},"after":{"score":0,...}}
B1 score after server reply = 3
B2 name before/after predict = {"before":"LOCAL","after":"[Input name]"}
```

- `score[0].up(3)`（内部の `this.score` だけが 3 になる）の直後に予測すると、
  `this.score` が 0 へ戻った。サーバの返事で 3 に戻る
- `player_name[0].set('LOCAL')` の直後に予測すると `[Input name]` に戻った

`43193fc` の `put_checker()` はこれらに触っていなかったので、
**これは新しく増えた巻き戻し**（README 6 番「挙動を変えない」に
かかる）。ただし:

- 実際に起こるのは「他のクライアントの変更が飛んでいる間」だけで、
  サーバの返事（1 往復）で必ず直る。実害は一瞬のちらつき
- `score` の内部値については、`▲` を押した直後にドラッグすると
  `this.score` が巻き戻り、次の `▲` が 1 つ前の値から数え直す。
  ただし `load_gameinfo()` も毎回 `score.set()` しているので、
  **この競合そのものは TODO-030 より前からある**
  （README 7 番の「ときどき落ちるテスト」と同じ性質）
- `player_name.set()` を画面だけに当てる呼び出しは `src/` に無い
  （`main.js:129` は `emit()` だけ）ので、B2 の形は今は起きない

判断が要る点: このまま受け入れるなら、`CLAUDE.md` に
「予測はダイス以外を最後の `gameinfo` へ戻す（1 往復で直る）」と
書いておくのがよい。implementer の報告の「判断が要る点 5」は
ダイスにしか触れていない。

### B-2. `apply()` 経由になったことで `set_turn()` が予測でも走る（**検討・一部未確認**）

`43193fc` の `put_checker()` は closeout の判定だけをしていた。
いまは `apply()` → `set_turn()`（`board.js:554`）が走るので、
バナー・プレーヤー名の on/off・`roll_btn.update()` まで
予測のたびにやり直される。closeout の結果は同じ（`board.js:623-627`）
なので見た目は変わらないが、`set_turn()` には
`turn < 0` かつ勝者がいるときに `player_clock[winner].emit_stop()` を
**送る**枝がある（`board.js:600-602`）。

予測の `turn` は最後に届いた `gameinfo` の値なので、
`turn < 0` のまま予測が走れば `stop_clock` が飛ぶ。
`on_mouse_down_xy()` が `turn != player` で弾くので通常は起きないが、
**`turn` が下げてから上げるまでの間に変わった場合は未確認**。
`Board.put_checker()` を直に呼ぶ経路（`rules.test.mjs`）でも同じ。

### B-3. 予測は `turn` も巻き戻す（**検討**）

B-1 と同じ理由。実測（`exp2.mjs` の B4）: ベアオフで勝った直後、
`emit_turn(-1,-1)` をブロックした状態で `board.turn` は 0 のままだった。
これは正しい（サーバがまだ -1 にしていない）が、他人が
`turn` を変えた直後に予測すると、1 往復ぶん古い `turn` に戻る。

### B-4. 予測が例外になったときの振る舞い（**検討**）

`predict_gameinfo()` が投げると `apply()` を呼ばないので:

- 掴んでいた駒は `on_mouse_up_xy()` 冒頭の `ch.move(x, y, true)` の
  位置（離した座標、z=1000）に**浮いたまま**、サーバの返事まで残る
  （`43193fc` はその場で定位置へ入った）。実測: A4 で
  `moved? false`。返事が来た時点で正しい位置になることも確認した
- `winner_is()` が**移動前**の盤面を見るので、その手で勝っても
  `set_turn(-1)` と `set_score` が送られない（未確認。A4 は
  勝ちの形では試していない）
- ヒットがある手だと、`emit_put_checker()` の `idx` が表示から
  数えた値になる（`board.js:1146-1148`）。表示はまだ更新されて
  いないので、2 本目の `idx` が「相手の駒を含んだ枚数」になり、
  `43193fc`（1 本目の `put_checker()` で表示を更新してから数えた）
  とずれる（未確認。下の実測は例外を強制した単発の手）

実測 A4 の送信内容: `put_checker {ch:2, p:4, idx:1}` と
`dice {[12,0,0,0]}`。この場面では point 4 に 1 枚あったので `idx:1` は
正しい。

なお、`this.gameinfo` と表示は常に `apply()` が同時に作るので、
**この例外は今のコードでは実際には起きないはず**（`with_move()` が
投げるのは両者が食い違ったときだけ）。だから優先度は低い。

---

## C. `predict_gameinfo()` の作り

| 見るところ | 判定 | 根拠 |
|------------|------|------|
| `sn` を進めていないか | ○ | `board.js:1105` は複製するだけで `sn` に触っていない。`predict.test.mjs:202` が押さえている。なお**クライアントは `sn` をどこでも読んでいない**（`grep '\.sn\b' src/…/js/` が 0 件）ので、今は表示に影響しない |
| ヒットのとき 2 手ぶん | ○ | `checker.js:333-336` で `moves` に 2 件積む。`predict.test.mjs:253` で相手が 27（バー）に入ることを確認 |
| `idx` の決め方が送る値と一致するか | ○ | `board.js:1110` の `pos.count(mv.p)` を `gameinfo` に書き、`checker.js:355-357` が**その書いた値を読んで**送っている。同じ値なのでずれようがない。`43193fc` との一致も、ヒットの順（バーの枚数 → 相手が抜けたあとの移動先の枚数）まで同じ |
| dice を `roll_btn` から写す理由 | ○（ただし下記） | `Dice.disable()` は `value` に +10 する（`ui/dice.js:59-62`）ので、`RollButton.get()` は使用済みを `13` のように返す。2 手目の予測の土台（1 手目の予測）は disable 前の値なので、写さないと `apply()` が 1 手目のダイスを使える状態に戻す。実測 A1 で `[3,14,0,0]` を確認 |
| `this.gameinfo` を壊していないか | ○ | `JSON.parse(JSON.stringify(this.gameinfo))`（`board.js:1105`）。`Position` も `with_move()` が新しいものを返す |

### C-1. dice を写すことで生まれる別の食い違い（**検討**）

`predict_gameinfo()` は**盤面の予測**なのに、`gameinfo.board.dice` だけ
DOM（`roll_btn`）から写している。副作用が 2 つある。

- 他のクライアントがダイスを振った直後（その `gameinfo` がまだ
  届いていない）に予測すると、**自分の画面のダイスを `this.gameinfo` へ
  書き込む**。1 往復で直るが、B-1 と逆向きの食い違い（画面の値が
  勝つ）になる
- `Board.put_checker()`（いまは `rules.test.mjs` だけが呼ぶ）も
  この経路を通るので、**表示のダイスが `this.gameinfo` に入る**。
  今は同じ値なので問題無い

`CLAUDE.md` の追記には「`apply()` は dice を `gameinfo` の値に戻すので
`disable()` はあと」とは書いてあるが、**`predict_gameinfo()` が
逆向きに dice を写していること**は書かれていない。implementer の
報告の「判断が要る点 5」にある話なので、`CLAUDE.md` 側にも
1 行あるとよい（同じ性質の値を足したときに踏む）。

---

## そのほか

### 1. 二重実装は消えている（**確認できた**）

`grep -rn "\.add(\|checkers.splice\|checkers.push\|cur_point =" src/…/js/`
の結果は `ui/point.js:53-54`（`Point.add()`）と
`board.js:949`（`apply()` からの呼び出し）、
`checker.js:24`（初期化）だけ。
**駒を置く実装は `apply()` の 1 経路しか無い。**
`put_checker()` は `predict_gameinfo()` → `apply()` を呼ぶだけで、
pip・closeout・音も自前では持っていない。

### 2. `apply()` が `load_gameinfo()` と同じことをしているか（**確認できた**）

`git diff` を見るかぎり、変えたのは
**クロックの節を `if (clock_state !== undefined)` で包んだことだけ**。
ほかは引数の受け方（並び → options）とログ文字列の
`load_gameinfo` → `apply` だけ。

1 点だけ注意: 包みの条件が `!== undefined` なので、
`clock_state` が `null` で来ると今までどおり `clock_state.limit[0]` で
落ちる。`last_op` は `last_op ? …` と真偽で見ているので、
**同じ関数の中で null の扱いが揃っていない**。サーバは必ず
`clock_state` を入れて送る（`main.js:263-268`）ので今は起きない。
**好みの範囲**。

### 3. 在庫のコメントが `load_gameinfo` / 古い `put_checker` を指したまま（**検討**）

`CLAUDE.md` は直っているが、コードの中の同じ参照が残っている。
「対で保守すべきものの片方だけが変わっている」形。

- `src/ytbg/webroot/static/js/board.js:915`
  「`put_checker()` の `splice(-1, 1)` が無関係な駒を配列から外す」
  → いまの `put_checker()` に `splice` は無い（**記述が事実と違う**）
- `src/ytbg/webroot/static/js/board.js:592, 594`
  「`set_turn()` は `load_gameinfo()` から毎回呼ばれる」 → `apply()`
- `src/ytbg/webroot/static/js/rules/position.js:114`
  「積み順は `Board.load_gameinfo()` と同じで」 → `apply()`
- `src/ytbg/webroot/static/js/rules/position.js:227`
  「今の `put_checker()` の呼び方と同じ」 → ヒットを 2 手に分けるのは
  いま `on_mouse_up_xy()` の `moves`

テスト側（`clicks.test.mjs:47,64,139,297`、`tests/js/position.test.mjs:101`）
にも `load_gameinfo()` を指すコメントがあるが、README 6 番で
「テストを 1 行も変えない」としているので、**今回は触らない**判断で
よいと思う。

### 4. 足したテストは狙ったところを見ている（**確認できた**）

4 件とも、落ちるべきところで落ちる作りになっている。
`board.apply` / `WebSocket.prototype.send` の包みが二重にならないように
`window.__orig_*` で守っている点も良い。
`predict.test.mjs:329` の `delete board.predict_gameinfo` で
インスタンスの上書きを外してプロトタイプへ戻すのも正しい。
implementer が 6 通りの壊し方で 10/10 落としたという報告と、
私が読んだ内容は矛盾しない（壊し方の再現はしていない。**未確認**）。

`node --test tests/browser/` は 43 件すべて通った（1 回）。
README 7 番の「スコアの ▲」は落ちなかった。

### 5. `CLAUDE.md` の追記（**検討**が 2 つ、残りは実装と合っている）

合っていることを確認したもの: 「表示を変えるのは `apply()` だけ」、
「`sn` は進めない」、「ヒットは 2 手ぶん」、「`idx` も予測から取る」、
「`clock_state` と `last_op` を渡さない」、「`disable()` は `apply()` の
あと」、「確認は `tests/browser/predict.test.mjs`」。

足りないと思うもの:

- **free move では先行実行しない**ことが書かれていない
  （`checker.js:266-270` で `emit` して return する）。
  `predict.test.mjs` の冒頭コメントにはあるが、`CLAUDE.md` には無い
- C-1 の「dice だけは予測が画面から写す」

### 6. 範囲外の変更は無い（**確認できた**）

差分は `board.js` / `ui/checker.js` / `CLAUDE.md` と、新規の
`tests/browser/predict.test.mjs` だけ。README 5 番の
`get_dst_points()` / `get_dst_point1()` / `all_inner()` には
触れていない。`git diff` に `tests/js/` と既存の `tests/browser/` は
出てこないので、「1 行も変えずに」も守られている。

### 7. 行の長さ（**問題無し**）

追加された行を**文字数**で数えた（`git diff -U0` の `+` 行と、
新規ファイルの全行を Python の `len()` で）。
**78 文字を超える行は 0 件。**

---

## 好みの範囲（2 件）

1. **チェッカーの ID と添字の変換が 3 か所に散っている。**
   `parseInt(ch.id.slice(1)) % 100` が
   `board.js:1117`（`predict_gameinfo`）・`board.js:1178`（`put_checker`）・
   `checker.js:355`（`on_mouse_up_xy`）にあり、
   逆向きの `"p" + ("000" + n).slice(-3)` が `board.js:887`（`apply`）に
   ある。テストにも 2 か所ある。`Checker` 側に
   `ch.index()` のような 1 つの入口があると、ID の作り方
   （`dom.js:148`）と対で保守できる
2. `apply()` の中の `clock_state` は `undefined` 判定、`last_op` は
   真偽判定で、null の扱いが揃っていない（上の 2 番）

---

## まとめ

- **要修正: 0 件**
- **検討: 6 件**（A-2 テストの網羅、B-1 予測の巻き戻し、B-2 `set_turn`、
  B-4 例外時、C-1 dice の写し、在庫コメントと `CLAUDE.md` の補足）
- **好みの範囲: 2 件**

main に判断してほしいのは次の 2 つ。

1. **B-1（予測がダイス以外を 1 往復ぶん巻き戻す）を、このまま
   受け入れるか。** 受け入れるなら `CLAUDE.md` に 1 行足すのがよい
2. **2 枚のタブでの食い違いをテストに入れるか、verifier の手元の
   確認で済ませるか。** 私の実測では収束している（A1・A2）
