# TODO-073. lobby のページの見出しを消し、その分ボードを大きく出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main（実装）+ verifier |
| 実施 | Opus 5 / effort low | main（実装）+ verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | low | 1,695 | 8,490 | 50% |
| verifier | Sonnet 5 | medium | 6,713 | 40,087 | 50% |
| 合計 |  |  | 8,408 | 48,577 | 概算 $0.6 |

- verifier は `~/.claude/agents/verifier.md` の定義（sonnet / effort medium）のまま動かした

## きっかけ

利用者から、lobby の一覧ページの一番上にある `<h1>` を消し、空いた分だけボードを大きく出すよう頼まれた。

## やったこと

- `src/ytbg/webroot/templates/lobby.html` から `<h1>ytBackgammon</h1>` を消した
- `src/ytbg/webroot/static/js/lobby.js` の `fit_main()` のコメントから h1 の話を消した

`fit_main()` はカードの上端の位置から空いている高さを出すので、JS の処理は変えていない。

## 確かめたこと

verifier が確かめた（`archives/agents/TODO-073/verifier-report.md`）。

- `node --test tests/browser/lobby.test.mjs` を 1 回走らせ、5 件すべて通った
- 1280x720 で比べると、`.board.main` の top が 79.9px から 8px になり、`.frame` は 933x589 から 1047x660 に、`--main-scale` は 0.906 から 1.016 になった
- docs/ と README.md に、消した h1 に触れた記述は無い（`docs/Developer.md` の「見出しの行」はカードの `<h3>` のこと）

## 分担の振り返り

- verifier は差分の確認とテストに加え、h1 の有無で大きさを実測して、ボードが大きくなったことを数値で示した。問題は見つからなかった
- 見込みとの食い違いは main の effort だけで、分担は見込みどおりだった。料金の半分は verifier で、実測のスクリプトを書いた分が大きい
- 次に同じ規模（テンプレートの 1 行と既存テストで確かめられる変更）をやるなら、verifier は Haiku でテストを 1 回走らせるだけにする。見た目の大きさが目的の変更で、既存テストでは広がった量までは見られないときだけ、今回のように実測させる
