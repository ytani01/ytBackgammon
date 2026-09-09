# TODO-001 の分担

複数のファイルにまたがり、実装（Python・シェルスクリプト・HTML）と文書が
まとまって要るので実装を分けた。Flask-SocketIO の版が 4.x から 5.x へ上がり
挙動が変わるので、確認とは別にレビューも入れる。

| 担当 | 役割 |
|------|------|
| implementer | pyproject.toml の作成、src/ytbg/ への移動、依存の更新、スクリプトと文書の書き換え |
| verifier | uv sync と起動が通るか、README のとおりに動くかを確かめる |
| reviewer | SocketIO の版上げとパス解決の変更が挙動を変えていないかを見る |

- [implementer への依頼](implementer-task.md) / [報告](implementer-report.md)
- [verifier の報告](verifier-report.md)
- [reviewer の報告](reviewer-report.md)
