# TODO-027 implementer report

## いまの作業ツリーの状態

**実装・テスト・CLAUDE.md まで全部済み。残作業は無い**（コミットはしていない）。

```
 M CLAUDE.md
 M src/ytbg/webroot/static/js/board.js
 M src/ytbg/webroot/static/js/ui/base.js
 M src/ytbg/webroot/static/js/ui/checker.js
 M src/ytbg/webroot/static/js/ui/dice.js
?? src/ytbg/webroot/static/js/rules/     (position.js / move.js / judge.js)
?? tests/js/                             (helper.mjs / *.test.mjs 3 つ)
?? tests/browser/rules.test.mjs
?? .codegraph/  archives/agents/TODO-027/
```

**壊した版は残っていない**（`git status` と grep で確認済み。後述）。
`git checkout` / `restore` / `stash` は使っていない。控えは
scratchpad（`.../scratchpad/new/js`、`head/js`）に置いた。

## 移した関数の対応表

| 今までの場所 | 関数 | 移した先 | 呼ぶ側 |
|--------------|------|----------|--------|
| `ui/base.js` `BgBase` | `goal_point()` | `rules/position.js` | `judge.js` |
| `ui/base.js` `BgBase` | `bar_point()` | `rules/position.js` | `ui/checker.js:214`、`ui/dice.js:388`、`rules/` |
| `ui/base.js` `BgBase` | `calc_dst_point()` | `rules/move.js` | `board.js` `get_dst_point1()` |
| `ui/base.js` `BgBase` | `get_pip()` | `rules/position.js` | `Checker.get_pip()`（`rule_get_pip` として import）|
| `board.js` `Board` | `pip_count()` | `rules/judge.js` | `Board.pip_count()` が薄い包み |
| `board.js` `Board` | `calc_gammon()` | `rules/judge.js` | `judge.js` の `winner_is()` のみ。`Board` からは消した |
| `board.js` `Board` | `winner_is()` | `rules/judge.js` | `Board.winner_is()` が薄い包み |
| `board.js` `Board` | `closeout()` | `rules/judge.js` | `Board.closeout()` が薄い包み |

**`BgBase` からルール計算は全部消えた**（`ui/base.js` は 480 → 404 行）。
`Board` に残したのは、DOM から `Position` を作って渡し、返った値で表示・
状態を変えるだけの包み 4 つ（`position()` / `pip_count()` / `winner_is()` /
`closeout()`）。`board.js` と `ui/dice.js` の呼び出し側（`this.closeout()`、
`this.board.closeout()`）は 1 か所も書き換えていない。

変更箇所（`ファイル:行`）:

- `src/ytbg/webroot/static/js/rules/position.js:1-238`（新規）
- `src/ytbg/webroot/static/js/rules/move.js:1-34`（新規）
- `src/ytbg/webroot/static/js/rules/judge.js:1-131`（新規）
- `src/ytbg/webroot/static/js/ui/base.js:139-144` — 4 つのメソッドを削除
- `src/ytbg/webroot/static/js/board.js:9-13` — import を追加
  （`rule_closeout` / `rule_pip_count` / `rule_winner_is` と別名にしたのは、
  `Board` の同名メソッドと読み違えないため）
- `src/ytbg/webroot/static/js/board.js:635-680` — `position()` を新設、
  `pip_count()` / `winner_is()` を包みに、`calc_gammon()` を削除
- `src/ytbg/webroot/static/js/board.js:694-706` — `closeout()` を包みに
- `src/ytbg/webroot/static/js/board.js:800` — `this.calc_dst_point(...)` →
  `calc_dst_point(...)`
- `src/ytbg/webroot/static/js/ui/checker.js:4-5,65,213` — import 追加、
  `super.get_pip()` → `rule_get_pip()`、`this.bar_point()` → `bar_point()`
- `src/ytbg/webroot/static/js/ui/dice.js:4,388` — import 追加、
  `this.bar_point()` → `bar_point()`
