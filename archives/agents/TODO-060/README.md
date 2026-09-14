# TODO-060 の担当

implementer が Controller と View への分割、4 つの挙動の変更、テスト、helper、Developer.md を書き、
reviewer が変更前のコードと突き合わせ、verifier が一式と壊して落ちることを確かめた。
main は依頼を書き、指摘への対応を決め、CLAUDE.md を直して設計書を移した。

状態の持ち主を替えるので、条件が 1 つ変わっても挙動が変わる。「動くか」の verifier とは別に
「変える前と同じか」の reviewer を入れた。implementer と reviewer は、込み入った順番を扱うので
定義の Sonnet 5 から Opus 5 に上書きした。verifier は壊す箇所を依頼で指定したので、定義どおり Sonnet 5 にした。

reviewer が作業ツリーを読んでいる間に verifier が壊して戻すと食い違うので、reviewer → 2 巡目 → verifier → 3 巡目 →
verifier の順に回した。1 回目の verifier は利用上限で途中で止まり、壊した 1 行を戻さないまま終わったので、
main が戻してから、控えと `cmp` の手順を足してやり直させた。

- [implementer への依頼](implementer-request.md) / [報告](implementer-report.md) / [2 巡目の報告](implementer-report-2.md) / [3 巡目の報告](implementer-report-3.md)
- [reviewer への依頼](reviewer-request.md) / [報告](reviewer-report.md)
- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)
- [verifier への 2 回目の依頼](verifier-request-2.md) / [報告](verifier-report-2.md)

2 巡目と 3 巡目の依頼は、ファイルにせず implementer への追加の指示で渡した。
2 巡目はレビューの指摘 1・2・5・6・7 と `predict_moves()` の export、3 巡目は揺らぐキューブのテストと、
バナーを画面から読むテスト（レビューの指摘 3）。指摘 4（CLAUDE.md）は main が直した。
