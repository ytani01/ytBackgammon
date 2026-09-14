# TODO-062 レビューの依頼（reviewer）

## 目的

ブラウザテストを、ヘッドレスと画面を表示するモードで切り替えられるようにした（`TODO.md` の TODO-062）。
差分が良いかを見る。コードは直さず、見つけたことを報告する。動作確認は別の担当（verifier）が行う。

対象は未コミットの `git diff`（`tests/browser/helper.mjs`、`package.json`、`CLAUDE.md`、`docs/Developer.md`）。

## 見ること

- 環境変数の読み方の分岐: `YTBG_TEST_HEADED` の未設定・空・`0`・その他、
  `YTBG_TEST_SLOWMO` の未設定・数でない値・負の値で、起動の設定がどうなるか
- 既定（環境変数なし）の挙動が変更前と同じか
- `package.json` の scripts: `test:browser:headed` の `--test-concurrency=1`
  （画面を表示するときに窓が同時に多数開かないように付けた）、`test` と `test:browser` の重複、
  環境変数を先頭に書く形が利用者の環境（Linux の sh）で動くか
- 文書（CLAUDE.md・Developer.md）の説明がコードと合っているか、利用者向けの Developer.md に
  TODO の番号が無いか
- 足りない・多すぎるもの（ponytail の観点で、要らない仕組みを足していないか）

## 報告

`archives/agents/TODO-062/reviewer-report.md` に、指摘をファイル:行・内容・重さの順で書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
