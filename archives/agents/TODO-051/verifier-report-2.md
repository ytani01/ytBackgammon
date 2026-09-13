# TODO-051 verifier の報告（レビュー後の修正の確認）

`implementer-report.md` の「レビュー後の修正」の節（`gameinfo.py` の
`_require_dict()`、`storage.py` の `LOAD_ERRORS` を戻したこと、
`clicks.test.mjs` に足したテイク・リダブル・手番を渡すテスト）だけを対象にした。

## 1. 検証コマンド（すべて 1 回ずつ、終了コード 0）

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 291 passed, 1 warning（exit 0）。警告は starlette の `testclient.py` の DeprecationWarning で、今回の変更と無関係 |
| `uv run ruff check .` | All checks passed（exit 0） |
| `uv run mypy src` | Success: no issues found in 12 source files（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | 99 pass, 0 fail（exit 0） |
| `node --test tests/browser/` | 81 pass, 0 fail（exit 0） |

いずれも report の数値（291 / 99 / 81）と一致した。

## 2. 変更ファイルと指示の範囲

`git status` は implementer-report と同じ 33 ファイルの変更 + 3 つの
未追跡（`archives/agents/TODO-051/`、`actions.js`、`last_op.test.mjs`）。
今回の対象である `gameinfo.py` / `storage.py` / `clicks.test.mjs` /
`CLAUDE.md` は含まれており、範囲外の追加変更は見当たらない。

`gameinfo.py` を確認し、`_require_dict()`（61〜69 行）が
`CubeState.from_dict()`（84 行）、`BoardState.from_dict()`（108 行）、
`GameInfo.from_dict()`（348 行）の 3 箇所すべての先頭で呼ばれていることを
`grep` で確かめた。

## 3. `LOAD_ERRORS` とコメント

`src/ytbg/storage.py:35-40`:

```
LOAD_ERRORS = (OSError, UnicodeDecodeError, json.JSONDecodeError,
               KeyError, IndexError)
```

`TypeError` は含まれていない。コメントは

> "board": null のように dict であるべき所が dict でないファイルは、
> GameInfo.from_dict() などの入口で KeyError にしている (TODO-051)

とあり、`_require_dict()` が dict でなければ `KeyError` を投げる実装
（`gameinfo.py:61-69`）と一致している。

## 4. 壊し方 1 — `BoardState.from_dict()` の `_require_dict()` だけ外す

`BoardState.from_dict()`（`gameinfo.py`）から `_require_dict(data)` の
呼び出しだけを削除し、`uv run pytest tests/test_save_load.py -q -k not_dict`
を走らせた。

```
FAILED tests/test_save_load.py::test_jsonl_not_dict_is_broken_file[board-null-where0-None]
1 failed, 3 passed, 32 deselected in 0.08s
```

`board-null` の 1 件だけが落ち、`cube-null` / `cube-int` / `h-list` の
3 件は通った（`cube-null` / `cube-int` は `BoardState.from_dict()` の中で
呼ぶ `CubeState.from_dict()` 側の `_require_dict()` がまだ効くため）。
落ちた箇所を引用する。

```
src/ytbg/gameinfo.py:109: in from_dict
    playername=list(data['playername']),
                     ^^^^^^^^^^^^^^^^^^
TypeError: 'NoneType' object is not subscriptable
```

`KeyError` ではなく `TypeError` で落ちており、`LOAD_ERRORS` に拾われないため
テストの `assert Storage(path).load() == ([], [], None)` が失敗する形と
一致した。

直後に `_require_dict(data)` の呼び出しを書き戻し、同じテストが
`4 passed` に戻ることを確かめた。`git diff --stat` で `gameinfo.py` の
差分が report どおりの行数（102 行変化）に戻っていることも見た。

## 5. 壊し方 2 — `actions.js` の take で `1 - player` を送る

`src/ytbg/webroot/static/js/actions.js` の `take()` を

```js
export const take = (board, player) => {
    emit_msg("take", { player: parseInt(1 - player) });
}; // take()
```

に書き換え、`node --test tests/browser/clicks.test.mjs` を走らせた。

```
✖ 掛けられたキューブを自分の側で動かす (テイク) → take {player: 0} だけを送る (1050.266752ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    { player: 1 }  (actual)
    { player: 0 }  (expected)

✖ Roll ボタン → roll {player: 0, dice} だけを送る (5064.438295ms)
  Error: roll: timeout. last value=[]
```

39 件中 2 件が落ちた。テイクの項目が直接落ち、続く Roll の項目は
「テイクで plyaer を取り違えたため盤面が想定と違う状態になり、
Roll の待ち受けがタイムアウトする」形の連鎖で落ちた
（report の「後続の Roll も連鎖で落ちる」という記述と一致）。

`take()` を元に戻し、`clicks.test.mjs` が 39 pass / 0 fail に戻ることを
確認した。

## 5 まとめ

`_require_dict()` を外す壊し方も、`take` の player を取り違える壊し方も、
報告どおりの箇所・件数で落ち、元に戻すと通った。狙ったテストが狙った
箇所をちゃんと見ていることを確認した。

## 確かめられなかったこと・判断できないこと

- リダブルのテスト（`ui/cube.js` の `double(this.board, 0, true)` を
  `1` に壊す）と、ダイスを押す項目（`click_dice()` の `end_turn` の
  player を壊す）は、管理者の指示にあった 2 通りには含まれていなかった
  ので実施していない。report にはこれらも「壊して確かめた」との記載が
  あるが、今回は検証対象外とした
- コード自体の設計判断（`_require_dict()` の置き場所が適切かなど）は
  確認担当の範囲外と考え、踏み込んでいない
