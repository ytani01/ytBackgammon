# TODO-005 implementer 報告

ログを `my_logger.py`（標準 logging）から `mylog.py`（loguru）へ移した。

## 変更したファイル

- `src/ytbg/mylog.py`（新規）— `~/work/tmr/src/tmr/mylog.py` をそのままコピー
  （`diff` で同一を確認）。tmr 固有の docstring も変えていない。
  `git add` で追加済み（未コミット）
- `src/ytbg/my_logger.py` — `git rm` で削除
- `pyproject.toml:12-17` / `uv.lock` — `uv add loguru` で `loguru>=0.7.3` を追加
- `src/ytbg/yt_backgammon.py`
  - `:13` import を `from .mylog import getLogger` へ
  - `:19` `__log = getLogger(__qualname__)`（`_log = get_logger(__name__, False)` を置き換え）
  - `:21` `__init__(self, svr_ver='')` — `debug` 引数と `self._dbg`、
    `__class__._log = ...` の行を削除
  - ログ呼び出し 15 箇所を `self.__log.xxx('...={}', 値)` へ（`%a` は `{!a}`）
- `src/ytbg/yt_backgammon_server.py`
  - `:19` import、`:28` `__log = getLogger(__qualname__)`
  - `:30-33` `__init__(self, svr_name, svr_ver, svr_id, image_dir)` —
    `debug` 引数と `self._dbg`、`__class__._log = ...` を削除。
    最初の debug ログは 78 桁に収めるため 3 行に折り返した
  - `:49` `ytBackgammon(self._svr_ver)`（`debug=self._dbg` を削除）
  - ログ呼び出し 26 箇所を `self.__log.xxx` と `{}` 書式へ
- `src/ytbg/__main__.py`
  - `:25` `from .mylog import getLogger, loggerInit`
  - `:35` `_log = getLogger("main")`（モジュール直下。`get_logger(__name__, True)` を置き換え）
  - `:87` `handle_json` のログを `{}` 書式へ
  - `:101` `main()` の先頭で `loggerInit(debug)`。`_log` の再代入は削除
  - `:106` `ytBackgammonServer(MY_NAME, VERSION, svr_id, image_dir)`（`debug=True` を削除）
- `CLAUDE.md`
  - 「## 実行」の `-d` / `--debug` の説明を `loggerInit(debug)` と loguru の書式に直した
  - 「書き方の慣習」の先頭を、`getLogger(__qualname__)` / `loggerInit()` /
    「f-string にしない」の書き方に差し替えた

## 判断した点

- **書式の変換**は指示どおり `%s` / `%d` → `{}`、`%a` → `{!a}`。f-string は使っていない。
  ログのメッセージ文字列に `{` `}` のリテラルは無いので、loguru の `str.format`
  で壊れる箇所は無い（`_gameinfo[board][point][{}][{}]` のような角括弧は無害）
- **引用符は単引用符のまま**にした（ファイル全体の既存の書き方に合わせるため）。
  mylog.py のサンプルは二重引用符だが、周囲に合わせる方を優先した
- `save_data()` / `load_data()` の `self.__log.warning('{}:{}.', type(e).__name__, e)`
  は、mylog.py の `exmsg()` を使えば 1 引数にできるが、**範囲外なので書式の変換だけ**に
  とどめた
- `_log.debug('')`（引数なしの空メッセージ）は loguru でもそのまま動くので残した

## 検証

作業前の控え:

| コマンド | 変更前 | 変更後 |
|---|---|---|
| `uv run pytest` | 10 passed（終了コード 0） | 10 passed（終了コード 0） |
| `uv run ruff check .` | 19 errors（UP031 x17、BLE001 x2。終了コード 1） | 19 errors（同じ内訳・同じ箇所。終了コード 1） |
| `uv run mypy src` | 9 errors（終了コード 1） | 7 errors（終了コード 1） |

- ruff の指摘は増えていない。残る 19 件はすべて `hist_ent2str()` の `%` 書式と
  `except Exception` で、TODO-005 の範囲外（行番号だけ 1 つずれた）
- mypy は 2 件減った。消えたのは
  `yt_backgammon.py:23` と `yt_backgammon_server.py:32` の
  `Name "__class__" is not defined`（該当行を消したため）。
  残る 7 件は `__main__.py` の `svr = None` に対する `attr-defined` で、TODO-002 由来の既存分
