# TODO-073 verifier report

## 対象の差分

`git diff` で確認した未コミットの差分は、目的どおり以下のみ。

- `src/ytbg/webroot/templates/lobby.html`: `<h1>ytBackgammon</h1>` の行を削除
- `src/ytbg/webroot/static/js/lobby.js`: `fit_main()` の docstring から
  「見出し (h1) の分も引く」の言及を削っただけ（コメントのみ、処理は無変更）

余計なファイルの変更は無い。`git status --short` も上記 2 ファイルのみ。

## 1. コードを読んだ確認

`fit_main()`（`src/ytbg/webroot/static/js/lobby.js` 60行目付近）は
`main.getBoundingClientRect().top` を実行時に DOM から取得しており、
h1 の有無や高さをハードコードしていない。h1 を消せば `.board.main` の
`top` が自動的に小さくなり、`avail_h` の計算式
（`avail_h = root.clientHeight - (main.top + scrollY) - (main.offsetHeight - frame.offsetHeight) - marginBottom`）
がそのまま反映して `avail_h` が増える。つまり **JS のロジックを変えずに
ボードが大きくなる設計で、コード上の矛盾は無い**。

## 2. `node --test tests/browser/lobby.test.mjs`

1 回実行。終了コード 0、5 件すべて pass。

```
▶ lobby の一覧ページ
  ✔ iframe の src は、開いたホスト名とボードのポート (69.558975ms)
  ✔ 選んだボードが大きい枠になり、開き直しても残る (5094.259955ms)
  ✔ 停止・起動のボタンで状態の表示が変わり、起動後に iframe を読み直す (2495.869957ms)
  ✔ 大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071) (992.826607ms)
✔ lobby の一覧ページ (12005.195635ms)
▶ URL のプレフィクス付きの lobby とボード (TODO-064)
  ✔ 一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く (1004.715741ms)
✔ URL のプレフィクス付きの lobby とボード (TODO-064) (3193.051063ms)
ℹ tests 5
ℹ suites 2
ℹ pass 5
ℹ fail 0
```

## 3. 実際に広がったかの数値確認

scratchpad にヘッドレス playwright で lobby を起動し、ビューポート
1280x720 で `.board.main .frame` の大きさを測るスクリプトを書いて、
現在の版（h1 無し）と HEAD の版（h1 あり）を比較した。

作業ツリーは `git show HEAD:src/ytbg/webroot/templates/lobby.html` の
内容へ一時的に差し替えて計測し、直後に元（作業ツリーの新しい版）へ戻した。
戻した後 `git diff --stat` が元と同じ 2 ファイルのみであることを確認済み。

| | h1 あり (HEAD) | h1 無し (現在) |
|---|---|---|
| `.board.main` の `top` | 79.875px | 8px |
| `.frame` の高さ | 588.9px | 660.4px |
| `.frame` の幅 | 933.2px | 1046.5px |
| `--main-scale` | 0.906 | 1.016 |

`top` が h1 の分（見出しの高さ約 72px）減り、それに応じて `.frame` の
高さ・幅・倍率がすべて増えている。目的どおりボードが大きく出ている
ことを数値で確認できた。

h1 が無い現在の版では `top` は 8px で、body の既定マージン相当
（ブラウザの UA スタイルシートの `body { margin: 8px }`）に一致している。

## 4. docs / README の見出し (h1) への言及

```
grep -rn "ytBackgammon</h1>\|lobby.*h1\|h1.*lobby\|見出し" docs/ README.md
```

`docs/Developer.md:172` に「見出しの行の高さが状態の文字で変わるため」の
1 件がヒットしたが、これは `fit_main()` が `/api/boards` を読み直す
たびに再計算する理由を説明した箇所で、指す対象はページの `<h1>` では
なく、**各カードの `<h3>`（ボード名・状態の `span.status`・ボタンを
含む見出し）**。`src/ytbg/webroot/static/js/lobby.js` の
`make_card()` （111〜115行目）に `<h3>` があり、状態のテキストで
高さが変わるのはこちら。ページの h1 を指していた記述は無かった。
削除した h1 に関する古い記述は残っていない。

## 確認できなかったこと・判断が要る点

特に無し。上記すべて実際に動かして確認した。
