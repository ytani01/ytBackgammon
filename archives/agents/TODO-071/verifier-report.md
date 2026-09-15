# TODO-071 verifier 報告

## 1. `node --test tests/browser/lobby.test.mjs`

通った（1 回）。

```
▶ lobby の一覧ページ
  ✔ iframe の src は、開いたホスト名とボードのポート (106.49121ms)
  ✔ 選んだボードが大きい枠になり、開き直しても残る (4637.320794ms)
  ✔ 停止・起動のボタンで状態の表示が変わり、起動後に iframe を読み直す (2476.924309ms)
  ✔ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (341.610605ms)
✔ lobby の一覧ページ (9693.785724ms)
▶ URL のプレフィクス付きの lobby とボード (TODO-064)
  ✔ 一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く (899.184213ms)
✔ URL のプレフィクス付きの lobby とボード (TODO-064) (2859.640037ms)
ℹ tests 5
ℹ suites 2
ℹ pass 5
ℹ fail 0
```

## 2. 足したテストが狙いを見ているか

**a) `window.addEventListener("resize", fit_main);` の行をコメントアウト**
（`src/ytbg/webroot/static/js/lobby.js` 165 行目）して実行 → 新テストのみ落ちた
（他の 4 件は通った）。

```
✖ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (5113.406825ms)
  Error: 1600x700: timeout. last value={"win_w":1600,"win_h":700,"card":{...,"right":1592,"bottom":711.765625,...}}
```
（`win_h:700` に対し `card.bottom:711.77` で、高さにはみ出したまま resize 後の
再計算が効かず timeout）

**b) `fit_main()` の `Math.min(` を `Math.max(` に変更**（74 行目）して実行 →
同じく新テストのみ落ちた。

```
✖ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (5102.179425ms)
  Error: 1600x700: timeout. last value={"win_w":1600,"win_h":700,"card":{...,"bottom":1117.375,...}}
```
（縦に大きくはみ出す）

どちらも新テストだけが落ち、他のテストは通った。確認後、手で元に戻し
（`sed` で戻す）、`git diff src/ytbg/webroot/static/js/lobby.js` を壊す前の
差分（`git diff` の当初の出力）と突き合わせ、**完全に一致することを確認した**
（diff コマンドの exit code 0）。

## 3. 実際の見た目（lobby 3 面、1920x1080 / 1280x600 / 600x900）

`tests/browser/helper.mjs` の `launch_browser()` と、`lobby.test.mjs` の
`start_lobby()` と同じ要領（`YTBG_DATA_DIR` を一時ディレクトリ、`free_port()`
でポート確保）でスクリプトを組んで確認した。

| ビューポート | card (main) | 横スクロール | はみ出し |
|---|---|---|---|
| 1920x1080 | right=1912 (win_w=1920, 余白8px) / bottom=1071.9 (win_h=1080, 余白8.1px) | 無し | 無し |
| 1280x600 | right=1272 (win_w=1280, 余白8px) / bottom=591.5 (win_h=600, 余白8.5px) | 無し | 無し |
| 600x900 | right=592 (win_w=600, 余白8px) / bottom=486.2（幅で頭打ちのため高さに大きく余白） | 無し | 無し |

いずれも `scrollWidth > clientWidth` は false（横スクロール無し）、
`card.right <= win_w` かつ `card.bottom <= win_h` を満たす。決め手側
（1920x1080 は高さ、1280x600 は高さ、600x900 は幅）の余白は 8〜8.5px で
「数 px」の範囲。見出し・ボタン行を含むカード全体がはみ出していない。

スクリーンショットを保存した（チャットにも添付済み）。

- `~/tmp/playwright-mcp/TODO-071-1920x1080.png`
- `~/tmp/playwright-mcp/TODO-071-1280x600.png`
- `~/tmp/playwright-mcp/TODO-071-600x900.png`

**懸念（判断が要る点ではないが記録）**: 1920x1080 のスクリーンショットで、
盤面の駒・文字が上下反転して見えるコマが写っている（`[Input name]` が
逆さまに見える箇所）。計測値（`card`/`frame`/`iframe` の矩形とサイズ）は
3 つの幅すべてで正しく収まっており、fit_main() 自体の不具合とは考えにくい。
盤面の初期ロール演出中のアニメーション（キューブや旗が回転して出てくる
アニメーション）をスクリーンショットのタイミングで捉えただけの可能性が高い
（1280x600・600x900 のスクリーンショットでは正常に見えている）。
TODO-071 の変更（fit_main / --main-scale）とは無関係と判断するが、断定は
できない。

## 4. 大きく出すボードを切り替えても小さいボードの大きさ・並びが変わらないこと（1280x600）

切り替え前後で `.board:not(.main) .frame` の `getBoundingClientRect()` を
比較し、完全に一致した。

