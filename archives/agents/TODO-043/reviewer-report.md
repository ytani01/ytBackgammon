# TODO-043 レビュー担当の報告

対象: `git diff`（5 ファイル）。移す前は `git show HEAD:<path>` と読み比べた。

結論を先に書くと、**移した 5 つの関数に、分岐の意味が変わったところは
見つからなかった。** 指摘はテストの押さえ漏れと docstring に寄っている。

---

## 要修正

### 1. `dice_for_move()` の「ダイスが 1 個」が 1 件も押さえられていない

- 場所: `tests/js/move.test.mjs:283-322`（`describe('dice_for_move()')`）、
  実装は `src/ytbg/webroot/static/js/rules/move.js:277-337`
- 何が問題か: `active_dice` の長さが 1 のときを通るテストが無い。
- 根拠（実測）: 隔離したコピー（scratchpad）で `dice_for_move()` の先頭に
  `if ( active_dice.length < 2 ) { return []; }` を入れても、
  `node --test tests/js/move.test.mjs` は **45 件すべて通った**。
- なぜ問題か: 実装はこの枝で `active_dice[1]` = `undefined` との比較に
  寄りかかっている。`diff_p == undefined` が false、
  `active_dice[0] + undefined` が `NaN` になることで、たまたま正しく
  動いている（`move.js:293-299`）。`==` を `===` に直す、値を
  `Number()` に通すといった**無害に見える整形で静かに壊れる**のに、
  テストは 1 件も落ちない。しかも 1 手目を使ったあとの 2 手目は
  必ず `active_dice` が 1 個になるので、実運用でいちばん通る形。
- 実測した現行の値（この 3 つを足せば塞がる）:

  | 呼び出し | 返り値 |
  |----------|--------|
  | `dice_for_move(0, [3], 13, 10)` | `[3]` |
  | `dice_for_move(0, [3], 13, 8)` | `[]` |
  | `dice_for_move(0, [6], 3, goal_point(0))` | `[6]`（ベアオフ） |

---

## 検討

### 2. `Checker.dice_check()` の JSDoc が実際と食い違ったまま

- 場所: `src/ytbg/webroot/static/js/ui/checker.js:46-53`
- 何が問題か: `@return {number} - 使用するダイスの目 / 0: そこには移動
  できない` とあるが、実際は `number[]` で、移動できないときは空配列。
- 根拠: 実装者も「移す前からの誤り」として報告している
  （`implementer-report.md` の判断が要る点 2）。
- 意見: **今回の差分で直すのがよい。** 移す前からの誤りとはいえ、
  このメソッドの本体は今回まるごと書き換えている。移した先の
  `dice_for_move()` の JSDoc は正しく `number[]` になったので、
  **包みだけが間違ったまま残る**という、いちばん紛らわしい状態になる。
  「範囲外の修正」には当たらない（触った関数の説明を合わせるだけ）。

### 3. `usable_dice()` の `i2 == i` を飛ばす枝が未カバー

- 場所: `src/ytbg/webroot/static/js/rules/move.js:235-237`
- 根拠（実測）: `if ( i2 == i ) { continue; }` を消しても 45 件すべて通った。
- なぜ問題か: この 3 行が無いと「同じダイスを 2 回足した目」で
  使用可と判定してしまう（[2, 5] のときに 2+2=4 で動けると見なす）。
  移す前からある枝で、今回そのまま写されているが、**何のために
  あるのかをテストが説明していない**ので、次に読む人が消せてしまう。

### 4. 「1〜6 でない目」のテストが、実際には来ない値を使っている

- 場所: `tests/js/move.test.mjs:220-224`（`usable_dice(pos, 0, [0, 7, -1, 0])`）
- 何が問題か: `Dice.value` が取る値は `0` / `10`（非表示）と
  `1`〜`6`（有効）、`11`〜`16`（使用済み）と決まっている
  （`src/ytbg/webroot/static/js/ui/dice.js:30-36` の docstring）。
  `7` や `-1` は実際には来ない。
- 根拠（実測）: `dice_val > 6` を `dice_val > 16` に変えても
  45 件すべて通った。つまり**使用済みダイス（11〜16）を
  disable し直さない**という肝心の性質が固定されていない。
- 直すなら `[0, 11, 10, 0]` のような、実際に来る値に替えるだけでよい。

### 5. `usable_dice()` のバー判定が player 1 で未カバー

- 場所: `tests/js/move.test.mjs:226-244`（バーのテストは 2 件とも player 0）
- 根拠（実測）: `const bar_p = bar_point(player);` を
  `const bar_p = 26;`（player 0 のバー固定）に変えても 45 件すべて通った。
