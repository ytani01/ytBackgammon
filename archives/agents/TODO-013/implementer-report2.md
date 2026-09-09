# TODO-013 修正報告（implementer・2 回目）

`archives/agents/TODO-013/implementer-task2.md` の指示にしたがい、
`reviewer-report.md` の「直すべき」1〜7 と「併せて直すもの」8・9・10・12・13・14
を修正した。`src/` は変更していない（ミューテーション実測のときだけ一時的に
書き換え、都度 `\cp` で元に戻している）。

## 変更したファイル

### `tests/conftest.py`

- `EmittedMessages` に `kwargs`（json イベントの kwargs の列。`messages` と
  同じ並び）と `last_kwargs`（その最後。無ければ `None`）を追加（報告 2）
- `no_sleep` の docstring に「`yt_backgammon_server.time` は stdlib の
  `time` モジュールそのものなので、この差し替えはテストの間プロセス全体に
  効く」旨を追記（報告 13）。あわせて 1 行だった `monkeypatch.setattr(...)`
  を関数定義に分けて 78 文字以内に収めた（報告 7）
- `bg_server` フィクスチャで `emitted.append` を直接差し替えていたのをやめ、
  `fake_emit()` を挟む形に戻した（報告 14）。差し替え口を 1 か所
  （`fake_emit`）に隔離し、`EmittedMessages.append` は記録専用の API に戻した

### `tests/test_on_json.py`

- `test_put_checker_broadcasts_msg` /
  `test_fallthrough_types_broadcast_the_received_msg` — `on_json()` を
  呼ぶ前に `copy.deepcopy(msg)` で期待値を取っておき、それと比較する形に
  変更（報告 1）。あわせて `test_put_checker_broadcasts_msg` に
  `emitted.last_kwargs == {'broadcast': True}` と
  `len(emitted.messages) == 1`（送信の通数）を追加（報告 2・9 の代表）
- `test_new_keeps_score_playername_clock_limit_and_resets_board` に
  `history_flag is False`（報告 3）と `last_kwargs == {'broadcast': True}`
  （報告 2 のもう 1 箇所）を追加
- `test_back_sends_sec_for_checker_move` / `test_fwd_sends_sec_for_checker_move`
  を新規追加。`n > 0` のとき `sec == 0.2`（べた書き）と `history_flag is True`
  を確認（報告 3・4）
- `test_back_all_leaves_one_entry` / `test_fwd_all_moves_history_to_the_end`
  に `sec == 0.1`（べた書き）と `history_flag is True` を追加（報告 3・4）
- `test_back_moves_hist_i_by_n` — 基準値を `emit_gameinfo()` から取るのを
  やめ、`add_history()` を 2 回呼んだ状態を `hist_i == 3`, `hist_n == 3`、
  `back` 後を `hist_i == 2`, `hist_n == 3` とべた書きで固定（報告 5）
- `test_returning_types_do_not_broadcast_original_msg` — `fwd` / `fwd2` /
  `fwd_all` の前準備に `backward_hist(-1, sleep_sec=0)` を追加し、
  `_fwd_hist` を積んだ状態で試すよう修正。前準備の emit を判定に混ぜない
  よう `emitted.clear()` を追加し、`'gameinfo' in emitted.types`
  （＝何かは送られたこと）も確認（報告 6）
- `test_put_checker_updates_only_target` / `test_dice_updates_only_target_player`
  / `test_set_player_clock_updates_only_target_player` — 変わらないはずの
  側の「前の値」を `copy.deepcopy()` で取るよう修正（報告 8）
- `test_set_gameinfo_replaces_gameinfo` — `board` 以下（`playername`）まで
  置き換わることを追加。渡した dict を `copy.deepcopy()` で作り、
  `on_json()` の後に元の dict を書き換えても `gameinfo` が変わらないこと
  （＝`set_gameinfo()` が縁を切っていること）を確認（報告 10）
- `test_back_moves_history_by_n` / `test_fwd_moves_history_by_n` に
  `no_sleep` を追加（報告 12）

「好みの範囲」（`EmittedMessages.last` が `None` のときの失敗の分かりやすさ）
は任意扱いのため見送った。

