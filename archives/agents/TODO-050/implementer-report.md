# TODO-050 implementer 報告

## 変えたファイルと要点

- `src/ytbg/message.py`
  - `DATA_TYPES` / `NO_HISTORY_TYPES` / `parse()` を消した。残るのは dataclass と例外（`UnknownMessageType`）と `Message`
  - dataclass を足した: `ResignData`（`player, score`。130 行）、`OpeningData`（`winner`。137 行）、`MoveData`（`player, moves: list[PutCheckerData], dice, score`。143 行）
  - `roll` は `DiceData`、`end_turn` / `double` / `take` / `cancel_double` は `PlayerData` をそのまま使う（形が同じなので新しく作らなかった）
- `src/ytbg/gameinfo.py`
  - `CUBE_MAX = 64` / `SCORE_MAX = 99`（55 行付近）
  - `resign_game(ResignData)`（220 行）: `turn = -1`、`resign = player`、相手の得点に `score`（上限 99）
  - 足したメソッド: `_add_score()`、`opening()`（240）、`move()`（263）、`end_turn()`（278）、`double()`（284）、`take()`（292）、`cancel_double()`（297）。いずれも dataclass を受け取る（TODO-038 の慣習どおり）
- `src/ytbg/server.py`
  - `self._handlers` を消した
  - ハンドラを足した: `_on_roll` 〜 `_on_cancel_double`（428 行〜）、`_switch_clock(player)`（423。`stop(player)` → `start(1 - player)`）、`_switch_to_turn()`（477。`turn` が 0 / 1 のときだけ `_switch_clock(1 - turn)`）
  - `_on_set_clock_switch`: `Clock.stop(0)` / `stop(1)` のあとで `set_switch()`（536 行）
  - `on_json()`（562 行）: 処理の前の `turn` を覚え、`float` を返したときに `turn0 != -1 and turn == -1` なら `Clock.stop()` を 2 回（593 行）。そのあと `msg_type.history and (m.history or m.type in NAMED_TYPES)` で履歴へ積む
  - モジュールの末尾に `MessageType`（610）、`MESSAGE_TYPES`（631）、`NAMED_TYPES`（680）、`parse()`（686）
- `tests/test_named_ops.py`（新規）: 8 つの操作、勝負がついたときのクロック、`set_clock_switch`、履歴の表のテスト（33 件）
- `tests/test_message.py`: import 先を `ytbg.server` に、`SAMPLES` と欠落キーの例に 8 つを足した。`resign` を `{player, score}` に。「2 つの表のキーが一致」と「NO_HISTORY_TYPES が部分集合」のテストを消した
- `tests/test_on_json.py`: `resign` の data を `{player, score}` に（2 か所）
- `tests/test_clock.py`: `test_clock_does_not_advance_while_switch_off` を直した（sw を on に戻すとクロックは止まっているので、`resume_clock` を送ってから進める）。docstring の `NO_HISTORY_TYPES` を書き換え
- `tests/test_save_load.py`: docstring の `NO_HISTORY_TYPES` を書き換え
- `tests/browser/predict.test.mjs`: 「予測はサーバへ何も送らない (turn が -1 に変わっていても)」を消し、先頭のコメント（見ているもの 5 つ → 4 つ）を直した
- `CLAUDE.md`「状態と通信」: 履歴に積む type の段落、`parse()` の場所、登録表の段落、ハンドラの戻り値と後処理の順、クロックの切り替え、type を足す手順を書き直した

## 表の形

```python
@dataclass(frozen=True)
class MessageType:
    make_data: Callable[[dict[str, Any]], Any]
    handler: Callable[[BackgammonServer, Message], Awaitable[float | None]]
    history: bool

MESSAGE_TYPES: dict[str, MessageType] = {
    'back': MessageType(HistStepData.from_dict, _S._on_back, False),
    ...
    'roll': MessageType(DiceData.from_dict, _S._on_roll, True),
    ...
}
```

- ハンドラはクラスから引いた関数（`_S = BackgammonServer`）で、`on_json()` が `handler(self, m)` と呼ぶ。`parse()` をモジュールの関数のまま置くため、表もモジュールに置いた
- `history` の値: 積む = 8 つ + `put_checker` / `dice` / `set_playername` / `set_score` + 古い `cube` / `set_turn`。積まない = クロック系 6 つ。自分で送る 9 つは見ないので `False`

## わざと壊して確かめたこと

