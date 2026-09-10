# TODO-017 の分担

`load_gameinfo()` が毎回チェッカーを全部置き直す件。

## 分担にした理由

- **実装は main が持った。** `ytbg.js` の 1 メソッドが中心で、TODO-015 の
  設計を詰める流れでそのまま書けたため
- **確認は verifier**（利用者の `CLAUDE.md`「コードやファイルを変える項目では、
  確認の担当を、項目の規模によらず必ず別のサブエージェントに分ける」）。
  JS には自動テストが無いので、`BoardPoint.add()` の座標計算を写した
  スクリプトで旧実装と新実装を突き合わせる形にした
- **レビューも入れた。** 表示の挙動が変わる項目で、`node --check` 以外に
  機械的な検査が無い。定義のモデルは sonnet だが Opus 5 に上書きした

## ファイル

2 巡した。2 巡目は SendMessage で同じ担当を続けたので、依頼のファイルは無い。

- `verifier-report.md` — 1 巡目（`put_checker()` の副作用の追跡、`cur_point` と
  `hidden` の洗い出し）と「## 再確認」（旧新の配置をスクリプトで突き合わせ）
- `reviewer-report.md` — 1 巡目（検討 3 件。うち idx 15 以上の置き去りは実害あり）と
  「# 再レビュー（修正後）」（要修正 0 件）

Playwright での実測は main が行った（`~/tmp/playwright-mcp/ytbg-*.png`）。

振り返りは
`archives/todo/TODO-017. load_gameinfo() が毎回チェッカーを全部置き直す.md`
の「分担の振り返り」にある。
