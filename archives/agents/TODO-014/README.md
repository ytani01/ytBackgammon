# TODO-014 の分担

## 分担にした理由

設定ファイル（`pyproject.toml`）とテンプレート、JS、`CLAUDE.md` に
またがる項目で、**画面の表示とバージョン文字列が変わる**。
`CLAUDE.md` の「挙動が変わる項目には、確認の担当とは別にレビューの担当も
入れる」に従い、3 担当に分けた。

| 担当 | 役割 |
|------|------|
| implementer | 指示された範囲の実装。ビルド設定・JS・テンプレート・文書 |
| verifier | 実際に動くかの確認。タグを打って消す往復、サーバを起動しての表示確認、既存の保存ファイルの読み込み |
| reviewer | 規約と設計に照らしたレビュー。設定が意図どおりか、配布物で壊れないか |

- reviewer は定義のモデルが sonnet。`CLAUDE.md` に従って Opus 5 に上書きした
- verifier は 2 回目の依頼の途中でセッションの上限（HTTP 429）に当たって
  止まった。残りの確認は main が行い、`verifier-report.md` に追記した

## ファイル

| ファイル | 中身 |
|----------|------|
| `implementer-request.md` | 実装への依頼文 |
| `implementer-report.md` | 実装の報告（末尾にレビュー指摘への対応を追記） |
| `verifier-request.md` | 確認への依頼文 |
| `verifier-report.md` | 確認の報告（末尾に main が行った再確認を追記） |
| `reviewer-request.md` | レビューへの依頼文 |
| `reviewer-report.md` | レビューの報告（要修正 1 件、検討 3 件） |

振り返りは `archives/todo/TODO-014. バージョンを git tag に連動させる.md` の
「分担の振り返り」にある。