`src/` の 1 か所ずつを書き換えて `uv run pytest -x` を走らせ、終わるたびに元へ戻した（最後に退避したファイルとの `diff` が空であることを確かめた）。20 通りすべてで落ちた。

| 壊したところ | 落ちたテスト（最初の 1 件） |
|---|---|
| `on_json()` のクロック停止の条件を `if False:` | `test_turn_to_minus1_stops_both_clocks[resign]` |
| 同じ条件から `turn0 != -1` を外す | `test_take_outside_turn_does_not_touch_clock[-1]` |
| `_on_set_clock_switch` の `stop()` 2 回を消す | `test_clock.py::test_clock_does_not_advance_while_switch_off` |
| 履歴の条件から `NAMED_TYPES` を外す | `test_named_ops_append_history_without_flag[roll]` |
| 履歴の条件から `msg_type.history` を外す | `test_clock.py::test_clock_types_skip_add_history_call[set_clock_limit]` |
| `_switch_to_turn` を `_switch_clock(turn)` に | `test_take_accepts_and_runs_turn_clock` |
| `double` で `1 - player` を止める | `test_double_doubles_cube_and_switches_clock` |
| `end_turn` のクロック切り替えを消す | `test_end_turn_passes_turn_and_switches_clock` |
| `cancel_double` で `player` を止める | `test_cancel_double_halves_and_runs_turn_clock` |
| `_switch_clock` の `stop()` を `stop_all()` に | `test_end_turn_passes_turn_and_switches_clock` |
| 表の `opening` の history を `False` に | `test_table_history_values` |
| `opening` の並びを `[敗者, 0, 0, 勝者]` に | `test_opening_puts_winner_dice_first` |
| `opening` で 0 を読み飛ばさない | `test_opening_puts_winner_dice_first` |
| `opening` の引き分けで `turn = 2` を消す | `test_opening_draw_clears_dice_and_turn_2` |
| `CUBE_MAX = 128` | `test_double_is_capped_at_64` |
| `SCORE_MAX = 100` | `test_move_score_is_capped_at_99` |
| `cancel_double` の置き場所を `1 - player` に | `test_cancel_double_halves_and_runs_turn_clock` |
| `resign` で自分の得点に足す | `test_resign_ends_game_and_adds_score` |
| `move` の `score >= 1` で `turn = -1` にしない | `test_move_with_score_ends_game` |
| `end_turn` でダイスを空にしない | `test_end_turn_passes_turn_and_switches_clock` |

`take` / `cancel_double` のテストは、`player` と `1 - turn` が違う値になるように組んである（同じ値だと「`player` で決めている」実装と区別が付かない）。

## 検証の結果

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 269 passed、終了コード 0。警告 1 件は starlette の `DeprecationWarning`（変更前からある） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues |
| `uv run basedpyright` | 0 errors, 0 warnings |
| `node --test tests/js/` | 99 pass |
| `node --test tests/browser/`（1 回） | 60 pass、終了コード 0 |

## 迷って決めたこと

- **`move` は `SEC_CHECKER_MOVE` を返す**。設計に秒数の指定は無いが、駒が動くので `put_checker` に合わせた
- **`take` / `cancel_double` は、`turn` が 0 / 1 のときだけクロックを切り替える**。`turn` が 2 や -1 のとき `1 - turn` を添字にすると、Python の負の添字で別のプレーヤーを指すため。指示には無い条件
- **`cancel_double` の値は `max(value // 2, 1)`**。値が 1 のまま届いても 0 にしない
- **`turn` の判定は `== -1`**（`< 0` ではない）。設計の書き方どおり
- **`parse()` は今もメッセージの `history` を必須にしている**（新しい 8 つでも）。TODO-051 で消す範囲なので残した
- **新しい 8 つを見分けるために `NAMED_TYPES`（frozenset）を置いた**。表の外にもう 1 つ集合があることになるが、TODO-051 で `history` の条件と一緒に消すための一時的なもの（コメントに書いた）
- **勝負がついたときのクロック停止は `float` を返すハンドラのあとだけ**。`back` / `fwd` や `set_gameinfo` で `turn` が -1 になっても、この処理は通らない（`set_gameinfo` は元から `stop_all()`）
- `tests/test_named_ops.py` の `fake_time` フィクスチャは `tests/test_clock.py` の写し。conftest へ移すのは指示の範囲外なのでやめた

## 範囲外で気づいたこと

