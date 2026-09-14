# TODO-054 verifier (レビュー後の修正) の確認

対象: `archives/agents/TODO-054/implementer-report.md` 末尾「レビュー後の修正」
（`tests/browser/last_op.test.mjs`、`tests/browser/board.test.mjs` の追加、
`CLAUDE.md` と `dom.js` のコメント書き直し）。コードは変更していない。

## 1. 一式（1 回ずつ）

| 検証 | 結果 | 終了コード |
|------|------|-----------|
| `uv run pytest` | 291 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | 103 pass / 0 fail | 0 |
| `node --test tests/browser/` | 92 pass / 0 fail | 0 |

すべて通った。落ちた箇所は無い。

## 2. 壊して、足したテストが落ちるか

`\cp` で `board.js` / `dom.js` を退避し、壊したあとに戻して `md5sum` と
`git diff --stat` で完全一致を確認した（下記のとおり一致）。

### (a) put_checker の駒の引き当てを壊す

`board.js:623` を `put_ch = this.checker[0]?.[0];` に固定して
`node --test tests/browser/last_op.test.mjs` を実行。

- 追加した「put_checker → 動かす前がバーなら put、盤上からバーへなら hit」
  **のみ** fail（9 pass / 1 fail、終了コード 0 だが assertion は失敗）。
  期待 `sound_put`、実際は `sound_hit`

さらに、プレーヤーを取り違える形（`this.checker[1 - Math.floor(ch_id / 100)]?.[ch_id % 100]`）
でも同じテストが fail することを確認した（期待 `sound_put`、実際 `sound_hit`）。
実装者の報告にある「[0] 固定」だけでなく、この経路のプレーヤー取り違えも
このテストで捕まる。

### (b) プレーヤーを取り違える（ダイスの要素を入れ替え）

`dom.js` のダイス生成ループで `els.dice[p][i]` を `els.dice[1 - p][i]` に
変えて（id 属性 `dice${p}${i}` はそのまま、要素の格納先だけ入れ替え）
`node --test tests/browser/board.test.mjs tests/browser/last_op.test.mjs` を実行。

- 追加した「表示部品が dom.js の作った要素を取り違えずに持っている」
  **のみ** fail（16 pass / 1 fail）。`dice00: dice10` のように 8 個の
  食い違いを検出
- `last_op.test.mjs` はダイスの要素識別とは無関係なので、この壊し方では
  引き続き全件 pass（想定どおり）

戻したあとの一致確認:

```
board.js: md5sum 一致（e24e08c8c8c1f0af3e1ae515d38454d2）、
  git diff --stat 変更前と同じ（91 行、36 insertions, 55 deletions）
dom.js:   md5sum 一致（b1c7bd9fa01156e9b739d8a8fe7989cd）、
  git diff --stat 変更前と同じ（94 行、65 insertions, 29 deletions）
```

作業後の `git status --short` と `git diff --stat` も、確認開始時点と
完全に同じ（実験の跡は残っていない）。

## 3. `src/` の差分に壊した跡が残っていないか

`git diff` で `board.js` / `dom.js` / `CLAUDE.md` を通読した。

- `board.js`: `search_checker()` の削除、`put_checker` 系の引き当てが
  `this.checker[Math.floor(ch_id / 100)]?.[ch_id % 100]` /
  `ch.player * 100 + ch.num` に統一されている点、`Board` コンストラクタが
  `els` から要素を受け取る点は報告どおりで、不自然な断片（デバッグ用の
  ログや壊した名残のコード）は見当たらない
- `dom.js` / `CLAUDE.md`: レビュー後の修正で書いた「キーは `Board` の
  フィールド名に近い名前」の説明と、実際の `build_dom()` の戻り値
  （`name` → `player_name`、`clock` → `player_clock` に渡す、
  `name_input` / `clock_bg` / `dice` は `Board` に同名フィールドが無い）が
  一致している

壊した跡は見つからなかった。

## 判断できないこと・確かめられなかったこと

- 実装者の報告にある「残る懸念」（プレーヤーの取り違えを
  `Math.floor(ch_id / 100)` 側で壊す確認は未実施、と書かれていた点）は、
  今回の verifier で実測して fail することを確認済み（上記 2-(a) の追記分）
- チェッカーの要素を入れ替える壊し方は試していない（ダイスの要素入れ替えで
  代表させた）。指示は「ダイスかチェッカーの要素を入れ替える」で、
  どちらか一方でよいと読んだ。両方確かめるべきかは判断できない
- レビューの 5・7（`predict.test.mjs` の書き方、`CLAUDE.md` の折り返し）は
  実装者が「指示に無いので触っていない」としており、今回の依頼にも
  含まれていないため確認していない
