# TODO-064 の担当

implementer がサーバ・テンプレート・JS・テスト・文書を書き、reviewer が決めたことと照らして読み、実際に起動して試し、
verifier が一式と実際の起動と壊して落ちることを確かめた。main は依頼を書き、reviewer の指摘 1〜3 を直した
（文書を実装に合わせる、`test_lobby_prefix_routes` に 2 行足す、リダイレクトの説明を直す）。

サーバ・テンプレート・JS・テスト・文書にまたがるので実装を implementer に分けた。ルートと URL の組み立てが変わるので、
「動くか」の verifier とは別に「決めたとおりで穴が無いか」の reviewer を入れた。implementer と reviewer は、
どのページの URL から開いても組み立てが合うかを考える必要があるので、定義の Sonnet 5 から Opus 5 に上書きした。
verifier は手順を依頼で指定したので、定義どおり Sonnet 5 にした。

reviewer が作業ツリーを読んでいる間に verifier が壊して戻すと食い違うので、implementer → reviewer → main の修正 →
verifier の順に回した。

- [implementer への依頼](implementer-request.md) / [報告](implementer-report.md)
- [reviewer への依頼](reviewer-request.md) / [報告](reviewer-report.md)
- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)
