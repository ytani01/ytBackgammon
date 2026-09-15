# TODO-071. lobby の大きいボードを、ウィンドウに収まる範囲でなるべく大きく出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 14,673 | 83,686 | 50% |
| verifier | Sonnet 5 | medium | 18,871 | 79,815 | 24% |
| reviewer | Opus 5 | high | 16,932 | 56,280 | 27% |
| 合計 |  |  | 50,476 | 219,781 | 概算 $3.6 |

- verifier は定義のまま（`~/.claude/agents/verifier.md` が `model: sonnet` / `effort: medium`）。
  修正後の再確認は、同じ verifier に続けて頼んだ
- reviewer は定義の `model: sonnet` を Opus 5 に上書きした（倍率の計算の抜けを探すため）。
  effort は定義の `high`
- 分担は [archives/agents/TODO-071/](../agents/TODO-071/README.md) にある

## きっかけ

大きいボードの中身は 1030×650px の iframe を `transform: scale(0.835)` で縮小し、
枠を 880×560px に固定していた。ウィンドウが狭いと横にはみ出し、広いと余白が残る
（TODO-070 の「残ること」）。

利用者と決めたこと: 幅と高さの**両方**に収まる大きさにする（縦にもスクロールせずに、
大きいボード全体が見える）。

## やったこと

- `src/ytbg/webroot/static/js/lobby.js` に `fit_main()` を足した。カードの
  パディング、見出しとボタンの行（h3）、カードより上の h1、body の下の余白を引いた
  幅と高さから、iframe の `offsetWidth` / `offsetHeight`（transform の前の大きさ）に
  対する倍率の小さいほうを取り、`document.documentElement` の CSS 変数
  `--main-scale` に入れる。端数ではみ出さないよう 0.001 単位で切り捨て、0.1 を下限にした。
  呼ぶのは `show_main()`（大きく出すボードを選んだときと最初の表示）とウィンドウの `resize`
- `src/ytbg/webroot/templates/lobby.html` の `.main .frame` の大きさと `scale()` を
  `--main-scale` から組み立てた（既定値は 0.835）。`html` に
  `scrollbar-gutter: stable` を付けた。iframe の大きさは変えていない
- `tests/browser/lobby.test.mjs` に 1 件足した。高さで決まる大きさ・幅で決まる大きさの
  ウィンドウで、カードがはみ出ず、決め手の側に余白が残らないこと。開き直した直後
  （`resize` 無し）も合うこと。大きく出すボードを替えても小さいボードの大きさが変わらず、
  大きいボードの下に並ぶこと
- `docs/Developer.md` の lobby の節と、`CLAUDE.md` の `lobby.test.mjs` の説明に足した

reviewer の指摘で、最初の実装から次を直した。

- 倍率を変えるとページの高さが変わって縦のスクロールバーが出入りし、`resize` が
  起きないので計算がずれていた（1100×1000 で 6px 横にはみ出した）。
  `scrollbar-gutter: stable` で幅を変えないようにした
- テストの幅で決まる段がカードの右端を見ていた。カードは幅いっぱいに伸びるので
  倍率によらず通っていた。枠の右端で見るようにした
- `show_main()` から呼ぶ分を見るテストが無かったので、開き直した直後の確認を足した
- 1030 と 650 を JS に定数で持っていたのをやめ、iframe の大きさから読むようにした

## 確かめたこと

verifier が確かめた（[報告](../agents/TODO-071/verifier-report.md)）。

- `node --test tests/browser/lobby.test.mjs` が通る（5 件）
- 壊して、足したテストだけが落ちる: `resize` のリスナーを消す、`Math.min` を
  `Math.max` にする、`show_main()` の `fit_main()` を消す、幅から余計に 40px 引く
- 1920×1080、1280×600、600×900 でカードがはみ出さず、横スクロールが無い。
  1280×600 で大きく出すボードを替えても、小さいボードの大きさと位置が変わらない
- スクロールバーを隠さない chromium で、1100×1000 と 700×1000 を開いた直後の
  `--main-scale` が、`resize` を送った後の値と同じで、横スクロールが無い
- main が 1920×1080 のスクリーンショットを見た。上下が逆に見える文字は、向かい側の
  プレーヤー用に逆さに描いている名前と得点で、盤面の元の作り

## 残ること

- 小さいボードの枠は 450px 固定なので、それより狭いウィンドウでは横にはみ出す
  （変更前から）
- スマホで URL バーの出し入れにより `resize` が続けて起きたときの挙動は確かめていない

## 分担の振り返り

- reviewer（Opus 5）は、スクロールバーの出入りで計算がずれる件を、スクロールバーを
  隠さない chromium で実測して見つけた。headless ではスクロールバーの幅が 0 なので、
  テストでも verifier の計測でも出なかった。テストが倍率によらず通る段があることも
  見つけた。verifier は、指示した壊し方でテストが落ちることと、3 つの大きさでの
  はみ出しを確かめたが、上の 2 件は指示の外で見つけていない
- 見込みと実施の担当は食い違わなかった。reviewer の指摘の修正と再確認で 1 巡増えた
- 次に lobby の見た目で計算を伴う変更をするときも、reviewer を Opus で付ける。
  verifier への依頼には、最初から「スクロールバーを隠さない chromium
  （`ignoreDefaultArgs: ['--hide-scrollbars']`）で開いた直後を測る」を入れておく。
  そうすれば reviewer の実測と重ならず、再確認の 1 巡を減らせる
