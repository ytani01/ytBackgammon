# TODO-067 の分担

| 担当 | 受け持ち | 報告 |
|------|----------|------|
| main | nginx.conf を読んで答える、`docs/Admin.md` の「設定例」を書く | — |
| verifier | 設定例の `ytbg.toml` で lobby を起動し、URL・WebSocket・停止・systemd のユニットの書式を試す | [verifier-report.md](verifier-report.md) |

文書だけの項目だが、設定例は書いたとおりに試せるので、再現を verifier に分けた。
挙動は変わらないのでレビューの担当は入れなかった。手順が決まっているので Sonnet にした。
