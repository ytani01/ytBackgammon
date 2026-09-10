# TODO-009 の分担

Flask + Flask-SocketIO + gevent から Starlette + 素の WebSocket + uvicorn へ
移す項目。

## 分担にした理由

- **実装を implementer に分けた。** サーバ・クライアント・テスト・依存が
  同時に変わり、`ytbg.js` の通信部分と `tests/` の async 化までまとまって
  要る。見込みの段階で「複数のファイルにまたがり、実装・テスト・文書が
  同時に要る」と見ていたとおりだった。定義のモデルは sonnet だが、
  通信層の設計判断が要るので Opus 5 に上書きした
- **確認は verifier**（利用者の `CLAUDE.md`「コードやファイルを変える項目では、
  確認の担当を、項目の規模によらず必ず別のサブエージェントに分ける」）。
  ブラウザ 2 タブでの操作と再接続の実測が要るので、ここは分けないと
  確かめられない
- **レビューも入れた。** 通信層そのものが変わる項目で、「動くか」と
  「良いか」が別になる。定義のモデルは sonnet だが Opus 5 に上書きした。
  **要修正 1 件（連続再生の cancel の競合）は reviewer だけが見つけた**
- 文書（`CLAUDE.md` / `README.md` / `TODO.md`）は main が書いた。
  implementer には触らせていない

## ファイル

3 巡した。番号は依頼の回数。

- `implementer-task.md` / `implementer-report.md` — 最初の移行。
  末尾に「## 追加の直し」（受信中の例外で接続を切らない、`-d` なしで
  uvicorn のログも抑える、`EmittedMessages` の飾りを消す）と
  「## 3 回目の直し」がある
- `verifier-task.md` / `verifier-report.md` — 検証コマンド、壊して落ちるか、
  WebSocket クライアント 2 本、**ブラウザ 2 タブの操作と再接続**。
  「`broadcast()` を壊しても 1 件も落ちない」というテストの穴を発見
- `reviewer-task.md` / `reviewer-report.md` — 要修正 1 件（R1）、
  検討 8 件（C1〜C8）。移行前との挙動の差を実測で 3 件挙げた
- `implementer-task-2.md` / `implementer-report-2.md` — R1・C1〜C5・C7 の
  修正と、C8 のテスト追加（11 件）
- `verifier-task-2.md` / `verifier-report-2.md` — 直しの確認。
  M6 の失敗件数が実装の報告と食い違うことを見つけた
- `reviewer-task-2.md` / `reviewer-report-2.md` — 要修正 0 件。
  M6 の食い違いの原因を特定（壊した範囲の違い）。
  テスト 1 件の穴（C-2）と文書 2 点（C-7）を指摘

振り返りは
`archives/todo/TODO-009. Flask + gevent から Starlette + uvicorn へ移す.md` の
「分担の振り返り」にある。
