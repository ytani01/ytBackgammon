# TODO-024 verifier 報告 (2)

implementer-report2.md の修正内容と、reviewer-report.md の「重大」1、
「検討」4, 5, 6, 7, 9 を対象に確認した。旧形式の読み込み、2 枚タブの同期、
壊して試す 3/5/7 は前回確認済みなので今回は扱っていない。

## 1. 自動検証

すべて終了コード 0。

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 147 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 8 source files |
| `node --test tests/browser/` | tests 5 / pass 5 / fail 0 |

`grep -rn 壊した版 src tests` は 0 件（reviewer が見た一時的な壊した版は
残っていない）。

## 2. `sw` の保存・復元（重大 1 の直り）

`YTBG_DATA_DIR` を一時ディレクトリにして実サーバを起動し、playwright で
ヘッダの `#clock_sw` チェックボックスをクリック（`apply_clock_sw()` が
`history: false` で送る経路）→ ブラウザを閉じてサーバを SIGTERM →
**同じディレクトリで**サーバを起動し直し → ページを開き直して確認した。

- クリック直後: `checked === false`
- 保存された `.jsonl` の 1 行目:
  `{"v": 2, "clock": {"limit": [120, 12], "sw": false, "clock": [[120, 12], [120, 12]]}}`
  （`"sw": false` が入っている）
- 再起動後にページを開くと: `checked === false`（外れたまま）

`history: false` の経路でも保存され、復元されることを実測で確認した。
reviewer が指摘した「たまたま別の操作で履歴が積まれたら保存される」
状態からは直っている。

## 3. 壊れた `.jsonl` でも起動する（検討 4, 6 の直り）

実サーバを起動して 1 手ぶんの `.jsonl` を作った後、`board.checker` を
`board.cheker` に綴り違えたファイルに差し替えてサーバを起動し直した。

- プロセスは落ちなかった（`kill -0` で生存確認、`curl` で `/` が
  `HTTP_STATUS=200`）
- ログに警告が出た:
  ```
  09/11 14:08:07 ⚠️ WARNING storage.py:148 _load_jsonl()> KeyError:'checker'.
  09/11 14:08:07 ⚠️ WARNING yt_backgammon_server.py:74 __init__()> load_data(...): error
  ```
- playwright でページを開き、`board.checker[0][0].cur_point` が `6`
  （初期配置）であることを確認した

`strict=True` にしたことで綴り違いが `KeyError` になり、`LOAD_ERRORS` に
拾われて「履歴が空＝初期配置」として起動することを実測で確認した。

## 4. `encoding='utf-8'`（検討 5 の直り）

実サーバに websocket で直接 `set_playername` を送り、`name` に
`田中太郎` を入れて `history: true` で保存させた。

- `.jsonl` を `file` コマンドで見ると `New Line Delimited JSON text data`。
  中身をそのまま cat して `"田中太郎"` が `\uXXXX` エスケープではなく
  UTF-8 の文字そのままで書かれていることを確認（`grep -c '\\u' → 0`）
- 同じファイルでサーバを再起動し、最初に届く `gameinfo` の
  `board.playername` が `['田中太郎', '']` に戻ることを確認
- `LC_ALL=C LANG=C` を付けて同じ手順を通しても結果は同じだった。
  ただし `python3 -c "import sys; print(sys.flags.utf8_mode)"` を
  `LC_ALL=C LANG=C` 付きで実行すると `1` が返る。**この機械では
  `C` ロケールで Python が UTF-8 モードに自動で入るため、
  `encoding='utf-8'` を明示していない場合との違いは今回の手順では
  切り分けられていない**（reviewer の実測と同じ結果）。
  ただしコードは 3 箇所とも `encoding='utf-8'` を明示しているので、
  ロケールに依存しない書き方にはなっている

## 5. 変更範囲

`git status --short`:

```
 M CLAUDE.md
 M TODO.md
 M src/ytbg/webroot/static/ytbg.js
 M src/ytbg/yt_backgammon.py
 M src/ytbg/yt_backgammon_server.py
 M tests/browser/helper.mjs
 M tests/conftest.py
 M tests/test_clock.py
 M tests/test_datafile_dir.py
 M tests/test_history.py
 M tests/test_on_json.py
 M tests/test_save_load.py
 M tests/test_yt_backgammon.py
?? archives/agents/TODO-024/
?? src/ytbg/clock.py
?? src/ytbg/gameinfo.py
?? src/ytbg/storage.py
?? tests/test_clock_unit.py
```

指示にあった範囲（`src/ytbg/` 6 ファイル、`ytbg.js`、`tests/` 一式、
`CLAUDE.md`、`TODO.md`、`archives/`）に収まっている。`src/ytbg/` の
変更ファイルは `yt_backgammon.py` / `yt_backgammon_server.py`
（更新）と `clock.py` / `gameinfo.py` / `storage.py`（新規）で 5 つ、
`webroot/static/ytbg.js` を含めて 6 ファイル。指示外のファイルへの
変更は無い。

`grep -rn 壊した版 src tests` は 0 件。

## 確かめられなかったこと・判断できないこと

- **`LC_ALL=C` 環境での UTF-8 依存の切り分け。** この機械には
  非 UTF-8 ロケール（`ja_JP.eucJP` など）が入っておらず、`C` ロケールでも
  Python 側が UTF-8 モードに自動で入るため、`encoding='utf-8'` の
  明示が実際に効く場面（非 UTF-8 ロケールでの書き込み失敗を防ぐ）を
  再現できていない。コードが明示していること自体は確認済み
- 検討 7（`test_on_json.py` のクロック 5 件が実際にコメント通りの検査に
  なっているか）は、implementer 報告のとおりコードを読んで
  `no_clock_keys(gameinfo)` に直っていることは確認したが、わざと
  `clock_limit` を gameinfo に戻すよう壊してテストが落ちることまでは
  今回の依頼範囲の実測項目に無かったため試していない（自動検証の
  147 件全通過は確認済み）
- 検討 9（`server_version` の更新）はコードの実測ではなく、implementer
  報告と自動テストの通過を確認した程度で、実サーバでの新規ゲーム操作
  までは試していない
