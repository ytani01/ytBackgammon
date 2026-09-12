# TODO-037 確認報告

## 1. 検証コマンド（すべて通過）

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 226 passed | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | 57 tests, pass 57 | 0 |
| `node --test tests/browser/` | 44 tests, pass 44（1 回のみ実行） | 0 |

失敗・落ちた箇所は無し。

## 2. 消したものの裏取り（grep）

実装担当の報告を鵜呑みにせず、`src/` `tests/` `docs/` を対象に grep して
呼び出し元が無いことを確認した。

- `reset_clock`: `src/` `tests/` `docs/` のどこにも文字列が残っていない
  （`message.py` の `NO_HISTORY_TYPES` / `DATA_TYPES`、`server.py` の
  `_handlers` すべてから消えている）
- `emit_reset`: 全リポジトリで 0 件
- `CookieBase.save()`: `settings.js` の `class CookieBase { ... }` 内に
  `save` の定義は無い（grep で該当行なし）。呼び出し側の `.save(` は
  `server.py`（`self._storage.save(...)`、無関係）と
  `tests/test_save_load.py`（`storage.save(...)`、これも `Storage.save()` で
  別物）のみで、`CookieBase.save()` を指すものは無い
- `Position.empty()` / `count_of()` / `players()`: `src/` `tests/` に
  `.empty(` `count_of(` `.players(` の呼び出しが 0 件
- `board.js` の `clock_on()` / `clock_off()`: 0 件（`tests/test_clock.py` の
  `clock_on` は Python 側のテストヘルパー関数で、別物。混同していないか
  文脈も確認した）

`reset_clock` の削除により登録表（`DATA_TYPES` / `_handlers`）から分岐が
1 つ減っているが、`tests/test_message.py` の「キーの集合が一致すること」を
見るテストと `tests/test_on_json.py` は変更後も通っている
（`uv run pytest` に含まれる）。

## 3. テストの判別力（`Position.with_move()`）

`src/ytbg/webroot/static/js/rules/position.js` の `with_move()` を

```js
const i = pt[from_p].lastIndexOf(player);
```
から
```js
const i = pt[from_p].indexOf(player);
```
へ変え（スタックの先頭ではなく末尾から取る向きに反転）、
`node --test tests/js/position.test.mjs` を実行した。

結果: 26 件中 1 件が失敗。

```
✖ 動かすのは、そのポイントの上にある自分のチェッカー (1.265188ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  1 !== 0
      at TestContext.<anonymous> (file:///home/ytani/work/ytBackgammon/tests/js/position.test.mjs:191:16)
```

書き換えた（`players()` を使わず `owner()`/`count()` で検証し直した）
`it` が狙いどおり落ちることを確認した。判別力は失われていない。
確認後 `git checkout -- src/ytbg/webroot/static/js/rules/position.js` で
元に戻し、`diff` でバックアップと完全一致することを確認した
（`git diff --stat HEAD` にも意図しない差分は残っていない）。

## 4. 変更ファイルの一致確認

`git diff --stat HEAD`（17 ファイル、+20/-291）:

```
CLAUDE.md
src/ytbg/message.py
src/ytbg/server.py
src/ytbg/webroot/static/js/board.js
src/ytbg/webroot/static/js/main.js
src/ytbg/webroot/static/js/rules/position.js
src/ytbg/webroot/static/js/settings.js
src/ytbg/webroot/static/js/ui/checker.js
src/ytbg/webroot/static/js/ui/clock.js
src/ytbg/webroot/static/js/ui/cube.js
src/ytbg/webroot/static/js/ui/dice.js
src/ytbg/webroot/static/js/ui/label.js
tests/js/judge.test.mjs
tests/js/position.test.mjs
tests/test_clock.py
tests/test_message.py
tests/test_on_json.py
```

`CLAUDE.md` は依頼にある通り管理者（main）の変更（`reset_clock` の記述削除・
type の個数の訂正）で範囲内。残り 16 ファイルは実装担当の報告と一致する。
未追跡は `archives/agents/TODO-037/`（本報告ファイルと実装報告）のみで、
指示に無いファイルの変更は見当たらない。

## 5. 実装担当が挙げた「判断が要る点」について

`Position.empty()` / `count_of()` / `players()` の削除に伴うテスト書き換えが
指示（`position.test.mjs` の該当 `it` を消すだけ）より広くなっている点
（`judge.test.mjs` の 1 箇所の置き換え、`position.test.mjs` の 4 箇所の
アサーション手段の置き換え）は、diff を見る限り機械的な置き換えで
挙動確認の対象を変えているようには見えない。ただし
「これでテストの意図が変わっていないと言えるか」は設計判断が絡むため、
**verifier としては通過を確認したに留め、可否の判断はしていない**
（3 節の意図的破壊で該当 `it` の判別力自体は確認済み）。

## 確かめられなかったこと・判断できないこと

- テスト書き換え範囲が指示より広がったことの是非（上記 5 節）は、
  管理者の判断が必要
- `count_of()` / `players()` を使っていた他 3 箇所の書き換え
  （`from_gameinfo()` の「上に積む」テストなど）について、`with_move()` 以外は
  意図的な破壊での裏取りをしていない（依頼にあった `with_move()` のみ実施）
