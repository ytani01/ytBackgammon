# TODO-026 implementer 報告

メッセージの型付けと、`on_json()` のディスパッチ表化。

## 変更したファイル

### `src/ytbg/message.py`（新規、257 行）

- `UnknownMessageType`（message.py:24）— 登録表に無い `type`。
  `msg_type` 属性に受け取った値を持つ
- type ごとの frozen dataclass（message.py:31〜180）。
  `NoData` / `HistStepData` / `GameInfoData` / `PutCheckerData` /
  `CubeData` / `DiceData` / `TurnData` / `PlayerNameData` /
  `ScoreData` / `PlayerData` / `ClockLimitData` / `PlayerClockData` /
  `ClockSwitchData`。それぞれ `from_dict()` を持ち、キーは
  `data['...']` で引くので、足りなければそこで `KeyError`
- `DATA_TYPES`（message.py:183）— type → dataclass の登録表。23 件
- `Message`（message.py:212）— `type` / `data` / `history` / `raw`
- `parse(msg)`（message.py:232）

`resign` と `start` / `resume` / `stop` / `reset_clock` は `data` が
`{'player': int}` で同じなので、`PlayerData` を共有している。

### `src/ytbg/server.py`

- import に `dataclasses.asdict` と `message` の各クラス
  （server.py:20〜45）
- `self._handlers`（server.py:85〜114）— type → ハンドラの登録表。
  23 件。`message.py` の `DATA_TYPES` と同じ順・同じ区切りで並べた
- ハンドラ 23 個（server.py:299〜511）。すべて
  `async def _on_xxx(self, m: Message) -> float | None`。
  先頭で `data: PutCheckerData = m.data` と受け直しているのは、
  そこから先の属性参照を mypy に見てもらうため
- `on_json()`（server.py:513〜551）— `parse()` →
  `UnknownMessageType` なら警告して return → 登録表のハンドラ →
  戻り値が `None` なら return、そうでなければ
  `if m.history: add_history` と
  `emit_gameinfo(sec, history_flag=False, last_op=m.raw)`。
  README の 3 番の順序・引数のとおり

`put_checker` だけが `SEC_CHECKER_MOVE` を返し、残りの 13 個は `0`。
元の分岐のコメント（`set_clock_limit` の reset 2 回、
`set_clock_switch` の保存、クロック 5 つのまとめ）は、
対応するハンドラの docstring / コメントへそのまま移した。

### `tests/test_message.py`（新規、177 行）

- `SAMPLES` に 23 type ぶんの (data, 期待する dataclass) を並べ、
  `parse()` が型付きの dataclass を作ることを見る
- `test_samples_cover_all_types` — SAMPLES が全 type を覆うこと
  （登録表に足しただけで素通りしないように）
- `test_parse_keeps_history_and_raw` / `test_parse_data_is_frozen`
- `test_parse_raises_on_missing_key` — data のキー欠落 15 通り。
  `KeyError` の引数が足りないキー名であることまで見る
- `test_parse_raises_on_missing_msg_key` — `type` / `data` /
  `history` の欠落
- `test_parse_raises_on_unknown_type`、
  `test_parse_ignores_extra_data_keys`
- `test_tables_have_same_keys` — **2 つの表のキーの集合が一致する
  こと**（README の 2 番）

### `tests/test_on_json.py`（末尾に 2 件）

- `test_unknown_type_is_ignored` — 履歴に積まれず、`gameinfo` も
  送られず、`gameinfo` そのものも変わらず、例外も出ない
- `test_unknown_type_does_not_block_next_msg` — 無視したあと、次の
  メッセージは普通に処理される

### `tests/test_ws.py`（末尾に 1 件）

- `test_unknown_type_keeps_connection` — WebSocket 経路で、無視した
  あとも接続が保たれ、次の `put_checker` の `gameinfo` が届く
  （「接続は保たれる」を実際の受信ループで見るため、ここに置いた）

### `CLAUDE.md`

「状態と通信」の節に、`parse()` の型付け、2 つの登録表とキーの一致、
登録表に無い type の無視、ハンドラの戻り値の意味、type を足すときの
手順を足した（CLAUDE.md:213〜243）。

## 検証

いずれも作業ツリーが元の状態（壊していない状態）での結果。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 205 passed（終了コード 0。TODO-026 より前は 155） |
| `uv run ruff check .` | All checks passed!（0） |
| `uv run mypy src` | Success: no issues found in 12 source files（0） |
| `node --test tests/browser/` | pass 5 / fail 0（0） |

## わざと壊して確かめた結果（9 通り）

いずれも「落ちてほしいテストが落ちる」ことを確かめ、毎回元へ戻した。

