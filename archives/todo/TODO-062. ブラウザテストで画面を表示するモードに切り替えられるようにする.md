# TODO-062. ブラウザテストで画面を表示するモードに切り替えられるようにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort medium | verifier + reviewer |
| 実施 | Opus 5 / effort medium | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 9,591 | 20,019 | 52% |
| reviewer | Opus 5 | high | 10,515 | 45,963 | 31% |
| verifier | Sonnet 5 | medium | 7,864 | 58,829 | 17% |
| 合計 |  |  | 27,970 | 124,811 | 概算 $2.7 |

- reviewer は定義のモデルが sonnet。挙動が分かれる差分のレビューなので Opus 5 に
  上書きした。effort は定義の high。verifier は定義のまま（Sonnet 5 / medium）
- TODO-058 の途中で立て、TODO-058 の決着のあとに着手したので、
  `--since '2026-09-14 21:53:54'`（TODO-058 の決着のコミット）で集計した。
  集計は決着のコミットの直前まで

## きっかけ

利用者から、ブラウザテストをヘッドレスと画面を表示するモードで簡単に切り替えたいと
依頼があった。切り替え方は、環境変数・操作ごとの待ち・npm のコマンドの 3 つとも入れると
利用者が決めた。

## やったこと

- **tests/browser/helper.mjs** — `launch_browser()` が、`YTBG_TEST_HEADED` が空でも
  `0` でもなければ `headless: false`、`YTBG_TEST_SLOWMO`（ミリ秒）を `slowMo` に渡す。
  数でない値は 0。環境変数が無ければ変更前と同じ
- **package.json** — `test:browser`（`node --test tests/browser/`）と
  `test:browser:headed`（`YTBG_TEST_HEADED=1` と `--test-concurrency=1`。
  窓が同時に多数開かないように、ファイルを 1 つずつ走らせる）を足した。
  既存の `test` は残した
- **CLAUDE.md・docs/Developer.md** — 走らせ方、X の `DISPLAY` が要ること、
  待ちが入る操作と、待ちを入れた実行を通るかどうかの確認に使わない理由を書いた

レビューを受けて直したもの:

- 最初は「SLOWMO を大きくすると先手決めの自動クリックなど時間を見るテストが落ちる」と
  書いていたが、実際には落ちなかった。playwright の slowMo はマウス・キーボード・
  `goto` などにだけ入り、`page.evaluate()` には入らないため。心配なのは逆に、
  マウスを離したあとの待ちの間に返事が届き、先行実行の表示を見るテストが返事の表示を
  読むことなので、そう書き直した
- `test:browser` を文書に書いた。画面が無いと起動できないことを書いた
- `YTBG_TEST_SLOWMO` も `HEADED` と同じくモジュールの定数で読むように揃えた

## 確かめたこと

verifier が一式を 1 回ずつ走らせ、すべて終了コード 0 だった（pytest 292、tests/js 103、
tests/browser 92。ruff・mypy・basedpyright は指摘 0）。

- 走っている間の `ps` で chromium の引数を見て、`YTBG_TEST_HEADED=1` では `--headless` が無く、
  未設定・`0`・空では `--headless` があることを確かめた
- `npm run test:browser`（92 件、77 秒）と `npm run test:browser:headed`（92 件、137 秒）が通った
- `clicks.test.mjs` は SLOWMO 0 で 23 秒、200 で 33 秒になった
- 文書のコマンド例を書いたとおりに走らせて通った
- reviewer は SLOWMO=2500 で `opening.test.mjs`、1000 でマウス操作のある 4 ファイル
  60 件を走らせ、すべて通ることを見た

レビューを受けて直したあとは、main が構文と `sound.test.mjs` を
`YTBG_TEST_SLOWMO=1` で 1 回走らせて確かめた（定数に移しただけで、ほかは文書）。

## 分担の振り返り

- **verifier** は、`ps` で起動の引数を見て、モードの切り替えを実際に確かめた。
  文書の「落ちることがある」が再現しないことも見つけた
- **reviewer** は、その記述が誤りである理由を playwright のコードから示し、
  `test:browser` が文書に無いことと、画面が無い環境の件を見つけた。
  依頼で「テストは走らせなくてよい」としたが、主張を確かめるために走らせた
- 見込みと食い違いは無い
- 次に同じ規模の項目では、文書に「〜するとこうなる」と書くなら、main が書く前に
  1 回試す。今回はそれを省いて誤った注意書きを書き、レビューで直す手間になった。
  reviewer の依頼にも、主張を確かめるための実行はしてよいと最初から書く