- 手元での動作確認（サーバは起動していない。別担当の範囲）:
  `loggerInit(True)` を呼んでから `ytBackgammon` と `ytBackgammonServer` を作り、
  `put_checker` / `cube` / `resign` / `on_json` / `backward_hist` を呼んで、
  DEBUG・INFO・WARNING が loguru の書式で出ることと、
  `{}` に値が入ることを確認した（`svr_ver='v'` のように `{!a}` も効いている）
- `uv run ytbg --help` が従来どおり出ることを確認

## 残る懸念

- **`loggerInit()` を呼ばないと loguru の既定ハンドラのまま**になる。
  `main()` 以外の入口（`tests/`）では `loggerInit()` を呼んでいないので、
  DEBUG ログが loguru 既定の書式で stderr へ出る（pytest は捕捉するので
  出力には現れない）。テスト側で `loggerInit(False)` を呼ぶか、
  conftest で抑制するかは範囲外なので手を付けていない
- **ログの書式が変わる**（`HH:MM:SS LEVEL file.name.func:lineno>` →
  `MM/DD HH:mm:ss アイコン LEVEL file:line function()>`）。
  ログを読む運用や、ログを見る外部のツールがあるなら影響する
- `mylog.py` の docstring は tmr のサンプルのままで、ytBackgammon の例では無い
  （指示どおり中身は変えていない）
- 範囲外だが気づいたこと: `hist_ent2str()` の `%` 書式（ruff UP031 x17）は
  JSON を手で組み立てているところで、TODO-007 と関わる

---

# 追記: reviewer 指摘への対応（2 巡目）

管理者から指示された 3 点を直した。コードのログ書式（`{}` と引数渡し）と
`mylog.py` は変えていない。

## 1. CLAUDE.md の理由を訂正（reviewer 1）

「書き方の慣習」の項目を 2 つに分け、`{}` と引数で渡す理由を書き直した。

- 理由を「loguru の書き方に合わせ、値を引数のまま残すため」にし、
  **速さを理由にしない**と明記した
- 「この `mylog.py` はハンドラを `level=0` で足してフィルタで水準を見るので、
  loguru はフィルタより先に書式を組み立てる。つまり水準で抑制されるログでも
  文字列は作られる」と書き、同じ勘違いを次の人がしないようにした
- あわせて reviewer 3 の指摘（リテラルの `{` `}` や `{}` と引数の数の不一致は、
  抑制される水準でも実行時に例外になる）も注意として書いた

## 2. tests でも loggerInit() を呼ぶ（reviewer 2）

- `tests/conftest.py:12` に `from ytbg.mylog import loggerInit`、
  `:16-18` にモジュール直下の `loggerInit(False)`（理由のコメント付き）。
  conftest の import 時に 1 度だけ走る
- `CLAUDE.md` の規約に「`main()` 以外の入口（`tests/conftest.py` など）でも
  呼ぶこと。呼ばないと loguru の既定ハンドラが残り、DEBUG が全部 stderr に出る」
  を足した
- 効果: `uv run pytest -q -s` の出力が **111 行 → 15 行**。
  残る 15 行は `load_data` の WARNING（`FileNotFoundError` を意図的に起こす
  テスト）とドットの行だけで、変更前と同じ水準

## 3. 細かい直し

- `src/ytbg/__main__.py:35` `_log = getLogger('main')`（二重引用符 → 単引用符）
- `src/ytbg/yt_backgammon.py:94` 行末の `;` を削除
- `CLAUDE.md`「## 実行」の `__init__.py` の注意に、
  「`mylog.py`（loguru）も `socket` / `ssl` / `asyncio` を引き込むので、
  `__init__.py` には置かない（TODO-005）」を足した

## 検証（2 巡目）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 10 passed（終了コード 0） |
| `uv run pytest -q -s` | 10 passed。出力 15 行（対応前は 111 行） |
| `uv run ruff check .` | 19 errors（1 巡目・変更前と同じ内訳） |
| `uv run mypy src` | 7 errors（1 巡目と同じ。変更前は 9） |

いずれも悪化していない。

## 対応していない指摘

- reviewer 3 の「未実行のログ行を実行時に通す」（ブラウザで接続・切断、
  `on_error` の発火）は verifier の範囲なので手を付けていない
- reviewer 5（ログにクラス名が出ない）は `mylog.py` の `LOG_FMT` の話で、
  「mylog.py は直さない」方針のため対応していない
