# TODO-058 の担当

implementer がテストと helper と Developer.md を書き換え、verifier が確認した。
main は依頼を書き、CLAUDE.md のテストの説明を直した。

ブラウザテスト 11 本・約 200 か所を helper の関数に移す作業で、関数の切り方
（TODO-060 で controller と view のどちらに寄せるか、1 つの evaluate にまとめる
必要があるか）に判断が要るので、実装を分けた。implementer は定義の Sonnet 5 から
Opus 5 に上書きした。verifier も、テストが弱まっていないかを差分から判断し、
helper の壊し方を選ぶ必要があるので Opus 5 に上書きした。
挙動を変えない、テストだけの項目なので reviewer は入れていない。

- [implementer への依頼](implementer-request.md) / [報告](implementer-report.md)
- [verifier への依頼](verifier-request.md) / [報告](verifier-report.md)
