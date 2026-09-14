# TODO-053 verifier の報告

## 1. チェックリスト・箇条書きの確認

TODO.md のチェックボックス 3 つ、design.md の箇条書きすべてについて、
実装があることを確認した。

- 掴む・動かす・離すを `drag.js` の `Drag` へ移し、`checker` / `cube` を
  そこで持つ → `src/ytbg/webroot/static/js/drag.js` にあり、`Checker` /
  `Cube` の 3 つのマウスハンドラは `this.board.drag.*` を呼ぶだけ
  （`ui/checker.js`, `ui/cube.js`）
- 音・free move・PIP・cookie のプレーヤー番号を `Settings`（`settings.js`）
  へ移した。クロックの ON/OFF・持ち時間は `Board` に残っている（`clock.js` /
  `board.js` 側は変更なし）
- `ui/base.js` のクラス階層図に `Drag` / `Settings` を追加、`CLAUDE.md` の
  構成も直っている（下記 4 参照）
- `board.moving_checker` / `Cube.moving` / `board.free_move` /
  `board.sound` / `board.disp_pip` / `board.player` は `git grep` で
  `src/` `tests/` のどこにも残っていない（`predict.test.mjs` の `moving` は
  テストのローカル変数名で、値は `board.drag.checker !== undefined`）
- `drag.js` は `emit_msg` を import せず、`actions.js` の
  `can_pick_checker` / `drop_checker` / `can_hold_cube` / `drop_cube` を
  呼ぶだけ。行き先の判定・送信は持っていない
- `rules/move.js` の `disable_unusable()` は `dice_vals.map()` で新しい
  配列を返しており、渡された配列を書き換えない（後述の壊し方 3 で確認）

## 2. 一式のテスト（1 回ずつ）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 291 passed, 1 warning（deprecation warning のみ）。終了コード 0 |
| `uv run ruff check .` | All checks passed! 終了コード 0 |
| `uv run mypy src` | Success: no issues found in 12 source files。終了コード 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes。終了コード 0 |
| `node --test tests/js/` | 103 tests, 0 fail |
| `node --test tests/browser/` | 86 tests, 0 fail |

いずれも失敗なし。Python 側は今回の差分の対象外（実装者も触っていない）
なので、通ることの確認のみ。

## 3. 壊し方 3 通り（すべて戻し、`git diff` で元に戻ったことを確認済み）

| 壊し方 | 結果 |
|---|---|
| `Settings.apply_sound_switch()` から `this.cookie.set(this.cookie_sound, this.sound)` を削除（音の ON/OFF を cookie に保存しない） | `node --test tests/browser/` を再実行 → **86 件全部通過（落ちない）**。cookie への保存を確かめるテストは無い |
| `ui/label.js` の `PlayerPipCount` コンストラクタで `if ( this.board.settings.disp_pip )` を `if ( false )` に変更（移したクラスから読まない） | `board.test.mjs` + `clicks.test.mjs` を再実行 → **49 件全部通過（落ちない）**。`clicks.test.mjs` は `board.settings.disp_pip`（値そのもの）は見ているが、`PlayerPipCount` の実際の表示切り替えを見るテストは無い |
| `rules/move.js` の `disable_unusable()` を `map()` から `for` ループへ変え、渡された `dice_vals` 配列を直接書き換えて返す形にする | `node --test tests/js/move.test.mjs` → **`渡した配列は書き換えない` が失敗**（`actual: [12, 15, 0, 0]` / `expected: [2, 5, 0, 0]`）。狙ったテストが正しく落ちることを確認 |

1 番目・2 番目は実装者の報告にある「テストで押さえられていないところ」と
一致する（実装者は「Sound のチェックを外したときに音が止まること、PIP の
初期表示」を範囲外として明記している）。新しい欠落ではない。

## 変更されたファイルの一覧と指示の範囲

`git status` に出ている変更ファイルは、指示（TODO-053 のチェックボックス、
design.md の「`Board` を分ける」節）の範囲内。

- 新規: `drag.js`、`tests/browser/drag.test.mjs`
- 変更: `board.js`、`actions.js`、`main.js`、`rules/move.js`、
  `rules/position.js`、`settings.js`、`sound.js`、`ui/base.js`、
  `ui/checker.js`、`ui/cube.js`、`ui/label.js`、
  `tests/browser/board.test.mjs` / `clicks.test.mjs` / `opening.test.mjs` /
  `player_cookie.test.mjs` / `predict.test.mjs`、
  `tests/js/move.test.mjs` / `position.test.mjs`、`CLAUDE.md`

指示に無いファイルの変更は見当たらない。`CLAUDE.md` の変更は design.md の
チェックボックス「`CLAUDE.md` の構成を直す」で明示的に指示された範囲。

## 4. `CLAUDE.md` / `ui/base.js` のクラス階層図の確認

- `ui/base.js` のクラス階層図（TODO-028 コメント部）に `Drag`（drag.js）と
  `Settings`（settings.js）が追記されており、実装と一致
- `CLAUDE.md` の `git diff` を確認。`actions.js` の説明に `drop_cube()` の
  追加、`drag.js` の項目の新設、`settings.js` の説明に `Settings` の追加、
  `rules/` の説明に `copy_gameinfo()` / `disable_unusable()` の追加、
  先行実行の説明を `Drag` 経由に修正、テスト一覧に `drag.test.mjs` の追加、
  いずれも実装内容と一致していることを実際のソースと突き合わせて確認した
- `rules.test.mjs` の説明の修正（「ほかの 2 つ」→「`board.test.mjs` と
  `clicks.test.mjs`」）も、ファイルが増えた実態に合っている

## 確かめられなかったこと・判断できないこと

- 「迷って決めたこと」2 の「キューブを離したときの判定を `drag.js` から
  `actions.js` の `drop_cube()` へ移すべきか」は設計判断であり、
  reviewer の担当と考える（verifier としては、指示どおり `actions.js` へ
  移っており、動作もテストも通ることのみ確認した）
- `CLAUDE.md:88` 付近の `rules.test.mjs` の数の食い違いの指摘（実装者が
  「範囲外」としたもの）は、TODO-053 の指示に含まれないため本報告では
  判断していない
