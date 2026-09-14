# TODO-061. サーバを Session と protocol に分け、操作の結果を型で表す（対応しない）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | main のみ（着手せず、やめると決めた） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 20,363 | 30,159 | 100% |
| 合計 |  |  | 20,363 | 30,159 | 概算 $1.8 |

- 項目を立てた 32948bf から、過剰な実装の点からの見直しと、その反映までを
  `--since '2026-09-14 20:58:41'` で集計した。見直しは TODO-057〜060 の
  設計にも及んでいて、この項目だけの分ではない
- 決めるだけの作業で、確かめる対象が文書だけだったので、サブエージェントは使っていない

## きっかけ

TODO-056 で決めた構成の見直し（第 4 弾）の最後の段階として立てた。
`server.py` から `session.py`（`BoardSession`）と `protocol.py` を分け、
ハンドラの戻り値を `Applied(sec)` / `Ignored(reason)` / `Handled` にし、
`last_op` を要求ごとの `publish(update)` に添える計画だった。
`history_flag` を送るのをやめることと、設計案を archives へ移すことも含めていた。

## やらないと決めた理由

2026-09-14 に、立てた直後に過剰な実装の点から見直し、利用者の指示でやめた。

- **`Ignored` と `Handled` を分ける意味が無い。** どちらも共通の後処理
  （勝負がついたときの時計の停止、履歴への追加、配信）をしない点で同じ。
  捨てたときのログは、ハンドラが `_ignore()` で既に出している。
  `float | None` のままで足りる（`on_json()` のコメントも「送信済みか、
  盤面と合わないので捨てた」と両方を書いてある）
- **`last_op` の問題は無い。** 今も要求ごとのローカルな `m.raw` を
  `emit_gameinfo()` に渡していて、共有のフィールドには置いていない
- **Session と protocol に分けると、渡すだけの層ができる。** `BackgammonServer` は
  呼ぶ側が 1 つずつしか無いまま、Session へ渡すだけになる。`server.py` の大きさが
  気になるなら、`MESSAGE_TYPES`・`parse()`・`_type_ok()` を dataclass が既にある
  `message.py` へ移せば足りるが、それも今は要らない

残る作業（返事に `history_flag` を載せるのをやめる、`docs/design-4.md` を
archives へ移す）は TODO-060 に含めた。`history_flag` を読まなくなるのが
TODO-060 なので、同じ項目で消すほうが、使われない値を送る期間が無い。
設計案の「サーバ」と「設計確認で決めたこと」の 6 にも同じ理由を書いた。
