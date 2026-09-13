# TODO-050 reviewer 報告（3 回目: 型の確かめと `load_player()`）

対象: 実装者の報告の「型の確かめ」の節、`git diff` の `src/ytbg/message.py`・
`src/ytbg/server.py` の `parse()` / `_type_ok()`・`board.js` の
`load_player()`・`tests/`、新規の `tests/browser/player_cookie.test.mjs`、
`CLAUDE.md` の書き足し。テストの一式は走らせていない（verifier の担当）。
挙動は scratchpad の使い捨てスクリプトで `parse()` と `_type_ok()` を
直接呼んで確かめた（Python 3.14.7）。JS はコードを読み、`parseInt` と
`1 - x` の結果だけ node で確かめた（ブラウザでは未実測）。

## まとめ

- **要修正: 0 件**
- `_type_ok()` は短く、今の dataclass の注釈に対しては正しい（下の「確かめたこと」）
- 今のクライアントが正しく送る値で弾かれるものは見つからなかった
- `load_player()` の直しで振る舞いが変わるのは、cookie の値が `""` のときだけ（検討 1）

## 検討

### 1. cookie の値が `""` のときだけ、Inverse で戻れなくなった

- 場所: `src/ytbg/webroot/static/js/board.js:397`
- 問題: 前は `""` のまま残り、`this.player == 1` は偽、Inverse を 1 回押すと
  `1 - ""` = 1 で数に戻っていた。今は `parseInt("")` = `NaN` になり、
  `inverse()` も `NaN` を返し、`set_player()` が cookie に `"NaN"` を書き戻すので戻れない
- それ以外の値は変わらない（node で確かめた）
  - 無い: `undefined` → コンストラクタが `set_player(0)`（前と同じ）
  - `"0"` / `"1"`: 比較と `inverse()` の結果は前と同じで、型だけが数になる
  - `"abc"` / `"NaN"` / `"undefined"`: 前も `1 - x` が `NaN` で戻れず、
    `roll_btn[x]` が `undefined` になる。前からある壊れ方で、今回で悪くはなっていない
- 実害: `CookieBase.set()` は `encodeURIComponent(value)` を書くので、
  `""` はこのコードからは書かれない（手で消しかけた cookie くらい）。ほぼ起きない
- 直し方の案（直すなら）: a. このままにする b. `Number.isNaN()` のときも
  `undefined` として返し、コンストラクタの `set_player(0)` に任せる
  （壊れた cookie 全般から戻れるようになる。前からある壊れ方まで直すことになる）

## 好みの範囲

### 1. `_type_ok()` が扱わない注釈を docstring に書いておく

- 場所: `src/ytbg/server.py:749`〜`:771`
- 実測: `int | None` と `Optional[int]` は値によらず偽（全件弾く）。
  `Any` は `isinstance()` が `TypeError` を出す。`dict[str, int]` と
  `tuple[int, int]` は入れ物しか見ない。文字列の注釈（`'int'`）は
  `isinstance()` が `TypeError` を出す
- 今の dataclass にはどれも無く、足せば `SAMPLES` の `parse()` のテストが
  落ちるので気づける。docstring の「dict などは入れ物の型だけを見る」に、
  Optional と Any は扱わないことを 1 行足すと、落ちたときに原因を探さなくて済む。
  一般化はしなくてよい

### 2. `CLAUDE.md` に「写すのは受け取る側」を足す

- 場所: `CLAUDE.md` の「値の型も確かめる」の段落
- 「`list` のフィールドは `from_dict()` で `list()` に写さない」は正しいが、
  その結果 `data.dice` / `data.clock` が `msg`（`last_op` として送る `raw`）と
  同じ list になる（実測: `m.data.dice is raw['data']['dice']` が真）。
  今は `GameInfo.dice()` / `move()`、`Clock.set_clock()` がすべて `list()` で
  写しているので問題は無い。この前提は `DiceData` の docstring にしか無いので、
  ハンドラを足す人が気づけるよう `CLAUDE.md` にも「写すのは受け取る側
  （`GameInfo` / `Clock`）」と書いておくとよい

## 確かめたこと

### `_type_ok()`（実測）

- 注釈は文字列になっていない。`message.py` に `from __future__ import annotations`
  は無く、`get_type_hints(MoveData)` は `list[PutCheckerData]` などの型を返す。
  `f.type` ではなく `get_type_hints()` を使っているので、将来 `from __future__`
  を足しても壊れない
- `list[int]` の中身: `[1, '2', 0, 0]`、`[1, True, 0, 0]`、`[1.0, 2, 0, 0]` は
  弾く（JS の整数は `JSON.stringify` で `1` になるので、`1.0` は届かない）
- `list[PutCheckerData]` の中身はフィールドまで見る。`moves: [1]` は
  `PutCheckerData.from_dict()` の `1['ch']` で `TypeError`（`_type_ok()` の手前だが、
  同じく盤面を書き換える前）
