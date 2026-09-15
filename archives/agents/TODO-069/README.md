# TODO-069. サブエージェントの分担

見込みどおり、常設の定義（`implementer` / `verifier` / `reviewer`）で足りると
判断し、着手時に相談し直さなかった。挙動が変わる項目（`lobby` の設定と
ルーティングの分岐）なので、確認（verifier）とレビュー（reviewer）を分けた。

- **implementer**: `task.md`（main が事前に固めた設計）どおりに、
  `lobby.js` / `lobby.py` / `ytbg.toml` / テスト / 文書を実装
- **verifier**: 検証コマンドを実行し、実装をわざと壊して狙ったテストが
  落ちることを実測。`verifier-report.md`
- **reviewer**: 規約・設計との整合、分岐の妥当性を確認。`reviewer-report.md`
- **verifier（2回目）**: reviewer の「検討」3 件を main が直接修正した後、
  その修正を別の目で確認。`verifier-report2.md`

各報告:

- [`task.md`](task.md) — implementer への依頼書（設計の詳細）
- [`implementer-report.md`](implementer-report.md)
- [`verifier-report.md`](verifier-report.md)
- [`reviewer-report.md`](reviewer-report.md)
- [`verifier-report2.md`](verifier-report2.md)
