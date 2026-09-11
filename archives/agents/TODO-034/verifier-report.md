# TODO-034 verifier-report

## 走らせた検証

| 検証 | 結果 | 終了コード |
|------|------|-----------|
| `uv run ruff check .` | 通った（`All checks passed!`） | 0 |
| `uv run mypy src` | 通った（`Success: no issues found in 12 source files`） | 0 |
| `uv run basedpyright` | 通った（`0 errors, 0 warnings, 0 notes`） | 0 |
| `uv run pytest` | 通った（`211 passed, 1 warning in 2.12s`） | 0 |
| `node --test tests/js/` | 通った（`tests 59 / pass 59 / fail 0`） | 0 |
| `node --test tests/browser/`（1 回だけ） | 通った（`tests 44 / pass 44 / fail 0`） | 0 |

すべて成功。落ちたものは無い。

## 変更されたファイル

`git status --short`:

```
 M CLAUDE.md
 M pyproject.toml
 M src/ytbg/server.py
 M uv.lock
?? .codegraph/
```

指示の対象範囲（`pyproject.toml` / `uv.lock` / `src/ytbg/server.py` /
`CLAUDE.md` と、untracked の `.codegraph/`）と一致。それ以外のファイルは
変わっていない。

`git diff` の中身も確認した。

- `pyproject.toml`: `dev` 依存に `basedpyright>=1.40.1` を追加、
  `[tool.basedpyright]` で `typeCheckingMode = "standard"` を設定。
- `src/ytbg/server.py`: `emit_gameinfo()` の `sec` に `float` の型注釈を追加し、
  docstring の `sec: int` → `sec: float` に修正。
- `CLAUDE.md`: 「## 実行」のコマンド一覧に `uv run basedpyright` の行、
  テストの節の末尾に basedpyright についての段落を 2 つ追加。
- `uv.lock`: `uv sync` の結果の差分のみ（+30 行）。

## 具体的に確かめたこと

### basedpyright が tests/ も見ているか

`uv run basedpyright --outputjson` の `summary` を確認:

```
{'filesAnalyzed': 24, 'errorCount': 0, 'warningCount': 0, 'informationCount': 0, 'timeInSec': 3.66}
```

想定どおり `filesAnalyzed = 24`（src 12 + tests 12）で、`tests/` も
見ていることを確認した。

### 注釈を戻すと落ちるか

`src/ytbg/server.py` の

```python
async def emit_gameinfo(
        self, sec: float = 0, history_flag=False, last_op=None):
```

を一時的に

```python
async def emit_gameinfo(self, sec=0, history_flag=False, last_op=None):
```

に戻して確認した。

- `uv run basedpyright --outputjson` → `errorCount: 3`、終了コード 1。
  3 件とも `reportArgumentType`（`server.py` の 225 / 262 / 551 行目）で、
  メッセージは

  ```
  型 "float" の引数を、関数 "emit_gameinfo" の型 "int" のパラメーター
  "sec" に割り当てることはできません
  ```

  想定どおり 3 件、想定どおりの理由（`float` → `int` の代入不可）で出た。

- 同じ状態で `uv run mypy src` → `Success: no issues found in 12 source files`
  （0 件のまま）。CLAUDE.md の「mypy は通すが basedpyright は落ちる」は
  そのとおりだった。

確認後、`\cp` でバックアップから元のファイルに戻し、`git diff -- src/ytbg/server.py`
が変更前の 7 行差分（元の状態）に戻っていることを確認した。戻したあと
`uv run basedpyright` を再実行し、`0 errors, 0 warnings, 0 notes` に
戻っていることも確認済み。

### CLAUDE.md の記述の再現性

- 「引数なしで走らせると `tests/` も見て、指摘は 0 件」→ そのとおり
  （`uv run basedpyright` で確認済み、上記）。
- 「`recommended` は mypy よりずっと厳しく `src/` だけで 500 件以上出る」
  という記述自体は、`typeCheckingMode` を一時的に `recommended` へ
  変えて確認していない（`pyproject.toml` を変更することになるため、
  「何も直さない」の範囲を超えると判断し見送った）。数字の妥当性は
  未確認。

## 確かめられなかったこと・判断できないこと

- CLAUDE.md にある「`recommended` では `src/` だけで 500 件以上出る」という
  具体的な件数は、実際に `typeCheckingMode = "recommended"` に変えて
  数えれば検証できるが、`pyproject.toml` の変更を伴うため今回は行って
  いない。必要なら管理者の判断で追加検証を指示してほしい。
- それ以外の完了条件・検証項目はすべて確認済み。
