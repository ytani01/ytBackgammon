# TODO-059 の担当

implementer が rules の関数と委譲、テスト、helper、Developer.md を書き、reviewer が変更前後の判定を
突き合わせ、verifier が一式と壊して落ちることを確かめた。main は依頼を書き、指摘への対応を決めた。

操作の判定を条件式ごと移すので、条件が 1 つ変わっても挙動が変わる。挙動の変わる項目なので、
「動くか」の verifier とは別に「条件が変わっていないか」の reviewer を入れた。
implementer と reviewer は、込み入った判定を扱うので定義の Sonnet 5 から Opus 5 に上書きした。
verifier は壊す箇所を依頼で指定したので、定義どおり Sonnet 5 にした。

reviewer が作業ツリーを読んでいる間に verifier が壊して戻すと食い違うので、reviewer → 2 巡目 → verifier の
順に回した。reviewer は途中で API の利用上限に当たり、再開した。

- [implementer への依頼](implementer-request.md) / [報告](implementer-report.md) / [2 巡目の報告](implementer-report-2.md)
- [reviewer への依頼](reviewer-request.md) / [報告](reviewer-report.md)
- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)

2 巡目の依頼は、ファイルにせず implementer への追加の指示で渡した（レビューの指摘 1・2・4・5・6 を直す。3 は直さない）。
