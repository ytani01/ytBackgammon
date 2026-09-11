# TODO-027 verifier report

作業ディレクトリ: `/home/ytani/work/ytBackgammon`（コミット前、`819a7b2`
の上に未コミットの変更）。`git checkout` / `restore` / `stash` は使っていない。
壊した版はすべて scratchpad の控え（`.../scratchpad/backup/`）から
`\cp` で戻した。

## 1. 通常の検証コマンド

| コマンド | 結果 | 終了コード |
|----------|------|-----------|
| `uv run pytest` | 211 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `node --test tests/js/` | tests 59 / pass 59 / fail 0、警告 0 件（`grep -i warning` 空） | 0 |
| `node --test tests/browser/`（1 回目） | tests 39 / pass 39 / fail 0 | 0 |
| `node --test tests/browser/`（2 回目） | tests 39 / pass 39 / fail 0 | 0 |
| `node --test tests/browser/`（3 回目） | tests 39 / pass 39 / fail 0 | 0 |

**3 回とも 39/39・揺れ無し。** 報告にあった「スコアの ▲ →
set_score」の既知の揺れは、今回の 3 回では発生しなかった
（発生していれば、同じテストか確認してから走らせ直す予定だった）。

## 2. わざと壊して、狙ったテストが落ちることの確認（各 10 回）

すべて `src/ytbg/webroot/static/js/rules/move.js` /
`rules/judge.js` / `rules/position.js` / `board.js` を scratchpad の
控えから戻す前提で、1 つずつ壊しては 10 回走らせ、戻して次へ進んだ。
最後に `diff` で元と一致すること、`git status` / `git diff --stat` が
壊す前と同じであることを確認済み。

| # | 壊し方 | 対象コマンド | 落ちた回数 | 落ちた件数（毎回同じ） |
|---|--------|-------------|-----------|----------------------|
| 1 | `rules/move.js` `calc_dst_point()` の player0 を `src_p - dice_val` → `src_p + dice_val`（向きを反転） | `node --test tests/js/` | 10/10 | 5 |
| 2 | `rules/judge.js` `closeout()` の範囲 `[1, 6]` → `[1, 5]`（境界を 1 つずらす） | `node --test tests/js/` | 10/10 | 1 |
| 3 | `rules/judge.js` `winner_is()` の `resign == 1 - player` → `resign == player`（取り違え） | `node --test tests/js/` | 10/10 | 3 |
| 4 | `rules/position.js` `with_move()` の例外を、駒が無いときは何もしない（splice をスキップするだけ）に変更 | `node --test tests/js/` | 10/10 | 2 |
| 5 | `board.js` `pip_count()` で `this.pip[player].set(count);` をコメントアウト（副作用を呼ばない） | `node --test tests/browser/rules.test.mjs` | 10/10 | 1 |

**5 通りすべて 10 回続けて落ち、揺れは無かった。** 5 番目だけは
`tests/js/`（DOM を見ないルール層のテスト）では捕まらない箇所なので、
指示のとおり `tests/browser/rules.test.mjs`（`Board` とルール層の
つなぎを見るテスト）で確認した。壊す前後で `diff` を取り、
`src/ytbg/webroot/static/js/rules/move.js` / `judge.js` / `position.js` /
`board.js` の 4 ファイルが元と一致することを確認済み。壊した後の
サニティチェック（`node --test tests/js/` と
`node --test tests/browser/rules.test.mjs` を通常どおり実行）も
通過（59/59、7/7）。

## 3. 投了 → 相手の勝ち の実プロセスでの比較

`git worktree add` で `819a7b2` を別ディレクトリに出し、`uv sync` して
起動。作業ツリー（TODO-027 適用後）と同じ `image_dir=images1a` で
それぞれ実サーバを起動し、chromium で開いて次の手順を踏んだ
（比較用スクリプトは検証後に削除済み。`git status` に残っていないことを
確認済み）。

1. `board.button_resign.on_mouse_down_xy(0, 0)` で player0 が
   **実際の投了ボタンの経路**（`emit_turn(-1, player, false)` →
   WebSocket 送信 → サーバの `set_turn` → gameinfo 更新 → broadcast →
   `load_gameinfo()` → `set_turn()`）を通す
2. サーバの応答で `board.resign === 0` になるのを待ち、+300ms の
   描画安定待ちをしてから `board.resign` / `board.turn` / 各バナーの
   `hidden` / `score[1].score` を読む
3. `board.winner_is(1)` を直接呼び、戻り値と `board.resign` を読む
   （実装担当・reviewer が使ったのと同じ手順）

結果、**旧（`819a7b2`）と新（作業ツリー）で全項目が完全に一致した**。

