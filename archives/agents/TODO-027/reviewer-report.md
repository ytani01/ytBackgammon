# TODO-027 reviewer report

レビュー時点の作業ツリー。`src/` と `tests/` の JS は 20:06 以降変化なし
（mtime で確認）。**レビュー中の 20:08 に `CLAUDE.md` と
`docs/design.md` が書き換わった**（管理者の「誰も触っていない」と食い違う。
最後の「参考」を参照）。

**重大なもの: 0 件。** 判定の意味が変わっている箇所は見つからなかった。

---

## A. 移した 6 つの関数が、元と同じ値を返すか

**結果: 一致。168,618 件の比較で不一致 0 件。**

### やったこと

`819a7b2` の `ui/base.js` / `board.js` から、`goal_point()` /
`bar_point()` / `calc_dst_point()` / `get_pip()`（`this.player` を見る形の
まま）/ `pip_count()` / `calc_gammon()` / `winner_is()` / `closeout()` を
**1 文字も変えずに** `OldBoard` / `OldChecker` へ写し、同じ入力を新旧に
与えて突き合わせた（scratchpad の `diffcheck/old.mjs`、`diffcheck/fuzz.mjs`）。

- `goal_point()` / `bar_point()` — player 0/1 の全数
- `get_pip()` — player 0/1 × point 0〜39、`undefined`、`-1`、`100`
- `calc_dst_point()` — player 0/1 × src_p -2〜30 × dice 0〜7（**バー
  (26/27)、ゴール行き過ぎ、相手のバーを含む**）
- 盤面を使う 4 つ — ランダム盤面 4000 × 3 通り
  （完全ランダム / ゴール寄り（勝ち判定を踏ませる）/ インナー寄り
  （クローズアウトを踏ませる））。各盤面で cube 値 1/2/4/8/16 ×
  受理・未受理 × resign -1/0/1 を振り、player -1/0/1/2 を試した。
  積む順もシャッフルしているので `checkers[0].player`（= `owner()`）の
  違いが出れば捕まる

```
checked=168618, mismatch=0
```

### 境界について読み合わせた結果

| 箇所 | 元 | 新 | 判定 |
|------|----|----|------|
| ゴールを行き過ぎ | 補正しない（コメントアウト済み） | 同じ | 一致 |
| バーからの復帰 | `src_p == this.bar_point(player)` のときだけ 25 / 0 | 同じ（相手のバーは特別扱いしない） | 一致 |
| `closeout()` の範囲 | `[1,6]` / `[19,24]` と `bar_point(1-player)` | 同じ | 一致 |
| `closeout()` の player 判定 | `player != 0 && player != 1` で false | 同じ | 一致 |
| `calc_gammon()` の normal | `!cube.accepted \|\| 相手ゴールに 1 枚以上` | `!cube_accepted \|\| position.count(goal_point(1-player)) > 0` | 一致（元も所有者を見ず枚数だけ） |
| `calc_gammon()` の backgammon | インナー 6 点 + 相手のバーに `checkers[0].player == 1-player` | `owner(p) == 1-player` | 一致 |
| `pip_count()` のバー | `point > 25` → 25 | 同じ | 一致 |

**唯一の潜在差（到達しない）**: 元の `pip_count()` は
`this.checker[player]` の 15 枚を回り、`cur_point === undefined` の駒が
あると `NaN` → `undefined` を返した。新は `this.point[]` から作るので、
どの point にも入っていない駒は数に入らず 0 を返す。`cur_point` が
`undefined` なのは `Board` のコンストラクタ直後（`board.js:210` で
`new Checker`）から最初の `load_gameinfo()` までの間だけで、その間に
`pip_count()` / `winner_is()` を呼ぶ経路は無い（呼び出しは
`board.js:1014`/`1015`、`board.js:1114`（`put_checker()` の中）、
`board.js:581`（`set_turn()`、`load_gameinfo():1011` からのみ）で、
どれもチェッカー配置のあと）。**実害なしと判断したが、
「どの point にも無い駒」が将来できると勝ち判定が誤発火しうる**
（pip 0 = 勝ち、になる）。

---

## B. 副作用の移し先

### B-1. `winner_is()` の `this.resign = -1`

