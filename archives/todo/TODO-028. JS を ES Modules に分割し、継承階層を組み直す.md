# TODO-028. JS を ES Modules に分割し、継承階層を組み直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 42,501 | 636,100 | 47% |
| implementer | Opus 5 | medium | 59,124 | 413,396 | 35% |
| reviewer | Opus 5 | high | 23,080 | 164,638 | 10% |
| verifier | Sonnet 5 | medium | 21,838 | 109,908 | 7% |
| 合計 |  |  | 146,543 | 1,324,042 | 概算 $23.2 |

- implementer と reviewer は定義のモデルが sonnet。この一連で最も大きい
  項目なので Opus 5 に上書きした。effort は定義の frontmatter の値
- **implementer が 2 度レート制限で止まり、3 回に分かれた**（段 1 の途中、
  R1〜R4 の途中）。段ごとに報告ファイルへ追記させていたので、
  引き継ぎで失われたものは無い。R4 だけは main が直した
- main の割合が 47% と高いのは、止まった 2 回の引き継ぎで作業ツリーの
  状態を main が確かめ直したため

## きっかけ

`Board` が 1,200 行超、コンストラクタだけで 280 行。モジュール分割が無く
全部グローバルスコープで、`this.board` と `board` の参照が混在していた。

### 決めたこと

- **キャッシュ避けは、サーバが `/static` に `Cache-Control: no-cache` を
  返す形にする。** `?ts=` 付き URL は、`import` した先のモジュールには
  効かない
- **`window.board` は残す**（デバッグ用と明記する）
- **バンドラは入れない**（TODO-020 で決めた）

着手時に main が決めた 6 点（`window` への橋渡し、作るファイル、
2 段に分けること）と、implementer・reviewer の「判断が要る点」への
main の答えは
[`archives/agents/TODO-028/README.md`](../agents/TODO-028/README.md) にある。

## やったこと

**2 段に分けて進めた。** 段 1 が `node --test tests/browser/` を通ってから
段 2 に入る形にした。

### 段 1 — 分割

`static/ytbg.js`（4,243 行）を `static/js/` の 15 ファイル（4,229 行）へ
分けた。`main.js` / `ws.js` / `log.js` / `layout.js` / `settings.js` /
`sound.js` / `board.js` と、`ui/` の 8 つ（`base.js` / `point.js` /
`checker.js` / `cube.js` / `dice.js` / `clock.js` / `label.js` /
`button.js`）。

- `index.html` の `<head>` は `<script type="module">` と
  `<link rel="stylesheet">` の 2 行になった（`?ts=` 付き URL を動的に
  組み立てる処理は消えた）
- かわりに `app.py` の `NoCacheStaticFiles` が `/static` に
  `Cache-Control: no-cache` を返す
- ES Modules はスコープが閉じるので、`index.html` の `onClick` /
  `onChange` / `onFocusOut` 属性から呼ばれる 15 個の関数を、
  `main.js` が `window` に載せる。**TODO-029 で属性を
  `addEventListener` に移したら、この橋渡しごと消す**

### 段 2 — 継承階層

**クラスは 37 から 22 になった。** 最も深いところで `BgBase` から 3 段
（`BgBase` → `BgImage` → `BannerButton` → `RollButton`）。

- 属性を足すだけの中間クラス 6 つ（`BoardText` / `PlayerText` /
  `PlayerItem` / `OnBoardImage` / `OnBoardButton` / `BoardArea`）をやめ、
  `board` と `player` は基底のコンストラクタの options で渡す
- `EmitButton` の 6 つのサブクラスを 1 つにした。**盤面で使っていたのは
  2 つだけで、残り 4 つはどこからも生成されていなかった。**
  しかも `Fwd2Button` / `FwdAllButton` は data を渡し忘れていて、
  生成すれば引数がずれる壊れた状態だった（使われていないので表に出て
  いない）。消したのでこの不具合も消えた
- `BannerButton` の 3 つのサブクラスを、押したときの動作を `on_click` で
  渡す形にした。**`RollButton` は残した**（ダイス 4 つを持ち、
  `on()` / `off()` も「隠す」ではなく「盤の端へ動かす」で違う）

クラス階層図は `ui/base.js` の先頭にある。

### クリックでの確認を `tests/browser/` に足した

