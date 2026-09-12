# TODO-041 レビュー報告

対象: `src/ytbg/webroot/static/js/ui/dice.js`（diff）、
`tests/browser/opening.test.mjs`（新規）

## 総評

指摘なし（要修正 0 件）。修正は根本原因に当たっており、テストも狙った
挙動（free move での `this` 取り違え）を固定できている。

## 確認した内容

### 1. 修正が根本原因に当たっているか / 他に同じ取り違えが無いか

- `git grep -n '\.bind('` を `src/ytbg/webroot/static/js/` 全体に掛けた。
  該当は `dice.js:543`（今回直したもの）と `ui/base.js:77-83` の 7 件
  （すべて `this.on_mouse_down.bind(this)` のように自分自身へ束縛）のみ。
  他に同種の取り違えは見当たらない（未確認: TypeScript の型が無いので
  静的には保証できず、grep による目視確認の範囲）。
- `Dice.on_mouse_down_xy()` を読み、free move 分岐（140〜162 行）が
  `this.value` を読むこと、非 free move の `turn >= 2` 分岐
  （170〜199 行）は `this.player` しか読まないことを確認した。
  `RollButton.player` と `RollButton.dice[i].player` は同じ値になるため、
  `turn >= 2` 分岐は `this` を取り違えても偶然動く（`TODO.md` の記載どおり）。
  今回の `bind(this.dice[0])` により、free move 分岐でも正しく
  `this.value` / `this.set()` が `Dice` インスタンスに対して働くようになる。

### 2. テストが狙った挙動を固定しているか

- **乱数依存**: `RollButton.roll()` は `Math.random()` でダイスを決めるが、
  `set_opening()` と各 `it` 内で `emit_dice()` により **サーバ経由で
  決め打ちの値に上書きしてから** `wait_for()` で反映を待っている
  （ファイル冒頭のコメントで「ローカルに `set()` するだけでは足りない」
  という理由も明記されている）。2 秒後の自動クリックが読む値は
  この決め打ち後の値なので、揺れない。
- **待ち方**: `tests/browser/predict.test.mjs` と同じ
  `helper.mjs` の `start_server` / `launch_browser` / `open_board` /
  `wait_for` / `console_errors` を使っており、書き方は揃っている。
  自動クリックの 2 秒待ちには `wait_for` の既定 5000ms を超える
  `AUTO_CLICK_WAIT = 8000` を明示的に渡しており、他のテストの
  待ち方（既定値 or 個別の `timeout`）と矛盾しない。
- **状態の引き継ぎ**: `describe` 内で `page` / `server` / `browser` は
  共有しているが、各 `it` の冒頭で `set_opening()` を呼んで
  `turn` とダイスを毎回リセットしている。`predict.test.mjs` のように
  「前のテストの盤面をそのまま引き継ぐ」設計ではなく、各 `it` が
  自己完結している（2 番目の `it` の最後で `set_free_move(page, false)`
  も明示的に戻している）。**ただし** `predict.test.mjs` にある
  「テストは書いた順に走り…並べ替えないこと」という注記は
  `opening.test.mjs` には無い。実際に読んだ限り並べ替えても壊れなそうだが、
  そこは**未確認**（実際に順序を入れ替えて走らせてはいない）。

### 3. `CLAUDE.md` の慣習

- ファイル冒頭は他の `tests/browser/*.test.mjs` と同じ
  `// (c) Yoichi Tanibayashi` ＋説明＋`node --test tests/browser/` の形。
- コメントは日本語で「なぜ」（このタイミングでサーバ経由に上書きする理由、
  自動クリックの `this` がずれると何が起きるか）を書いており、
  「何を」の説明に留まっていない。
- 造語は見当たらない。
- diff 自体（`dice.js`）はログ追加や新規コメントを伴わない 1 行の
  束縛先変更のみ。

### 4. 分岐の意味

- 変更点は `bind()` の第一引数だけで、`if` / 分岐の条件式・順序には
  手を入れていない。free move でない経路（`turn >= 2` 分岐、
  通常の `turn` 分岐）の挙動は、上記のとおり `this.player` しか
  読まないため、修正前後で見た目上変化しない（`TODO.md` の記載と一致）。
