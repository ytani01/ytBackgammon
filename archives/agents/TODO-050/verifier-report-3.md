# TODO-050 verifier 報告（3 回目・「型の確かめ」）

コードは変更していない。変更した箇所はすべて確かめたあと元に戻し、
`diff` が空であることを確認した。

## 1. すべての type の dataclass で、注釈どおりに確かめているか

`src/ytbg/server.py` の `_type_ok()`（749〜770 行）が、`parse()`（737〜739 行）
から呼ばれる。dataclass は `get_type_hints()` でフィールドを 1 つずつ、
`list[X]` は中身を 1 つずつ確かめる（type ごとの手書きではなく、共通の関数）。

- **int に bool**: `isinstance(value, bool)` を先に見て `tp is bool` でなければ
  弾く。`tests/test_message.py::test_parse_raises_on_bad_value_type`
  （`data2`: `double` の `player=True`、`data3`: `set_score` の `score=False`）
- **bool に 0/1**: 最後の分岐 `isinstance(value, get_origin(tp) or tp)` が
  `isinstance(1, bool)` で False。`data15`（`set_clock_switch` の
  `switch=1`）
- **float に bool**: `tp is float` の分岐は `isinstance(value, (int, float))`
  だが、bool は前の分岐で先に弾かれる。`data16`（`set_clock_limit` の
  `clock_limit=True`）
- **list に文字列・空文字・dict**: `get_origin(tp) is list` の分岐で
  `isinstance(value, list)` を見る。`data8`〜`data10`（`roll` の
  `dice=5/'1234'/''`、`move` の `moves=''`/`{}`）
- **moves の中身に文字列**: `MoveData.from_dict()` は list のときだけ
  `PutCheckerData.from_dict()` で組み立て、list でなければそのまま入れて
  `_type_ok()` で弾く構造。`data13`（`ch: '0'`）
- **list の中身に文字列・bool**: `data11`〜`data14`（`dice=[1,'2',0,0]`、
  `dice=[1,True,0,0]`、`clock=[90,'x']`）

`tests/test_message.py` の 1 パラメータ化テストで 17 通りをまとめて見ている。
足りない組み合わせは見当たらなかった（int に str、int に float も含む）。

## 2. 弾いたときに盤面・履歴・クロックが変わらず、送られず、接続が保たれるか

- 単体: `tests/test_named_ops.py::test_bad_value_type_changes_nothing`
  （540〜558 行）。`send()` 経由で `on_json()` を呼び、`TypeError` の発生と、
  `gameinfo` / 履歴の件数 / `clock.active` が変わらないこと、
  `emitted.messages == []` を見ている
- **WS 経路そのもの（`tests/test_ws.py`）にはこの型のテストが無い。**
  同ファイルにあるのは `KeyError`（`test_error_in_on_json_keeps_connection`）と
  `UnknownMessageType`（`test_unknown_type_keeps_connection`）だけで、
  「型が合わない `TypeError`」を WS 越しに送るテストは無い
- 上の抜けを、TestClient で実際に確かめた（`double` に `player: True` を
  送ったあと `put_checker` を送る）。ログに
  `ERROR ... TypeError("double: bad data: {'player': True}")` が出たあと、
  接続は切れずに次の `put_checker` を正常に処理した。
  `app.py` の受信ループ（95〜116 行）は `on_json()` を包む
  `except Exception` で拾っており、`KeyError` と同じ扱いになる作りなので、
  ロジックとしては筋が通っている。**ただしこれは自動テストではなく
  手元での確認であり、`tests/test_ws.py` にこの経路の回帰テストは無い**

## 3. 検証コマンド（すべてこのリポジトリで実行、終了コード 0）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 316 passed |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 99 pass, 0 fail |
| `node --test tests/browser/` | 62 pass, 0 fail |

## 4. 報告に無い壊し方（2 通り）

1. `_type_ok()` の bool/int 区別の分岐（`isinstance(value, bool): return
   tp is bool`）を削除 →
   `tests/test_message.py::test_parse_raises_on_bad_value_type[double-data2]`
   ほか 4 件が失敗（`DID NOT RAISE`）
2. `list[X]` の分岐から中身の確かめ（`all(_type_ok(...) for v in value)`）を
   外し、`isinstance(value, list)` だけにする →
   `[roll-data11]` ほか 4 件が失敗

いずれも壊した直後に対象テストが失敗することを確認し、その後
`\cp` でバックアップから戻して `git diff --stat src/ytbg/server.py` が
変更前の diff（268 insertions/46 deletions、TODO-050 全体の差分）と一致する
ことを確認した。最後に `uv run pytest` を通して 316 passed に戻ることを確認済み。

## 5. `from_dict()` の list 非コピーと共有の懸念

`DiceData` / `PlayerClockData` の `from_dict()` は `_FromDict`（キーをそのまま
写すだけ）になり、届いた JSON の list をそのまま `data.dice` /
`data.clock` として持つ。書き換え側での扱いを確認した。

- `gameinfo.py:201`（`dice()`）と `gameinfo.py:288`（`move()`）は
  `self.board.dice[data.player] = list(data.dice)` と、代入の直前で
  `list()` により写している
- `clock.py:152`（`Clock.set_clock()`）は `self.clock[player] =
  list(clock)` で同様に写している
- `move()` の `data.moves` はスカラー（`mv.ch` / `mv.p` / `mv.idx`）だけを
  `put_checker()` に渡し、`put_checker()` は `[p, idx]` という新しい list
  リテラルを `board.checker` に代入する（172〜185 行）。list そのものを
  使い回してはいない
- `data.dice` / `data.clock` / `data.moves` を直接（`list()` を通さず）
  `board` や `Clock` の内部状態へ代入している箇所は、grep で見た限り無かった

`Message.raw`（`last_op` として送り返す元の msg dict）と、書き換わる盤面の
list が同じオブジェクトを共有している箇所は見つからなかった。
コピーの責務が「届いた側」から「書き換える側」へ移っているだけで、
書き換える側は全箇所で `list()` を通してから代入していることを確認した。

## 変更ファイルの一覧と指示の範囲

`git status` の差分はすべて指示の範囲内（`src/ytbg/message.py` /
`server.py` / `webroot/static/js/board.js` の `load_player()`、`tests/`、
新規 `tests/browser/player_cookie.test.mjs`）に収まっている。
`CLAUDE.md` / `docs/design.md` / `TODO.md` / `gameinfo.py` の差分は
TODO-050 の前段（名前付き操作の実装）のもので、今回の「型の確かめ」の
節の対象外。指示に無いファイルの変更は見当たらなかった。

## 確かめられなかったこと・判断が要ること

- `tests/test_ws.py` に TypeError 経路の回帰テストが無い点は、実装の
  誤りではなく「テストが薄い」という指摘。追加するかどうかは管理者の判断
- `GameInfoData`（`set_gameinfo`）は型の確かめの対象が `dict[str, Any]` の
  「入れ物が dict か」だけで、中身は見ていない。報告どおり
  TODO-051 で消す予定の type なので、今回の範囲では問題ないと判断したが、
  「型の確かめ」全体としては手薄な箇所として認識しておくべき
