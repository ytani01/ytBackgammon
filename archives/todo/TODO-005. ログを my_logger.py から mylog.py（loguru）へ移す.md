# TODO-005. ログを my_logger.py から mylog.py（loguru）へ移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 44,124 | 143,545 | 47% |
| implementer | Opus 5 | medium | 13,522 | 174,674 | 23% |
| reviewer | Opus 5 | high | 21,004 | 71,077 | 17% |
| verifier | Sonnet 5 | medium | 19,839 | 161,083 | 13% |
| 合計 |  |  | 98,489 | 550,379 | 概算 $8.6 |

- implementer と reviewer は定義（`~/.claude/agents/*.md`）のモデルが
  `sonnet`。Opus 5 に上書きした。implementer は 47 箇所の書き換えに
  `debug` 引数の削除が絡むため、reviewer は書式変換の誤りが実行時にしか
  出ない類いのため
- effort は定義の値（implementer: medium、reviewer: high、verifier: medium）
- verifier は定義のまま。上書きしていない

## きっかけ

ログが `my_logger.py`（標準の `logging` を包んだもの）で、水準を
インスタンスごとの `debug` 引数で回していた。`~/work/tmr/src/tmr/mylog.py`
（loguru のグローバル logger に名前を付けて、名前ごとに水準を変えられる
ようにしたもの）へ移す。

TODO-003 で見送っていた「`ytBackgammonServer(..., debug=True)` が固定」も
これで消える。実際、変更前は `-d` を付けなくても DEBUG が出続けていた
（`main()` 内の `_log = get_logger(__name__, debug)` はローカル変数で、
`handle_json` の `_log` には効いていなかった）。

着手前に決めたこと:

- **`src/ytbg/mylog.py` にコピーする。** 依存に増えるのは loguru だけ。
  tmr とは別々に持つので、片方を直してももう片方には反映されない
- **`%s` 書式は loguru の `{}` に書き換える。** f-string にしない
- **クラスの `debug` 引数は落とす。** クラス本体に
  `__log = getLogger(__qualname__)` を置き、`main()` の先頭で
  `loggerInit(debug)` を 1 回だけ呼ぶ

## やったこと

- `src/ytbg/mylog.py` を tmr からコピーした（`diff` で完全一致。中身は
  変えない）。`pyproject.toml` の依存に `loguru>=0.7.3` を足した
- ログ呼び出し 47 箇所を書き換えた（`yt_backgammon_server.py` 26、
  `yt_backgammon.py` 15、`__main__.py` 6）。`%s` / `%d` は `{}` に、
  `%a` は `{!a}` にして、値は引数として渡す
- クラス本体に `__log = getLogger(__qualname__)` を置き、`ytBackgammon` と
  `ytBackgammonServer` の `debug` 引数と `self._dbg` を落とした
- `main()` の先頭で `loggerInit(debug)` を呼ぶようにした。
  `tests/conftest.py` でも `loggerInit(False)` を呼ぶ
- `src/ytbg/my_logger.py` を削除した
- `CLAUDE.md` の「書き方の慣習」「実行」を新しい書き方に直した

### 決めごとが実測で覆った点

**「`{}` にすれば、出力しない水準で文字列を作らずに済む」は、この
`mylog.py` では成り立たない。** reviewer の実測で分かった。

`mylog.py` はハンドラを `logger.add(out, level=0, filter=_filter, ...)` で
足し、水準の判定をレコード単位のフィルタで行っている。loguru は
`logger._log()` の中でフィルタより**前に** `message.format(*args)` を
実行するので、捨てるログでも必ず文字列が組み立てられる。

実測（`-d` なし ＝ DEBUG は出力されない状態、1 回あたり）:

| 呼び方 | 時間 |
|---|---|
| `log.debug('_gameinfo={}', gi)` | 28.3 µs |
| `log.debug(f'_gameinfo={gi}')` | 28.5 µs |
| 旧 `logging` の `log.debug('%s', gi)` | 0.2 µs |

利用者と相談して、**コードは `{}` と引数渡しのまま残し、`CLAUDE.md` の
理由のほうを直した**（「loguru の書き方に合わせ、値を引数のまま残すため。
速さのためではない」）。あわせて、`{}` の数と引数の数が合わないと
抑制される水準でも実行時に例外になることを注意として書いた。