```
before smalls: [{"x":12,"y":638.5,...,"width":450,"height":270},{"x":478,"y":638.5,...,"width":450,"height":270}]
after  smalls: [{"x":12,"y":638.5,...,"width":450,"height":270},{"x":478,"y":638.5,...,"width":450,"height":270}]
```

## 変更ファイルと指示範囲の一致

`git diff` の対象は指示どおり以下の 5 ファイルのみ。他のファイルへの変更は無い。

- `CLAUDE.md`（`lobby.test.mjs` の説明に TODO-071 を追記）
- `docs/Developer.md`（`fit_main()` の説明を追記）
- `src/ytbg/webroot/static/js/lobby.js`（`fit_main()` 追加、`resize` リスナ追加）
- `src/ytbg/webroot/templates/lobby.html`（`--main-scale` の CSS 変数化）
- `tests/browser/lobby.test.mjs`（新テスト 1 件追加）

TODO.md 側の要件確認:
- 大きいボードの倍率を幅・高さ両方に収まる最大値にする → 3 と 2 で確認済み
- ウィンドウの大きさを変えたら計算し直す → 2a（resize リスナのテスト）と
  3（3 つのビューポートで都度正しく収まる）で確認済み
- 見出しとボタンの行を含めてはみ出さない → 3 のスクリーンショットと計測で確認済み
- 大きく出すボードを切り替えても小さいボードが変わらない → 4 で確認済み
- `node --test tests/browser/lobby.test.mjs` が通る → 1 で確認済み

## 確かめられなかったこと・判断できないこと

- 1920x1080 のスクリーンショットで見えた上下反転の見た目について、
  fit_main() の変更が原因かアニメーションのタイミングかは断定できない。
  盤面のロール演出（`Roll` ボタンやフラグアイコンが回転して現れる）が
  写り込んだだけと見ているが、確証は無い。管理者・reviewer の判断を仰ぎたい
- lobby のプロセスは `SIGTERM` → 応答なければプロセスグループごと
  `SIGKILL` で止めた（`pkill` は使っていない）。確認後 `pgrep` で
  残存プロセスが無いことも確認した

---

# 再確認（reviewer の指摘を受けた修正後）

対象: `lobby.html` の `html { scrollbar-gutter: stable; }`、`lobby.js` の
`FRAME_W`/`FRAME_H` 定数をやめて `iframe.offsetWidth`/`offsetHeight` から
計算、テストの幅の段を `m.card.right - m.frame.right` で見る変更、
reload 直後の倍率の確認、切り替え後に小さいボードが大きいボードの下に
あることの確認。コードは直していない。

## 1. `node --test tests/browser/lobby.test.mjs`

通った（1 回）。

```
▶ lobby の一覧ページ
  ✔ iframe の src は、開いたホスト名とボードのポート (59.406974ms)
  ✔ 選んだボードが大きい枠になり、開き直しても残る (4724.135676ms)
  ✔ 停止・起動のボタンで状態の表示が変わり、起動後に iframe を読み直す (2537.904845ms)
  ✔ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (987.021487ms)
✔ lobby の一覧ページ (10394.346643ms)
▶ URL のプレフィクス付きの lobby とボード (TODO-064)
  ✔ 一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く (848.517314ms)
✔ URL のプレフィクス付きの lobby とボード (TODO-064) (2843.178627ms)
ℹ tests 5
ℹ suites 2
ℹ pass 5
ℹ fail 0
```

## 2. 壊して新テストが落ちるか

**(a) `show_main()` の中の `fit_main();` をコメントアウト**（47 行目）して実行
→ 新テストのみ落ち、他 4 件は通った。

```
✖ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (537.013438ms)
  AssertionError [ERR_ASSERTION]: {"win_w":1280,"win_h":720,...}
      at TestContext.<anonymous> (file:///home/ytani/work/ytBackgammon/tests/browser/lobby.test.mjs:258:16)
```

reload 直後の倍率を見る段（258 行目付近）で落ちた。これは reviewer の
指摘 3（`show_main()` の `fit_main()` を消しても元のテストは通っていた）
に対応する修正が効いていることの確認になる。

**(b) `fit_main()` の `avail_w` から余計に 40 を引く**（67 行目）して実行
→ 新テストのみ落ち、他 4 件は通った。

```
✖ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (5097.931889ms)
  Error: 700x1000: timeout. last value={"win_w":700,"win_h":1000,"card":{...,"right":677,...},"frame":{...,"right":632.05,...},...}
      at wait_for (file:///home/ytani/work/ytBackgammon/tests/browser/helper.mjs:284:19)
```

