# TODO-005 の分担

ログの仕組みを丸ごと入れ替え、47 箇所の呼び出しを書き換える項目。
複数ファイルにまたがるので実装を main から分け、**挙動（ログの水準の
決まり方）が変わる**ので確認とは別にレビューの担当も入れた。

| 担当 | モデル | 受け持ち |
|------|--------|----------|
| implementer | Opus 5 / effort medium（モデルを上書き） | `mylog.py` のコピー、47 箇所の書き換え、`my_logger.py` の削除、`CLAUDE.md` の更新 |
| verifier | Sonnet 5 / effort medium（定義のまま） | 検証の実行、実サーバ起動での水準の切り替わり、socket.io クライアントでの実接続 |
| reviewer | Opus 5 / effort high（モデルを上書き） | 差分のレビュー。挙動の変化、`{}` 書式への変換、gevent との相性 |
| main | Opus 5 / effort high | 範囲の決定、利用者との相談、決着 |

- implementer のモデルを上げたのは、書き換えに `debug` 引数の削除が絡み、
  呼び出し元（`tests/`、`__main__.py`）への波及があるため
- reviewer のモデルを上げたのは、**書式変換の誤りが実行時にしか出ない**
  類いだから。結果として、要修正の 1 件（`{}` の遅延評価が成り立たない）は
  この担当だけが見つけた
- verifier と reviewer は**並行で起動した**。実装が終われば、どちらも
  読むだけで互いに干渉しない
- レビューの結果を受けて、implementer に 2 巡目（`CLAUDE.md` の文言訂正、
  `tests/conftest.py` の `loggerInit()`、細かい直し）、verifier に 2 巡目
  （socket.io クライアントで未実行のログ行を通す）を依頼した

## 報告

- [implementer-report.md](implementer-report.md)（2 巡目を追記）
- [verifier-report.md](verifier-report.md)（2 巡目を追記）
- [reviewer-report.md](reviewer-report.md)

見込みと実施の表、消費トークンの表、分担の振り返りは
`archives/todo/TODO-005. ログを my_logger.py から mylog.py（loguru）へ移す.md`
にある（ここには写さない）。
