# TODO-055 verifier-report

## 1. チェックボックスごとの確認

- [x] `DATAFILE_DIR` を、import したときではなく `BackgammonServer` を作るときに環境変数から読む
  → `src/ytbg/server.py`: クラス変数 `DATAFILE_DIR` を削除し、`__init__()` の中で
  `datafile_dir = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')` を読むよう変更済み。
- [x] `add_history()` の `gameinfo=None` と `History.add()` の `None` 分岐を消し、
  `History._cur_sn` をローカル変数にする
  → `add_history(self, gameinfo)` に既定値なし。`History.__init__` から `_cur_sn` 削除、
  `add()` 内の `if gameinfo is None: return False` も削除。`gameinfo.sn = self._history[-1].sn + 1 if self._history else 1` に一本化。
- [x] `load_data()` が件数の組ではなく、読めたかどうかを返す
  → `return (0, 0)` / `return len(self._hist), len(self._hist.fwd_entries)` を
  `return False` / `return len(self._hist) > 0` に変更。呼び出し側 `if not self.load_data():` も合わせて変更。
- [x] `backward_hist()` / `forward_hist()` の docstring を `n <= 0` に揃える
  → 両方とも `< 0: all` → `<= 0: 最後まで` に統一。
- [x] `docs/Developer.md` を今の構成に合わせて直す
  → `message.py` の役割の記述、登録表 `MESSAGE_TYPES` への言及、操作の種類の表、
  先行実行・履歴・JS 構成（`actions.js`/`drag.js`/`Settings` 等）を今の実装に合わせて書き直し済み。
- [x] `docs/design.md` を `archives/docs/design-3.md` へ移し、`CLAUDE.md` に現行仕様ではないことを書く
  → `git status` で `RM docs/design.md -> archives/docs/design-3.md` を確認。
  `CLAUDE.md` に「TODO-049 で決めた構成の見直し（第 3 弾）の設計は `archives/docs/design-3.md` にあり…
  どちらも現行仕様ではない」を追記済み。

設計の指示（`archives/docs/design-3.md` の「サーバの細かい修正」）にある補足も確認:

- `tests/conftest.py` / `tests/test_ws.py` は `BackgammonServer.DATAFILE_DIR` の
  monkeypatch から `monkeypatch.setenv('YTBG_DATA_DIR', ...)` に変更済み。
- `tests/test_datafile_dir.py` は `importlib.reload()` によるモジュール読み直しをやめ、
  `BackgammonServer` を作り直すだけの形に書き直し済み。新しいテスト
  `test_read_when_created`（import 後に環境変数を変えても効くこと）も追加されている。
- `load_data()` の戻り値の組を見ていた `test_history.py::test_clear_history_saves_data`、
  `test_save_load.py::test_load_data_keeps_history_when_broken` はどちらも
  `is True` / `is False` を見る形に直っている。
- 「最後に行う」の順序どおり、`server.py` の変更は今回の 1 コミット（未コミット）にまとまっている。

## 2. 残存確認

```
grep -rn "DATAFILE_DIR" src/ tests/ CLAUDE.md docs/   → 該当なし
grep -rn "_cur_sn" src/ tests/ CLAUDE.md docs/        → 該当なし
grep -rn "load_data()" tests/                          → is True / is False の 2 件のみ（組を見ている箇所なし）
```

`docs/design.md` は存在せず、`archives/docs/design-3.md` が存在する（`git status` で確認）。

`git grep "docs/design.md"` の残り（`archives/` の外）:

- `CLAUDE.md:218` … `archives/docs/design.md`（TODO-033 で移した**別の**旧設計文書への参照。TODO-055 の対象外）
- `TODO.md:18, 33, 35` … TODO-055 の節自身の記述（未着手の設計参照として残っているのは項目の本文なので当然）
- `src/ytbg/webroot/static/js/rules/position.js:79` … `archives/docs/design.md` への参照（コメント）。こちらも
  TODO-033 で移した別の設計文書を指しており、TODO-055 の対象外。

いずれも `archives/docs/design-3.md` への言及が漏れているものではなく、TODO-055 の指示（`docs/design.md` →
`archives/docs/design-3.md`）とは別の既存参照。**問題なし。**

## 3. 検証コマンド（一式 1 回ずつ）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 291 passed, 1 warning（exit 0） |
| `uv run ruff check .` | All checks passed!（exit 0） |
| `uv run mypy src` | Success: no issues found in 12 source files（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | 103 pass / 0 fail |
| `node --test tests/browser/` | 92 pass / 0 fail（`headless: false` のまま。利用者の一時的な変更で対象外） |

## 4. `~/ytbg-*` の読み書きが無いこと

検証の前後で `ls -l --time-style=full-iso ~/ytbg-*` の更新時刻はすべて変わらなかった
（`uv run pytest` 一式、`node --test tests/browser/`、下記の壊し方の実験も含めて）。

