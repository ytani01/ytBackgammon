# TODO-037 の分担

| 担当 | モデル | 何を頼んだか |
|------|--------|--------------|
| implementer | Sonnet 5 | 箇条書きの 8 項目を消し、検証を通す |
| verifier | Sonnet 5 | 検証一式、消したものの呼び出し元の grep、`with_move()` をわざと壊してテストが落ちるかの確認 |
| reviewer | Opus 5 | 「本当に死んでいるか」と、テストの書き換えで判別力が落ちていないか |

削除だけの項目だが、`reset_clock` は登録表（`DATA_TYPES` / `_handlers`）から
分岐が 1 つ減るので、「本当に死んでいるか」を見るレビューの担当を入れた。
reviewer は判断が要るので、定義の sonnet を Opus 5 に上書きしている。

**結果として、テストの判別力が落ちた箇所を見つけたのは reviewer だけだった。**
詳しくは
[archives/todo/TODO-037. 呼ばれていないコードを消す.md](../../todo/TODO-037.%20呼ばれていないコードを消す.md)
の「分担の振り返り」。

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