- 実測した現行の挙動: player 1 のバーに 1 枚、1〜6 を相手が 2 枚ずつで
  ふさいだ盤面で `usable_dice(pos, 1, [3,5,0,0])` →
  `[false, false, false, false]`（正しい）。

### 6. 「バーからの復帰」と「ゾロ目」を掛け合わせたテストが無い

- 場所: `tests/js/move.test.mjs:155-177`（バー）と `:201-210`（ゾロ目）
- 何が問題か: TODO-043 が挙げた 4 つのうち 2 つが、それぞれ単独でしか
  見られていない。バーからゾロ目で 2 個・3 個・4 個ぶん進む経路
  （`dst_points()` の `src_p = bar_point()` × 4 個のダイス）は通らない。
- 実測した現行の値: `dst_points(pos, 0, bar_point(0), [3,3,3,3])`
  → `[22, 19, 16, 13]`。

### 7. `Checker.is_inner()` が未使用になった

- 場所: `src/ytbg/webroot/static/js/ui/checker.js:37-44`
- 根拠: `grep -rn "is_inner" src/ tests/` の結果が定義の 2 行だけ。
  唯一の呼び出し元だった `Board.all_inner()` がルール層へ移った。
- 意見: **今回の差分では消さなくてよい**（TODO-043 の範囲外）。
  ただし TODO-048「小さいものをまとめて直す」の表に 1 行足しておくと、
  忘れずに済む。`Board.all_inner()` と `Board.get_dst_point1()` も
  `src/` からの呼び出しが無くなったが、こちらは TODO-043 が
  「消さない」と明記しているので、そのままでよい。

---

## 好みの範囲

### 8. テストのコメントが盤面と合っていない

- 場所: `tests/js/move.test.mjs:247`
  「`// player0 の駒は 13 だけ。8 も 11 も 3 もふさがっている`」
- 実際にふさいでいるのは `8` / `11` / `10` / `5` で、`3` はふさいでいない。
  判定に効いているのは `8`（13-5）と `11`（13-2）の 2 つだけ。

### 9. `Board.all_inner()` の JSDoc に移譲先が書かれていない

- 場所: `src/ytbg/webroot/static/js/board.js:654-660`
- `closeout()`（`:662-672`）と `get_dst_point1()`（`:698-709`）には
  「判定は rules/... 」と書いてあるので、揃えると読みやすい。

---

## 読み合わせの結果（分岐の意味が変わっていないこと）

依頼で名指しされた 4 点を、移す前（`git show HEAD:`）と読み比べた。

### `usable_dice()` — 長さと中身の前提

**変わっていない。**

- `check_disable()` が渡すのは `this.get()`（`dice.js:335-341`）で、
  `this.dice.length` = 4 と同じ長さ・同じ添字。返り値の
  `usable[i]` と `this.dice[i]` が 1 対 1 で対応する
- 値が 1〜6 でない要素（`0` / `10`〜`16`）は `usable.push(true)` →
  disable しない。移す前の `continue` と同じ
- バーの枝に渡すダイスは、関数の中で `filter((v) => v >= 1 && v <= 6)`。
  移す前の `get_active_dice()`（`dice.js:347-357`）と、絞り方も並び順も同じ。
  **実測**: `filter` を外すと 1 件落ちる（テストは効いている）
- バーで復帰できないときは `map(() => false)` → 呼び出し側が 4 個とも
  `disable()`。移す前の `for (let d=0; d<4; d++) this.dice[d].disable()`
  と同じ（値 0 のダイスまで `disable()` して `value` が 10 になる、という
  細かい副作用も込みで同じ）
- 復帰できるときは `map(() => true)` → 何も disable しない。移す前の
  `return modified;`（= false）と同じ。T.B.D. のコメントも残っている

### `dst_point()` のベアオフとブロックの判定

**変わっていない。**

- `checkers.length > 0 && checkers[0].player == player` →
  `pos.owner(p) === player`。`owner()` は空なら `null` を返すので
  （`position.js:140-146`）、`null === 0` は false。同値
- `checkers.length >= 2 && checkers[0].player != player` →
  `pos.count(p) >= 2 && pos.owner(p) !== player`。同値
- 範囲外の添字については、player 0 は `dst_p1 < 0` のとき必ず 0 に
  丸められ、player 1 は `> 25` のとき 25 に丸められるので、
  `pos.count(dst_p1)` が範囲外になる呼び出し方は今のところ無い
  （実装者の報告 5 と同じ結論）

### `all_inner()` — 結果が変わる盤面

**実用上は無い。** 1 か所だけ性質が違うので書いておく。

