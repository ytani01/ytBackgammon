# TODO-054 verifier の報告

## 1. チェックボックス・箇条書きの確認

- [x] `build_dom()` が作った要素を返し、`main.js` から `Board` へ渡す
  — `dom.js:250` `build_dom()` が `els` を返し、`main.js:12` `const els = build_dom();`、
  `main.js:128` `new Board(els, ...)`
- [x] `BgBase` が id ではなく要素を受け取るようにする
  — `ui/base.js` の `BgBase` コンストラクタが `el` を第 1 引数に取り、`getElementById` は無い。
  `id` は `get id() { return this.el.id; }` の getter として残るのみ
- [x] チェッカーがプレーヤーと通し番号を数値で持ち、`parseInt(ch.id.slice(1))` と
  `Board.search_checker()` をなくす
  — `ui/checker.js` の `Checker` は `player` / `num` を数値で持つ。
  `git grep` で `src/` 側に `parseInt(ch.id` `.id.slice(` `search_checker` は 0 件
  （残っているのは `tests/browser/predict.test.mjs` の 2 箇所のみ。実装者の報告どおり
  範囲外扱いで、`id` の getter があるため動作には影響しない）
- [x] `CLAUDE.md` の `dom.js` と `ui/` の説明を直す — `git diff CLAUDE.md` で該当節に
  TODO-054 の説明が追記されている

設計の付帯条件も確認した。

- id 属性は残る（`create_div()` は変わらず id を設定）
- `build_dom()` が作る要素はすべて渡している（`clock_bg`＝`PlayerClock` の背景、
  `name_input`＝`PlayerName` の `<input>` も含む）。ヘッダの要素
  （`clock_sw`、`clock_limit0`/`clock_limit1`、`nav-input`、`nav-drawer`、
  `sound-switch`、`disp-pip`、`free-move`）は今までどおり `getElementById` で拾っている
  （`board.js`、`main.js`、`settings.js`、`ui/clock.js` の `ClockLimit`）。
  これは設計の「ヘッダの要素は今のまま id で拾う」の範囲内
- `dom.js:254` の `board: document.getElementById("board")` は、`index.html` にある
  唯一の既存コンテナ（`<div id="board">`）を拾っているだけで、`build_dom()` 自身が
  作る「表示部品」ではないので、設計の対象外と判断した（表示部品への id 依存では
  ないため問題ないと考えるが、これは verifier の推定であり、管理者の判断が要れば
  別途確認してほしい）

`src/` 全体の `git grep`:
```
git grep -n "getElementById" -- src/    → 上記ヘッダ要素・#board のみ
git grep -n "parseInt(ch\.id\|id\.slice(" -- src/   → 0 件
git grep -n "search_checker" -- src/    → 0 件
```

## 2. 一式のテスト（1 回ずつ）

すべて終了コード 0（失敗なし）。

| コマンド | 結果 |
|---|---|
| `uv run pytest` | `291 passed, 1 warning`（警告は starlette の非推奨 API、TODO-054 と無関係） |
| `uv run ruff check .` | `All checks passed!` |
| `uv run mypy src` | `Success: no issues found in 12 source files` |
| `uv run basedpyright` | `0 errors, 0 warnings, 0 notes` |
| `node --test tests/js/` | `tests 103, pass 103, fail 0` |
| `node --test tests/browser/` | `tests 90, pass 90, fail 0` |

## 3. 壊して確かめた（3 通り）

いずれも `src/ytbg/webroot/static/js/board.js` を書き換えて
`node --test tests/browser/board.test.mjs predict.test.mjs last_op.test.mjs clicks.test.mjs drag.test.mjs`
を実行。終わるたびに退避しておいた元ファイルへ `\cp` で戻し、`md5sum` で一致を確認した。

1. **チェッカーの要素の割り当てを 1 つずらす**
   （`els.checker[player][i]` → `els.checker[player][(i + 1) % 15]`）
   → **68 件中 10 件 fail**（`predict.test.mjs` の複数、`ch.id` 経由でズレが見える）