- `docs/Developer.md` の 50・77・132〜138・153・165 行が、`message.py` の `parse()` / `DATA_TYPES` / `_handlers` / `NO_HISTORY_TYPES` のままになっている（文書は触らない決まりなので直していない）
- `CLAUDE.md` の「構成」節にある `gameinfo.py` の説明（更新のメソッドの一覧）に、今回足したメソッドが載っていない。指示の範囲が「状態と通信」だけなので触っていない

## レビュー後の修正

レビュー（`reviewer-report.md`）を受けて、管理者の指示 1〜4 を直した。`docs/design.md` と `TODO.md` は触っていない。

### 1. 盤面と合わない名前付きの操作を捨てる

- `src/ytbg/gameinfo.py`: `resign_game()`（219）、`opening()`（249）、`end_turn()`（293）、`double()`（306）、`take()`（325）、`cancel_double()`（338）が `bool` を返すようにした。盤面と合わなければ何も変えずに `False`
  - `double`: `cube.side == p or (cube.accepted and cube.side == -1)`（「テイク済みで中央か p の側」または「未テイクで p の側」と同じ意味）
  - `take`: 未テイクで `side == p`。`cancel_double`: 未テイクで `side == 1 - p`
  - `resign`: `turn == -1` なら捨てる。`end_turn`: `turn != p` なら捨てる。`opening`: `turn < 2` なら捨てる
  - `move()`（277）は捨てない。`turn` が既に -1 なら駒とダイスだけ置き、得点も `turn` も変えない
- `src/ytbg/server.py`: `_ignore(m)`（428）を足した。警告をログに出す。ハンドラは `_ignore()` のあとで `None` を返すので、クロックの停止・履歴・送信を通らない（ハンドラの戻り値の説明も「捨てた」を含むように直した）
- 今のクライアント（`ui/cube.js` の `on_mouse_up_xy()`、パスのバナー）の操作と照らした。リダブルは「未テイクでキューブが自分の側」、取り消しは「未テイクでキューブが相手の側」、パスは `player = turn` で、どれも捨てる条件に当たらない。今のクライアントは新しい 8 つをまだ送らないので、`tests/browser/` への影響は無い。**不自然な条件や、正しい操作を捨ててしまう場面は見つからなかった**

### 2. 履歴の操作ではクロックを止めない

コードは変えていない。`CLAUDE.md`「状態と通信」の後処理の手順のすぐ下（421 行）に書いた。

### 3. テストの取り違え

`tests/test_named_ops.py` の `CUBE_CASES`（172）で、`double` / `take` / `cancel_double` を「通常」と「ビーバー（player が逆）」の 2 通りで parametrize した。

### 足したテスト

- `test_named_op_twice`（438）: `opening` / `end_turn` / `double` / `take` / `cancel_double` / `resign` を 2 回送る。1 回目は効き、2 回目は盤面・履歴・クロックが変わらず、何も送らない
- `test_move_twice_sends_but_does_not_add_score`（450）
- `test_named_op_not_matching_board_is_ignored`（490）: 条件ごとに合わない盤面 12 通り
- `test_redouble_is_accepted`（512）
- 既存のテストで、捨てる条件に当たるようになったものの準備を直した（`opening` の引き分けのテストで `turn = 0` にしていたのをやめた、`take` の `turn` が 0 / 1 以外のテストで未テイクのキューブを置いた、履歴のテストで操作ごとに `turn` とキューブを決めた）
- 準備に使う `CubeState` はテストどうしで共有しないよう、`copy.deepcopy()` してから盤面に置く（共有すると前のテストで書き換わり、単独では通るのに続けて走らせると落ちた）

### 4. 細かいもの

- `CLAUDE.md` の「構成」の `gameinfo.py`（223 行〜）に新しいメソッドと、`resign_game()` が `turn` と得点も変えること、`False` を返すことを書いた
- 「状態と通信」で「`on_json()` の `NAMED_TYPES`」を「`server.py` の `NAMED_TYPES`」に直した。捨てる条件の表も足した（424 行〜）
- `CUBE_MAX` / `SCORE_MAX` を import の直後（`gameinfo.py:35`）へ移した
- `tests/test_save_load.py:124` を折り返した（表示幅 78 以内）。`tests/test_named_ops.py` にあった 78 超えの 1 行も折った。`tests/test_save_load.py:163`（79）は変更前からあるので触っていない
- レビュー 4（`move` の途中の例外）は直していない

### わざと壊して確かめたこと

前回と同じく 1 か所ずつ書き換えて `tests/test_named_ops.py` を走らせ、戻した（退避したファイルとの `diff` が空であることを確かめた）。