**結果: 2 か所とも正しく移っている。**

- `winner_is()` の呼び出しは grep で 2 か所のみ。
  `board.js:581`（`set_turn()`）と `ui/checker.js:375`。**どちらも
  `Board.winner_is()`（`board.js:671`）を通る**ので、`rules/` を直接
  呼んでいる経路は無い（`grep -rn "winner_is(" src/`）
- `Board.winner_is()` は `result.by_resign` が真のときだけ
  `this.resign = -1`。条件は `rules/judge.js:119` の
  `resign == 1 - player` で、元（`819a7b2` の `board.js:698`）と同じ
- **タイミングの差**: 元は `this.resign = -1` を `calc_gammon()` の
  **前**、新は**後**。`calc_gammon()` は `resign` を読まない
  （cube と point しか見ない）ので結果は変わらない。上の fuzz でも
  `winner_is()` の戻り値と、呼んだあとの `resign` の値を毎回突き合わせ、
  不一致 0 件
- ブラウザでも確認: `board.resign = 1` → `board.winner_is(0)` が 3 を
  返し、`board.resign` が -1 に戻る（`tests/browser/rules.test.mjs:85`
  が同じことを見ており、実装担当の W2 で 3/3 落ちている）

### B-2. `pip_count()` の `this.pip[player].set(count)`

**値は同じ。回数は turn < 0 のときだけ 4 → 2 に減るが、見え方は変わらない。**

実測（`board.pip[p].set` を差し替えて数えた。scratchpad の
`diffcheck/count_set.mjs` / `count_set2.mjs`）:

| 場面 | 新の `set()` 呼び出し | 元だと |
|------|----------------------|--------|
| turn = 2、put_checker の gameinfo | `[[0,166],[1,167]]`（2 回） | 同じ 2 回（turn >= 0 なので `winner_is()` は呼ばれない） |
| turn = -1、resign = -1、同上 | `[[0,166],[1,167]]`（2 回） | 4 回（`set_turn()` の `winner_is(0)`/`winner_is(1)` が中で `pip_count()` を呼び、そのあと `load_gameinfo():1014-1015` がもう一度） |

- **減った 2 回は同じ値を同じ順で書いていたぶん**で、
  `PlayerPipCount.set()`（`ui/label.js:127`）は代入と再描画だけで
  累積しない。最終表示は 166/167 で元と同じ（実測値も上の表のとおり）
- `this.pip[]` を読んでいる箇所は `board.js:435-439` の `on()`/`off()` と
  `board.js:658` の `set()` だけで、**`pip_count` の値を読む処理は無い**
  （`grep -rn "\.pip\[" src/`）。判定に影響しない
- `ui/checker.js:375` の経路は、直前の `put_checker()`（`board.js:1114`）が
  `pip_count(ch.player)` を呼んでいる。間の `check_disable()` /
  `roll_btn.get()` はチェッカーを動かさないので、表示は元と同じ

---

## C. `Position` の内部表現（積んだ順の配列）

**実装担当の理由は正しい。`{player, n}` だと実際にずれる。ブラウザでも
再現した。**

### C-1. ブラウザでの実測（end-to-end）

サーバを実プロセスで起動 → chromium で開く → `board.free_move = true` に
して、player1 のチェッカー 3 枚を **player0 が 5 枚乗っている point 6** へ
`emit_put_checker()` で送った（scratchpad の `diffcheck/browser_mixed2.mjs`）。

```
初期配置: [[1,[1,1]],[6,[0,0,0,0,0]],[8,[0,0,0]],[12,[1,1,1,1,1]],
           [13,[0,0,0,0,0]],[17,[1,1,1]],[19,[1,1,1,1,1]],[24,[0,0]]]
target point = 6
{"target_point":[0,0,0,0,0,1,1,1],
 "old":[167,206], "now":[167,206], "pn":[185,149], "shown":[167,206]}
```

- `old` = `819a7b2` の `Board.pip_count()` をページの中で再現した値
  （`board.checker[p][i].cur_point` から計算）
- `now` = 今の `board.pip_count()`
- `pn` = `pt[p] = {player, n}` だった場合（ポイントの持ち主のぶんしか
  数えられない）
- `shown` = 実際の画面の表示

