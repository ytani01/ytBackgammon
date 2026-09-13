# TODO-051 レビュー（2 回目）: レビュー後の修正

対象: `implementer-report.md` の「レビュー後の修正」。差分は
`src/ytbg/gameinfo.py` / `src/ytbg/storage.py` / `tests/test_save_load.py` /
`tests/browser/clicks.test.mjs` / `CLAUDE.md`。テストは走らせていない
（下の実測は `Storage.load()` を直接呼んだもの）。

**まとめ:** 要修正 0 件、検討 2 件。前回の要修正 1・2 はどちらも片付いている。

---

## 前回の要修正の扱い

### 1. `LOAD_ERRORS` のコメントと `TypeError` — 片付いた

- `src/ytbg/storage.py:35-40` — `TypeError` を外し、`LOAD_ERRORS` は HEAD と
  同じに戻った。コメント（「TypeError まで握ると書き間違いを握りつぶす」）と
  コードが一致し、dict でないものを入口で `KeyError` にしている旨も足された
- `src/ytbg/gameinfo.py:61-70` の `_require_dict()` を
  `CubeState` / `BoardState` / `GameInfo` の `from_dict()` の先頭で呼ぶ。
  管理者の決定どおり
- `CLAUDE.md:255-258` の説明もコードと合っている
- `_require_dict()` の例外メッセージに `{data!r}` が入るが、`storage.py:145` の
  ログは `'{}:{}.'` に `e` を引数で渡しているので、中身に `{` があっても
  loguru の書式で例外にならない（`CLAUDE.md` の「書き方の慣習」の罠は踏んでいない）

### 2. テイク・リダブル・ダイスを押す操作のテスト — 片付いた

- `tests/browser/clicks.test.mjs:545-580` にリダブルとテイク、`:612-627` に
  ダイスを押して `end_turn`。どれも `assert_only_sent()` で 1 通だけかを見ており、
  サーバの盤面（キューブ・`turn`）が変わるところまで待つ
- 実装者の報告では、`take()` の `1 - player`、リダブルの `0` → `1`、
  `click_dice()` の `1 - player` の 3 通りを壊してそれぞれ落ちている。
  前回の案（`player` を反対にして落ちるか）に沿っている

---

## 入口の確かめが他の経路を壊さないか

- **`from_dict()` を呼ぶのは `storage.py:139,141` だけ**（`grep` で確認。
  `src/` にも `tests/*.py` にも他の呼び出しは無い）。
- **`new_game()`**（`server.py:89` → `gameinfo.py:145`）は `from_dict()` を
  通らない。**履歴の複製**（`history.py:93,108`、`server.py:139,277`）は
  `GameInfo.copy()` = `copy.deepcopy()` で、これも通らない。影響は無い
- **正しい保存ファイル**は、`to_dict()` の出力を 1 行書いたファイルで実測して
  読めた（下の表の `correct`）

### 実測: 壊れた 1 行を `Storage.load()` に読ませた結果（HEAD と比べた）

HEAD は `git archive HEAD src` を scratchpad に展開し、`PYTHONPATH` で差し替えて
同じスクリプトを走らせた。

| 壊し方 | HEAD | 今の差分 |
|--------|------|----------|
| 正しいファイル | 読める | 読める |
| `"h": "x"` | `TypeError`（起動しない） | 空で始まる |
| `"cube": [1, 2]` | `TypeError`（起動しない） | 空で始まる |
| `"score": 5` / `"playername": 5` | `TypeError`（起動しない） | 同じ |
| 1 行が `5` / `"h"` | `TypeError`（起動しない） | 同じ |
| 1 行目（メタ）が `[]` | `TypeError`（起動しない） | 同じ |
| `"clock": 3` | `AttributeError`（起動しない） | 同じ |
| `"score": "ab"` / `"turn": "0"` / `"dice": null` / `"checker": null` | 黙って読める | 同じ |

`"board": null` は、HEAD では `_get(...) or {}` から `strict` で `KeyError` に
なっていた（コードを読んで確認。実測はしていない）。今の差分では
`_require_dict()` で `KeyError` になる（新しいテストで確認されている）。
**HEAD より悪くなった壊し方は見つからなかった。**

---

## 足したテストが壊したときに落ちる形か

- `tests/test_save_load.py:295-340` の 4 通りは、それぞれ別の `_require_dict()`
  にしか当たらない（`board-null` は `BoardState`、`cube-*` は `CubeState`、
  `h-list` は `GameInfo`）。どれか 1 つを外せば、その行は `None['playername']`
  などの `TypeError` で落ちる。実装者の実測（全部外す / `CubeState` だけ外す）とも合う
- 起動後に `score == [0, 0]` を見ており、書いた履歴は `score=[7, 7]` なので、
  「読めてしまった」と「空で始まった」を区別できる
- ブラウザの 3 件は上に書いたとおり、壊して落ちることが確かめられている

---

## `"score": 5` を放っておいてよいか

**放っておいてよい。** 理由:

- HEAD でも同じ（実測）で、TODO-051 で悪くなったものではない。範囲外
- 実際に起きる壊れ方ではない。サーバが書くのは `to_dict()` の出力だけで、
  途中で切れた行は `JSONDecodeError` で拾われる。型の違う値が入るのは
  手で書き換えたときくらい
- **起動に失敗する方が、ファイルは残る。** 拾って空で始めると、
  `BackgammonServer.__init__()`（`server.py:84-87`）の `add_history()` →
  `save_data()` が利用者の `.jsonl` を初期配置で上書きする（コードを読んで確認）。
  起動しなければ、利用者がファイルを直して起動し直せる
- 拾う範囲を広げるなら、「空で始めて上書きする」ことの是非と一緒に決める話で、
  ここで `list` の確かめだけ足すと、`"score": "ab"` のように黙って読める方が
  残る。やるなら別の項目にする

---

## 検討

### 1. `src/ytbg/webroot/static/js/ui/cube.js:161-168` — プレーヤー 1 の画面からのテイク・リダブルは試されていない

- **問題:** 足したテストは `board.player` が 0 の画面だけで、キューブが `y1[0]`
  にある分岐（`:153-160`）しか通らない。`y1[1]` の分岐の `take(this.board,
  this.player)` と `double(this.board, 1, true)` は、書き間違えても落ちない
- **根拠:** `cube.js:47,102` で `y1[player]` がそのプレーヤーの側の位置。
  テストはプレーヤー 0 で開いている（`clicks.test.mjs` を読んで確認）。
  前回の指摘（3 件足す）は満たしているので、足すかどうかは管理者の判断
- **重さ:** 2 つの分岐は同じ形で、今回書き換えたのは呼び出す関数名と引数だけ。
  片方が通っていれば、もう片方を間違える見込みは小さい

### 2. `tests/browser/clicks.test.mjs:523-532` — `drag_cube()` の固定の `sleep(500)`

- **問題:** キューブの移動（0.3 秒）が終わるのを 0.5 秒の固定で待っている。
  重い環境では足りずに掴み損ね、テイク・リダブルの項目と、それに続く項目が
  連鎖で落ちる
- **根拠:** 実装者の報告に「待たないとテイクの項目が落ちた」とある。
  1 回の実行でしか確かめていない（未確認: 負荷をかけたときに落ちるか）
- **案:** `#cube` の位置が `y1[side]` に着くまで `wait_for()` で待つ。
  いまのままで困っていなければ、そのままでもよい
