# TODO-050 の分担

サーバに名前付きの操作を 8 つ足し、登録表を 1 つにする項目。ハンドラ、
表、`parse()` の移動、テストがまとまって要り、分岐の意味も変わるので、
実装・確認・レビューを分けた。

**実装とレビューは Opus 5 に上書きした。** 実装はクロックの切り替えと
履歴の条件が込み入り、レビューはバックギャモンのルールと今のクライアントの
操作に照らす判断が要るため。確認は決まった手順なので定義のまま Sonnet 5。

レビューで判断が要る点が出るたびに利用者に聞き、同じ implementer に直させて、
直した部分だけを確認とレビューに回した。これが 3 巡あった。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | implementer（Opus 5） | 8 つの操作、表、クロックの停止、テスト | [implementer-report.md](implementer-report.md) |
| 1 | verifier（Sonnet 5） | チェックボックスごとの実装、6 つの検証、5 通りの破壊 | [verifier-report.md](verifier-report.md) |
| 1 | reviewer（Opus 5） | 履歴の条件、ルールとの照合、同時操作 | [reviewer-report.md](reviewer-report.md) |
| 2 | implementer | 盤面と合わない操作を捨てる、テストの parametrize | implementer-report.md の「レビュー後の修正」 |
| 2 | verifier | 捨てる条件と設計の一致、3 通りの破壊 | [verifier-report-2.md](verifier-report-2.md) |
| 2 | reviewer | 正しい操作（リダブル、ビーバー）を捨てないか | [reviewer-report-2.md](reviewer-report-2.md) |
| 3 | implementer | 入口での型の確かめ、`load_player()` | implementer-report.md の「型の確かめ」 |
| 3 | verifier | 注釈どおりに弾くか、2 通りの破壊、list の共有 | [verifier-report-3.md](verifier-report-3.md) |
| 3 | reviewer | `_type_ok()` の正しさ、今のクライアントの値 | [reviewer-report-3.md](reviewer-report-3.md) |

2 巡目の implementer は利用上限で途中で止まり、何も入らないまま再開した。

振り返りは
[`archives/todo/TODO-050. サーバに名前付きの操作を足し、type の登録表を 1 つにする.md`](../../todo/TODO-050.%20サーバに名前付きの操作を足し、type%20の登録表を%201%20つにする.md)
にある。