- `CLAUDE.md` — 後述

## 副作用をどこへ移したか

1. **`pip_count()` の `this.pip[player].set(count)`** →
   `Board.pip_count()`（`board.js:656`）。`rules/judge.js` の
   `pip_count(position, player)` は値を返すだけ。呼び出し側
   （`load_gameinfo()` の 2 か所、`put_checker()` の 1 か所）は無変更。
2. **`winner_is()` の `this.resign = -1`** → `Board.winner_is()`
   （`board.js:676`）。`rules/judge.js` の `winner_is()` は
   `{score, by_resign}` を返し、`by_resign` が真のときだけ `Board` が
   `this.resign = -1` する。**消していない。** 呼び出し側
   （`board.js` の `set_turn()`、`ui/checker.js:373`）は無変更。

**ここで挙動が変わっていないかの確認**: 移す前は、`winner_is()` の中で
呼ぶ `pip_count()` が pip の表示まで変えていた。移した後はそこでは
変わらない。`winner_is()` の呼び出しは 2 か所だけで、どちらも**直前に
pip 表示が同じ値で更新されている**ので、見え方は変わらない。

- `set_turn()` は `load_gameinfo()`（`board.js:1061`）からしか呼ばれず、
  その 3 行後で `pip_count(0)` / `pip_count(1)` が呼ばれる
- `ui/checker.js:373` の直前で `put_checker()` が
  `pip_count(ch.player)` を呼んでいる

## `Position` の形

```js
new Position(pt)      // pt[p] = そのポイントのチェッカーの
                      //         プレーヤー番号を積んだ順に並べた配列
Position.empty()
Position.from_points(points)     // Board.position() 用
Position.from_gameinfo(gameinfo) // idx 昇順に積む（load_gameinfo と同じ）
owner(p)          // いちばん下のチェッカーの player。空なら null
count(p)          // 枚数
count_of(p, player)
players(p)        // 積んだ順の配列（複製）
points_of(player) // そのプレーヤーのチェッカーがあるポイント（1 枚 1 つ）
with_move(from_p, to_p, player)  // 新しい Position を返す。自分は不変
```

**設計（`docs/design.md`）と README の下書きは `pt[p] = {player, n}` だが、
積んだ順の配列にした。** 理由は 2 つ。

1. **free move では 1 つのポイントに両プレーヤーのチェッカーが乗る。**
   `{player, n}` だと枚数を分けられず、PIP カウントがずれる。今の
   `pip_count()` はチェッカー 1 枚ずつを見ているので、そこで挙動が変わる
2. **今の判定は `checkers[0].player` を見ている**（`closeout()`、
   `calc_gammon()`）。「いちばん下のチェッカー」という意味をそのまま
   持たせるには、積んだ順が要る

`owner(p)` / `count(p)` / `with_move()` という API は README のとおり。
`{player, n}` にしたい場合は、`owner()` / `count()` の中身を差し替えれば
済む形にしてある（**ここは判断が要る点**。後述）。

`with_move()` は **TODO-030 でしか使わない**が、テストは書いた（6 件）。
ヒットの処理はせず、相手をバーへ送るのは呼んだ側が別の `with_move()` で
行う（今の `Checker.on_mouse_up_xy()` が `put_checker()` を 2 回呼ぶのと
同じ形）。

## 足したテスト

### `tests/js/`（57 件、`node --test tests/js/`）

- `helper.mjs` — `init_checker()`（`src/ytbg/gameinfo.py` と同じ初期配置）、
  `make_gameinfo()`、`make_position({ポイント: [player,..]})`、`stack()`
- `position.test.mjs`（29 件）— `goal_point()` / `bar_point()` /
  `get_pip()`（player ごと、バーは 25、undefined）、
  `Position.from_gameinfo()`（初期配置、合計 30 枚、idx 順、範囲外は
  RangeError）、`owner()` / `count()` / `count_of()` / `points_of()` /
  `players()`（複製を返す）、`with_move()`（不変、上に積む、先端を動かす）
