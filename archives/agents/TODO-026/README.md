# TODO-026 の分担

メッセージを型付けし、`on_json()` をディスパッチ表にする項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— 23 個の分岐を移す
- **reviewer**（Opus 5 に上書き）— **分岐の構造そのものを変える。**
  「前半は return し、後半は末尾の `add_history` と `emit_gameinfo()` へ
  落ちる」2 段構造を戻り値で表し直すので、落ち先を取り違えても
  気づきにくい
- **verifier**（定義のまま Sonnet 5）— 4 つの検証と、`src/` を壊して
  落ちること

**reviewer を先に、verifier を後に回す**（TODO-025 と同じ。同じ作業ツリーを
verifier が壊しては戻すので、並行にすると reviewer が「壊した版」を読む）。

## main が決めたこと（実装の前提）

`docs/design.md` の「メッセージの型付けとディスパッチ」に加えて、
着手時に main が決めた分。**迷ったらここに従う。**

### 1. `message.py` が持つもの

- **type ごとの frozen dataclass**（`data` の中身を表す）。
  `data` が空のものは共通の `NoData` を使う
- **`parse(msg)`** — `type` を見て組み立てる。返すのは次の frozen dataclass

```python
@dataclass(frozen=True)
class Message:
    type: str
    data: object     # type ごとの dataclass
    history: bool
    raw: dict        # 受け取った msg そのまま（last_op に要る）
```

- `data` のキーが足りなければ `parse()` の中で例外になる。
  **奥の `msg['data']['n']` で `KeyError` にしない**のがこの項目の眼目
- 登録表に無い `type` のときは、専用の例外
  （`UnknownMessageType` のような名前）を上げる

### 2. 表は 2 つになるが、ずれないようにする

`message.py` が「type → dataclass」、`server.py` が「type → ハンドラ」を
持つ。**2 つの表のキーの集合が一致することを見るテストを必ず足すこと。**
片方だけに足したときに落ちるようにする。

### 3. ハンドラの形

**全部 `async def` にして、戻り値を `float | None` にそろえる。**

| 戻り値 | 意味 | 対象 |
|--------|------|------|
| `None` | 自分で送信済み。共通の後処理をしない | `back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` / `clear_hist` / `new` / `set_gameinfo` |
| `float` | アニメーションの秒数。`history` フラグを見て履歴へ積み、`emit_gameinfo()` | 盤面とクロックを変える 14 個 |

後処理は次の形。**いまの末尾と同じ順序・同じ引数にすること。**

```python
sec = await handler(m)
if sec is None:
    return
if m.history:
    self.add_history(self._gameinfo)
await self.emit_gameinfo(sec, history_flag=False, last_op=m.raw)
```

`put_checker` のハンドラだけが `SEC_CHECKER_MOVE` を返し、
残りの 13 個は `0` を返す（いまの
`sec = SEC_CHECKER_MOVE if msg['type'] == 'put_checker' else 0` と同じ）。

### 4. 挙動は変えない。例外は 1 つだけ

**登録表に無い `type` は、警告をログに出して無視する**（履歴に積まず、
`gameinfo` も送り返さない）。接続は保つ。
**それ以外は 1 つも変えない。** 特に:

- `set_clock_limit` が両方のクロックを `reset()` すること
- `set_clock_switch` が `save_data()` を呼ぶこと（TODO-024）
- `set_gameinfo` が `stop_all()` すること
- `put_checker` で `p >= 26` のときの DEBUG ログ
- `clear_hist` が `_run_replay()` 相当（`Replayer.run()`）を通ること
- `new` が `emit_gameinfo(3, False)` を呼ぶこと

### 5. 型注釈

`message.py` は完全に型を付ける。`server.py` のハンドラも
`-> float | None` を書く。`mypy src` が通ること。

## 報告

- [implementer-report.md](implementer-report.md)
- [reviewer-report.md](reviewer-report.md)
- [verifier-report.md](verifier-report.md)
