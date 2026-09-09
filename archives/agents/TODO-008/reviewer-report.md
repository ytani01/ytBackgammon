# TODO-008 レビュー報告

対象: `git diff HEAD`
- 削除: `src/ytbg/webroot/static/menu.css`, `src/ytbg/webroot/templates/top.html`
- 変更: `src/ytbg/yt_backgammon_server.py`（`app_top()` を削除、7 行）

## 到達不能だったかの確認

**確認済み。長期間（約 6 年）到達不能だった。**

- `git log -S "return svr.app_top" -- app/bgserver.py app/ytbg.py` により、
  `/` ルートが `svr.app_top()` を呼んでいたのはコミット `a3da98c`
  （2020-05-02）で、その次のコミット `a7f7a22`（2020-05-08）で
  `svr.app_index()` に置き換えられている（差分:
  `-    return svr.app_top()` / `+    return svr.app_index()`）。
  以降、現在の `src/ytbg/__main__.py` まで `/`, `/p1`, `/p2` はすべて
  `app_index()` を呼んでおり、`app_top()` を呼ぶ経路は無い
- つまり `app_top()` と `top.html` は 2020-05-08 以降、実質約 6 年間
  死んでいたコードだった。TODO-008 の「どこからも呼ばれない」という
  判断は正しい
- 新レイアウト（`src/ytbg/`）への移行コミット `12eddc5` の時点で、
  既に `/` は `app_index()` を呼んでおり、`app_top()`／`top.html` は
  移行前の状態をそのまま引き継いだ死骸だったことも確認した

## menu.css の要不要

**確認済み。`menu.css` を消してよい。**

- 削除前の `top.html`（`git show HEAD:.../top.html`）を見ると、
  `<link rel="stylesheet" ... href="/static/menu.css">` は `top.html` の
  中にしか無い
- `ytbg.js:4144-4145` の `// menu` コメントと
  `document.getElementById("nav-drawer")` は、`index.html:44` の
  `<div id="nav-drawer">` を指しており、その CSS 定義は
  `ytbg.css:36` にある（`#nav-drawer`, `#nav-open`, `#nav-content` など
  一式）。`menu.css` 側には無い。`ytbg.js` 側の `nav_el.offsetWidth` /
  `offsetHeight` はボードのサイズ計算に使っているだけで、`menu.css` の
  スタイルには依存していない
- リポジトリ全体を `grep` しても `menu.css` を参照する箇所は
  `top.html`（削除対象）以外に無い（`grep -rn "menu.css" ...` で該当なし）

## 消し過ぎ・消し足りない箇所

問題なし。

- `yt_backgammon_server.py` の差分は `app_top()` の 7 行削除のみで、
  `render_template` の import や `_svr_name` / `_svr_ver` / `_image_dir`
  はすべて `app_index()` が使い続けており、不要な import・変数は
  残っていない
- `src/ytbg/__main__.py` は変更されていないが、それで正しい。
  もともと `/`, `/p1`, `/p2` は `app_index()` を呼んでおり、`app_top` へ
  言及する行が無いため直す必要が無い

## 文書・TODO 番号

問題なし。

- `README.md` / `docs/` に `top.html` や「`/` を開いて向きを選ぶ」
  といった手順の記述は見当たらない（`grep` で該当なし）。
  そもそも現状の README にはメニューページを前提にした手順は無かった
- `README.md` に TODO 番号を書いている箇所は無い（規約
  「利用者向け文書に TODO 番号を書かない」への違反なし）

## 気付いた点（好みの範囲）

- `src/ytbg/__main__.py:52-53` のルート関数名が `def top():` のまま
  残っている。`top.html` の概念が無くなった今、名前だけが昔の名残りに
  見えるが、今回の変更範囲外であり、動作に影響は無い。直すなら
  別項目にした方がよい（今回は指摘のみ）

## テスト

- `uv run pytest` は 10 件全て pass。`tests/` に `app_top` /
  `top.html` を参照するテストは無く、削除によるテストの壊れは無い

## 結論

要修正・検討に該当する指摘は無し。削除範囲は妥当で、消し過ぎ・
消し足りない箇所も見当たらない。
