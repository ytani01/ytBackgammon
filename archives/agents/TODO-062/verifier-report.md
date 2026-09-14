# TODO-062 確認の報告（verifier）

## 1. 検証の一式（1 回ずつ）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 292 passed |
| `node --test tests/js/` | 0 | 103 passed |
| `node --test tests/browser/`（既定・ヘッドレス） | 0 | 92 passed（58.1s） |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |

すべて通過。落ちたものなし。

## 2. HEADED の切り替え

`DISPLAY=localhost:10.0`（X 転送）が来ていることを確認済み（`xset q` が通る。
`xdpyinfo` は未インストール）。

`sound.test.mjs` を走らせている最中の `ps aux` で、起動した chromium の
コマンドラインを確認した。

- `YTBG_TEST_HEADED=1`: `/usr/lib/chromium/chromium ... --no-startup-window`
  （`--headless` 無し）→ 画面表示モードで起動していることを確認
- 未設定: `/usr/lib/chromium/chromium ... --headless --ozone-platform=headless ...`
- `YTBG_TEST_HEADED=0`: 同上、`--headless` あり
- `YTBG_TEST_HEADED=`（空）: 同上、`--headless` あり

4 通りとも、`helper.mjs` の `HEADED` 判定（空・`0` 以外で表示）どおりに動作した。
いずれも該当ファイルは 4 件 pass、終了コード 0。

## 3. npm run スクリプト

| コマンド | 終了コード | 件数 | 所要時間 |
|---|---|---|---|
| `npm run test:browser` | 0 | 92 passed | 77.5s |
| `npm run test:browser:headed` | 0 | 92 passed | 136.9s（real 2:17） |

`package.json` の中身:
```
"test": "node --test tests/browser/",
"test:browser": "node --test tests/browser/",
"test:browser:headed": "YTBG_TEST_HEADED=1 node --test --test-concurrency=1 tests/browser/"
```
どちらも全件 pass、落ちたものなし。

## 4. YTBG_TEST_SLOWMO が効くこと

`clicks.test.mjs`（playwright の操作が多いファイル）で比較。

| SLOWMO | 所要時間（duration_ms） |
|---|---|
| 0 | 23304.9ms |
| 200 | 33219.8ms |

約 10 秒（≒操作回数 × 200ms 相当）伸びており、SLOWMO は効いている。

なお `opening.test.mjs`（playwright の操作が 2 回程度しかないファイル）では
SLOWMO=0 が 12075.3ms、SLOWMO=200 が 11942.8ms で、ほぼ差が出なかった
（自動クリックまでの 2 秒待ちが支配的で、操作回数が少ないため）。これは
SLOWMO が効いていないのではなく、このファイルでは効果が測定しにくいという
だけと考えられる（推定）。

## 5. 文書の主張（SLOWMO で時間を見るテストが落ちることがある）の確認

指示どおり `YTBG_TEST_SLOWMO=300` で以下を走らせた。

- `opening.test.mjs`: 終了コード 0、3 件 pass（duration_ms 12206.9）
- `clicks.test.mjs`: 終了コード 0、43 件 pass（duration_ms 40178.5）

**どちらも落ちなかった。** CLAUDE.md と Developer.md は「SLOWMO を大きくすると、
時間を見るテスト（先手決めの 2 秒後の自動クリックなど）が落ちることがある」と
書いているが、SLOWMO=300 では再現しなかった。「落ちることがある」という
書き方自体は「常に落ちる」とは言っていないので、矛盾とまでは言えないが、
今回の環境・実行では確認できなかった旨を報告する。文書を直すかどうかは
判断できない（管理者が決める点）。

## 6. 文書のコマンド例をそのまま実行

```
YTBG_TEST_HEADED=1 YTBG_TEST_SLOWMO=300 node --test tests/browser/drag.test.mjs
```

終了コード 0、2 件 pass（duration_ms 13094.5）。書いたとおりに動いた。

## 変更ファイルの確認

`git status` / `git diff` で見た範囲:

- `CLAUDE.md`
- `docs/Developer.md`
- `package.json`
- `tests/browser/helper.mjs`

依頼に書かれた「変えたのは `tests/browser/helper.mjs` の `launch_browser()`、
`package.json`、`CLAUDE.md`、`docs/Developer.md`」と一致している。
それ以外の追跡ファイルの変更は無い（`archives/agents/TODO-062/` は今回の
確認作業用の未追跡ディレクトリ）。

`helper.mjs` の差分は `HEADED` 定数の追加と `launch_browser()` への
`headless` / `slowMo` オプション追加のみで、依頼の範囲と合っている。

## 確かめられなかったこと・判断できないこと

- 項目 5 で、文書が主張する「SLOWMO を大きくすると時間を見るテストが
  落ちることがある」という挙動は、SLOWMO=300 では再現しなかった。
  もっと大きい値（600 など）で落ちるかどうかは試していない。これが
  「まだ確認していないだけで実際に起きうる」のか、「文書の記述が
  実態より強すぎる」のかは判断できない
- `xdpyinfo` が入っておらず、X 転送の確認は `xset q` と、実際に headed の
  chromium が `--headless` 無しで起動したことの 2 点で代替した。より厳密な
  確認方法が要るかは判断できない
