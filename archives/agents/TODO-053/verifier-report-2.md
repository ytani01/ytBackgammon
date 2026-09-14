# TODO-053 verifier（レビュー後の修正）の報告

対象: implementer-report.md の「レビュー後の修正」節。指示は reviewer-report.md の
要修正 1・検討 3・好みの範囲 5・6 と verifier-report.md のテストの穴 2 つ。

## 1. 実装者が「戻し損ねた」と報告した壊し方の残留確認

`git diff` で `src/` の全差分を読んだ。判定の反転・処理の消し跡・
`// broken` の類は見当たらなかった。reviewer / verifier の 1 回目の
報告にある「壊して確かめたこと」に対応する箇所（`drag.js` の
`checker_src` / `cube_src_y` の分離、`actions.js` の `drop_cube()`、
`rules/move.js` の `disable_unusable()` が `map()` で新しい配列を返す形
など）はいずれも壊れていない状態だった。

## 2. 一式のテスト（1 回ずつ）

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 291 passed, 1 warning（deprecation のみ） | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | 103 tests, 0 fail | 0 |
| `node --test tests/browser/` | 90 tests, 0 fail | 0 |

いずれも失敗なし。

## 3. 変更されたファイルと指示の範囲

`git status` の変更ファイルは、実装者の報告の「変えたところ」と一致する。
指示の範囲外に見えるファイルは無い。新規: `drag.js`、
`tests/browser/drag.test.mjs`、`tests/browser/settings.test.mjs`、
`archives/agents/TODO-053/`。

## 4. 壊し方 2 通り（狙ったテストが落ちるか）

いずれも `\cp` でバックアップしてから壊し、対象ファイルだけ再実行し、
`diff` でバックアップと一致することを確認して戻した。

### 壊し方 A: `drag.js` の掴んだ位置をチェッカーとキューブで 1 組にまとめる（要修正 1 を戻す）

`pick_checker()` に `this.cube_src_y = ch.y;` を追加（チェッカーを掴むと
キューブの掴み位置も上書きされる、レビュー前の壊れ方を再現）。

```
node --test tests/browser/drag.test.mjs
✖ キューブとチェッカーを同時に掴んでも、キューブを離せば take を送る
  AssertionError [ERR_ASSERTION]: take を送っていない: put_checker
```

狙ったテストが落ちた（もう 1 件「掴んでいる駒は手元の座標に残る」は
影響を受けず通過）。`diff` でバックアップと一致することを確認し、
`\cp` で元に戻した。

### 壊し方 B: `settings.js` の音の cookie 保存を消す（テストの穴 2 つの一方を戻す）

`apply_sound_switch()` から `this.cookie.set(this.cookie_sound, this.sound);`
を削除。

```
node --test tests/browser/settings.test.mjs
✖ Sound を外すと cookie に保存し、開き直しても外れたまま
  AssertionError [ERR_ASSERTION]: cookie から読んだ音の設定が戻っていない
  true !== false
```

狙ったテストが落ちた（Pip の 2 件は影響なし）。`diff` でバックアップと
一致することを確認し、`\cp` で元に戻した。

戻したあと `tests/browser/drag.test.mjs` と `tests/browser/settings.test.mjs`
を合わせて再実行し、5 件すべて通過することを確認した。

## 5. `settings.js` が `sound.js` を import していないこと

`git diff` の `settings.js` を確認。import は `log.js` の 1 本のみで、
`sound.js` は import していない。`sound.js` 側は `settings.js` を
import していない（`sound.js` の差分は `this.board.sound` →
`this.board.settings.sound` の 1 行のみ）。循環は `log.js` ⇄ `settings.js`
の 1 つに減っている。

## 確かめられなかったこと・判断できないこと

- reviewer の「検討 2」（`CLAUDE.md:88-89` の `rules.test.mjs` の記述）は
  今回の指示（要修正 1・検討 3・好みの範囲 5・6・テストの穴 2 つ）に
  含まれないため確認していない
- reviewer の「検討 4」（バーから出られないとき 0 の目が 10 になる）は
  TODO-053 以前からの既存の挙動として reviewer 自身が確認済みであり、
  今回の指示にも含まれないため確認していない
- マルチタッチの実機での挙動（touch イベントそのもの）は、実装者の
  報告どおりテストに無く、今回も確認していない（コードを読む・
  Drag のメソッドを直接呼ぶ検証の範囲にとどまる）
