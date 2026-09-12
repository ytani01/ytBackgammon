# TODO-037. 呼ばれていないコードを消す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 21,290 | 96,642 | 44% |
| implementer | Sonnet 5 | medium | 29,451 | 112,466 | 25% |
| reviewer | Opus 5 | high | 22,908 | 83,099 | 23% |
| verifier | Sonnet 5 | medium | 12,003 | 92,496 | 7% |
| 合計 |  |  | 85,652 | 384,703 | 概算 $8.3 |

- main のモデルは利用者が Opus 5 のまま着手したので、見込みの Sonnet 5 とは違う
- reviewer は定義のモデルが sonnet。「本当に死んでいるか」の判断が要るので
  Opus 5 に上書きした
- この集計には、並行して走らせていた **TODO-040 の決着分（概算 $1.2）が
  main と verifier に混じっている**。時刻で切れないので、そのまま載せてある

## きっかけ

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果（15 件）を、
性質ごとに TODO-037〜039 の 3 つへ分けた。そのうち、**呼ばれていない
コードを消すだけ**で盤面の挙動が変わらないものを集めたのがこの項目。

## やったこと

`src/` から 285 行、テストから差し引き 14 行を消した。

### JS

- `ui/checker.js` — `calc_z()` / `distance()` / `is_last_man()` /
  `get_available_points()`（T.B.D. のまま空を返していた）
- `settings.js` — `CookieBase.save()`（呼び出しが無く、
  `if (Object.keys(this.data)) return;` で常に何もしなかった）
- `board.js` — `clock_on()` / `clock_off()`、`apply_sound_switch()` 内の
  `GlobalSoundSwitch` ブロック、コンストラクタの `this.score = [0, 0]`
  の二重初期化
- `main.js` — 未使用のローカル変数 `def_name`
- `ui/label.js` — 読まれていない `PlayerScore.default_text`
- `ui/clock.js` — `PlayerClock.emit_reset()` と `PlayerClock.reset()`
- `rules/position.js` — `Position.empty()` / `count_of()` / `players()`
- コメントアウトされたまま残っていた塊を全部（`board.js` と `ui/dice.js`
  にまたがる `dice_histogram` 約 25 行を含む）。1 行のコメントアウトは
  「塊」ではないので残した

### `reset_clock` の経路

唯一の送り元 `PlayerClock.emit_reset()` がどこからも呼ばれていなかった。
`message.py` の `DATA_TYPES` と `NO_HISTORY_TYPES`、`server.py` の
`_handlers` とハンドラ `_on_reset_clock()` を消した。
**`Clock.reset()` 自体は `new_game()` と `_on_set_clock_limit()` が使うので
残してある。**

`PlayerClock.reset()`（JS 側）は箇条書きに名前が無かったが、
`emit_reset()` とは無関係に前から未参照だったので、項目の趣旨どおり
一緒に消した。`clock.py` の `Clock.reset()` の docstring がそれを
参照していたので、その一行も直した。

### 文書

`CLAUDE.md` の「クロック系の 7 つの type」を 6 つに、`on_json()` の
クロックの分岐の一覧から `reset_clock` を外し、`float` を返すハンドラの
個数を 14 → 13 に直した。`docs/Developer.md` には `reset_clock` の記述が
無かったので、触っていない。

### テスト

`reset_clock` を見ていた Python のテスト（`test_clock.py` の
`test_reset_clock_restores_limit_and_stops` と、パラメータの 1 件ずつ）と、
`test_message.py` / `test_on_json.py` のサンプルを消した。

`Position.empty()` / `count_of()` / `players()` は、`position.test.mjs` の
中だけでなく `judge.test.mjs` からも、また**他の `it` のアサーションの
手段としても**使われていた。それらは `it` ごと消さず、`owner()` /
`count()` / `points_of()` / `make_position({})` で同じことを見る形に
書き換えてある。

## 確かめたこと

- `uv run pytest`（226 passed）/ `uv run ruff check .` / `uv run mypy src` /
  `uv run basedpyright` / `node --test tests/js/`（57）/
  `node --test tests/browser/`（44）がすべて終了コード 0
- **消したものがどこからも呼ばれていないことを、実装担当とは別に
  verifier が grep で裏を取った**
- **`with_move()` をわざと壊して、狙ったテストが落ちることを確かめた。**
  `lastIndexOf(player)` → `indexOf(player)`、移動先への `push` → `unshift`、
  相手の駒を取り除く、の 3 通り
- **`Clock.reset()` を no-op にすると pytest が 6 件落ちる**ことを reviewer が
  実測した（残した判断が正しいことの裏）
- `DATA_TYPES` と `_handlers` のキーの集合が一致していること（22 個）。
  `tests/test_message.py` がこれを見ているので、片方だけ消していれば落ちる

## 残ること

- 1 行のコメントアウト（`// log(...)` など）が JS 全体に 30 か所以上残る。
  項目の指示は「塊」だったので範囲外にした
- `mylog.py` の `exmsg()` と `setLevel(level=None)` はこのリポジトリでは
  未使用だが、他でも使い回すモジュールなので触っていない

## 分担の振り返り

- **reviewer が唯一、テストの判別力が落ちた箇所を見つけた。**
  `with_move()` のテストで `players()` の配列比較を `owner()` + `count()` に
  置き換えた結果、「混在ポイントで相手の駒を代わりに取り除く」壊れ方が
  捕まらなくなっていた（実測で 57 件すべて通ることを確認して報告してきた）。
  `points_of(1)` の 1 行を足して埋めた。**「削除だけだから検証は軽い」
  という見立てが外れた部分**で、reviewer を入れた効果はここに出た
- verifier は検証一式の通過と、消したものの呼び出し元が無いことの裏取り、
  わざと壊してテストが落ちることの確認をした。3 通りの破壊はすべて
  狙ったテストを落としたが、reviewer が見つけた 4 つ目の壊れ方には
  届かなかった。**「指示された項目を確かめる」verifier と「指示に無い
  壊れ方を探す」reviewer の分け方が、そのまま結果に出ている**
- 見込み（implementer + verifier + reviewer）との食い違いは無い。
  ただし implementer が「テストの書き換えが指示より広くなった」と
  報告してきたとおり、削除だけの項目でもテストの書き換えが発生した。
  **次に「消すだけ」の項目をやるときも、テストを書き換えるなら
  reviewer を省かないこと**
- main が `git checkout <path>` で実装担当の削除を巻き戻してしまい、
  入れ直す手間が出た。**未コミットの作業ツリーでわざと壊して試すときは、
  戻すのに `git checkout` を使わない**（元の内容を控えてから直接書き戻す）
