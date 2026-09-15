# TODO-074 の分担

呼ばれていないコードと通らない分岐を消す項目。ガードや分岐を消す作業なので、
「本当に通らないか」を実装者とは別の目で確かめる必要があると判断し、
常設の定義（`~/.claude/agents/`）どおり implementer + verifier + reviewer の
3 分担にした。

- 実装: implementer（`implementer-report.md`）。TODO.md に列挙済みの対象を
  1 件ずつ、呼び出し元を確認してから削除した
- 確認: verifier（`verifier-report.md`）。diff と TODO.md の対象の一致、
  全テスト・型チェックの再実行、文書への名前の残存を独立に確認した
- レビュー: reviewer（`reviewer-report.md`）。削除した各ガード・分岐について、
  呼び出し元を洗い直し、「本当に通らないか」を検算した

判断が要った点（`__init__.py` の `assert __package__` 追加）は、implementer が
report に明記し、reviewer も追認したので、管理者（利用者）に確認して
採用と決めた。