**混在ポイントでも `now` は元と一致し、`{player, n}` だけがずれる**
（player0 が 167 → 185、player1 が 206 → 149）。free move で両者が同じ
ポイントに乗ることは `ui/checker.js:266-270` で確認した（free move の
分岐は `emit_put_checker()` を呼ぶだけで、行き先の判定もヒット処理も
通らない）。

### C-2. ルール層だけでの再現

player0 5 枚 + player1 5 枚を point 12 に置いた盤面
（scratchpad の `diffcheck/pn.mjs`）:

```
player0: old=120 配列=120 {player,n}=180
player1: old=185 配列=185 {player,n}=120
```

`owner()` が「いちばん下のチェッカー」（元の `checkers[0].player`）で
あることも、fuzz で積む順をシャッフルしながら 4000×3 盤面ぶん
突き合わせて一致を確認した。

**結論: `docs/design.md` の `{player, n}` ではなく積んだ順の配列にする
判断は妥当。** なお `docs/design.md` は 20:08 に積んだ順の配列へ更新済みで、
実装との食い違いは無くなっている。

---

## 直したほうがよいもの（検討）

### 1. `tests/js/judge.test.mjs:204` — テスト名が中身と逆

```js
it('上がって勝ったときは by_resign が false', () => {
    const r = winner_is(won, 0, {resign: 1});
    // 投了が先に見られるので、どちらでも勝ちだが by_resign になる
    assert.equal(r.by_resign, true);
});
```

名前は「false」、assert は `true`。コメントが正しく、assert も正しい
（`rules/judge.js:119` が resign を先に見る）ので**テストとしては
合っている**が、名前だけが逆。読んだ人が assert のほうを疑う。
根拠: 上記ファイルの実物。

### 2. `node --test tests/js/` が警告を出す（実測）

```
(node:...) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of
file:///.../rules/judge.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected.
This incurs a performance overhead.
To eliminate this warning, add "type": "module" to .../package.json
```

`rules/*.js` 3 本ぶん stderr に出る（`node --test tests/js/ 2>&1 | grep -i
warning` で確認）。**テストは通る**（57/57、終了コード 0）が、
`CLAUDE.md` に「npm パッケージは要らない」と書いた手順をそのまま試した
利用者に毎回この警告が出る。`package.json` に `"type": "module"` を足せば
消える（`tests/browser/` は `.mjs` なので影響しない。**未確認**: 足した
場合の `tests/browser/` の再実行はしていない）。
実装担当の報告にこの警告の記載は無い。

### 3. `tests/browser/rules.test.mjs` — it どうしが状態を共有し、名前が実態と違う

1 つの `page` を 7 件で使い回し、途中で盤面を壊す。

- `:71` — `board.put_checker(board.checker[0][0], 0)` で盤面を変える
- `:87` — `board.resign = 1` を書き込む

その結果、`:79` の `it('初期配置では、まだ誰も勝っていない')` と
`:91` のコメント「初期配置では、相手が point 1 に残っている」は、
**その時点で初期配置ではない**。今は偶然どちらも成り立つ
（動かした先が point 0 で、`calc_gammon()` が見るのは point 25 と
1〜6・27 のため）が、`it` の順番を入れ替えたり 1 件足したりすると
落ちる。根拠: 上記ファイルと `rules/judge.js:80-95` を読み合わせた。

### 4. `tests/js/helper.mjs:17` の初期配置が `src/ytbg/gameinfo.py:26` の写し

両者は今は一致している（1 行ずつ突き合わせ済み）が、手で写したもので、
**片方だけ変わっても誰も気づかない**。`pip_count()` が 167 という
テストの前提がここに乗っているので、ずれると誤った値を正解として
固定してしまう。`CLAUDE.md` の「対で保守するもの」に近い形。

### 5. `rules/position.js:217` の docstring が実際の UI と違う

> いちばん上の 1 枚 (今の `Checker.on_mouse_up_xy()` が動かすのも
> ポイントの先端のチェッカー)

`with_move()` は `pt[from_p].lastIndexOf(player)`（**自分の**駒の
いちばん上）を取るが、UI は `ui/checker.js:234` で
`point[cur_point].checkers.slice(-1)[0]`（**player を問わず**先端）を
取る。free move の混在ポイントでは別の駒になる。
`with_move()` の動きとしては「自分の駒」で正しいと思うが、
**括弧の中の説明が事実と違う**。TODO-030 でここを根拠にすると誤る。

