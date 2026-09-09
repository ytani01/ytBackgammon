# TODO-005 reviewer 報告

対象: `git diff HEAD` ＋ 新規 `src/ytbg/mylog.py`（staged）。
コードは直していない。

---

## 要修正

### 1. CLAUDE.md:136-141 — 「出力しない水準で文字列を作らないため」が実測と合わない

`CLAUDE.md`（新しい「書き方の慣習」）と `TODO.md:48-50` は、`{}` と引数で渡す
理由を「出力しない水準で毎回文字列を作らないため」と書いている。**この
mylog.py では成り立たない。**

根拠（`mylog.py:136`）:

```python
logger.add(out, level=0, filter=_filter, format=LOG_FMT)
```

ハンドラを `level=0` で足し、水準の判定を `_filter`（レコード単位のフィルタ）で
行っている。loguru は `logger._log()` の中で **フィルタより前に**
`message.format(*args)` を実行するので、`core.min_level` が 0 の間は
**捨てるログでも必ず文字列が組み立てられる。**

実測（`loggerInit(False)` ＝ `-d` なし、DEBUG は出力されない状態）:

| 呼び方 | 1 回あたり |
|---|---|
| `log.debug('_gameinfo={}', gi)`（今の書き方） | 28.3 µs |
| `log.debug(f'_gameinfo={gi}')`（f-string） | 28.5 µs |
| 旧 `logging` の `log.debug('%s', gi)` | 0.2 µs |

- `__str__` を数えるオブジェクトを渡すと、抑制される DEBUG でも呼び出し回数が
  1 になる（＝文字列を作っている）ことを確認した
- つまり **`{}` と f-string に速度差は無く**、旧 `logging` に比べると
  抑制時が 100 倍以上遅い方向

実害の大きさは小さい（`gameinfo` は約 580 文字、28 µs／回。1 手あたり数回）。
ただし **規約の根拠として書かれている理由が事実と違う**ので、
`CLAUDE.md` の文言は直したい。ルール自体（`{}` と引数）を残すかは別の判断で、
残すなら「loguru の書き方に合わせる」「引数が構造化されて残る」などの
理由に置き換えるのが正しい。逆に f-string には後述 3 の書式エラーが
起きないという利点がある。

（`mylog.py` 側を直して `logger.add(..., level=logLevel(debug))` にすれば
本来の意図どおりになるが、mylog.py は tmr からのコピーで変えない方針なので
ここでは指摘のみ。tmr 側にも同じ性質がある。）

---

## 検討

### 2. tests/ で `loggerInit()` を呼んでいない — DEBUG が全部 stderr に出る

`tests/conftest.py:46` は `loggerInit()` を通らずに `ytBackgammonServer` を作る。
loguru は `logger.remove()` されるまで **既定ハンドラ（DEBUG・loguru の
既定書式）** を持ったままなので、テスト実行中の DEBUG がすべて stderr に出る。

実測: `uv run pytest -q -s` の出力が **111 行**。`_gameinfo=...` の全文が
何度も出る。変更前は `get_logger(名前, False)` ＝ INFO だったので、
`load_data` の WARNING 数行だけだった。

- 通常の `pytest` では捕捉されるが、**テストが失敗したときにキャプチャが
  そのまま表示される**ので読みにくくなる
- `mylog.py:19` の表は「呼ばないと → 出力先が無く、何も出ない」と書いているが、
  実際は既定ハンドラが残るので**逆**（コピー元の記述の誤り。ytbg 側で効いてくる）
- `CLAUDE.md` の新しい規約は「`loggerInit(debug)` は `main()` の先頭で 1 度だけ」
  としか書いておらず、**`main()` 以外の入口（tests）をどうするかが書かれていない**。
  conftest で `loggerInit(False)` を呼ぶなら、規約にもその旨が要る

### 3. 書式の誤りは実行時に例外になり、未実行の 12 行は静的にしか確認していない

実測（loguru 0.7.x）:

- `log.info('mismatch {} {}', 1)` → `IndexError: Replacement index 1 out of
  range`（**例外が呼び出し元へ伝わる**。`logger.add(catch=True)` は
  ハンドラ内の失敗しか拾わないので効かない）
- `log.info('{"a": 1} v={}', 2)` → `KeyError: '"a"'`
- 水準で抑制される DEBUG でも同じく例外になる（1 の理由で format が走るため）

**今の差分に該当箇所は無い**ことは確認した:

- ログ呼び出し 47 箇所すべてを AST で走査し、置換フィールド数＝引数の数を確認
  （不一致 0、テンプレートに残った `%` 書式 0）
- `%a` → `{!a}` は `yt_backgammon.py` 2/2、`yt_backgammon_server.py` 6/6 で
  取りこぼし無し
- メッセージ本体にリテラルの `{` `}` を含むものは無い。JSON や dict は
  すべて**引数**として渡しているので `format` の対象外（安全）