`mylog.py` 側を `logger.add(..., level=logLevel(debug))` に直せば本来の
意図どおりになるが、tmr からのコピーに差分を作らない方針を採った。

## 確かめたこと

- `uv run pytest` 10 passed。`uv run ruff check .` 19 件（UP031 x17、
  BLE001 x2。変更前と同数・同内訳）。`uv run mypy src` 9 → 7 件
  （`__class__` 由来の 2 件が消えた）
- 実際にサーバを起動して（ポート 5099）、`-d` 無しで INFO まで、`-d` 付きで
  DEBUG までになることを確かめた。`/` は 200 を返す
- `python-socketio` のクライアントで接続 → `json` 送信 → 意図的な例外 →
  切断まで通し、`on_connect` / `on_json` / `on_disconnect` / `on_error` /
  `app_index` のログ行を実行させた。書式由来の例外（`IndexError` /
  `KeyError`）は出ず、`{}` は展開され、`{!a}` は repr で出ている
- reviewer が 47 箇所すべてを AST で走査し、置換フィールドの数と引数の数が
  一致すること（不一致 0）、`%` 書式の残りが無いこと、メッセージ本文に
  リテラルの `{` `}` が無いことを確かめた
- `import loguru` が `socket` / `ssl` / `asyncio` を引き込むことを確かめた。
  今の import 順（`monkey.patch_all()` → `from .mylog import ...`）は
  守られていて、`is_module_patched('ssl')` / `('socket')` はいずれも True

## 分担の振り返り

- **要修正の 1 件を見つけたのは reviewer だけ。** ベンチマークを自分で書いて
  「`{}` なら遅延評価される」という前提を覆した。ほかに、tests で
  `loggerInit()` を呼ばないと DEBUG が全部出ること（`pytest -q -s` が
  111 行）、loguru が `socket` / `ssl` を引き込むこと、書式の誤りが
  抑制される水準でも実行時例外になることを見つけた。
  implementer は書き換えを終え、tests のログが増える件を「範囲外」として
  報告に残した。verifier は実サーバでの水準の切り替わりと `{!a}` の出力を
  確かめ、`hist_ent2str()` の `%` 書式を範囲外とした判断の可否を管理者へ回した
- **見込みと担当の構成は食い違わなかった**（3 人とも見込みどおり）。
  食い違ったのはモデルで、implementer と reviewer を Opus 5 に上げた。
  reviewer を上げた判断は当たった。implementer は書き換え自体が機械的で、
  Sonnet 5 でも足りた可能性がある
- 料金は $8.6 で、TODO-006（$1.7）の 5 倍。**main が 47%** を占めた。
  差分と 3 通の報告を main が繰り返し読んだ分。次に同じ規模なら:
  - reviewer は Opus 5 のままにする。実測で前提を覆す働きは、このモデルで
    initiative を出させたときに出た
  - implementer は Sonnet 5 で始め、詰まったら上げる
  - verifier と reviewer は今回のように**並行で起動する**（実装が終われば
    どちらも読むだけなので、待ちが重ならない）
  - main は報告ファイルを全文読まず、返事の 5 行と必要な節だけにする

分担の理由と各担当の報告は
[archives/agents/TODO-005/](../agents/TODO-005/) にある。

## 残ること

- `hist_ent2str()` の `%` 書式（ruff の UP031 が 17 件）は、ログ呼び出しでは
  ないので触っていない。ruff の指摘は変更前と同じ
- `app_top()`（`yt_backgammon_server.py`）はどのルートからも呼ばれておらず、
  実行しての確認ができていない。`__main__.py` の `finally` の
  `_log.info('end')` も、確認では kill で止めたので通っていない。
  どちらも引数の無いログなので書式の誤りは起きない
- `mylog.py` の docstring の表にある「`loggerInit()` を呼ばないと → 出力先が
  無く、何も出ない」は**逆**で、実際は loguru の既定ハンドラ（DEBUG）が
  残る。tmr からのコピーなので直していない
- ログの書式（`LOG_FMT`）に `extra["log_name"]` が入っていないので、
  ログ行から logger 名（クラス名）が分からない。ファイル名と関数名は出る。
  名前ごとの水準（`setLevel()`）を使い始めたら効いてくる