## 5. 壊し方 3 通り（対象ファイルだけ実行）

いずれも実験後に元の内容へ戻し、`git diff --stat` で差分が最初と同じ状態
（`CLAUDE.md`、`archives/docs/design-3.md`、`docs/Developer.md`、`src/ytbg/history.py`、
`src/ytbg/server.py`、`src/ytbg/webroot/static/js/rules/position.js`、`tests/browser/helper.mjs`、
`tests/conftest.py`、`tests/test_datafile_dir.py`、`tests/test_history.py`、`tests/test_named_ops.py`、
`tests/test_save_load.py`、`tests/test_ws.py` の 13 ファイル）に戻ったことを確認した。

### (a) `YTBG_DATA_DIR` を読む処理をクラス変数に戻す

`DATAFILE_DIR = os.getenv(...)` をクラス変数に戻し、`__init__` の `datafile_dir` local を
`self.DATAFILE_DIR` に戻した。

**注意**: 最初に `HOME` を設定せずに実行したところ、`test_no_ytbg_data_dir` /
`test_empty_ytbg_data_dir` は `HOME` にダミー実在パス（`str(tmp_path)`）を渡すテストのため
アサーションで失敗するだけで、`save_data()` までは到達せず（`__init__` の
`load_data()` 呼び出しの前に、そもそもテストの `datafile_path()` フィクスチャがサーバを
作った時点でファイルは書かれる可能性があった）。管理者からの指摘を受けて、
`HOME=$(mktemp -d)` にしてから再実行した。

- `HOME=/tmp/tmp.DNn2KgdzfX .venv/bin/python -m pytest tests/test_datafile_dir.py -q`
  → `test_ytbg_data_dir` / `test_no_ytbg_data_dir` / `test_empty_ytbg_data_dir` /
  `test_read_when_created` の 4 件が失敗（対象どおり）。
- 同じ `HOME` で `uv run pytest` 相当の全体（`.venv/bin/python -m pytest -q`）を走らせると
  38 failed, 253 passed。クラス変数はテストの `monkeypatch.setenv()` では差し替わらないため、
  他の多くのテストが本来の `$HOME`（この場合は安全な tmp dir）へ書き込む形で副作用を起こし、
  連鎖的に失敗した。
- 実験前後で `ls -la /tmp/tmp.DNn2KgdzfX/` に `ytbg-test.jsonl` が書かれたことを確認したが、
  これは一時 HOME 内なので問題ない。**利用者の実際の `~/ytbg-*` の更新時刻は実験の前後で
  変わっていない**（`ls -l --time-style=full-iso ~/ytbg-*` で確認、上記「4.」の表と同じ）。
  `~/ytbg-test.jsonl` は作られていない。

### (b) `load_data()` が履歴 0 件でも `True` を返す

`return len(self._hist) > 0` を `return True` に変更。

- `uv run pytest tests/test_history.py tests/test_save_load.py -q` → **48 passed（1 件も落ちない）**
- `uv run pytest -q`（全体）→ **291 passed（1 件も落ちない）**

**この壊し方は、今ある指示のテストでは検出できない。** 理由は、`load_data()` が
「ファイルが読めて、かつ履歴が 0 件」という状態を返す経路に到達するテストが無いため
（`Storage.load()` が返す `clock` が `None` でない限り履歴は最低 1 件積まれた状態でしか
保存されない実装になっており、「有効なファイルだが履歴 0 件」というケース自体が
テストに現れない）。**判断が要る点**: これは元々の設計（`load_data()` の戻り値を
「読めたかどうか」に単純化した意図）からすると、そもそも「読めて履歴 0 件」という
状態が実際には起こらない前提なのか、起こり得るのにテストが抜けているのかは、
実装意図を知る本人（main）か管理者の判断が要る。verifier からは「テストが
この分岐を検出できない」という事実のみ報告する。

### (c) `History.add()` の sn の求め方を 1 ずらす

`gameinfo.sn = self._history[-1].sn + 1 if self._history else 1` の `+ 1` を `+ 2` に変更。

- `uv run pytest tests/test_history.py -q` →
  `test_add_history_appends_with_incrementing_sn` と
  `test_add_history_after_clear_restarts_sn` の 2 件が失敗（狙ったとおり）。

## 確かめられなかったこと・判断が要る点

- **上記 5-(b) の懸念**: `load_data()` を「履歴 0 件でも True を返す」ように壊しても、
  `uv run pytest` を含むどの検証コマンドも落ちない。この分岐（有効なファイルで
  履歴が空）を狙ったテストは無い。実際にこの状態が起こり得るかどうかの判断は
  上位の判断が要ると考える。
- `docs/Developer.md` の書き直し内容そのものの正確さ（文章の細部が実装と一致しているか
  一つずつ突き合わせる作業）は、文書と実装コードを機械的に diff できないため、
  目視での確認に留めた（誤りを見つけていないが、突き合わせの網羅性は保証できない）。
