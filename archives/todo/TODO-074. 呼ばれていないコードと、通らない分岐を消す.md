# TODO-074. 呼ばれていないコードと、通らない分岐を消す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |
| 実施 | Sonnet 5 / effort medium | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Sonnet 5 | medium | 9,416 | 104,478 | 22% |
| implementer | Sonnet 5 | medium | 23,127 | 91,491 | 48% |
| verifier | Sonnet 5 | medium | 4,617 | 46,705 | 7% |
| reviewer | Sonnet 5 | high | 17,179 | 76,428 | 23% |
| 合計 |  |  | 54,339 | 319,102 | 概算 $3.5 |

- 3 つの定義とも上書きせず、定義ファイル（`~/.claude/agents/`）のモデル・
  effort をそのまま使った

## きっかけ

2026-09-16 に `src/` 全体を過剰実装の観点で読み直した結果のうち、
**消すだけで盤面の挙動が変わらないもの**を対象にした（書き直しで短くする
ものは TODO-075）。ガードや分岐を消す作業なので、「本当に通らないか」を
reviewer に見させる方針で分担した。

## やったこと

JS（`src/ytbg/webroot/static/js/` 以下）:

- `rules/move.js` の `dst_points()` — 先頭の `dice_vals.length == 0` の
  早期 return を削除
- `rules/judge.js` の `pip_count()` の `isNaN` と、`rules/position.js` の
  `get_pip()` の `point === undefined` を削除
- `rules/judge.js` の `closeout()` のプレーヤー番号の範囲チェックを削除
  （`tests/js/judge.test.mjs` の該当テストも削除）
- `rules/position.js` の `Position.from_points()` を削除
  （`tests/js/helper.mjs` は `new Position()` を呼ぶ形にした）
- `ui/base.js` の `BgText.get()` と `ui/label.js` の `PlayerScore.get()` を削除
- `ui/base.js` の `this.el` のガードを削除
- `board_view.js` の投了・勝ちのバナーの `on_click`（log を出すだけ）を削除
- `ui/label.js` の `PlayerPipCount.set()` の重複していた `move()`/`rotate()`
  呼び出しを削除
- `ui/dice.js` の `this.image_el` の代入と、`get_filename()` の `val %= 10`
  を削除
- `main.js` の `e.key.length === undefined` の判定と `keyCode` のログを削除
- `settings.js` の `CookieBase` の `this.cookie` と `load()` の戻り値を削除
- `lobby.js` の `board_url()` の、prefix が無い分岐の `${b.prefix}` を削除

Python:

- `server.py` の `_on_roll()` を削除し、登録表の `roll` に `_on_dice` を
  直接渡す形にした
- `server.py` の `_load_hist_ent()`（1 行）を削除し、呼び出し元に展開した
- `replay.py` の `_replay()` の `except asyncio.CancelledError: raise` を削除
- `__main__.py` の `MY_NAME` / `VERSION`（別名）を削除し、
  `__prog_name__` / `__version__` を直接使う形にした
- `__init__.py` の `__package__` が無いときの分岐を削除。ただし
  `version(__package__)` の型（`str | None`）を basedpyright に通すため、
  `assert __package__` を 1 行足した。「分岐を消す」の範囲に「型チェック用の
  assert を足す」を含めてよいかを利用者に確認し、**このまま採用**と決めた
  （万一 `__package__` が falsy になっても、実運用ではその経路は無いと判断）

付随して、`tests/browser/helper.mjs` の `show_banner()` が、削除した
投了・勝ちバナーの `on_click` を無条件に呼んでいたため、
`if (orig) { orig(btn); }` に直した（テストヘルパー側の前提が古くなって
いたための修正）。

## 確かめたこと

- `uv run pytest`（349 passed）・`uv run ruff check .`・`uv run mypy src`・
  `uv run basedpyright`（いずれも指摘 0）・`node --test tests/js/`
  （154 passed）・`node --test tests/browser/`（106 passed）が、
  implementer・verifier それぞれの実行で通った
- `git diff` と TODO.md の対象が過不足なく一致していることを verifier が確認
- 消した各ガード・分岐について、呼び出し元をすべて洗い、TODO.md に書かれた
  理由付けが正しいことを reviewer が検算した。要修正は 0 件
- `CLAUDE.md`・`docs/Developer.md` に消した名前が残っていないことを確認

## 分担の振り返り

- implementer は 11 件の JS 項目と 5 件の Python 項目を過不足なく実装し、
  途中でブラウザテストの落ちを自分で見つけて修正した（`helper.mjs` の
  `show_banner()`）。verifier は diff と TODO.md の対象の一致、テストの
  再実行、文書への名前の残存を独立に確認し、問題なしと報告した。reviewer は
  全ガード・分岐の呼び出し元を洗い直し、削除の裏付けが取れることを確認した
  （要修正 0 件）。3 者とも見込みどおりの働きで、食い違いは無かった
- 唯一判断が割れた点（`__init__.py` の `assert` 追加）は、実装者自身が
  判断に迷ったと明記し、reviewer もそれを追認する形で拾い上げたので、
  管理者判断へうまくエスカレーションできた
- 次に同じ規模（消すだけの整理、対象が事前に列挙済み）の項目をやるなら、
  今回と同じ implementer + verifier + reviewer の 3 分担で足りる
