# TODO-026 reviewer 報告

メッセージの型付けと `on_json()` のディスパッチ表化のレビュー。
**コードは直していない。**

対象: 作業ツリーの未コミット差分（`git diff bbe50a2`）。
比較元: `bbe50a2`（旧 `on_json()` は `src/ytbg/server.py:289〜438`）。

## 結論

**重大なものは 0 件。** 旧 23 分岐と新ハンドラの対応（呼ぶメソッド、
引数、順序、ログ、戻り値の `None` / `float`）は 1 つずつ突き合わせて
一致を確認した。共通の後処理も同じ順序・同じ引数。
「挙動は変えない。例外は 1 点だけ」という約束に対して、
**例外がもう 2 件ある**（下の 1 と 2）。どちらも `ytbg.js` からは
到達しない経路なので、直すか記録に残すだけにするかは main の判断。

## 重大なもの

なし。

## 直したほうがよいもの

### 1. `cube` の `data` が緩かったのが厳しくなった（実測）

`src/ytbg/message.py:90-93` / 旧 `server.py:361-363`

旧は `self._gameinfo.cube(msg['data'])` → `CubeState.from_dict(data)` を
**`strict=False`** で呼んでいた（`src/ytbg/gameinfo.py:71-79`）。
`side` / `value` / `accepted` が欠けても既定値
（`-1` / `1` / `True`）で通る。
新の `CubeData.from_dict()` は 3 つとも `data['...']` で引くので `KeyError`。

実測:

```
old CubeState.from_dict({'side':1,'value':4}) -> CubeState(side=1, value=4, accepted=True)
new parse({'type':'cube','data':{'side':1,'value':4},...}) -> KeyError 'accepted'
```

実経路では変わらない。`ytbg.js` の `Cube.emit()` を呼ぶ 3 か所
（`ytbg.js:1340` / `1350` / `1365`）は `accepted` に真偽値のリテラルを
渡しており、`side` は `undefined` のとき `-1` に置き換えている
（`ytbg.js:1249-1257`）。`value` が `undefined` になる経路は追い切れて
いない（**未確認**）。

これは implementer が「判断が要る点 1」に挙げた
「`msg['data']` と `msg['history']` を全 type で必須にした」とは
**別の経路**。あちらは msg のトップレベルのキー、こちらは `data` の
中身で、しかも旧の寛容さは `CubeState.from_dict` の `strict=False` から
来ている。`data` の中身で旧が寛容だったのは 23 type 中この 1 つだけ
（他は `GameInfo` / `Clock` 側も `data['...']` で直接引いていた。
`set_gameinfo` は旧も新も `GameInfo.from_dict()` の非 strict のまま）。

### 2. `type` がハッシュ不可のときだけ「無視」にならない（実測）

`src/ytbg/message.py:260`

`DATA_TYPES.get(msg_type)` は `msg_type` が `list` / `dict` のとき
`TypeError: cannot use 'list' as a dict key` を上げる（実測）。
旧は `msg['type'] == 'back'` の比較なので、素通りして末尾へ落ちていた。

約束は「登録表に無い `type` は警告を出して無視する」だが、この場合だけ
警告ではなく `app.py:101` の受け皿（`svr.on_error()`）へ行く。
接続は保たれるので実害は小さいが、`UnknownMessageType` の扱いと
食い違う。JSON なので `type` が list / dict になるのは壊れた
クライアントだけ。

### 3. `tests/test_ws.py` の末尾マーカー `##` が中に取り残された

`tests/test_ws.py:184`

新しい `test_unknown_type_keeps_connection` が `##` の**後ろ**に
足されているため、ファイル末尾が `##` でなくなった。
`src/ytbg/*.py` は全ファイルが `##` で終わっており、`test_ws.py` も
`bbe50a2` では末尾にあった（`tests/` 全体では元々まちまちで、
`test_clock.py` などは付いていない）。

### 4. `CLAUDE.md` の書き足しに、`data` / `history` が全 type で必須に
なったことが書かれていない

`CLAUDE.md:218-243`

書いてあるのは「**`data` のキーが**足りなければ入口で `KeyError`」で、
`back` / `back2` / `clear_hist` などが `msg['data']` と `msg['history']`
そのものを要求するようになった点（旧はそれらを読まずに `return`）は
読み取れない。implementer が挙げた挙動の変化なので、CLAUDE.md か
archives のどちらかに残しておきたい。

### 5. 「警告をログに出して」がテストで見られていない

`tests/test_on_json.py:608-627`、`src/ytbg/server.py:532-536`

`test_unknown_type_is_ignored` は「積まない・送らない・変えない」は
見ているが、`self.__log.warning()` を消しても 1 件も落ちない。
README の 4 番は「**警告をログに出して**無視する」なので、そこだけ
見られていない。loguru は `caplog` に乗らないので手間はかかる。
重要度は低い。

