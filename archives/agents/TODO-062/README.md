# TODO-062 の担当

main が実装し（`helper.mjs` の 1 関数、`package.json`、文書）、verifier が両方のモードで
実際に走らせ、reviewer が差分を見た。

変更が小さいので実装は分けなかった。環境変数の値で起動の設定が分かれるので、
確認とは別にレビューを入れた。verifier は手順が決まっているので定義の Sonnet 5 のまま、
reviewer は playwright の slowMo の効き方まで読む必要があったので Opus 5 に上書きした。

- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)
- [reviewer への依頼](reviewer-request.md) / [報告](reviewer-report.md)
