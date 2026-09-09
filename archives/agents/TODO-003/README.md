# TODO-003 の分担

Werkzeug の開発サーバから gevent の WSGI サーバへ移行する項目。

## 分担にした理由

- **実装は main。** 変えたのは `__main__.py` の import 順・`SocketIO()` の
  引数・`socketio.run()` の引数と、`pyproject.toml`、文書だけ。行数は少ないが、
  `monkey.patch_all()` をどこに置くか、`log_output` に何を渡すかの判断が要る
- **確認は verifier に分けた**（利用者の `CLAUDE.md`「コードやファイルを変える
  項目では、確認の担当を、項目の規模によらず必ず別のサブエージェントに分ける」）
- **レビューも入れた。** サーバの動作基盤が変わる項目なので、「動くか」とは別に
  「良いか」を見る担当が要る。定義のモデルは sonnet だが Opus 5 に上書きした

## ファイル

- `verifier-task.md` / `verifier-report.md`
- `reviewer-task.md` / `reviewer-report.md`

振り返りは `archives/todo/TODO-003. 切断のたびにログへ ConnectionError と 500 が出る.md`
の「分担の振り返り」にある。
