# TODO-063 レビューの依頼（reviewer）

## 目的

lobby（複数のボードを子プロセスで起動し、一覧ページで並べて起動・停止する）の実装を、
TODO-063 で決めたことと規約に照らしてレビューする。「動くか」は後で verifier が見るので、
ここでは「決めたとおりか・分岐の意味が正しいか・子プロセスの扱いに穴が無いか」を見る。

## 読むもの

- `TODO.md` の TODO-063（決めたこと）
- `archives/agents/TODO-063/implementer-request.md`（依頼）と `implementer-report.md`（実装の報告。自分で決めた点がある）
- 差分: `git status` / `git diff`、新規の `src/ytbg/lobby.py`・`webroot/templates/lobby.html`・`webroot/static/js/lobby.js`・
  `tests/test_lobby.py`・`tests/browser/lobby.test.mjs`・`ytbg.toml`
- `docs/Developer.md`（規約と落とし穴）

## 特に見ること

1. 子プロセス: 起動・停止・lobby の終了（lifespan）で、子が残る・二重に起動する・止めた直後に起動するなどの競合。
   SIGTERM → 待ち → SIGKILL の分岐、終了した子の状態の反映、起動に失敗したときに「停止中」になり理由がログに残るか
2. CLI: `ytbg board` が変更前の `main` と同じ引数・既定値で動くか。`ytbg lobby` の `-c`・`-p`・`-d`
3. 設定の検証: 重複・必須キー・型の誤りの扱い。**`server_id` は整数も受けて文字列に直す方針にする**（main が決めた。
   今は整数をエラーにしている。直す箇所を指摘に含めてよい）
4. 一覧ページ: iframe の URL（`url` の有無）、`?sound=off`、選んだボードの記憶、状態の読み直し。
   設定の値をページに埋めるときのエスケープ
5. テスト: `src/` を壊したら落ちる形になっているか（見る観点が抜けていないか）。実プロセスを起動するテストが
   `YTBG_DATA_DIR` を逃がし、終わったら子を必ず片付けるか
6. docs（README・Admin・Developer・Player）の説明が実装と合っているか。消した 3 ファイルへの言及が残っていないか
   （`CLAUDE.md`・`TODO.md`・`archives/` は対象外）
7. 過剰な実装が無いか（使われない引数・抽象・分岐）

## やらないこと

- **コードを直さない。** 作業ツリーを書き換えない（壊して試すのもしない）
- テストの一式は走らせなくてよい（verifier が走らせる）。確かめるために個別のテストを走らせるのはよい

## 報告

`archives/agents/TODO-063/reviewer-report.md` に、指摘を重い順に（場所・何が問題か・どうなるか・直し方の案）。
返事は 5 行以内（終わったか・報告ファイルのパス・判断が要る点）。