`clicks.test.mjs`（25 件）。メニュー・ヘッダのチェックボックスと入力・
盤面のボタン・バナーを実際に押し、**送られたメッセージの
`type` / `data` / `history`** と、変わった `board` の属性を見る。

`tests/browser/` は 30 件になった。

## 確かめたこと

`uv run pytest`（211 passed）、`uv run ruff check .`、`uv run mypy src` が
終了コード 0。`node --test tests/browser/` は **3 回続けて 30 pass**。

**verifier が実際に動かして確かめたもの**（報告は
[verifier-report.md](../agents/TODO-028/verifier-report.md)）:

- **分割前（`390e397`）と今のスクリーンショットが md5 で完全一致。**
  `git worktree` で分割前を別ディレクトリに出し、同じ画像ディレクトリ・
  同じビューポート・同じ初期配置で撮って比べた
- `/static/js/main.js` が `Cache-Control: no-cache` を返し、
  2 回目のロードで JS と CSS が 304 になる
- **わざと壊す 5 通りが、いずれも狙ったテストを落とす。**
  `export` を消す、`window` への橋渡しを消す、戻すボタンの data を変える、
  バナーのコールバックを消す、`on_pass` の `change_turn()` を消す。
  最後の 2 つは **10 回続けて走らせて 10 回とも落ちた**（揺れていない）

**reviewer が、元の `ytbg.js` のクラス・メソッド・トップレベルの関数を
新しいファイルと突き合わせた**（報告は
[reviewer-report.md](../agents/TODO-028/reviewer-report.md)）。取りこぼしも
重複も無く、**宣言も import もされていない素の `board` / `emit_msg` も
どのモジュールにも無かった**。

## 残ること

- **素の `board` は、`window.board` を消しても ReferenceError にならない。**
  `index.html` に `<div id="board">` があり、id を持つ要素は `window` の
  名前付きプロパティになるため、黙って DIV を掴む。いまは該当箇所が
  無いが、罠として `main.js` のコメントと `CLAUDE.md` に書いた
- `no-cache` にしたので、2 回目以降のロードで 30 件（JS 15、CSS 1、画像 14）が
  304 の問い合わせになり、mp3 4 件は 206 で送り直される。操作感には
  効かないが、`ytbg.html` の 4 面なら 4 倍になる
- `InverseButton` / `ResignButton` / `ScoreButton` は統合しなかった。
  指示の範囲外で、`BannerButton` は中央寄せと z の出し入れを持つので
  そのままは載せられない
- `clicks.test.mjs` は、サーバの返事を待つ目印にプレーヤー 1 の名前を
  変えずに送り直している。**このファイルでプレーヤー 1 の名前を
  変えないこと**（`CLAUDE.md` にも書いた）

## 分担の振り返り

- **reviewer が「テストが効いていない」ことを実測で見つけた。**
  パスのバナーの「消える」という判定が、サーバの返事が先に届くせいで
  壊しても 5 回中 4 回通る状態だった。**壊した版を作って 5 回走らせる**
  という確かめ方をしており、読むだけでは出てこない
- **reviewer に「素の `board` を洗い出す」と名指しで頼んだのが効いた。**
  `window.board` があると素の `board` が動いてしまい、テストも通るので
  誰も気づかない。結果は 0 件だったが、`<div id="board">` でも同じことが
  起きるという、より広い罠が見つかった
- **「見た目を変えない」は、テストの数字では確かめられない。**
  verifier にスクリーンショットの比較を指示して、md5 一致まで取れた。
  次に見た目が関わる項目でも、これを使う
- **implementer が 2 度止まったが、段ごとの追記で引き継げた。**
  「途中で止まっても引き継げるように、1 つ終わるごとに報告ファイルへ
  追記する」という指示は、長い項目では必ず入れる
- **`git checkout` の禁止を明示したのが効いた。** TODO-026 で
  未コミットの変更を消す事故が起きたので、TODO-028 では
  `checkout` / `restore` / `stash` の 3 つを名指しで禁じ、
  scratchpad の控えから戻させた。事故は起きていない
- **次に同じ規模（数千行の移し替え）をやるなら、段を分けるのは必須。**
  ただし **main の割合が 47% と高すぎた**。止まるたびに main が作業ツリーを
  確かめ直したため。長い項目では、implementer に
  「作業ツリーの状態を報告ファイルの先頭に書く」ことまでさせると、
  引き継ぎが安くなる
