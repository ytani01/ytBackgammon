# TODO-026. メッセージを型付けし、on_json をディスパッチ表にする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 14,710 | 30,848 | 36% |
| implementer | Opus 5 | medium | 36,390 | 160,959 | 40% |
| reviewer | Opus 5 | high | 8,820 | 84,244 | 15% |
| verifier | Sonnet 5 | medium | 15,885 | 75,805 | 9% |
| 合計 |  |  | 75,805 | 351,856 | 概算 $9.0 |

- implementer と reviewer は定義のモデルが sonnet。分岐の構造を変える
  項目なので Opus 5 に上書きした。effort は定義の frontmatter の値
- TODO-025 と同じく **reviewer を先に、verifier を後に**回した
- implementer は 2 回動いている（指摘を直す回）

## きっかけ

`msg['data']['n']` のような生の dict へのアクセスが全域にあり、キーが
足りないと奥で `KeyError` になっていた。`parse()` で入口に寄せる。
戻り値の対応表は [`docs/design.md`](../docs/design.md) の
「メッセージの型付けとディスパッチ」にある。

**挙動は変えない。ただし 1 点だけ例外がある。**

### 決めたこと

**登録表に無い `type` は、警告をログに出して無視する**（履歴に積まず、
`gameinfo` も送り返さない）。接続は保つ。TODO-026 より前はどの `if` にも
当たらないまま末尾へ落ち、`history` フラグ次第で履歴に積まれて
`gameinfo` が送り返されていたが、これは意図した振る舞いではない。

着手時に main が決めた 5 点（`parse()` が返す `Message` の形、
2 つの表がずれないようにすること、ハンドラの戻り値、取りこぼしやすい
6 つ）は
[`archives/agents/TODO-026/README.md`](../agents/TODO-026/README.md) にある。

## やったこと

- `src/ytbg/message.py` を作った。`type` ごとの frozen dataclass 13 種と、
  `type` → dataclass の登録表 `DATA_TYPES`（23 件）、`parse(msg)`、
  `UnknownMessageType`。`parse()` が返す `Message` は
  `{type, data, history, raw}` で、`raw` は `last_op` に要る受け取った msg
- `src/ytbg/server.py` の `on_json()` にあった 23 個の `if` を、
  23 個の `async def` ハンドラと登録表 `self._handlers` に置き換えた。
  ハンドラの戻り値は `float | None` で、`None` は「自分で送信済み」、
  `float` は「アニメーションの秒数。`history` フラグを見て履歴へ積み、
  `emit_gameinfo()`」。秒数を返すのは `put_checker` だけ
- `data` と `history` は**全ての `type` で必須**になった。`back` や
  `clear_hist` のように中身を使わない `type` でも、キーが無ければ
  `parse()` で `KeyError`（旧は読まずに `return` していた）
- 文字列でない `type`（list / dict / 数値 / `None`）も
  「登録表に無い `type`」として扱う
- `tests/test_message.py` を足した。**2 つの表のキーの集合が一致することを
  見るテスト**を含む（片方だけに足すと落ちる）
- `CLAUDE.md` の「状態と通信」の節に、型付けとディスパッチ表を書いた
- `docs/design.md` の「20 個の `if`」を実数の 23 に直した

テストは 155 件から 210 件になった。

## 確かめたこと

`uv run pytest`（210 passed）、`uv run ruff check .`、`uv run mypy src`、
`node --test tests/browser/`（5 pass）がいずれも終了コード 0。

**reviewer が、旧 23 分岐を 1 つずつ新しいハンドラと突き合わせた**
（報告は [reviewer-report.md](../agents/TODO-026/reviewer-report.md)）。

- **`return` していた 9 個が `None` を返す 9 個と一致**、
  末尾へ落ちていた 14 個が `float` を返す 14 個と一致
- 旧の `msg['type'] == '...'` から機械的に抜いた 23 個、`DATA_TYPES`、
  `_handlers` の 3 つを `diff` して差分なし
