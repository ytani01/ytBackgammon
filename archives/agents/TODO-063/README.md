# TODO-063 の担当

implementer が lobby（CLI・子プロセスの管理・一覧ページ・テスト・文書）を書き、reviewer が決めたことと照らして
実際に起動して試し、verifier が一式と手での確認と壊して落ちることを確かめた。main は依頼を書き、指摘への対応を決め、
CLAUDE.md を直し、2 巡目のレビューの軽い指摘と Ctrl+C の確認を行った。

子プロセスの起動・停止と、画面の読み込みの順番が絡むので、「動くか」の verifier とは別に「決めたとおりで穴が無いか」の
reviewer を入れた。implementer と reviewer は、込み入った順番を扱うので定義の Sonnet 5 から Opus 5 に上書きした。
verifier は手順を依頼で指定したので、定義どおり Sonnet 5 にした。

reviewer が作業ツリーを読んでいる間に verifier が壊して戻すと食い違うので、implementer → reviewer → 2 巡目 →
reviewer（2 巡目）→ verifier の順に回した。

- [implementer への依頼](implementer-request.md) / [報告](implementer-report.md) / [2 巡目の報告](implementer-report-2.md)
- [reviewer への依頼](reviewer-request.md) / [報告](reviewer-report.md) / [2 巡目の報告](reviewer-report-2.md)
- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)

2 巡目の依頼は、ファイルにせず同じ担当への追加の指示で渡した。implementer にはレビューの指摘 1〜7 への対応方針
（listen を見る状態、`server_id` の整数、`url` の絶対 URL、選択の保持、テストの追加、使われない名前、`templates`）、
reviewer にはその差分の再レビュー。verifier への依頼の「10 回連続」は、途中で取りやめを伝えた。
