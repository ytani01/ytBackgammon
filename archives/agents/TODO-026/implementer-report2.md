# TODO-026 implementer 報告 (2 巡目)

reviewer の指摘のうち、main が選んだ 4 件への対応。
6 / 7 / 5 は指示どおり手を付けていない。

## 1. `cube` の `data`（結論: **直さない**。いまのまま strict）

`ytbg.js` を読んで確かめた。**3 つとも必ず送られる**ので、
`CubeData.from_dict()` は `data['...']` のままでよい。根拠:

`Cube.emit(val, player, accepted)`（`ytbg.js:1248-1258`）は
`{side, value, accepted}` を組み立てて送る。呼ぶのは 3 か所のみ
（`grep '\.emit('` で確認。`Cube` のインスタンス経由の外部呼び出しは
無い）。

- `side` — `emit()` の中で `player === undefined` なら `-1` に
  置き換える（`ytbg.js:1253-1256`）。よって常に数値
- `accepted` — 3 か所とも真偽値のリテラル。
  `double()` が `false`（`:1340`）、`accept_double()` が `true`
  （`:1350`）、`cancel_double()` が `true`（`:1365`）
- `value` — reviewer が未確認としていた箇所。`this.value` は
  コンストラクタで `1` に初期化され（`:1224`）、
  書き換えるのは `Cube.set()` の `this.value = val`（`:1274`）だけ。
  `set()` の呼び出しは `Board.load_gameinfo()` の
  `this.cube.set(c.value, c.side, c.accepted, false)`（`:3601`）
  1 か所で、`c` はサーバが返す `gameinfo.board.cube`。サーバ側の
  `CubeState` は `value` を必ず持つので `undefined` にならない。
  3 か所の呼び出しが渡す値も
  `this.value * 2`（`:1329`、64 で頭打ち）、`this.value`（`:1350`）、
  `this.value / 2`（`:1359`）で、いずれも数値

`double()` は `player === undefined` のとき早期 return する
（`:1322-1324`）ので、`this.player = 1 - player` が `NaN` になる経路も
無い。

## 2. `type` がハッシュ不可のとき

`src/ytbg/message.py:262-263` に

```python
    if not isinstance(msg_type, str):
        raise UnknownMessageType(msg_type)
```

を足した。`DATA_TYPES.get()` の前に置いたので、`list` / `dict` でも
`TypeError` にならず `UnknownMessageType`（＝警告を出して無視）に
なる。`parse()` の docstring（`message.py:253-256`）にも書いた。

テスト: `tests/test_message.py:163-178` に
`test_parse_raises_on_non_str_type` を追加。
`['back']` / `{'type': 'back'}` / `1` / `None` / `True` の 5 通り。

**わざと壊して確かめた**（`message.py` を scratchpad へ退避してから
上の 2 行を削除 → 元に戻した。`git checkout` は使っていない）:

```
FAILED tests/test_message.py::test_parse_raises_on_non_str_type[msg_type0]
FAILED tests/test_message.py::test_parse_raises_on_non_str_type[msg_type1]
2 failed, 50 passed
```

落ちるのは `list` と `dict` の 2 件で、どちらも
`TypeError: cannot use 'dict' as a dict key`。
`1` / `None` / `True` は元から `.get()` が `None` を返すので、
ガードが無くても通る（＝ガードで挙動が変わるのは list / dict だけ）。
戻したあとの `uv run pytest` は 210 passed。

## 3. `tests/test_ws.py` の末尾マーカー

`##` を `test_dropped_connection_is_removed` の直後から取り除き、
ファイル末尾（`tests/test_ws.py:207`）へ移した。行の入れ替えのみで
テストの中身は変えていない。

## 4. `CLAUDE.md`

- `CLAUDE.md:224-226` — 「**`data` と `history` は全ての `type` で
  必須**になった。`back` や `clear_hist` のように中身を使わない
  `type` でも、キーが無ければ `parse()` で `KeyError` になる（旧
  `on_json()` は読まずに `return` していた）」を追記
- `CLAUDE.md:234-235` — 「文字列でない `type` も同じ扱い」を追記
  （2 の変更ぶん）

## 変更したファイル

- `src/ytbg/message.py:253-256`（docstring）、`262-263`（ガード）
- `tests/test_message.py:163-178`（テスト追加）
- `tests/test_ws.py:184` 付近の `##` を削除し、`:207` へ
- `CLAUDE.md:224-226`、`:234-235`

## 検証

いずれも終了コード 0。

| コマンド | 結果 |
| --- | --- |
| `uv run pytest` | 210 passed、exit 0 |
| `uv run ruff check .` | All checks passed!、exit 0 |
| `uv run mypy src` | Success: no issues found in 12 source files、exit 0 |
| `node --test tests/browser/` | pass 5 / fail 0、exit 0 |

行長は Python で文字数を数えて確認。追加した行に 78 文字超は無い
（`CLAUDE.md:3` の 102 文字は元からある行）。

終了前の確認:

- `git status --short` — 変更は `CLAUDE.md` / `docs/design.md` /
  `src/ytbg/server.py` / `tests/test_on_json.py` / `tests/test_ws.py` と、
  未追跡の `src/ytbg/message.py` / `tests/test_message.py` /
  `archives/agents/TODO-026/`。壊した版は残っていない
  （`grep -n "isinstance(msg_type" src/ytbg/message.py` で
  ガードが在ることを確認）
- `docs/design.md` の変更は 1 巡目のもので、今回は触っていない

## 判断が要る点・残る懸念

- **`CLAUDE.md` を実装担当が直した。** main の指示（4 件目）に従ったが、
  実装担当の既定は「文書を触らない」なので、文面は main 側で
  見直してほしい
- 1 は「直さない」判断。`ytbg.js` 以外のクライアント（手書きの
  WebSocket など）が `accepted` を省いて送ると、旧は既定値で通った
  ところが `KeyError` になる。実クライアントは 1 つだけなので
  実害は無いという判断
- 5（警告がテストで見られていない）は指示どおり未対応
