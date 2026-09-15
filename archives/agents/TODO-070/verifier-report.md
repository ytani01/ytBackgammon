# TODO-070 verifier 報告

## 1. `node --test tests/browser/lobby.test.mjs`（1 回だけ走らせた）

通った。

```
▶ lobby の一覧ページ
  ✔ iframe の src は、開いたホスト名とボードのポート (71.093889ms)
  ✔ 選んだボードが大きい枠になり、開き直しても残る (4763.289512ms)
  ✔ 停止・起動のボタンで状態の表示が変わり、起動後に iframe を読み直す (2575.442599ms)
✔ lobby の一覧ページ (10673.949443ms)
▶ URL のプレフィクス付きの lobby とボード (TODO-064)
  ✔ 一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く (883.238628ms)
✔ URL のプレフィクス付きの lobby とボード (TODO-064) (3097.262337ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

## 2. 見た目の確認

`lobby.test.mjs` と `helper.mjs` の起動方法（`YTBG_DATA_DIR` を一時ディレクトリに、
ポートは `free_port()`、`detached` 起動で SIGTERM→タイムアウトなら SIGKILL）を
そのまま流用したスクリプトを組み、ボード 3 面（b1/b2/b3）の設定で lobby を実プロセス
起動し、システムの chromium（`/usr/bin/chromium`）で見た。作業ツリーは変更していない
（スクリプトは `/tmp/claude-.../scratchpad/verify_visual.mjs` に置き、コードは未変更）。

各ボードの `.board` の `boundingBox()` を計測:

- **1920px**: `b1(main)` は `y=79.875`、`b2` と `b3` は両方 `y=690.875`（同じ行に並ぶ）。
  main は `x=8, width=1904` で先頭の行を単独で占めている。
- **600px**: `b1(main)` は `y=79.875`（変わらず単独の行）、`b2` は `y=690.875`、
  `b3` は `y=1011.875`（別の行 = 1 列に折り返す）。

いずれの幅でも `.board.main` は `b1` のままで、先頭の行を単独で占めている
（`document.querySelector('.board.main').dataset.serverId` が両方で `b1`）。

スクリーンショットを保存した:
- `~/tmp/playwright-mcp/todo070-lobby-1920.png`
- `~/tmp/playwright-mcp/todo070-lobby-600.png`

見た目も上の計測と合っている（1920px は小さいボード 2 枚が横に並び、600px は
縦に並ぶ）。

**気づいた点（判断不要、参考）**: 600px のビューポートでも `b1` の
`boundingBox().width` は `888px` だった（600px 幅なのに縦スクロールバー分を
除いても収まらない）。`<meta name="viewport">` の `initial-scale=0.4` は
デスクトップの playwright には効かないため、`.main .frame` の固定幅
`880px`（`main` はスケール 0.835 のiframe を包む）が原因で横スクロールが
出ている。これは今回の変更（`width: 920px;` を消したこと）とは無関係の、
元からある固定幅（`.frame` / `.main .frame`）による挙動で、今回確かめたい
「小さいボードが行に複数並ぶか・折り返すか・main が先頭行を占めるか」には
影響していない。

## 3. 変更前の理屈での確認

`git show HEAD:src/ytbg/webroot/templates/lobby.html` を読み、`body { width: 920px; }`
があったことを確認した。小さいボードは `.frame` が `450px` + `.board` の
`padding: 4px` を両側で `8px` = `458px`。2 枚 + `gap: 8px` で
`458 * 2 + 8 = 924px` となり、`920px` を超える。従って変更前は 1920px の
ビューポートでも小さいボードは 1 列にしか並ばなかったはずで、これは実際の
数値を試さず理屈だけで確認した（作業ツリーは変更していない）。

## 4. 変更されたファイルとの一致

`git status` で変更されているのは `src/ytbg/webroot/templates/lobby.html` のみ。
`git diff` も `width: 920px;` の行を削除しただけで、依頼の説明（`body` から
`width: 920px;` を消しただけ）と一致している。他に変更されたファイルは無い。

## 5. 確かめられなかったこと・判断が要る点

- 600px での横スクロール（`.main .frame` の固定幅由来）が意図した挙動かどうかは
  今回の依頼の範囲外と判断したが、確定的な判断ではない。気になる場合は
  管理者の判断が要る。
- スクリーンショットの目視確認は自分（verifier）が行った。感覚的な「レイアウトが
  崩れていないか」の最終判断は、添付画像を見て利用者にも確認してもらうのが良い。