ただし、pytest が実際に実行するのは `add_history` / `backward_hist` /
`forward_hist` / `save_data` / `load_data` / `put_checker` / `cube` / `dice` /
`set_turn` の系統だけで、**次のログ行は実行時に一度も通っていない**（静的確認のみ）:

`yt_backgammon_server.py:61`（new_game）、`:293-294`（on_connect）、
`:303`（on_disconnect）、`:307-309`（on_error）、`:315-316`（on_json の入口）、
`:429`（app_top）、`:436`（app_index）、
`yt_backgammon.py:75, 126, 133, 144, 146, 152, 159`、
`__main__.py:88`（handle_json）、`:104`、`:120`。

verifier に **ブラウザで実際に接続・切断まで通す**ことを頼めば、
`on_connect` / `on_json` / `on_disconnect` / `app_index` は実行される。
特に `on_error`（TODO-003 で入れた例外ハンドラ）は、ここで落ちると
エラー処理の中で二次障害になるので、意図的に例外を起こして通したい。

### 4. loguru は `socket` / `ssl` / `asyncio` を引き込む

実測: `import loguru` だけで `sys.modules` に `socket`、`ssl`、`asyncio`、
`multiprocessing` が入る。

`CLAUDE.md`「`__init__.py` に `socket` や `ssl` を使う import を足さない」に
**mylog.py が該当する**。今の差分は順序を守っていて問題ない:

- `__main__.py:17` `monkey.patch_all()` → `:26` `from .mylog import ...`
- `src/ytbg/__init__.py` は mylog を import していない
- `import ytbg.__main__` で gevent の警告が出ないことも確認した
  （`is_module_patched('ssl')` / `('socket')` はいずれも True）

危ないのは**この先**で、`__init__.py` にログを 1 行足したくなったときに
`from .mylog import getLogger` と書くと、patch_all より前に ssl が読まれる。
CLAUDE.md の該当箇所に「mylog（loguru）も socket/ssl を引き込む」と
一言足しておくと踏まずに済む。**実害があるかどうかは未確認**
（gevent 26.8 では警告も出なかった）。

### 5. ログにクラス名（logger 名）が出なくなった

旧: `HH:MM:SS LEVEL ファイル名.ロガー名.関数名:行番号>` — ロガー名にクラス名が入っていた。
新（`mylog.py:69-77` の `LOG_FMT`）: `MM/DD HH:mm:ss アイコン LEVEL file:line function()>` で、
`extra["log_name"]` は**書式に含まれていない**。

- ファイル名と関数名は出るので実用上の情報量はほぼ同じ
- ただし `mylog.py` の売りである「名前ごとの水準」を使い始めると、
  どの名前で出た行なのかログから分からない。今の ytbg は `setLevel()` も
  `getLogger(name, level)` の第 2 引数も使っていないので、当面は影響しない

---

## 好みの範囲

- `__main__.py:35` `_log = getLogger("main")` だけ二重引用符。周囲（同ファイルの
  `CONTEXT_SETTINGS` など）は単引用符で、implementer も「引用符は単引用符のまま」と
  書いている。ここだけ mylog.py のサンプルの引用符が残っている
- `yt_backgammon.py:94` 行末の `;` が残っている（変更前からの持ち越し。
  触った行なので直すならこの機会）

---

## 問題なしとして確認した点

- **挙動の変化は TODO-005 の意図どおり。** 変更前は
  `ytBackgammonServer(..., debug=True)` 固定＋`get_logger(__name__, True)` で
  **`-d` に関係なく DEBUG が出っぱなし**だった（`main()` 内の
  `_log = get_logger(__name__, debug)` はローカル変数で、`handle_json` の
  `_log` には効いていなかった）。変更後は `-d` 無しで INFO、`-d` で DEBUG。
  実際に `loggerInit(False)` / `loggerInit(True)` で切り替わることを確認した。
  `README.md:126`（「`-d` を付けるとログが DEBUG レベルになります」）とも整合
- `loggerInit()` より前に出るログは無い（`__main__.py` のモジュール直下は
  `getLogger("main")` の束縛だけ。`main()` の 1 行目が `loggerInit(debug)`）
- `debug` 引数の削除に伴う呼び出し元の追随漏れなし。
  `__main__.py:106`、`tests/conftest.py:19,46` はいずれもキーワード引数に
  `debug` を渡していない
- `my_logger` / `MyLogger` / `get_logger` の参照は、TODO.md の説明文以外に
  残っていない
- `mylog.py` は tmr の `src/tmr/mylog.py` と `diff` で完全一致（方針どおり）
- ruff 19 件（UP031 x17・BLE001 x2、すべて `hist_ent2str()` と `except
  Exception`）は変更前と同じ内訳、mypy 7 件（`svr = None` 由来の既存分）、
  `pytest` 10 passed を自分で再実行して確認した
- 変更行はすべて 78 文字以内（`[tool.ruff] line-length = 78`）
- 範囲外の変更は混ざっていない（差分はログ関連＋`loguru` の依存追加のみ）

## 残り作業（不具合ではない）

`TODO.md:36-39` のチェックボックスが未チェック。実体は 4 つとも済んでいる。