- 移す前は `this.checker[player][i]`（15 個）の `cur_point` を見ていた。
  `cur_point` が `undefined` の駒は `undefined <= 6` が false になるので
  **false 側**に倒れた
- 移したあとは `pos.points_of(player)` なので、**どのポイントにも
  いない駒は数に入らない**。その player の駒が 0 枚なら `true` を返す
  （**実測**: `all_inner(make_position({}), 0)` → `true`）
- ただし `Board.apply()` は毎回 30 個すべてを `point[].checkers` に
  配り直し（`board.js:756-787`）、`BoardPoint.add()` が
  `ch.cur_point` も設定する（`ui/point.js:41-56`）ので、両者は常に一致する。
  ドラッグ中も駒は `point[].checkers` から外れない
  （`ui/checker.js:119-131` は座標と z を変えるだけ）
- 境目は指示どおり。player 0 は 0〜6（ゴールの 0 を含む）、
  player 1 は 19〜25、バー（26・27）は外

### `dice_for_move()` — `active_dice` が 1 個以下のとき

**変わっていない**（移す前と同じ `undefined` 頼みのまま）。実測:

| 呼び出し | 返り値 | 備考 |
|----------|--------|------|
| `dice_for_move(0, [3], 13, 10)` | `[3]` | |
| `dice_for_move(0, [3], 13, 8)` | `[]` | |
| `dice_for_move(0, [], 13, 10)` | `[]` | |
| `dice_for_move(0, [], 3, 0)` | `[-Infinity]` | `Math.max(...[])` |

最後の 1 つは移す前からある落とし穴だが、`on_mouse_up_xy()` が
先に `get_dst_points()` で空を弾いて `cancel_move()` するので
（`ui/checker.js:170-190`）、ここには到達しない。今回は直さなくてよい。

---

## `rules/` の約束（`CLAUDE.md`）

守られている。

- `rules/move.js` の import は `./position.js` の 1 本だけ。DOM も
  `Board` も触っていない。受け取るのは `Position` と数値だけ
- 表示を変えるのは呼び出し側に残っている。`RollButton.check_disable()`
  は `usable_dice()` の結果を見て `this.dice[i].disable()` を呼び、
  `modified` を返すだけ（`ui/dice.js:363-380`）
- `Board` の 3 つ（`all_inner()` / `get_dst_points()` /
  `get_dst_point1()`）は `this.position()` を渡すだけで、判定は残っていない。
  `Board.pip_count()` / `closeout()` と同じ形。`rule_` 接頭辞の付け方も
  既存に揃っている
- 指示に無い変更は混ざっていない。`tests/js/move.test.mjs` も
  既存の `calc_dst_point()` の節はそのままで、追加だけ

## テストが効いていることの確認（実測）

隔離したコピーに対して壊し、`node --test tests/js/move.test.mjs` を走らせた。

| 壊し方 | 落ちた件数 |
|--------|-----------|
| `dst_points()` の「単独が全滅なら和を試さない」早期 return を外す | 1 |
| `usable_dice()` のバー判定で 1〜6 の `filter` を外す | 1 |
| `dst_points()` の重複削除を外す | 3 |
| `dice_for_move()` の「2 個目の目だけで届く」枝を外す | 1 |
| `all_inner()` の player 1 の上限（`p > 25`）を外す | 1 |
| `usable_dice()` の `i2 == i` 除外を外す | **0**（指摘 3） |
| `dice_for_move()` をダイス 1 個で空にする | **0**（指摘 1） |
| `usable_dice()` のバーを player 0 固定にする | **0**（指摘 5） |
| 使用済みダイス（11〜16）も判定対象にする | **0**（指摘 4） |

なお `dst_points()` の `dice_vals.length == 0` の早期 return
（`move.js:126-128`）は、外しても全件通る。外しても後段の
`dst_p.length == 0` で同じ `[]` になるためで、害は無い。移す前からある
書き方なので、そのままでよい。

---

## コミット前に確かめてほしいこと

レビュー中（2026-09-12 19:57）に、`src/ytbg/webroot/static/js/rules/move.js`
の 105 行目が `pos.count(dst_p1) >= 3` に書き換わっているのを見つけた。
数十秒後には `>= 2` に戻っていたので、**並行して走っている確認担当の
「わざと壊す」作業の途中だった**とみられる（実装者の報告にも同じ壊し方が
ある）。事故で残るとブロックの判定が丸ごと効かなくなるので、
コミットの直前に `git diff` で `>= 2` に戻っていることを目視すること。

このため、私の壊しての確認は**プロジェクトのファイルを触らず**、
scratchpad に複製した `rules/` と `tests/js/` に対して行った。