### 6. `with_move()` が、無いはずの駒を生やす

`position.test.mjs:208`「自分のチェッカーが無いポイントからは減らない」が
追認しているとおり、`from_p` に `player` の駒が無くても `to_p` には
1 枚積む（`rules/position.js:232-238`）。合計枚数が 15 → 16 になる。
**今は誰も呼ばないので実害は無い**が、TODO-030 で合法手の列挙に使うと
静かに盤面が壊れる。投げるのか、何もしないのか、今の形のままにするのかを
TODO-030 の着手前に決めたほうがよい。

### 7. 1 行 78 文字を超える行（新しいファイルで 1 件だけ）

`tests/js/judge.test.mjs:23` が 80 文字。

```js
    const inner = (player == 0) ? [1, 2, 3, 4, 5, 6] : [19, 20, 21, 22, 23, 24];
```

**文字数**で数え直した結果（Python の `len()`）。`rules/` 3 本、
`tests/js/` の残り、`tests/browser/rules.test.mjs` は全行 78 以内。
`board.js` / `ui/dice.js` に 78 超の行があるが、いずれも今回の差分の
外（`board.js:345,537,815,831`、`dice.js:444`）。

---

## 確認して問題が無かったもの

- **`rules/` が DOM も `Board` も見ていない**（README の 4 番）。
  import は `move.js:7` と `judge.js:9` の `./position.js` だけ。
  `position.js` は何も import しない。`document` / `window` / `board` の
  参照も無い（`grep`）。`position.js:121` の `gameinfo.board.checker` は
  素のデータで、`Board` ではない
- **`BgBase` からルール計算が全部消えた**。`ui/base.js` の差分は
  4 メソッドの削除のみ。`this.goal_point` / `this.bar_point` /
  `this.calc_dst_point` / `super.get_pip` の残りは `src/` にも
  `tests/` にも無い（`grep -rn`）。`Board.calc_gammon()` も消えており、
  外から呼ばれていない
- **`log()` を消した影響は無い。** `log.js:11` は `console.log` そのまま。
  `tests/browser/helper.mjs:166` はコンソールの `msg.type() === 'error'`
  しか拾わないので、`console.log` が減っても判定は変わらない。
  上のブラウザ実測でも `console errors: []`
- **`Board.position()` の名前衝突なし。** `BgBase` / `BgImage` に
  `position` という名前は無い
- `tests/js/` 57 件は、狙った境界（バー、ゴール、`closeout()` の
  インナーの端、backgammon の判定、cube 未受理、混在ポイント）を
  実際に踏んでいる。`node --test tests/js/` を走らせて 57/57 通過を確認
- `CLAUDE.md` の書き足しは実装と一致（`rules/` の中身、副作用の置き場所、
  import の制約、`tests/js/` の走らせ方）。「32 件」は 20:08 の編集で
  「全件」に直っていた

## 好みの範囲

- `Board.position()`（`board.js:643`）が `.map()` で作った配列を、
  `Position` のコンストラクタ（`position.js:86`）がもう一度複製する。
  1 回の判定で 28 個の配列を 2 回作る。呼ばれる回数は 1 操作あたり
  数回なので実害は無い
- `rules/judge.js:55` の `isNaN(count)` → `undefined` は到達しない。
  `points_of()` が返すのは常に 0〜27 の整数なので、`get_pip()` が
  `undefined` を返すことがない。元の実装から素直に写した結果なので
  残っていても害は無いが、死んだ枝ではある

---

## 参考（指摘ではない）

**レビュー中に作業ツリーが動いた。** 開始時の `git status` には
`docs/design.md` が無く `CLAUDE.md` の差分は 26 行だったが、
20:08 に両方が書き換わった（`docs/design.md` が `{player, n}` から
積んだ順の配列へ、`CLAUDE.md` の「32 件」が「全件」へ）。
**`src/` と `tests/` の JS は 20:06 以降変化していない**ので、
A・B・C の実測結果はいまの作業ツリーに対して有効。