| 項目 | 旧 | 新 |
|------|----|----|
| 投了直後の `resign` | 0 | 0 |
| 投了直後の `turn` | -1 | -1 |
| `resign_banner_btn[0].el.hidden` | false | false |
| `resign_banner_btn[1].el.hidden` | true | true |
| `win_btn[0].el.hidden` | true | true |
| `win_btn[1].el.hidden` | false | false |
| `score[1].score`（投了直後） | 3 | 3 |
| 投了直後のフルページスクリーンショット md5 | `83700f343e607d72a804fd8534a75474` | 同じ |
| `board.winner_is(1)` の戻り値 | 3 | 3 |
| `winner_is(1)` 実行後の `board.resign` | -1 | -1 |
| コンソールエラー | 0 件 | 0 件 |

**投了のバナーの出方（どちらの `resign_banner_btn` / `win_btn` が
表示されるか）と、そのあとの `board.resign` の値・タイミングは、
旧新で同じ条件・同じタイミングで一致した。**

## 4. 変更前と同じに見えるかのスクリーンショット比較

TODO-028・029 と同じ手順（同じ `image_dir=images1a`、ビューポート
1280×900、`board.checker[0][0].cur_point` が定義されるまで待ってから
+500ms 安定待ちして `fullPage` スクリーンショット）で、初期配置を
旧新で撮って比較した。

- 旧（`819a7b2`）: md5 `0e2b3779fdc7873cd60ef0039b337ba5`、898253 bytes、
  コンソールエラー 0 件
- 新（作業ツリー）: md5 `0e2b3779fdc7873cd60ef0039b337ba5`、898253 bytes、
  コンソールエラー 0 件
- **md5 完全一致。**

画像は `~/tmp/playwright-mcp/todo027-init-old.png` /
`todo027-init-new.png`、投了後の画像は scratchpad の
`resign_old.png` / `resign_new.png` に保存した（スクリーンショットの
差分確認用。手元での目視は行っていない。md5 一致のため）。

終わったあと `git worktree remove --force` で worktree を消し、
`git status` / `git log --oneline -1`（`819a7b2` のまま）で本体の
`starlette` ブランチが無事なことを確認した。

## 5. 変更ファイルと範囲

```
 M CLAUDE.md
 M docs/design.md
 M package.json
 M src/ytbg/webroot/static/js/board.js
 M src/ytbg/webroot/static/js/ui/base.js
 M src/ytbg/webroot/static/js/ui/checker.js
 M src/ytbg/webroot/static/js/ui/dice.js
?? .codegraph/
?? archives/agents/TODO-027/
?? src/ytbg/webroot/static/js/rules/
?? tests/browser/rules.test.mjs
?? tests/js/
```

- `CLAUDE.md` と `docs/design.md` の差分は、README にあった「移すもの」
  「副作用を外す」「`Position` の作り方」「テストは `tests/js/`」の
  範囲に収まっている（実測で読み合わせ済み）。main が書いたものとして
  範囲内
- **`TODO.md` は変更されていない**（`git diff --stat -- TODO.md` が空）
- `.codegraph/` は未追跡のまま残っている（索引なので触っていない）
- `grep -rn` で、壊した版（`src_p + dice_val`（player0）、
  `[1, 5]`、`resign == player`、`// this.pip[player].set`、
  「壊した版」というリテラル文字列）が `src` にも `tests` にも
  残っていないことを確認した（0 件）
- 検証用に作った一時スクリプト（`tests/browser/_verifier_*.mjs`）は
  実行後に削除済み。`git status` に残っていない

## 確かめられなかったこと・判断できないこと

- **投了の実プロセス比較は、`board.winner_is(1)` を直接呼ぶ形で行った。**
  実際のゲームで `winner_is()` が呼ばれる経路（`ui/checker.js:375`、
  チェッカーを動かした直後）を、投了後の一連の操作から自然に辿って
  確かめてはいない。README にある「呼び出しは `board.js:576` と
  `ui/checker.js:373` の 2 か所」という記述と実装を突き合わせた限りでは、
  投了直後の `set_turn()` 内では `resign >= 0` の分岐に入り
  `winner_is()` は呼ばれず、実際に `this.resign = -1` へ戻るのは
  次に `winner_is()` が呼ばれたとき（チェッカーの移動時など）だと
  読めるが、**この経路をゲーム内の自然な操作だけで再現して確認しては
  いない**。reviewer もブラウザでは同じ「直接呼ぶ」形で確認しており、
  この点は reviewer 報告と同水準の確認にとどまる
- スクリーンショットの一致判定は md5 のみで、目視の見比べは行っていない
  （TODO-029 verifier と同じ基準）
