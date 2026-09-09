# TODO-008 の分担

`app_top()` と `top.html` を消すだけの項目。変更はファイルの削除と数行なので
**実装は main が行い、確認とレビューだけを分けた**。コードとテンプレートが
消えるので、確認（動くか）とレビュー（消してよかったか）は別にした。

| 担当 | モデル | 受け持ち |
|------|--------|----------|
| verifier | Sonnet 5 / effort medium（定義のまま） | 消し残しの確認、検証の実行、実サーバでの `/`・`/p1`・`/p2` の応答 |
| reviewer | Sonnet 5 / effort high（定義のまま） | 本当に到達不能だったかの履歴からの確認、消し過ぎ・消し足りないところ |
| main | Opus 5 / effort high | 削除の実装、利用者との相談、決着 |

- 削除だけなので、reviewer もモデルを上書きせず Sonnet 5 のままにした
- reviewer には「`ytbg.js` の `nav-drawer` から見て `menu.css` が要らないと
  言い切れるか」を名指しで確かめさせた（クライアント側に別のメニューが
  ある可能性があったため）
- 両方が挙げた `def top()` の関数名は、利用者に確かめてから main が直し、
  verifier に再確認させた

## 報告

- [verifier-report.md](verifier-report.md)（関数名の変更の再確認を追記）
- [reviewer-report.md](reviewer-report.md)

見込みと実施の表、消費トークンの表、分担の振り返りは
`archives/todo/TODO-008. app_top() と top.html を消す.md` にある
（ここには写さない）。
