# TODO-034 の分担

| 担当 | 定義 | 役割 |
|------|------|------|
| main | — | 調査、`pyproject.toml` と `src/ytbg/server.py` と `CLAUDE.md` の変更 |
| verifier | `~/.claude/agents/verifier.md`（Sonnet 5 / effort medium） | 検証の実行と、壊して落ちるかの確認 |

## この分担にした理由

変えるのは設定 1 か所と型注釈 1 か所で、**挙動は変わらない**（型チェッカの
設定と注釈だけ）。そのため reviewer は入れず、実装も分けずに main が行った。

確認だけは分けた。「設定を変えたのだから指摘が消えるはず」で済ませると、
**狙った指摘が消えたのか、走っていないだけなのかが分からない**ため。

## 報告

- [verifier-report.md](verifier-report.md)
