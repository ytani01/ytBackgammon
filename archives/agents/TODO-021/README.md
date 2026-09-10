# TODO-021 の分担

## 編成

| 担当 | モデル | 範囲 |
|------|--------|------|
| implementer | Opus 5 | `package.json` / `tests/browser/` / `.gitignore` / `CLAUDE.md` / `DATAFILE_DIR` |
| verifier | Sonnet | `node --test tests/browser/` と `uv run pytest` を走らせる。`~/ytbg-*.json` が増えないことを確かめる |
| reviewer | Sonnet / effort high | `DATAFILE_DIR` の条件式と、テストが確かめている中身 |

## 理由

- **implementer を Opus にした。** 常設の定義は Sonnet だが、この項目は
  playwright のヘルパーが初物で、サーバプロセスの起動と後始末、2 枚目の
  タブへの同期待ち、ドラッグの座標計算がまとまって要る。決まった手順を
  なぞる作業ではない。
- **reviewer を入れた。** `DATAFILE_DIR` の条件式が変わる（挙動が変わる）。
  範囲はそこと、テストが「通ることだけを見ていないか」に絞る。
- **verifier は Sonnet のまま。** 走らせて結果を報告する担当で、判断は要らない。

## 報告

- [`implementer-report.md`](implementer-report.md) — 変更点、検証、404 の正体、
  わざと壊した 4 通り
- [`verifier-report.md`](verifier-report.md) — 検証の結果、`~/ytbg-*.json` と
  プロセスの残留、追加分の再確認
- [`reviewer-report.md`](reviewer-report.md) — 要修正 0 件。指摘 6 件

決着の記録は
[`archives/todo/TODO-021. ブラウザでの動作確認の仕組みを作る.md`](../../todo/TODO-021.%20ブラウザでの動作確認の仕組みを作る.md)。