- `list[float]`: `[90.5, 3]` は通し、`[90.5, True]` と `[None, 3]` は弾く
- bool と int: int のフィールドに `True` / `False`、bool のフィールドに `1`、
  float のフィールドに `True` はすべて弾く
- `dict[str, Any]`（`set_gameinfo`）: `[]` は弾き、`{'turn': 'x'}` は通す（中身は見ない。
  TODO-051 で消す type）
- 余分なキー（`put_checker` に `roll`）は読み捨てる
- `TypeError` は `on_json()` では拾わず、`app.py:114` の受け皿がログに出して接続を保つ
- 過剰な一般化は無い。分岐は dataclass・list・bool・float・その他の 5 つだけ

### 今のクライアントが送る値（コードを読んだ）

`emit_msg()` の呼び出しをすべて見た。弾かれるものは無い。

- `set_turn`: `turn` は数（`RollButton.player`、`BannerButton.player`、`-1`、`2`）、
  `resign` は `-1` か `board.player`（今回で数になった）
- `cube`: `side` は `Cube.emit()` が `undefined` を `-1` にする。`value` は
  `this.value * 2` か `/ 2`。`/ 2` は未テイクのときだけ呼ばれ、そのとき `value` は
  2 以上なので整数。`accepted` は bool
- `dice`: `player` は `Checker` / `RollButton` のコンストラクタの数、`dice` は
  `Dice.value` の配列（`Math.floor` の結果か `% 10` / `+ 10`）で整数。`roll` は読み捨て
- `put_checker`: `ch` は `parseInt()`、`p` / `idx` は数から計算した値
- `set_playername` / `set_score`: `parseInt()` 済み、`name` は `<input>` の文字列
- `set_clock_switch`: `checkbox.checked` で bool
- `set_clock_limit`: `parseFloat()`（index 0 は `* 60`）。空欄は `NaN` → JSON で
  `null` になり、今回から弾かれる。先に送る `stop_clock` 2 通は通るので、
  止まって `limit` はそのまま。前は `limit` に `None` が入っていたので悪化ではない
- `set_player_clock`: `clock` は数の配列。`start` / `resume` / `stop_clock` の `player` は数
- `main.js` のメニュー: `back` / `fwd` は `{n: 1}`、ほかは `{}`
- `set_gameinfo` と、名前付きの操作（`roll` / `move` など）はまだ送っていない

### `board.player` を使うほかの箇所（コードを読んだ）

- `inverse()` / `set_player()`: 数を入れ、数を返す。前も `"0"` → `1 - "0"` = 1 で数に戻っていた
- `Cube`: `!=` / `==` で比べ、`double(this.board.player)` の中で `1 - player` にする。
  数になっても結果は同じ
- `ResignButton`: `score[1 - board.player]` と `emit_turn(-1, board.player)`。今回で
  `resign` が数になり、サーバが受け付ける
- `BgBase.get_xy()` の `player == 1`、`main.js` の `roll_btn[player]`: 数でも文字列でも同じ

### `from_dict()` で写さなくなったこと（実測とコード）

- `m.data.dice is raw['data']['dice']` は真。`raw` は `last_op` として送るだけで、書き換えない
- 受け取る側は `GameInfo.dice()`（`gameinfo.py:201`）、`move()`（`:288`）、
  `Clock.set_clock()`（`clock.py:152`）がすべて `list()` で写す。`data.dice` /
  `data.clock` をほかで読んでいる所は無い（`server.py` は `GameInfo.dice()` に渡すだけ）
- `moves` は `MoveData.from_dict()` が新しい list を作るので共有しない

### テスト

- `tests/test_message.py` の 17 通りと、`tests/test_named_ops.py` の 5 通りで、
  種類（str・bool・float・list でない・中身）は揃っている
- `player_cookie.test.mjs` の最後の `board.turn === -1` は、サーバの初期値が
  `turn = 2`（`gameinfo.py:144`）で、待つ前に `gameinfo` を受けていること
  （`cur_point` が入っている）を確かめているので、弾かれたら待ちきれずに落ちる。
  実装者の報告でも、`parseInt()` を外すと落ちている

### `CLAUDE.md`

- 「値の型も確かめる」の段落は実装と合っている（盤面を書き換える前、`list[X]` は
  中身まで、bool の扱い、float に int、`list()` に写さない）
- `player_cookie.test.mjs` の説明も合っている

## 範囲外で気づいたこと（型ではなく値の範囲。依頼の外）

- ブラウザ以外から `NaN` / `Infinity` を送ると float として通る（実測。Python の
  `json.loads` はこれらを読む）。ブラウザの `JSON.stringify` は `null` にするので、
  今のクライアントからは届かない
- `dice` の長さは見ていない。`[]` や `[1, 2]` も通る（実測）