| # | 壊した内容 | 落ちたテスト |
|---|-----------|-------------|
| 1 | `_on_put_checker` が `SEC_CHECKER_MOVE` ではなく `0` を返す（戻り値の取り違え） | `test_put_checker_sends_gameinfo_with_last_op`、`test_fallthrough_types_...[put_checker]`（2 件） |
| 2 | `_on_cube` が `0` ではなく `None` を返す（送信済みと取り違え） | `test_fallthrough_types_...[cube]`（1 件） |
| 3 | `_on_new` が `None` ではなく `0` を返す（送信済みなのに後処理へ落ちる） | `test_returning_types_do_not_broadcast_original_msg[new]`、`test_new_keeps_score_playername_limit_and_resets_board`（2 件） |
| 4 | `parse()` が未知の type で例外を上げず `NoData` にする | `test_parse_raises_on_unknown_type`、`test_unknown_type_is_ignored`、`test_unknown_type_does_not_block_next_msg`（3 件） |
| 5 | `_on_set_clock_limit` が `reset(1)` をしない | `test_set_clock_limit_resets_both_clocks`（1 件） |
| 6 | 登録表の `stop_clock` に `_on_resume_clock` を割り当てる | `test_stop_clock_freezes_elapsed`、`test_clock_ops_send_gameinfo_with_clock_state`（2 件） |
| 7 | `HistStepData.from_dict()` が `n` の欠落を既定値 1 で埋める | `test_parse_raises_on_missing_key[back]` / `[fwd]`（2 件） |
| 8 | `_on_set_clock_switch` が `save_data()` を呼ばない | `test_clock_switch_is_saved`（1 件） |
| 9 | 登録表から `reset_clock` を外す（2 つの表がずれる） | `test_tables_have_same_keys` を含む 4 件 |

1・2・3 が「戻り値の取り違え」を狙ったもの（README の指示は 2 つ以上）。
9 で、2 つの表のずれが `test_tables_have_same_keys` で捕まることを
確かめた。

## 判断が要る点

1. **`msg['data']` と `msg['history']` を、全 type で必須にした。**
   これまで `back` / `back2` などは `data` も `history` も読まずに
   return していたので、それらのキーが無い壊れたメッセージでも
   動いていた。`parse()` が入口でまとめて読むため、いまは
   `KeyError`（受信ループが握って接続は保つ）になる。
   `ytbg.js` の `emit_msg()` は必ず 3 つとも付けて送るので、
   実際の経路では変わらない。**README の「挙動は変えない」に対する、
   壊れたメッセージ限定のずれ**なので、報告する。
   戻すなら `parse()` を `msg.get('data') or {}` にできる
2. **`Message.data` の注釈は `Any`。** README は `object` と
   書いているが、`object` だとハンドラ側の `m.data.ch` が mypy で
   通らない。代わりに各ハンドラの先頭で
   `data: PutCheckerData = m.data` と受け直して、そこから先を
   mypy に見てもらう形にした
3. **`cube` / `dice` / `set_turn` / `set_playername` / `set_score` /
   `resign` は、ハンドラで `asdict(data)` に戻して
   `GameInfo` のメソッドへ渡している。** `GameInfo` 側は TODO-025 の
   ままで、dict を受け取る。ここを dataclass 渡しに変えると
   `gameinfo.py` の API と `tests/test_gameinfo_ops.py` まで
   変わるので、範囲外として触っていない

## 範囲外だが気づいたこと

- `_on_back2` / `_on_back_all` / `_on_fwd2` / `_on_fwd_all` /
  `_on_clear_hist` / `_on_new` は引数 `m` を使わない。表に載せる
  ために形をそろえた結果で、ruff の指摘は出ない（ARG は無効）
- `set_gameinfo` は `GameInfo.from_dict()` を strict なしで呼ぶので、
  キーが欠けた gameinfo でも既定値で通る（TODO-024 の決めごとの
  まま）。`parse()` は中身を見ていない
- `history` フラグの付け方の見直しは TODO-032 の範囲なので触らない。
  いまは `clear_hist` など「自分で送信済み」の 9 つでは
  `m.history` が読まれないまま捨てられる

## 残る懸念

- 作業の途中で `git checkout src/ytbg/server.py` を実行してしまい、
  未コミットだった `server.py` の変更を一度消した（壊して確かめる
  ための復元に使おうとした）。同じ内容を当て直し、以後は
  scratchpad へ取ったバックアップから戻す形に変えた。最終状態は
  上の検証のとおり全て通っている。**`git status` と、壊した版の
  文字列（`no_such_type` など）が `src/` に残っていないことも
  確認済み。**
