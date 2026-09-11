# TODO-024 verifier 報告

## 1. 4 つの検証コマンド

すべて終了コード 0。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 131 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed、終了コード 0 |
| `uv run mypy src` | no issues found in 8 source files、終了コード 0 |
| `node --test tests/browser/`（timeout 600000） | 5 pass / 0 fail、終了コード 0 |

## 2. 「わざと壊して 7 通り」のうち 3・5・7 を再現

`src/` を 1 箇所だけ書き換え、`uv run pytest`、そのあと `\cp` でバックアップから
元に戻す、を 3 回繰り返した（`git diff` は最終的に元の状態と一致することを確認済み）。

### #3: `storage.py` の `_old_clock()` が常に既定の `Clock()` を返す

```python
def _old_clock(self, raw_history: list[dict[str, Any]]) -> Clock:
    """壊した版: 常に既定を返す"""
    return Clock()
```

結果:

```
FAILED tests/test_save_load.py::test_old_format_is_read_when_no_jsonl - assert ...
FAILED tests/test_save_load.py::test_server_starts_from_old_format - assert [...]
2 failed, 129 passed in 1.85s
```

報告にある `test_old_format_is_read_when_no_jsonl` が落ちることを確認。
もう 1 件（`test_server_starts_from_old_format`）も同じ理由で落ちたが、これは
`-x` を付けずに走らせたための追加検出で、報告と矛盾しない。

### #5: `_load_hist_ent()` が `_clock.reset()` も呼ぶ

```python
def _load_hist_ent(self, hist_ent):
    """壊した版: reset() も呼ぶ"""
    self._bg._gameinfo = hist_ent.copy()
    self._clock.reset(0)
    self._clock.reset(1)
```

（`Clock.reset()` は `player` 引数必須なので、報告の意図に合わせて両プレーヤー分
呼ぶ形にした。引数無しで呼ぶと無関係な `TypeError` で 28 件が広く落ちてしまい、
狙った検証にならないため）

結果:

```
FAILED tests/test_clock.py::test_back_does_not_rewind_running_clock - assert ...
FAILED tests/test_clock.py::test_fwd_does_not_rewind_running_clock - assert [...]
2 failed, 129 passed in 1.89s
```

報告どおり、狙った 2 件だけが落ちることを確認。

### #7: `GameInfo.to_dict()` が `clock_limit` と `board.clock` を残す

```python
def to_dict(self) -> dict[str, Any]:
    """壊した版: clock_limit と board.clock を残す"""
    d = asdict(self)
    d['clock_limit'] = [600, 60]
    d['board']['clock'] = [[600, 60], [600, 60]]
    return d
```

結果:

```
FAILED tests/test_clock.py::test_clock_is_not_in_history - AssertionError: as...
FAILED tests/test_clock.py::test_clock_state_carries_current_clock - Assertio...
FAILED tests/test_save_load.py::test_saved_file_is_jsonl - AssertionError: as...
FAILED tests/test_save_load.py::test_old_format_drops_clock_keys - AssertionE...
4 failed, 127 passed in 1.87s
```

報告にある `test_clock_is_not_in_history` が落ちることを確認。他 3 件も
同じキー漏れが波及して落ちたもので、報告と矛盾しない。

3 回とも書き換えを戻したあと `uv run pytest` が 131 passed に戻ることを確認済み。
**3・5・7 とも、報告どおりのテストが狙って落ちることを確認した。**

## 3. 旧形式（`.json`）の読み込みを実際に動かして確認

`git worktree add` で TODO-022 時点（`0831b55`）を一時ディレクトリへ取り出し、
`uv sync` してから `YTBG_DATA_DIR` を一時ディレクトリにして旧コードのサーバを
起動。Node の組み込み `WebSocket` でメッセージを送り、`set_clock_limit`
（index 0 → 300, index 1 → 10）、`put_checker` を 2 回、`start_clock` を送って
`~/ytbg-old.json`（実際は一時ディレクトリの `ytbg-old.json`）を作らせた。

作業ツリーは変更していない（`git stash` は使わなかった。worktree は
検証後に `git worktree remove --force` で削除済み、`git worktree list` で
確認済み）。