- `move.test.mjs`（6 件）— `calc_dst_point()` の向き（player0 は減る、
  player1 は増える）、バーの扱い、**相手のバーはバー扱いしない**、
  ゴールを行き過ぎても補正しない
- `judge.test.mjs`（22 件）— `pip_count()`（初期は 167、ゴールは 0、
  バーは 25、**混在ポイントでも混ざらない**）、`closeout()`（成立、
  相手がバーにいない、インナーの端が 1 枚、相手のポイント、
  インナーの外は無関係、player が 0/1 以外、相手のクローズアウトではない）、
  `calc_gammon()`（normal / gammon / backgammon / バー / cube 未受理）、
  `winner_is()`（上がり、投了、自分の投了、-1、`by_resign`、引数を
  書き換えない）

### `tests/browser/rules.test.mjs`（7 件、新規ファイル）

**既存の 32 件は 1 行も変えていない。** 足した理由は、既存の 2 つが
ドラッグを **free move で行うのでルール判定を 1 度も通らない**こと
（実測。「わざと壊した結果」の項を参照）。`Board` とルール層の
つなぎ間違いを捕まえるものが無くなるので、次の 7 件を足した。

`board.position()` の中身 / pip が 167 で表示にも出る / **動かすと表示が
161 に更新される**（＝ 副作用の移し先）/ 初期配置では誰も勝っていない /
**`winner_is()` が投了の 3 を返し `board.resign` を -1 に戻す**（＝ もう 1 つの
副作用の移し先）/ クローズアウトしていない / `get_dst_points()` の向き。

## 検証の結果

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 211 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed!、終了コード 0 |
| `uv run mypy src` | no issues found in 12 source files、終了コード 0 |
| `node --test tests/js/` | tests 57 / pass 57 / fail 0、終了コード 0 |
| `node --test tests/browser/` ×3 | 3 回とも tests 39 / pass 39 / fail 0、終了コード 0 |

## わざと壊して確かめた結果

### ルール層（`node --test tests/js/` を各 10 回）

| # | 壊し方 | 落ちた回数 | 落ちた件数 |
|---|--------|-----------|-----------|
| B1 | `calc_dst_point()` の player0 を `src_p + dice_val` に（**向きを逆に**） | 10/10 | 5 |
| B2 | `closeout()` の範囲を `[1, 6]` → `[1, 5]` に（**境界を 1 つずらす**） | 10/10 | 1 |
| B3 | `winner_is()` の `resign == 1 - player` → `resign == player`（**取り違え**） | 10/10 | 3 |
| B4 | `get_pip()` の player1 を `25 - point` → `point` に | 10/10 | 5 |
| B5 | `Position.owner()` が先頭ではなく末尾を返す | 10/10 | 3 |
| B6 | `bar_point()` を `26 + player` → `27 + player` に | 10/10 | 15 |
| B7 | `calc_gammon()` の backgammon（3 倍）を 2 倍に | 10/10 | 3 |

**7 通りすべて 10 回続けて落ちた（揺れない）。** うち B1・B2・B3・B7 は
「判定の意味が変わる」壊し方。壊すたびに scratchpad の控えから戻し、
最後に `diff -r` で元と一致することを確かめた。

### `Board` とルール層のつなぎ（`node --test tests/browser/rules.test.mjs` を各 3 回）

| # | 壊し方 | 落ちた回数 |
|---|--------|-----------|
| W1 | `calc_dst_point()` の向きを逆に | 3/3 |
| W2 | `Board.winner_is()` が `this.resign = -1` をしない | 3/3 |
| W3 | `Board.pip_count()` が `this.pip[player].set()` を呼ばない | 3/3 |

**W1 は、既存の 32 件（`board.test.mjs` / `clicks.test.mjs`）では
落ちなかった**（32 件とも通ってしまう）。ドラッグを free move で
行っているためで、ルール層を通らない。この穴を埋めるために
`rules.test.mjs` を足した。