`[700, 1000, 'w']` の段（幅で決まる段）で timeout した。`card.right`
(677) と `frame.right` (632.05) の差が大きいまま収束しないため。
reviewer の指摘 2（幅側の最大性をテストが固定していない）に対応する
修正（`m.card.right - m.frame.right` で見る）が効いていることの確認になる。

どちらも確認後、手で元に戻し（sed で 1 行ずつ戻す）、
`git diff -- src/ytbg/webroot/static/js/lobby.js src/ytbg/webroot/templates/lobby.html tests/browser/lobby.test.mjs docs/Developer.md CLAUDE.md`
が、壊す前に取った diff と完全に一致することを確認した（`diff` コマンドの
exit code 0）。

## 3. reviewer 報告の要修正 1 の再現確認

`ignoreDefaultArgs: ['--hide-scrollbars']` で起動した headless chromium
（`tests/browser/helper.mjs` の `CHROMIUM_PATH` を使用）で、ボード 2 面の
lobby を 1100×1000 と 700×1000 で開いた直後（`resize` を送らずに）測定した。

```
=== 1100x1000 ===
just opened:      {"win_w":1085,"win_h":1000,"scrollW":1085,...,"card":{...,"right":1077,"bottom":792.375},"scale":"1.03"}
after resize event:{"win_w":1085,"win_h":1000,"scrollW":1085,...,"card":{...,"right":1077,"bottom":792.375},"scale":"1.03"}
scrollW > clientW (just opened): false
card fits (just opened): true
scale equal: true

=== 700x1000 ===
just opened:      {"win_w":700,"win_h":1000,"scrollW":685,...,"card":{...,"right":677,"bottom":539.515625},"scale":"0.641"}
after resize event:{"win_w":700,"win_h":1000,"scrollW":685,...,"card":{...,"right":677,"bottom":539.515625},"scale":"0.641"}
scrollW > clientW (just opened): false
card fits (just opened): true
scale equal: true
```

`scrollbar-gutter: stable` により、開いた直後の `clientWidth` が最初から
スクロールバーの分を引いた値になっている（1100×1000 で `win_w` が
1085 と、最初からスクロールバー幅 15px を差し引いた値）。開いた直後と
`resize` イベントを送った後で `--main-scale` が同じ値になり
（`scale equal: true`）、横スクロールも発生せず（`scrollW > clientW: false`）、
カードもウィンドウに収まっている。reviewer 報告の要修正 1 の再現条件で
問題が解消したことを確認した。

## 4. 1920x1080 と 1280x600 の再確認

```
=== 1920x1080 ===
win_w=1920 win_h=1080 scrollW=1905 (横スクロール無し)
card: right=1897 (win_w との差 23px)、bottom=1071.875 (win_h との差 8.125px)

=== 1280x600 ===
win_w=1280 win_h=600 scrollW=1265 (横スクロール無し)
card: right=1257 (win_w との差 23px)、bottom=591.515625 (win_h との差 8.5px)
```

いずれも `scrollW <= win_w`（横スクロール無し）、カードは収まっている。
修正前の測定（`scrollbar-gutter: stable` 追加前）では `card.right` は
`win_w - 8`（縦スクロールバーの有無による差が出ない場合）だったが、
今回は `win_w - 23` になっている。これは `scrollbar-gutter: stable` が
縦スクロールバー用の余白（本環境で 15px 程度）を常に確保するためで、
高さ側で倍率が決まっているこの 2 つの幅では想定どおりの挙動（余白が
増えた分は横方向の未使用領域で、はみ出しではない）。決め手側（どちらも
高さ）の余白は 8〜8.5px で「数 px」の範囲のまま変わっていない。

## 再確認のまとめ

reviewer の要修正 1・2 とも、指摘どおりの条件で問題が解消したことを
実測で確認した。指摘 3（切り替え後に小さいボードが大きいボードの下に
あることを見ていない）に対応するテスト追加分は、2(a) の破壊実験で
狙いどおり検知することを確認した。

## 確かめられなかったこと

- reviewer 報告の指摘 4（1030/650 が JS・CSS の 3 箇所に分かれている点）
  と指摘 5（`margin-bottom` を引く理由のコメント不足）は、今回のコードに
  修正が反映されているかを見る指示が無かったため確認していない
  （指摘 4 は今回の diff で `iframe.offsetWidth`/`offsetHeight` を使う形に
  直っており、`FRAME_W`/`FRAME_H` の定数は無くなっている。CSS 側の
  1030px/650px は残っており、コメントで `.frame iframe` の大きさと
  明記されている。指摘 5 のコメント追加の有無は今回の指示に無かったので
  深追いしていない）
- プロセスは `SIGTERM` → 応答なければプロセスグループごと `SIGKILL` で
  止め、`pgrep` で残存が無いことを確認した（`pkill` は使っていない）