## 好みの問題

### 6. `list()` のコピーが二重になっている

`src/ytbg/message.py:105`（`DiceData`）、`:181`（`PlayerClockData`）

渡し先の `GameInfo.dice()` が `list(data['dice'])`
（`gameinfo.py:194`）、`Clock.set_clock()` が `list(clock)`
（`clock.py:154`）で既にコピーを作るので、結果は変わらない。
旧は msg 内のリストをそのまま渡していた。新の形のほうが
frozen dataclass としては筋が通るので、**指摘というより記録**。

### 7. `docs/design.md` の「20 個の `if`」は実際は 23

`docs/design.md`（「メッセージの型付けとディスパッチ」）。
`bbe50a2` より前からある記述で、今回の差分の範囲外。

## 確かめたこと（問題なし）

- **type の集合が完全一致。** 旧 `on_json()` の `msg['type'] == '...'`
  から機械的に抜いた 23 個と、`message.py` の `DATA_TYPES`、
  `server.py:87-114` の `_handlers` の 3 つを `diff` して差分なし。
  旧にあって新に無い type も、その逆も無い
- **return / 末尾落ちの対応。** `None` を返すのは
  `back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` /
  `clear_hist` / `new` / `set_gameinfo` の 9 個で、旧で `return` して
  いた 9 個と一致。`float` を返すのは残る 14 個で、旧で末尾へ落ちて
  いた 14 個と一致。`put_checker` だけ `SEC_CHECKER_MOVE`、
  他 13 個は `0`（旧の
  `sec = SEC_CHECKER_MOVE if ... else 0` と同じ）
- **`0` と `None` を取り違えない。** `server.py:539` は
  `if sec is None:` で、真偽値ではなく `is None` で判定している
- **各分岐の中身。** 呼ぶメソッド・引数・順序・ログが旧と一致。
  特に `put_checker` の `p >= 26` の DEBUG ログ、
  `set_clock_limit` の `reset(0)` / `reset(1)`、
  `set_clock_switch` の `save_data()`、`set_gameinfo` の
  `stop_all()` → `add_history()` → `emit_gameinfo(0)` の順、
  `new` の `emit_gameinfo(3, False)`、`clear_hist` の
  `_replayer.run(self.clear_history)` → `emit_gameinfo(0)`、
  `back2` / `fwd2` の `sleep_sec=.5`
- **末尾の後処理。** `if m.history: self.add_history(self._gameinfo)` →
  `await self.emit_gameinfo(sec, history_flag=False, last_op=m.raw)` で、
  順序も引数も旧と同じ。`m.raw` は受け取った msg そのもの
  （`test_parse_keeps_history_and_raw` が `is` で見ている）
- **例外の行き先。** `parse()` の `KeyError` は `on_json()` が握らず、
  `app.py:99-104` の `except Exception` が拾って接続を保つ。
  `UnknownMessageType` だけ `server.py:532` が握って `return`
- **当て直しの取りこぼしは無い。** `git diff bbe50a2 -- src/ytbg/server.py`
  のハンクは 3 つだけ（import、`__init__` の `_handlers`、
  `on_json()` とハンドラ）。`on_json()` とハンドラ以外は
  `bbe50a2` と同一
- **`data` 無しで送っているところは無い。** `ytbg.js` の送信は
  `emit_msg()`（`ytbg.js:88-96`）の `ws.send` 1 か所だけで、
  `type` / `data` / `history` を必ず付ける。`tests/` の
  `on_json()` 呼び出しと `send_json()` もすべて 3 つ揃っている。
  `tests/browser/` は UI 操作なので `emit_msg()` を通る
- **テストが狙いを見ている。**
  `test_tables_have_same_keys` は片方の表にだけ足す / 片方から外すと
  落ちる（両方から同時に消えた場合は捕まえないが、そのときは
  各 type の振る舞いのテストが落ちる）。
  `test_unknown_type_is_ignored` は `history: True` で送っていて、
  旧の挙動（末尾へ落ちて履歴に積み `gameinfo` を返す）との差が
  出る形になっている。
  `test_unknown_type_keeps_connection` は、未知 type が何か返したら
  最初の受信の `last_op` が `put_checker` でなくなるので落ちる
- **行長。** 78 **文字**超は `tests/test_on_json.py:315, 342, 371` の
  3 行だけで、いずれも `bbe50a2` に既にある（今回の追加分ではない）。
  `message.py` / `server.py` / `test_message.py` / `CLAUDE.md` の
  追加分に超過なし
- `uv run pytest` を自分でも実行して 205 passed / 終了コード 0