W3 は最初、`rules.test.mjs` でも落ちなかった。`PlayerPipCount` の
コンストラクタが初期値 167 を表示しているので、初期配置のままでは
表示が更新されなくても気づけない。チェッカーを 1 枚動かしてから
161 を見る形に直したら 3/3 で落ちるようになった。

## CLAUDE.md の変更

指示（範囲）にあったので触った（**本来は管理者・wording の担当**なので、
文言の調整が要るなら直してほしい）。

- 実行の節のコマンド一覧に `node --test tests/js/` を追加
- テストの節に「Python / ルール層 / ブラウザ」の 3 つの走らせ方の表を追加。
  npm パッケージが要るのは `tests/browser/` だけ、と明記
- `tests/browser/` の一覧に `rules.test.mjs` を追加
- 構成の `static/js/` に `rules/` の説明を追加（何がどこにあるか、
  DOM も `Board` も見ないこと、副作用は `Board` 側にあること）

## 判断が要る点・気づいたこと

1. **`Position` の内部表現を、設計の `{player, n}` ではなく積んだ順の
   配列にした**（上の「`Position` の形」）。free move の混在ポイントで
   PIP カウントを合わせるため。設計どおりに戻すなら挙動が変わる。
2. **`BgBase.get_pip()` は引数の `player` ではなく `this.player` を
   見ていた。** 呼び出しは `Checker.get_pip()` の 1 か所だけで、そこは
   `this.player` を渡していたので**結果は変わらない**。移した先では
   引数の `player` を使う（純粋関数にするため）。`rules/position.js` の
   docstring に書いた。
3. **ルール層から `log()` を消した。** 移す前の `closeout()` と
   `calc_gammon()` は結果をコンソールに出していた。判定のたびに出るので
   （`closeout()` は 1 回の `put_checker()` ごと）、値を返すだけにした。
   **コンソールの出力は減る**が、エラーではないのでテストには影響しない。
4. **`Board.get_dst_points()` / `get_dst_point1()` / `all_inner()` は
   移していない**（README の表に無いため）。この 3 つも行き先の計算で、
   `this.point[].checkers` と `Checker.is_inner()` を見ている。
   `Position` があれば移せるので、TODO-030 か別項目で検討する余地がある。
5. **`tests/browser/` が 32 件から 39 件になった。** CLAUDE.md の
   `wait_images()` の説明にある「`tests/browser/` は 32 件とも通る」は
   TODO-029 での実測なので、そのままにしてある（数だけ古くなる）。
6. **`clicks.test.mjs` の「スコアの ▲ → set_score」は、ときどき落ちる。**
   5 秒待っても送信が観測されず timeout する。**この項目の変更とは関係
   ない**ことを確かめてある: HEAD のままの JS（`rules/` を外し、4 ファイルを
   `git show HEAD:` から書き戻した状態）で 5 回走らせたところ、同じテストが
   1 回落ちた（3 回目）。変更後も 5 回中 1 回落ちた。**ブラウザのテストは
   稀に揺れる**ので、落ちたら同じテストか確かめて走らせ直すとよい。

---

# reviewer の指摘を直した（追記）

`archives/agents/TODO-027/reviewer-report.md` の「検討」のうち、管理者が
選んだ 5 件（1・2・3・5・7）を直した。**4 と 6、好みの範囲の 2 件は触っていない。**
要修正は 0 件だったので、判定の意味は変えていない。

## 直した内容

| 指摘 | 直したもの | 箇所 |
|------|-----------|------|
| 1 | テスト名が中身と逆 | `tests/js/judge.test.mjs:204` |
| 2 | `MODULE_TYPELESS_PACKAGE_JSON` の警告 | `package.json:5` |
| 3 | ブラウザのテストが状態を共有し、順序に依存 | `tests/browser/rules.test.mjs` |
| 5 | `with_move()` の docstring が UI の実態と違う | `src/.../rules/position.js:213-221` |
| 7 | 78 文字超が 1 行 | `tests/js/judge.test.mjs:23-24` |