| 壊したところ | 落ちたテスト |
|---|---|
| `_switch_to_turn` を `_switch_clock(1 - player)` に（レビュー 3） | `test_take[normal]`、`test_take[beaver]`、`test_cancel_double[normal]`、`[beaver]` ほか計 9 件 |
| `_on_double` を `_switch_clock(turn)` に（レビュー 3） | `test_double[beaver]` |
| `_on_double` を `_switch_clock(1 - player)` に | `test_double[normal]`、`[beaver]` |
| `double` の条件を「テイク済みで中央か p の側」だけに（リダブルを捨てる） | `test_double[beaver]`、`test_redouble_is_accepted` |
| `double` の条件を `side in (-1, p)` に（未テイクで中央を通す） | 最初は落ちなかった。「未テイクで中央」の場合を足して `test_named_op_not_matching_board_is_ignored[double-...cube02...]` で落ちることを確かめた |
| `double` の条件を消す | `test_named_op_twice[double]` ほか 3 件 |
| `take` の条件から `side != p` を外す | `test_named_op_not_matching_board_is_ignored[take-...cube03...]` |
| `take` の条件から `accepted` を外す | `test_named_op_twice[take]` ほか 2 件 |
| `cancel_double` の条件から `side` を外す | `...[cancel_double-...cube05...]` |
| `cancel_double` の条件から `accepted` を外す | `...[cancel_double-...cube04...]` |
| `resign_game` の `turn == -1` の条件を消す | `test_named_op_twice[resign]` ほか 2 件 |
| `move` の `turn != -1` を消す | `test_move_twice_sends_but_does_not_add_score` |
| `end_turn` の条件を `turn < 0` に | `test_named_op_twice[end_turn]` ほか 3 件 |
| `opening` の条件を `turn == -1` に | `test_named_op_twice[opening]` ほか 2 件 |
| `_on_take` が捨てたときに `0` を返す（後処理へ進む） | `test_named_op_twice[take]` ほか 3 件 |

### 検証の結果

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 292 passed、終了コード 0（警告 1 件は starlette のもので変更前からある） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues |
| `uv run basedpyright` | 0 errors, 0 warnings |
| `node --test tests/js/` | 99 pass |
| `node --test tests/browser/`（1 回） | 60 pass、終了コード 0 |

### 残る懸念

- `double` の条件は `turn` を見ていない（指示どおり）。手番でない側が中央のキューブで掛けても受け付ける。重複を防ぐ目的では要らないが、ルールとしては手番の人しか掛けられない
- `cancel_double` でリダブルを取り消すと、キューブは取り消した人の側にテイク済みで置かれる（今の `Cube.cancel_double()` と同じ）

## 型の確かめ

最初の依頼では、今のクライアントが弾かれる値を送る箇所が 2 つ見つかったので実装を止めて報告した（投了ボタンの `resign` が文字列 `"0"` になる、`clock_limit` が小数になりうる）。管理者の決定（`load_player()` で数に直す、`clock_limit` を `float` にする）を受けて実装した。

### 変えたところ

- `src/ytbg/server.py`
  - `parse()`: `make_data()` で組み立てたあと、`_type_ok(type(data), data)` が偽なら `TypeError`（盤面を書き換える前）。`on_json()` の中で起きるので、`app.py` の受信ループがログに出して接続を保つ（`KeyError` と同じ扱い）
  - `_type_ok(tp, value)`（`parse()` の下）: 注釈から確かめる。dataclass は `get_type_hints()` でフィールドごと、`list[X]` は中身ごと。`bool` の値は注釈が `bool` のときだけ通す（int と float に bool を通さない）。`float` には int も通す。それ以外（`int` / `str` / `bool` / `dict[str, Any]`）は `isinstance(value, get_origin(tp) or tp)`。type ごとの手書きは無い
- `src/ytbg/message.py`
  - `ClockLimitData.clock_limit` を `float` に
  - `DiceData` / `PlayerClockData` の手書きの `from_dict()`（`list()` で写していた）を消して `_FromDict` にした。`list()` で写すと、`""` や `{}` が空の list に、`"1234"` が文字の list になり、「list でない」を弾けないため。書き換える側（`GameInfo.dice()` / `move()`、`Clock.set_clock()`）は元から `list()` で写している
  - `MoveData.from_dict()`: `moves` が list のときだけ `PutCheckerData` に組み立て、list でなければそのまま入れて型の確かめで弾く。`dice` も写さない
