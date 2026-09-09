# TODO-007 の分担

- **実装: main（Opus 5 / effort high）** —
  `init_gameinfo()` からキーを 1 つ消し、テストの除外処理を消すだけなので、
  実装の担当は分けなかった
- **確認: verifier（Sonnet 5 / effort medium）** —
  [verifier-report.md](verifier-report.md)。
  クライアントが `gameinfo.board.roll` を読んでいないことの確認は、
  実装した側では「読んでいないはず」で流しやすい。`ytbg.js` には
  `roll_btn` や `data.roll` など紛らわしい同名のものが 60 箇所以上あるので、
  別の目で確かめた
- **レビューの担当は置かなかった** — `gameinfo` の構造は変わるが、
  分岐や条件式は変わらないため

集計の表は
[archives/todo/TODO-007. board.roll が使われていない.md](../../todo/TODO-007.%20board.roll%20が使われていない.md)
にある（こちらには写さない）。
