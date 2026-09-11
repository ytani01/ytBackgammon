# TODO-034. basedpyright の型チェックの水準を揃える

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |
| 実施 | Opus 5 / effort high | main + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 9,423 | 26,475 | 84% |
| verifier | Sonnet 5 | medium | 4,565 | 38,692 | 16% |
| 合計 |  |  | 13,988 | 65,167 | 概算 $1.5 |

- main は見込みで Sonnet 5 と書いたが、利用者がモデルを切り替えずに
  着手したので Opus 5 のまま動いた
- verifier は `~/.claude/agents/verifier.md` の定義（`model: sonnet` /
  `effort: medium`）のまま。上書きしていない

## きっかけ

Emacs の eglot が Python のバッファで `reportUnknownMemberType` を出す、
という利用者の指摘から。

言語サーバが basedpyright（`~/.emacs.d/init.el` の `eglot-server-programs`
で `basedpyright-langserver --stdio` を指定している）で、その既定の
`typeCheckingMode` が `recommended` になっているのが原因だった。本家
pyright の `standard` には無い `reportUnknownMemberType` / `reportAny` /
`reportMissingParameterType` などが全部 ON になる。

`src/` で実測すると error 4 件・warning 504 件。内訳の上位は
`reportUnknownMemberType` 118 件、`reportAny` 95 件、
`reportMissingParameterType` 67 件。このプロジェクトの型チェックは
mypy（`check_untyped_defs` のみ）で指摘 0 件なので、**mypy の基準と
basedpyright の既定がずれているだけ**で、コードが壊れていたわけではない。

## やったこと

### 水準を `standard` に揃えた

`pyproject.toml` に `[tool.basedpyright]` を足した。ここに書けば
eglot（`basedpyright-langserver`）でも `basedpyright` コマンドでも効く。

```toml
[tool.basedpyright]
typeCheckingMode = "standard"
```

Emacs 側（`eglot-workspace-configuration`）で全プロジェクト共通にする案も
あったが、プロジェクトごとに変えられるほうを採った。

### `standard` でも残った 3 件を直した

`emit_gameinfo()` の `sec` に注釈が無く、既定値の `0` から `int` と
推論されていた。`SEC_CHECKER_MOVE`（`0.2`）を渡す呼び出しが 3 か所あり、
`reportArgumentType` で落ちる。

```python
async def emit_gameinfo(
        self, sec: float = 0, history_flag=False, last_op=None):
```

**mypy は int の引数に float を渡すのを許す**（数値の特例）ので見逃していた。
docstring の `sec: int` も `float` に直した。

### 検証の手順に足した

利用者と相談して、dev 依存に `basedpyright>=1.40.1` を足し、
`uv run basedpyright` を ruff / mypy と並べることにした。mypy と重なるが、
**エディタに出る指摘と手元で走らせた結果が揃う**のが利点。`mypy src` が
`tests/` を見ていないのに対し、`basedpyright` は引数なしで `tests/` も見る
（24 ファイル）。`CLAUDE.md` の「## 実行」のコマンド一覧と、テストの節の
末尾に書いた。

## 確かめたこと

確認は verifier に分けた（報告は
[`archives/agents/TODO-034/verifier-report.md`](../agents/TODO-034/verifier-report.md)）。

| 検証 | 結果 |
|------|------|
| `uv run ruff check .` | 0 件 |
| `uv run mypy src` | 0 件（12 ファイル） |
| `uv run basedpyright` | 0 件（24 ファイル） |
| `uv run pytest` | 211 passed |
| `node --test tests/js/` | 59 pass |
| `node --test tests/browser/` | 44 pass |

**通ることだけを見ないため**、`sec: float = 0` を `sec=0` に戻して
`uv run basedpyright` を走らせ、`reportArgumentType` が狙った 3 か所
（`server.py` の 225 / 262 / 551 行）で出ることを確かめた。同じ状態で
`uv run mypy src` は 0 件のままで、`CLAUDE.md` に書いた「mypy は通すが
basedpyright は落ちる」もそのとおりだった。

`CLAUDE.md` の「`recommended` では `src/` だけで 500 件以上出る」は、
着手前に main が実測した値（error 4・warning 504）。verifier は
`pyproject.toml` を書き換えることになるため確かめていない。

## 分担の振り返り

- **verifier が見つけたもの**: 落ちた検証は無かった。代わりに
  「注釈を戻すと狙った 3 件が出る」「そのとき mypy は 0 件のまま」を
  実際に動かして確かめ、`CLAUDE.md` に書いた 2 つの主張の裏付けになった。
  **自分で確かめられない範囲（`pyproject.toml` を変える必要がある件数）を
  正直に報告してきた**のもよかった
- **見込みとの差**: 担当（main + verifier）は見込みどおり。main のモデルだけ
  Opus 5 のままだったが、判断が要ったのは「Emacs 側で直すか
  `pyproject.toml` で直すか」の一点で、Sonnet 5 でも足りた規模
- **次に同じ規模なら**: 設定ファイル 1 行と型注釈 1 行の項目でも、
  **確認を分けた効果は「壊して落ちるか」を実際にやらせた点**にあった。
  main が自分でやると「基準を変えたのだから出るはず」で済ませてしまう。
  ただし main を Opus 5 で回したぶんは無駄（料金の 84%）。
  この規模は Sonnet 5 で始めるべきで、**着手前にモデルを切り替えるよう
  利用者に促す**とよい