- 各分岐の中身（呼ぶメソッド・引数・順序・ログ）も一致。
  `put_checker` の `p >= 26` の DEBUG ログ、`set_clock_limit` の
  `reset(0)` / `reset(1)`、`set_clock_switch` の `save_data()`、
  `set_gameinfo` の `stop_all()` → `add_history()` → `emit_gameinfo(0)` の順、
  `new` の `emit_gameinfo(3, False)` まで
- `server.py:539` が `if sec is None:` で、真偽値ではなく `is None` で
  判定していること（`0` と `None` を取り違えない）

**verifier が実際に動かして確かめたもの**（報告は
[verifier-report.md](../agents/TODO-026/verifier-report.md)）:

- 2 枚のタブで、ドラッグ・Roll・Cube（ダブル）・New Game・
  1 つ戻す / 1 つ進める・Clock のチェックボックスがいずれも効く
  （**ディスパッチ表への移し忘れは、自動テストより実操作で出る**）
- 登録表に無い `type` を送ってもサーバは落ちず、接続も切れず、
  そのあとの操作が通る。ログに警告が出る

**わざと壊して狙ったテストが落ちることを、実装側で 10 通り、
verifier が別に 4 通り確かめた。** うち 3 通りは「戻り値の取り違え」を
狙ったもの（`_on_new` が `None` ではなく `0` を返す、など）。
登録表から 1 つ外すと `test_tables_have_same_keys` が落ちることも確かめた。

## 残ること

- **`cube` の `data` だけ、旧は中身が緩かった。** 旧は
  `CubeState.from_dict(strict=False)` を経由していたので、
  `side` / `value` / `accepted` が欠けても既定値で通っていた。
  新は `KeyError`。**`ytbg.js` を読んで、3 つとも必ず送られることを
  確かめたうえで strict のままにした**（`value` は `Cube.set()` でしか
  書き換わらず、その引数はサーバの `CubeState` 由来なので `undefined`
  にならない）。他の 22 type は旧も `data['...']` で直接引いていた
- **「警告をログに出す」ことはテストで見ていない。** `self.__log.warning()`
  を消しても 1 件も落ちない。loguru は pytest の `caplog` に乗らないので
  手間がかかる。「積まない・送らない・変えない・接続が切れない」は
  見ている
- `cube` / `dice` / `set_turn` などのハンドラは、`asdict(data)` で dict に
  戻して `GameInfo` のメソッドへ渡している。`GameInfo` 側の API を
  dataclass 受けに変えるのは範囲外にした
- `set_gameinfo` は `GameInfo.from_dict()` を strict なしで呼ぶので、
  キーが欠けた gameinfo でも既定値で通る（TODO-024 の決めごとのまま）

## 分担の振り返り

- **reviewer が見つけたのは「旧だけが緩かった 1 か所」。** 23 type のうち
  `cube` だけが、旧は `CubeState.from_dict(strict=False)` を経由していて
  `data` の中身が欠けても通っていた。他の 22 個との違いなので、
  分岐を 1 つずつ突き合わせないと出てこない。**verifier の担当範囲の外**
- **implementer が自分の挙動変化を自分で報告した**（`data` と `history` を
  全 type で必須にしたこと）。報告に「判断が要る点」を書かせる形が効いた
- **verifier に「メニューとボタンをひととおり触る」ことを明示したのが
  効いた。** ディスパッチ表への移し忘れは、自動テストでは
  「そのテストが元から無い type」だと出ない
- **`git checkout` の事故があった。** implementer が壊して確かめる復元に
  `git checkout src/ytbg/server.py` を使い、未コミットだった変更を一度
  消した（当て直して事なきを得た）。2 巡目の依頼で
  「`git checkout` / `git restore` を使わない。scratchpad へバックアップを
  取ってから壊す」と明示したところ、事故は起きなかった。
  **この一文は次回以降も入れる**
- **見込みと食い違ったのは、料金が TODO-025 の $15.7 から $9.0 へ下がった
  こと。** reviewer の報告が短くて済んだ（要修正 0 件）ぶん、main の
  仕分けも軽かった
- **次に同じ規模（分岐の構造を変える）をやるなら、同じ組み方でよい。**
  reviewer への依頼に「**旧の全分岐を 1 つずつ突き合わせる**」と
  具体的な作業を書いたのが効いているので、そこは削らない
