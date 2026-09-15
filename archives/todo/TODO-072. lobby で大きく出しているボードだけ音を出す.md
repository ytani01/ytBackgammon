# TODO-072. lobby で大きく出しているボードだけ音を出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 13,158 | 65,670 | 42% |
| verifier | Sonnet 5 | medium | 14,970 | 74,176 | 19% |
| reviewer | Opus 5 | high | 27,544 | 73,185 | 39% |
| 合計 |  |  | 55,672 | 213,031 | 概算 $3.7 |

- verifier は定義のまま（`~/.claude/agents/verifier.md` が `model: sonnet` / `effort: medium`）
- reviewer は定義の `model: sonnet` を Opus 5 に上書きした（読み込みの順序の抜けを探すため）。
  effort は定義の `high`
- 集計は決着のコミットの前、現在時刻まで
- 分担は [archives/agents/TODO-072/](../agents/TODO-072/README.md) にある

## きっかけ

全部のボードの iframe に `?sound=off` を付けていて、lobby では音が出なかった（TODO-063）。
切り替え方は、利用者と相談して「iframe を読み込み直す」に決めた
（postMessage でボードへ伝える案は、ボード側にも受け口が要るので採らなかった）。

## やったこと

- `src/ytbg/webroot/static/js/lobby.js`
  - `frame_url()` をやめて `load(c)` にした。カードに `main` の class が無いときだけ
    `?sound=off` を付けて `src` を入れる。カードは URL の代わりにボードの情報を持つ
  - `show_main()` で、`main` の有無が変わったカードのうち listen しているものだけ読み込み直す
  - `refresh()` の順序を、カードを作る → 最初だけ `show_main()` → `update()` にした
    （最初に開いたとき、音の有無を決めてから 1 回だけ読む）
  - この順序にすると、状態の文字が入る前に `fit_main()` が計算し、見出しの行が 2px 高く
    なって TODO-071 のテストが落ちた。`refresh()` の最後で毎回 `fit_main()` を呼ぶようにした
  - iframe に `allow="autoplay"` を付けた
- `tests/browser/lobby.test.mjs`: 最初は先頭のボードだけ `?sound=off` が無いこと、
  `allow` の属性、切り替えたら 2 面の `src` が入れ替わって大きいボードが読み込み直されること、
  開き直したときも覚えていた大きいボードだけ音ありなこと。プレフィクス付きの p1 は
  大きいボードなので、期待値から `?sound=off` を外した
- `docs/Developer.md`・`docs/Admin.md`・`docs/Player.md`・`CLAUDE.md` の lobby の説明

reviewer の指摘で、`docs/Developer.md` に残っていた「`src` は `listening` が偽から真に
変わったときだけ入れる」を直し、`fit_main()` を計算し直す時機の書き方を直した。
停止・起動のテストが前のテストの選択（b2 が大きい）に依存することをコメントに書いた。

## 確かめたこと

verifier が確かめた（[報告](../agents/TODO-072/verifier-report.md)）。

- `uv run pytest`・`ruff`・`mypy src`・`basedpyright`・`node --test tests/js/`・
  `node --test tests/browser/` がすべて通る
- 壊して、狙ったテストが落ちる: `load()` で全部に `sound=off` を付ける、`show_main()` の
  読み込み直しを消す、`allow="autoplay"` を消す、`refresh()` の最後の `fit_main()` を消す
- 実際に iframe の中で `sound.js` の `GlobalSoundSwitch` を読み、最初に開いたときも
  切り替えたあとも、大きいボードだけ音が有効なこと

reviewer が実測した: 最初に開いたとき各 iframe を 1 回だけ読む（覚えていない id でも）、
停止中のボードは切り替えても読みに行かず、起動したら正しい音の有無で 1 回読む、
3 秒ごとの `fit_main()` でスクロール位置も `--main-scale` も変わらない。

## 残ること

- **`allow="autoplay"` の効き目は、テストでは確かめられない。** playwright の chromium は
  属性が無くても音を再生する。普段使うブラウザで、lobby の大きいボードの音が出るかを
  一度見ること
- 次の 2 つは、テストを足さなかった。どちらも最後の `src` は正しくなるので、読み込みの
  回数（document のリクエスト）を数えないと捕まえられず、外れても 1 回余計に読むだけのため
  - 最初に開いたとき 2 回読まないこと（順序を元に戻してもテストは通る）
  - 停止中のボードを切り替えで読みに行かないこと
- 大きいボードを停止中に切り替えると、そのボードの iframe には起動するまで音ありのページが
  残る。ボードが listen し始めてから lobby が読み直すまで（最大 3 秒）に再接続して
  音が鳴る余地がある（推論。未確認。実害は小さいので直していない）

## 分担の振り返り

- reviewer（Opus 5）は、`docs/Developer.md` に残った古い記述（要修正）と、テストが読み込みの
  回数を捕まえていないこと、停止中に切り替えたときの流れを実測で見つけた。`allow` の効き目が
  テスト環境で確かめられないことも実測した。料金の 39% を占め、main とほぼ同じだった
- verifier（Sonnet 5）は一式と壊す確認、iframe の中の音の設定の実測を行い、問題は
  見つけなかった。作業中に `git checkout --` で未コミットの差分を一度消し、保存していた diff から
  戻した（戻したことは main も `git diff --stat` で確かめた）
- 見込みと実施の担当は食い違わなかった。`fit_main()` の件は main がテストを走らせて見つけ、
  担当に渡す前に直した
- 次に lobby の読み込みを変える項目では、verifier への依頼に「壊す前に `git diff` を保存し、
  戻すときは `git checkout` を使わず、保存した diff で当て直す」を書いておく。
  読み込みの回数が大事な変更なら、テストに document のリクエストを数える形を最初から入れる
  （reviewer が見つけてから足すか判断する 1 巡を省ける）
