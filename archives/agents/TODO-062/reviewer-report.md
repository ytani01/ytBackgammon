# TODO-062 レビューの報告（reviewer）

対象: 未コミットの `git diff`（`tests/browser/helper.mjs`、`package.json`、`CLAUDE.md`、`docs/Developer.md`）

要修正 1 件、検討 2 件、好みの範囲 1 件。

## 要修正

### 1. `CLAUDE.md:141-142` / `docs/Developer.md:440-442`: SLOWMO で落ちるテストとして挙げた例が、実際には落ちない

- **問題:** 「SLOWMO を大きくすると時間を見るテストが落ちることがある（先手決めの 2 秒後の自動クリック、返事が届く前に読むもの）」と書いているが、
  挙げた例では落ちない
- **根拠（コード）:** playwright の slowMo が効くのは、`coreBundle.js` の表で `slowMo: true` が付いた操作だけ
  （マウス、キーボード、`click`、`goto` など）。`Frame.evaluateExpression` には付いていない。
  `opening.test.mjs` の Roll から自動クリックまでは `press_part()`、`send_msg()`、`wait_for()` が並ぶだけで、
  どれも `page.evaluate` なので待ちが入らない。「返事の前に 2 回押す」のは `press_n()` で、1 回の evaluate の中で押しているので、
  これも影響を受けない
- **根拠（実測）:**
  - `YTBG_TEST_SLOWMO=2500 node --test tests/browser/opening.test.mjs`: 3 件すべて通過
  - `YTBG_TEST_SLOWMO=1000` で `predict` / `drag` / `clicks` / `board`（マウス操作があるファイル）を走らせた: 60 件すべて通過
- **気にすべき点（未確認）:** 起きうるのは「落ちる」ことより「**壊れていても通ってしまう**」ほうだと考える。
  たとえば `predict.test.mjs` で `mouse.up()` のあとに予測の表示を読むテストは、slowMo の待ちの間にサーバの返事が届く。
  そのため、予測が壊れていても、返事で正しい表示になって通るおそれがある。src を壊して確かめてはいない。
  「検証には使わない」「確認はヘッドレスで」という結論はそのままでよく、説明と例を実態に合わせて直す必要がある

## 検討

### 2. `package.json:9`: `test:browser` が `test` と同じ中身で、文書のどこにも出てこない

- `test` と `test:browser` はどちらも `node --test tests/browser/`。CLAUDE.md にも Developer.md にも `npm test` / `npm run test:browser` は出てこない
- TODO の項目は「ヘッドレスと画面表示のそれぞれで走らせるものを足す」だが、ヘッドレスは既存の `test` で足りている。
  名前を揃えるために残すなら文書に書く。書かないなら消す（どちらにするかは管理者の判断）

### 3. `CLAUDE.md:137-142` / `docs/Developer.md:432-442`: 画面が無い環境で `YTBG_TEST_HEADED` を立てたときのことが書かれていない（未確認）

- 利用者は `DISPLAY=localhost:10.0`（SSH の X 転送）で作業している。X 転送なしで SSH から入ると、headed の chromium は起動に失敗するはず。
  実際には試していない
- 「画面を表示するには X（DISPLAY）が要る」と 1 行あれば足りる。要らないと判断してもよい

## 好みの範囲

### 4. `tests/browser/helper.mjs:39-44, 163`: HEADED はモジュールの定数、SLOWMO は関数の中で読んでいて、置き方が揃っていない

- JSDoc は定数 `HEADED` に付いているのに、SLOWMO の説明まで含んでいる。SLOWMO の読み込みも定数に上げるか、
  両方を `launch_browser()` の中で読むかに揃えると読みやすい
- 値の扱いは次のとおりで、実害は無い（実測）
  - 未設定、空、`abc`、空白だけ: 0
  - `-5` と `Infinity`: そのまま渡る。playwright の `if (slowMo) setTimeout(...)` を通り、Node が
    `TimeoutNegativeWarning` / `TimeoutOverflowWarning` を出して 1ms 扱いにする。警告が出るだけで止まらない

## 問題なしと確かめた点

- **既定の挙動:** 変更前と同じ。変更前の `{ executablePath }` に、playwright の既定値そのままの `headless: true` と `slowMo: 0` が明示で加わっただけ
- **`YTBG_TEST_HEADED` の値:** 未設定、空、`0` ならヘッドレス。それ以外（`false` や `no` も含む）なら画面を表示する。文書の「空でも `0` でもない値」と合っている
- **`--test-concurrency=1`:** Node v26.8.2 の `node --help` にある。ファイルの中の `it` はもともと順に走るので、窓を 1 つにする目的には足りている
- **npm の環境変数の書き方:** `npm config get script-shell` は `null`（POSIX の既定の `/bin/sh`）。`VAR=1 cmd` の形で動く
- **Developer.md:** TODO の番号は無い
- **ブラウザの起動:** 全テストファイルが `launch_browser()` を通しており、`chromium.launch` を直接呼ぶ箇所は無い
- **範囲:** 指示に無い変更は無い
