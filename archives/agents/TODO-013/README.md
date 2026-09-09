# TODO-013 の分担

`on_json()` の `type` ごとのテストを足す項目。

## 分担にした理由

- **実装は implementer に分けた。** 分岐が 17 あり、テストの量がまとまって
  出る。`conftest.py` のフィクスチャの作り替えも要る
- **確認は verifier**（利用者の `CLAUDE.md`「コードやファイルを変える項目では、
  確認の担当を、項目の規模によらず必ず別のサブエージェントに分ける」）
- **レビューも入れた。** テストは「分岐を網羅しているか」ではなく
  「守るべきものを守っているか」が値打ちなので、通ることを見るのとは
  別の目が要る

## ファイル

3 巡した。番号は依頼の回数。

- `implementer-task.md` / `implementer-report.md` — 最初の実装（55 件）
- `reviewer-task.md` / `reviewer-report.md` — 「値を変えてもテストが通る」
  箇所を実測で 7 件
- `implementer-task2.md` / `implementer-report2.md` — その 7 件と、
  記録扱いから拾った 6 件の修正
- `verifier-task.md` / `verifier-report.md` — ミューテーション 13 種。
  1 種だけ落ちない穴を発見
- `implementer-task3.md` / `implementer-report3.md` — 同じ性質の 5 件をまとめて修正
- `verifier-report2.md` — 最終確認（依頼は SendMessage で渡したので task ファイルは無い）

振り返りは `archives/todo/TODO-013. on_json の分岐ごとのテストを足す.md` の
「分担の振り返り」にある。