2. **ダイスの要素をプレーヤー間で入れ替え**
   （`RollButton` に渡す `els.dice[0]` / `els.dice[1]` を入れ替え）
   → **68 件中 2 件 fail**（`clicks.test.mjs` の「使えるダイスが無いときにダイスを押す」ほか）
3. **`put_checker` の put/hit 判定で使う駒の引き当てを常に `[0]` にする**
   （`this.checker[Math.floor(ch_id / 100)]?.[ch_id % 100]` → `this.checker[0]?.[0]`）
   → **68 件全部 pass。落ちない。**
   実装者の報告どおり、盤上どうしの `put_checker`（free move）の
   put/hit 判定を見るテストは無い。`last_op.test.mjs` の `put_checker` ケースは
   盤上間の移動しか確かめていない

3 つとも復元後、`board.js` の md5sum が壊す前と一致することを確認した。

## 4. 画像読み込みを待つ順番

`git diff` を読んで確認した。`main.js` の該当箇所:

```diff
-build_dom();
+// 作った要素は Board へ渡す (TODO-054)
+const els = build_dom();
```

**`build_dom()` を呼ぶ行の位置（モジュール評価時、`window.onload` より前）は
変わっていない。** 変わったのは戻り値を受け取るようになったことだけで、
呼び出しのタイミングにはノータッチ。`wait_images()` の呼び出し位置
（`window.onload` の中）も diff に変更なし。CLAUDE.md が言う「画像の読み込みを
待ってから `Board` を作る順番」は保たれている。実測（画像の応答を遅らせての
配置確認）はしていない。順番自体を変えていないので、設計が求める
「順番に触れたら実測する」には該当しないと判断した。

## 変更ファイルと指示の範囲

`git diff --stat`（`archives/` を除く）:

```
CLAUDE.md
src/ytbg/webroot/static/js/actions.js
src/ytbg/webroot/static/js/board.js
src/ytbg/webroot/static/js/dom.js
src/ytbg/webroot/static/js/main.js
src/ytbg/webroot/static/js/ui/base.js
src/ytbg/webroot/static/js/ui/button.js
src/ytbg/webroot/static/js/ui/checker.js
src/ytbg/webroot/static/js/ui/clock.js
src/ytbg/webroot/static/js/ui/cube.js
src/ytbg/webroot/static/js/ui/dice.js
src/ytbg/webroot/static/js/ui/label.js
src/ytbg/webroot/static/js/ui/point.js
```

いずれも TODO-054 の対象（`ui/` の表示部品、`dom.js`、`main.js`、`board.js`、
`actions.js` の受け渡し、`CLAUDE.md` の説明）の範囲内。`actions.js` は 1 行のみの
差分（`checker_id()` を `player * 100 + num` にした行、実装者の報告どおり）。
指示に無いファイルの変更は無い。

## 確かめられなかったこと・判断できないこと

- **要素の取り違え全般**（実装者の報告にある「ダイス以外の要素の取り違え」、
  クロックの背景、名前の `<input>`、スコアのボタンなど）は、依頼にあった
  3 通りに絞ったため、ダイス以外は確かめていない。テストが無いという
  実装者の申告は妥当と考えるが、全部は個別に確認していない
- **`dom.js:254` の `board: document.getElementById("board")` が設計の
  「表示部品には要素を渡す」の対象に含まれるか**は、上記のとおり verifier の
  推定で「対象外」としたが、これは判断が要る点として管理者へ返す
- 画像読み込みの順番は、diff を読んで「呼び出し位置が変わっていない」ことは
  確認したが、依頼の 4 番で言う「実測」（画像の応答を遅らせて配置を見る）は
  行っていない。CLAUDE.md 自身が「順番を変えたときだけ実測する」としており、
  今回は順番自体は不変のため省略した。実測が必要かどうかは管理者の判断を仰ぎたい
