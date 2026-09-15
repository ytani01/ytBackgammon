# TODO-075 の分担

TODO.md に立てたときの見込みどおり、implementer + verifier + reviewer の
3 者で組んだ。

- **implementer** — 依頼の 7 箇所を機械的に書き換える（挙動を変えない
  リファクタリング）
- **verifier** — テストを実際に走らせ、ループ化した 2 箇所は境界を
  わざとずらして狙ったテストが落ちるかを実測する
- **reviewer** — 分岐や条件式が変わる項目なので、書き換え前後の意味が
  一致しているかを別の目でトレースする

依頼ファイルと報告ファイルは同ディレクトリにある。

- `implementer-request.md` / `implementer-report.md`
- `verifier-request.md` / `verifier-report.md`
- `reviewer-request.md` / `reviewer-report.md`

reviewer が、implementer の範囲外の変更（`pass_btn` の冗長行削除）を
要修正として指摘。main が利用者に確認し、「元に戻す」との判断で復元した。
振り返りは `archives/todo/TODO-075. 同じ処理を短く書き直す.md` の
「分担の振り返り」節にある。