### 1. テスト名

`'上がって勝ったときは by_resign が false'` →
**`'上がっていても、相手が投了していれば by_resign'`**。
assert（`true`）とコメントはそのまま。

### 2. `"type": "module"`

`package.json` に `"type": "module"` を追加（`"private": true` の次の行）。
**`node --test tests/js/` の警告は 0 件になった**（`grep -ci warning` で 0）。

影響の確認:

- `node --test tests/browser/` — **6 回走らせて、そのうち 5 回が 39/39**
  （落ちた 1 回は後述の既知の揺れ）。`.mjs` なので影響しない、を実測で確認
- `npm install` — `up to date, audited 3 packages`、終了コード 0
- `npm test`（`package.json` の `scripts.test` = `node --test tests/browser/`）
  — 39/39
- `uv` — `package.json` は読まないので影響なし。`pytest` / `ruff` /
  `mypy` は変更前と同じく終了コード 0

### 3. `tests/browser/rules.test.mjs` の順序依存

**各 `it` が自分で前提を作り、変えたものは自分で戻す形に直した。**

- `beforeEach` を足し、**始まる前に初期配置・`resign == -1` であることを
  確かめる**（`pip` が 167/167、`position().count(6)` が 5）。
  崩れていれば「前の it が盤面を戻していない」で落ちる
- pip の表示のテストは、動かす前の `cur_point` を控え、**確かめたあとに
  同じ point へ戻す**。戻したあとの 167 も見るので、
  「動かすと変わる／戻すと戻る」の両方を確かめる形になった
- `resign` のテストは、`board.resign = 1` を自分で立てて、
  `winner_is()` が -1 に戻すことを確かめる（**立てた値は自分で回収される**）
- 「初期配置では」という名前とコメントは、`beforeEach` が本当に初期配置で
  あることを確かめるようになったので、実態と合っている

**`beforeEach` が効くことの確認**: pip のテストから戻す 1 行を外すと、
**後ろの 4 件が「前の it が盤面を戻していない」で落ちた**（実測）。
戻したあとは 7/7 通過。

**W3（`Board.pip_count()` が `pip[player].set()` を呼ばない）を今でも
捕まえることも確認済み**（この形に直したあとで、もう一度壊して 1 件落ちた）。

### 5. `with_move()` の docstring

事実と違う括弧書きを消し、**UI と食い違うこと自体を書いた**。

> from_p から動かすのは、そのポイントにある **player の** チェッカーの
> いちばん上の 1 枚。…
> **UI とは、混在ポイントで食い違う。** `ui/checker.js` の
> `on_mouse_down_xy()` は `checkers.slice(-1)[0]` で、プレーヤーを問わず
> ポイントの先端のチェッカーを掴む。free move で 1 つのポイントに両
> プレーヤーのチェッカーが乗っていると、UI が動かす駒と `with_move()` が
> 動かす駒は別になる。**TODO-030 でここを「UI と同じ」と見なさないこと**

`with_move()` の動き（自分の駒のいちばん上を取る）は変えていない。

### 7. 78 文字超

`closeout_position()` の `inner` の行を 2 行に分けた。
**`rules/` 3 本、`tests/js/`、`tests/browser/rules.test.mjs` の全行が
78 文字以内**（Python の `len()` で数え直して 0 件）。

## 検証の結果（直したあと）

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 211 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed!、終了コード 0 |
| `uv run mypy src` | no issues found in 12 source files、終了コード 0 |
| `node --test tests/js/` | 57/57、終了コード 0、**警告 0 件** |
| `npm install` | up to date、終了コード 0 |
| `npm test` | 39/39、終了コード 0 |
| `node --test tests/browser/` | **3 回続けて 39/39、終了コード 0**（run4〜6） |

