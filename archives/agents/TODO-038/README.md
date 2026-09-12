# TODO-038 の分担

| 担当 | モデル | 何を頼んだか |
|------|--------|--------------|
| implementer | Opus 5 | 4 つの書き換えと、足りないテストの追加 |
| verifier | Sonnet 5 | 検証一式、押せなくなったものが無いか、6 つの更新メソッドを実ブラウザで、連続再生の両方向 |
| reviewer | Opus 5 | 変更前と 1 つずつ突き合わせ（送るメッセージ、`_replay_hist` の同一性、`from_dict()` の既定値、`ClockLimit` の継承） |

構造が変わる項目なので、確認とレビューを分けた。
**`GameInfo` の更新メソッドの引数を変える件が込み入る**ので、
implementer も定義の sonnet を Opus 5 に上書きしている。

**reviewer が文書の食い違い 2 件と、「confirm のキャンセル側を誰も
見ていない」を見つけた。** 詳しくは
[archives/todo/TODO-038. 同じ形の繰り返しをまとめる.md](../../todo/TODO-038.%20同じ形の繰り返しをまとめる.md)
の「分担の振り返り」。

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
