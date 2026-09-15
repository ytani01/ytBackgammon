# TODO-074 implementer 報告

## 消した項目と変更箇所

### JS

- `src/ytbg/webroot/static/js/rules/move.js:124` — `dst_points()` の先頭
  `dice_vals.length == 0` の早期 return を削除（下のループと
  `dst_p.length == 0` の判定で同じく `[]` になることを確認）
- `src/ytbg/webroot/static/js/rules/judge.js:17` — `pip_count()` の `isNaN`
  チェックを削除。`@return` の型注釈も `number|undefined` → `number` に修正
- `src/ytbg/webroot/static/js/rules/position.js:37` — `get_pip()` の
  `point === undefined` の分岐を削除。呼び出し元は `judge.js` の
  `pip_count()` のみで、渡すのは `points_of()` が返す値（undefined を含まない）
  と確認。`@return` の型注釈も修正
  - `tests/js/position.test.mjs:55-58` — `get_pip(0, undefined)` の
    テストを削除
- `src/ytbg/webroot/static/js/rules/judge.js:107` — `closeout()` の
  `player != 0 && player != 1` の範囲チェックを削除。呼び出し元は
  `board_view.js` の `render_turn()` のみで、`turn` が 0 か 1 のときだけ
  呼ばれることを確認
  - `tests/js/judge.test.mjs:114-119` — 範囲チェックのテストを削除
- `src/ytbg/webroot/static/js/rules/position.js:153-164` —
  `Position.from_points()`（`new Position()` を呼ぶだけ）を削除
  - `tests/js/helper.mjs:63` — `Position.from_points(pt)` を
    `new Position(pt)` に変更
- `src/ytbg/webroot/static/js/ui/base.js` — `BgText.get()` を削除
  （唯一の呼び出し元は `ui/label.js` の `PlayerScore.get()`）
- `src/ytbg/webroot/static/js/ui/label.js` — `PlayerScore.get()` を削除
  （呼び出しが無いことを grep で確認）
- `src/ytbg/webroot/static/js/ui/base.js` — `this.el` のガードを削除
  （`BgBase.constructor()` の `w/h` 判定、`id` getter、`BgText.constructor()`、
  `BgText.set()`、`BgText.on()`/`off()`）
- `src/ytbg/webroot/static/js/board_view.js` — 投了・勝ちバナーの
  `on_resign_banner` / `on_win`（log を出すだけ）を削除し、`BannerButton` に
  `on_click` を渡さない形にした。パスバナーの `on_pass` はそのまま残す
- `src/ytbg/webroot/static/js/ui/label.js` — `PlayerPipCount.set()` の
  末尾の `this.move()` / `this.rotate()` 呼び出しを削除（`super.set()`
  ＝ `BgText.set()` の中で同じものを呼んでいるため）
- `src/ytbg/webroot/static/js/ui/dice.js` — コンストラクタの
  `this.image_el = this.el.firstElementChild` を削除（`BgImage` の
  コンストラクタが `this.image_el = this.el.children[0]` で入れている）。
  `get_filename()` の `val %= 10` を削除（唯一の呼び出し元
  `this.get_filename(val % 10)` で済んでいる）
- `src/ytbg/webroot/static/js/main.js` — `on_key_down()` の
  `e.keyCode` のログと、`document.body.onkeydown` の
  `e.key.length === undefined` の判定を削除（`e.key` は常に文字列）
- `src/ytbg/webroot/static/js/settings.js` — `CookieBase` の
  `this.cookie = undefined`（クラス自身では未使用。`Settings.cookie` とは
  別物）と、`load()` の戻り値（呼び出し元は戻り値を使っていない）を削除
- `src/ytbg/webroot/static/js/lobby.js` — `board_url()` の prefix が
  無い分岐のテンプレートから `${b.prefix}`（常に空文字）を削除

### Python

- `src/ytbg/server.py` — `_on_roll()`（`_on_dice()` と同じ中身）を削除し、
  登録表 (`MESSAGE_TYPES`) の `'roll'` に `_S._on_dice` を渡す形にした
- `src/ytbg/server.py` — `_load_hist_ent()`（1 行、呼び出しも 1 か所）を
  削除し、呼び出し元の `back()`/`fwd()` の中で
  `self._gameinfo = hist_ent.copy()` と直接書く形にした
- `src/ytbg/replay.py` — `_replay()` の
  `except asyncio.CancelledError: raise` を削除（何もしないので、
  `except Exception` にはそもそも捕まらない）
- `src/ytbg/__main__.py` — `MY_NAME` / `VERSION`（別名）を削除し、
  呼び出し箇所で `__prog_name__` / `__version__` を直接使う形にした
- `src/ytbg/__init__.py` — `__package__` が無いときの分岐
  （`__version__ = '_._._'`）を削除。ただし `version(__package__)` の
  引数の型が `str | None` のままだと basedpyright が
  `reportArgumentType` で落ちるため、`assert __package__` を 1 行入れて
  型を絞った（TODO の指示は挙動の分岐を消すことで、型チェックを通すための
  `assert` は分岐ではないので範囲内と判断）

## 確認したこと

- `uv run pytest` — 349 passed
- `uv run ruff check .` — All checks passed
- `uv run mypy src` — Success: no issues found in 13 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- `node --test tests/js/` — 154 passed / 0 failed
- `node --test tests/browser/` — 106 passed / 0 failed
  - 1 回目は `clicks.test.mjs` の「コンソールエラーが出ていない」が
    `orig is not a function` で落ちた。原因は `tests/browser/helper.mjs`
    の `show_banner()` が、投了・勝ちバナーの `on_click`
    （今回削除した log だけの関数）を `orig(btn)` として無条件に
    呼んでいたため。`on_click` が無いことは正しい変更なので、
    `helper.mjs:1024` 側を `if (orig) { orig(btn); }` に直し、
    再実行して全件通った
- `CLAUDE.md` / `docs/Developer.md` に消した名前が残っていないことを
  grep で確認（`docs/Developer.md` の `PlayerPipCount` / `PlayerScore` は
  クラス図のクラス名で、消したのはそのメソッドなので該当しない）
- TODO.md の TODO-074 節のチェックボックスは、確認できたものを全てチェック

## 判断に迷った点

- `__init__.py` の `assert __package__` — TODO は「分岐を消す」ことを
  求めていたが、型チェッカー（basedpyright）が `str | None` を `str` に
  絞り込めず落ちたため、挙動を変えない範囲で `assert` を追加した。
  これは分岐の削除であって新しい分岐ではないと判断したが、気になる場合は
  型: ignore コメントなど別の書き方に変える余地がある
- `board_view.js` の投了・勝ちバナーの `on_click` を削除したことで、
  テストヘルパー `tests/browser/helper.mjs` の `show_banner()` が
  影響を受けた（`orig` が `undefined` になる）。これはテストヘルパー側の
  前提が古くなっていたための修正で、範囲外のリファクタリングではないと
  判断し、あわせて直した