旧サーバを止め、**今のリポジトリ（作業ツリーの変更込み）**のコードで同じ
`YTBG_DATA_DIR` を指して起動したところ:

- ログに `load old format` が出て、旧形式を読んだことを確認
- `sn: 5` / チェッカーの位置とも、旧サーバで作った履歴の最後の状態と一致
- `clock_state.limit == [300, 10]`（旧形式の `clock_limit` の値が引き継がれている）
- `clock_state.active == [false, false]`（動作中のまま復元しない設計どおり）
- gameinfo の中に `clock_limit` / `board.clock` のキーが**無い**ことを確認
- `ytbg-old.json` はそのまま残っている（消えていない）
- 履歴が積まれるメッセージ（`put_checker`）を 1 回送ったところ、
  `ytbg-old.jsonl` が新しく書かれ、1 行目のメタに
  `{"v": 2, "clock": {"limit": [300, 10], ...}}`、以降に `h` エントリが
  6 件（旧形式から引き継いだ 5 件 + 新しい 1 件）書かれていることを確認

README.md の決めごと「旧形式は `.jsonl` が無いときだけ読む」「旧ファイルは
消さない」「書き戻しは常に `.jsonl`」「`active` は保存しない」を、いずれも
実測で確認した。

## 4. 2 枚のタブでのクロック同期をブラウザで確認

`tests/browser/helper.mjs` を使い、`start_server()` → 2 枚 `open_board()`。
`page1` で Roll → `emit_msg('start_clock', {player: 0}, false)` を送信。

- `board.clock_limit.limit` が `[120, 12]` で届いている
  （`clock_state.limit` 経由。`gameinfo.clock_limit` はもう無い）
- 1.5 秒待った後、`page1` と `page2` 両方で
  `board.player_clock[0].active === true`
- 残り時間（`clock[1]`）が両方のページで 12 → 10.5 前後に減っており、
  `page1` だけでなく `page2` でも動いていることを確認（同期している）

このテストスクリプトは検証専用でスクラッチパッドに置いただけで、
リポジトリには追加していない。

## 5. 変更ファイルの範囲

```
 src/ytbg/webroot/static/ytbg.js  |  38 +--
 src/ytbg/yt_backgammon.py        | 122 +++---
 src/ytbg/yt_backgammon_server.py | 282 ++++++-------
 tests/browser/helper.mjs         |   2 +-
 tests/conftest.py                |  25 +-
 tests/test_clock.py              | 153 +++---
 tests/test_datafile_dir.py       |   4 +-
 tests/test_history.py            |  26 +-
 tests/test_on_json.py            | 115 +++--
 tests/test_save_load.py          | 332 +++++++++----
 tests/test_yt_backgammon.py      |  27 +-
新規: src/ytbg/gameinfo.py, src/ytbg/clock.py, src/ytbg/storage.py,
      tests/test_clock_unit.py
```

すべて implementer-report.md に書かれた一覧と一致する。TODO-024 の
指示（`gameinfo.py` / `clock.py` / `storage.py` を作る、旧形式の読み込みを
残す、JS は `Board.load_gameinfo()` のクロック読み先だけ変える）の範囲に
収まっており、指示に無いファイルの変更は見当たらない。

`CLAUDE.md` は変更されていない（implementer 報告のとおり、下書きのみで
main への判断待ち）。

## 確かめられなかったこと・判断できないこと

- **CLAUDE.md の書き換え案の当否は判断していない。** implementer 報告に
  下書きがあるが、文書の反映は main の判断事項なのでここでは触れていない
- **implementer 報告 2.（`ensure_ascii=False` にした点）、3.（`history` が
  1 件積まれる仕様の変化）は、いずれも動作は確認できたが「これでよいか」の
  判断は reviewer/main の範囲と考え、ここでは踏み込んでいない**
- ブラウザでのクロック同期確認は、今回作った一時テストで見ただけで、
  リポジトリの `tests/browser/` には追加していない（指示は「確かめる」で
  「テストを足す」ではなかったため）