- `src/ytbg/webroot/static/js/board.js` の `Board.load_player()`: cookie の値が `undefined` でなければ `parseInt()` する。`undefined` のときは今までどおり `undefined` を返し、コンストラクタが `set_player(0)` する。`board.player` を送る所はここから読むので、投了ボタン以外にあっても同じく直る
- `CLAUDE.md`「状態と通信」の `parse()` の段落に、値の型を確かめることと、list を写さないことを足した

### 今のクライアントが送る値

コードを読んで、`emit_msg()` の呼び出しをすべて見た。`board.player` を直に送るのは投了ボタンだけで、`Cube.double(this.board.player)` は中で `1 - player` にして数にする。名前と得点は `parseInt()` 済み。`put_checker` の `ch` は `parseInt()`、`p` / `idx` は数から計算した値。`tests/browser/` は 62 件すべて通った。

### Clock 側（`clock_limit` を float にした影響）

困るところは見つからなかった。`Clock.set_limit()` は値を入れるだけで、`reset()` が `list(self.limit)` で残り時間にする。`cur()` は元から小数を扱う（経過時間を引く）。保存は JSON なので小数のまま書け、読める。`Clock.DEF_LIMIT` の注釈は `list[int]` のままだが、`limit` 自体に注釈は無いので型チェックは通る。入力欄を空にしたときの `NaN`（`null` で届く）は、今回から弾かれる（今までは `Clock` に `None` が入っていた）。

### 足したテスト

- `tests/test_message.py`: `test_parse_raises_on_bad_value_type`（17 通り。文字列の player、bool の player と score、int のフィールドに float、bool のフィールドに 1、list でない dice（数・文字列・空文字）、list でない moves（空文字・dict）、中身が文字列や bool の dice、中身が文字列の moves、中身が文字列の clock、float に bool、str に数）、`test_parse_clock_limit_accepts_int_and_float`（90 と 90.5）
- `tests/test_named_ops.py`: `test_bad_value_type_changes_nothing`（文字列の player、bool の player、list でない dice、中身が文字列の moves、文字列の player の resign）。`TypeError` になり、盤面・履歴・クロックが変わらず、何も送らない
- `tests/browser/player_cookie.test.mjs`（新規）: cookie に `board{svr_id}_player=0` を入れて開き直し、`board.player` が数の 0 で、投了ボタン（`button_resign.on_mouse_down_xy()`）が送る `set_turn` の data が `{turn: -1, resign: 0}` になり、サーバが受け付けて `turn` が -1 になること

### わざと壊して確かめたこと

| 壊したところ | 結果 |
|---|---|
| `load_player()` の `parseInt()` を外す（直す前に戻す） | `player_cookie.test.mjs` が落ちた（`actual: '0', expected: 0`） |
| `parse()` の型の確かめを `if False:` に | 21 件落ちた（`test_parse_raises_on_bad_value_type` と `test_bad_value_type_changes_nothing`） |
| `_type_ok()` の bool の分岐を消す | 5 件（bool の player / score / dice の中身 / clock_limit） |
| list の中身を見ない | 4 件（dice・moves・clock の中身） |
| dataclass のフィールドを見ない | 21 件 |
| float に int を通す分岐を消す | 15 件（`set_clock_limit` / `set_player_clock` の正しい値が弾かれる） |
| `DiceData.from_dict()` で `list()` に写す形に戻す | `test_parse_raises_on_bad_value_type[roll-data8]`（`dice: ""`） |
| `MoveData.from_dict()` で list でない moves も組み立てる | `[move-data9]`、`[move-data10]`（`moves: ""` と `{}`） |

壊したファイルはそのたびに戻し、退避したファイルとの `diff` が空であることを確かめた。

### 検証の結果

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 316 passed、終了コード 0（警告 1 件は starlette のもので変更前からある） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues |
| `uv run basedpyright` | 0 errors, 0 warnings |
| `node --test tests/js/` | 99 pass |
| `node --test tests/browser/`（1 回） | 62 pass、終了コード 0 |

### 範囲外で気づいたこと

- `CLAUDE.md` の「実行」節にある `tests/browser/` のファイルの一覧に、`player_cookie.test.mjs` と（前からある）`predict.test.mjs` が載っていない。指示の範囲外なので触っていない
- `GameInfoData`（`set_gameinfo`）は `dict[str, Any]` なので、入れ物が dict かしか見ていない（TODO-051 で消す type）
- 値の範囲（`player` が 0 / 1 か、`p` が 0〜27 か）は確かめていない。依頼は型だけ