## ミューテーションでテストが落ちることを確かめた結果

報告に書かれたミューテーションを 1 つずつ `src/` に入れ直し、`pytest` で
失敗すること→ `\cp` で `src/` を元に戻すこと、を確認した（`git diff --stat src/`
が最終的に空であることも確認済み）。

| # | ミューテーション | 結果 |
|---|---|---|
| 1 | `emit()` 直前に `del msg['history']; msg['src']='server'` | `test_put_checker_broadcasts_msg` と `test_fallthrough_types_broadcast_the_received_msg` の全 9 parametrize が失敗 |
| 2 | 全 `emit()` から `broadcast=True` を除去 | `test_put_checker_broadcasts_msg` と `test_new_keeps_...` が失敗 |
| 3 | `backward_hist`/`forward_hist` の `history_flag=True`→`False`、`new` の `emit_gameinfo(3, False)`→`True` | `test_back_sends_sec_for_checker_move`、`test_fwd_sends_sec_for_checker_move`、`test_back_all_leaves_one_entry`、`test_fwd_all_moves_history_to_the_end`、`test_new_keeps_...` が失敗 |
| 4 | `SEC_CHECKER_MOVE = 0.2` → `0.9` | `test_back_sends_sec_for_checker_move`、`test_fwd_sends_sec_for_checker_move` が失敗 |
| 5 | `'hist_i': len(self._history)` → `len(self._history) - 1` | `test_back_moves_hist_i_by_n` が失敗 |
| 6 | `forward_hist()` の `while` を `while False and ...` に | 修正前は誤って 8 件とも passed（前準備の emit が残っていたため）。`emitted.clear()` を足した後は `fwd` / `fwd2` / `fwd_all` の 3 件が正しく失敗するようになった |
| 8 | `dice()` を両プレーヤーとも書き換える in-place 実装に変更 | `test_dice_updates_only_target_player` が失敗 |
| 9 | 末尾の `emit('json', msg, broadcast=True)` を 2 回呼ぶ | `test_put_checker_broadcasts_msg` が失敗（`len(emitted.messages) == 1`） |
| 10 | `set_gameinfo()` の `copy.deepcopy(gameinfo)` を `gameinfo`（参照代入）に | `test_set_gameinfo_replaces_gameinfo` が失敗 |
| 7 | （line-length）`conftest.py` / `test_on_json.py` の全行が 78 文字以内であることを Python の `len()` で確認 | 該当なし（0 件） |
| 12 | （sleep）`no_sleep` を足した 2 テストの durations を確認 | `--durations=5` で 0.005 秒未満（sleep が効いていない） |

7・6 の実測補足:
- 項目 7 は `awk` でバイト数を数えると日本語行が 78 超に見えたが、
  `pyproject.toml` の `line-length = 78` は文字数基準（ruff の既定）なので
  Python の `len()`（Unicode コードポイント数）で数え直し、0 件を確認した
- 項目 6 は、最初に足した `emitted.clear()` の位置がなく、`backward_hist(-1)`
  の前準備自体が `'gameinfo'` を emit していたため、`forward_hist()` を
  丸ごと無効化しても最初は 8 件とも通ってしまった。前準備の直後に
  `emitted.clear()` を追加してから、狙いどおり `fwd` 系だけが落ちることを
  確認した（この追加修正は依頼書に明記されていないが、報告 6 の意図
  「空振りで通らないこと」を満たすために必要だったため行った）

## 検証結果

- `uv run pytest -q` — 57 passed（前回 55 passed、今回 2 件追加）
- `uv run ruff check .` — All checks passed
- `uv run mypy src` — 7 errors（変更前と同一。すべて `__main__.py`、TODO-002）
- `git diff --stat src/` — 変更なし（ミューテーションはすべて `\cp` で復元済み）

## 判断が要る点

- 報告 6 の対応で、依頼書に書かれていない `emitted.clear()` の追加が
  必要だった（前準備の `backward_hist(-1)` 自体が emit するため）。
  内容としては依頼書の意図（空振りで通らないこと）の範囲内と判断し、
  そのまま直した
- 「好みの範囲」（`last` が `None` のときの `TypeError`）は任意のため
  見送った。直すなら別途指示がほしい
