# TODO-006 の分担

`tests/` の骨格を作る項目。新規ファイルを足すだけで既存の挙動を変えないので、
**レビューの担当は入れず、実装と確認の 2 人**にした。設定・テスト・文書が
まとまって要る規模なので、実装も main から分けた。

| 担当 | モデル | 受け持ち |
|------|--------|----------|
| implementer | Sonnet 5 / effort medium（定義のまま） | `pyproject.toml` と `tests/` の作成 |
| verifier | Sonnet 5 / effort medium（定義のまま） | 検証の実行、テストが狙ったものを見ているかの確認 |
| main | Opus 5 / effort high | 範囲の決定、`CLAUDE.md` の更新、決着 |

- implementer には**文書を触らせない**（定義どおり）。`CLAUDE.md` の更新は
  main が書いた
- verifier には「`src/` をわざと壊して、狙ったテストだけが落ちるか」を
  名指しで依頼した

## 報告

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)

見込みと実施の表、消費トークンの表、分担の振り返りは
`archives/todo/TODO-006. tests ディレクトリを作って pytest でテストする.md`
にある（ここには写さない）。
