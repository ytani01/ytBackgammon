# TODO-008. app_top() と top.html を消す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 10,674 | 16,901 | 66% |
| reviewer | Sonnet 5 | high | 8,634 | 39,854 | 17% |
| verifier | Sonnet 5 | medium | 4,857 | 68,628 | 17% |
| 合計 |  |  | 24,165 | 125,383 | 概算 $2.3 |

- verifier も reviewer も定義（`~/.claude/agents/*.md`）のまま。
  モデルの上書きはしていない
- 削除だけの項目なので、reviewer も Sonnet 5 で足りると見た（TODO-005 の
  振り返りで「reviewer は Opus 5 のまま」と書いたのは、書式変換のように
  実行時にしか誤りが出ない項目の話）

## きっかけ

TODO-005 の確認で verifier と reviewer が見つけた。`app_top()` は
`top.html`（「反時計回り（`/p1`）／時計回り（`/p2`）」を選ばせるメニュー
ページ）を返すが、`__main__.py` のルート（`/`、`/p1`、`/p2`）はすべて
`app_index()` を呼んでいるので、どこからも呼ばれていなかった。

着手前に決めたこと:

- **消す。** `/menu` のような別のパスで残す案、`/` を `top.html` に戻す案も
  あったが、**URL を開いたらすぐボードが出る**今の振る舞いのほうが、
  1 枚のボードを共有する使い方に合っている

## やったこと

- `yt_backgammon_server.py` の `app_top()`（7 行）を消した
- `webroot/templates/top.html` と `webroot/static/menu.css` を消した
  （`menu.css` は `top.html` からしか参照されていない）
- `__main__.py` の `/` のルート関数名を `def top()` から `def index_top()` に
  変えた。top ページが消えて名前の由来が無くなったため。
  `index_p1` / `index_p2` と揃う。**利用者に確かめてから直した**

## 確かめたこと

- `app_top` / `top.html` / `menu.css` を指す記述が、コード・テンプレート・
  JS・CSS・`ytbg.html`・`README.md`・`docs/` に残っていないこと
- `url_for('top')` のように、エンドポイント名を文字列で参照している箇所が
  無いこと（関数名を変えたため）
- `uv run pytest` 10 passed、`uv run ruff check .` 19 件、
  `uv run mypy src` 7 件。いずれも変更前と同数
- 実際にサーバを起動して、`/`、`/p1`、`/p2` がいずれも 200 で
  `index.html`（ボードのページ）を返すこと、ログに `TemplateNotFound` などの
  例外が出ていないこと、`/static/menu.css` が 404 になることを確かめた

### いつから到達不能だったか

reviewer が `git log -S` で辿った。`/` が `app_top()` を呼ばなくなったのは
**2020-05-08 のコミット `a3da98c`**（`- return svr.app_top()` /
`+ return svr.app_index()`）。以来 6 年ほど、`app_top()` と `top.html` は
どこからも使われないまま残っていた。

## 分担の振り返り

- **reviewer は「いつから到達不能だったか」を履歴から突き止めた**
  （`git log -S`）。指摘そのものは 0 件で、好みの範囲として挙げた
  `def top()` の関数名だけが残った。verifier も独立に同じ点を挙げた。
  verifier は実サーバで `/`、`/p1`、`/p2` と `menu.css` の 404 まで通した
- **見込みと食い違わなかった。** 担当もモデルも見込みのまま。削除だけの
  項目にしては料金（$2.3）のうち **main が 66%** を占めたが、これは項目が
  小さく分母が小さいため。担当 2 人の合計は $0.8
- 次に同じ規模（削除だけ、数行）の項目をやるなら:
  - **verifier と reviewer を並行で起動する**のは今回もうまくいった。
    どちらも読むだけなので待ちが重ならない
  - **reviewer に「いつからこうなっていたか」を名指しで聞く**のは、
    削除の項目では効く。消してよい根拠が履歴から出る
  - main の側は、報告ファイルを開く前に返事の 5 行で足りるかを見る。
    今回は 2 通とも同じ 1 点しか挙げていなかったので、全文を読む必要は
    無かった

分担の理由と各担当の報告は
[archives/agents/TODO-008/](../agents/TODO-008/) にある。
