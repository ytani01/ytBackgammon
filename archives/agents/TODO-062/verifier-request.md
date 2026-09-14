# TODO-062 確認の依頼（verifier）

## 目的

ブラウザテストを、ヘッドレスと画面を表示するモードで切り替えられるようにした（`TODO.md` の TODO-062）。
書いたとおりに動くかを実際に走らせて確かめる。コードは直さず、見つけたことを報告する。

差分は `git diff`（未コミット）。変えたのは `tests/browser/helper.mjs` の `launch_browser()`、
`package.json`、`CLAUDE.md`、`docs/Developer.md`。

## 確かめること

1. **検証の一式を 1 回ずつ**走らせ、終了コードを記録する: `uv run pytest`、`node --test tests/js/`、
   `node --test tests/browser/`（既定のヘッドレス）、`uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`
2. **画面を表示するモードで起動していること。** `DISPLAY` は X の転送（`localhost:10.0`）が来ている。
   `YTBG_TEST_HEADED=1` で 1 ファイル（例: `sound.test.mjs`）を走らせ、chromium が
   `--headless` 無しで起動していることを、走っている間の `ps` の引数などで確かめる。
   `YTBG_TEST_HEADED` 無し・`=0`・`=` （空）ではヘッドレスで起動することも同じ方法で見る
3. **`npm run test:browser` と `npm run test:browser:headed` が動くこと。** headed は時間がかかるので、
   全件を 1 回走らせて終了コードと件数を記録する（timeout は 600000 に伸ばすこと）
4. **`YTBG_TEST_SLOWMO` が効くこと。** 同じファイルを `YTBG_TEST_SLOWMO=0` と `=200` で走らせ、所要時間が伸びることを見る
5. **文書の主張を確かめる。** CLAUDE.md と Developer.md は「SLOWMO を大きくすると、時間を見るテスト
   （先手決めの 2 秒後の自動クリックなど）が落ちることがある」と書いている。
   `YTBG_TEST_SLOWMO=300` で `opening.test.mjs` と `clicks.test.mjs` を走らせ、落ちるかを記録する。
   落ちなければ、その旨を報告する（文書を直すかは管理者が決める）
6. 文書に書いたコマンド例（`YTBG_TEST_HEADED=1 YTBG_TEST_SLOWMO=300 node --test tests/browser/drag.test.mjs`）を、書いたとおりに走らせる

## 報告

`archives/agents/TODO-062/verifier-report.md` に、コマンドと終了コード、件数、所要時間、
落ちたものは出力のまま書く。返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