**そのうち 1 回（run1）だけ落ちた**が、落ちたのは
`clicks.test.mjs:403`「スコアの ▲ → set_score」で、**前の報告に書いた
既知の揺れ**（HEAD のままの JS でも 5 回中 1 回落ちる）。同じテスト・
同じ timeout であることを確かめたうえで走らせ直し、**4・5・6 回目が
3 回続けて全件通った**。

## 終わる前の確認

- `git status` — 変更は `CLAUDE.md`（管理者）、`docs/design.md`（管理者）、
  `package.json`、JS 4 ファイル、新規の `rules/` / `tests/js/` /
  `tests/browser/rules.test.mjs` のみ
- `grep -rn` — わざと壊した版（`// this.pip[player].set`、
  `if ( false )`、戻す行のコメントアウト、`calc_dst_point` の逆向き）は
  `src` にも `tests` にも残っていない。`board.js` は控えと `diff` で一致
- コミットはしていない

## 追記: 検討 6（`with_move()` が無いはずの駒を生やす）

管理者の判断で、**例外を投げる**形に直した。

### 直した内容

- `src/ytbg/webroot/static/js/rules/position.js:250-256` —
  `from_p` に `player` の駒が無ければ `Error` を投げる。文言は
  **どのポイントの、どのプレーヤーの駒が無かったか**と、そのポイントの
  中身が分かる形:

  ```
  Position.with_move: point 6 に player0 のチェッカーが無い (players=[1])
  ```

- `src/.../rules/position.js:230-233` — docstring に
  「**from_p に player の駒が無ければ例外を投げる。** 呼ぶ側は
  『掴んでいる駒』を渡す前提で、駒が無いことは起きない。黙って to_p に
  積むと、そのプレーヤーの駒が 15 枚から増え、**盤面が静かに壊れる**」
  を追記。`@throws` も足した
- **`from_p` が `undefined`（どこからでもない）のときは今までどおり**
  置くだけ。挙動は変えていない

### テスト（`tests/js/position.test.mjs`、57 → 59 件）

書き換え・追加は 3 件。

- `'自分のチェッカーが無いポイントからは減らない'` を
  **`'自分のチェッカーが無いポイントからは動かせない (例外)'`** に
  書き換え。相手の駒しか無いポイントと、空のポイントの 2 通りで
  `assert.throws`
- **`'例外のときは、どこの誰の駒かが分かる'`**（新規）— 文言に
  `point 6` と `player0` が入っていることを見る
- **`'動かしても、そのプレーヤーの枚数は変わらない'`**（新規）—
  **バーとゴールも含めて 0〜27 の全ポイントを数え、15 枚のまま**で
  あることを見る。盤上 → 盤上 → バー → ゴールと 3 回続けて動かし、
  相手の 15 枚も変わらないことを確かめる

### 狙ったところを見ているかの確認（各 10 回）

| 壊し方 | 落ちた回数 | 落ちたテスト |
|--------|-----------|-------------|
| 例外をやめて元どおり `to_p` に積む | 10/10 | 書き換えた「例外」と、足した「どこの誰の駒か」の 2 件 |
| `from_p` から減らさない（駒が増える） | 10/10 | 足した「枚数は変わらない」を含む 6 件 |

**「枚数は変わらない」は、例外をやめただけでは落ちない**（そのテストは
駒がある所からしか動かさないため）。壊れ方の本体である「合計が増える」を
直接見ていることを、2 つめの壊し方で確かめた。どちらも scratchpad の
控えから戻し、`diff` で一致を確認した。

### 検証の結果

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 211 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed!、終了コード 0 |
| `uv run mypy src` | no issues found in 12 source files、終了コード 0 |
| `node --test tests/js/` | **59/59**、終了コード 0、**警告 0 件** |
| `node --test tests/browser/` | **3 回続けて 39/39、終了コード 0**（揺れ無し） |

`git status` と `grep -rn` で、壊した版が `src` にも `tests` にも
残っていないことを確認済み。`CLAUDE.md` / `docs/design.md` / `TODO.md` は
触っていない（差分は管理者のもの）。コミットはしていない。
