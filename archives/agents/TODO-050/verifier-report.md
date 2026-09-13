# TODO-050 verifier 報告

## 1. チェックボックス・箇条書きの確認

TODO.md の TODO-050 節のチェックボックス（未チェックのまま残っている）を、
実装・テストの有無で確かめた。

- [x] 名前付きの 8 つの操作のハンドラと dataclass — `src/ytbg/server.py` に
  `_on_roll`〜`_on_resign`（7 つ。`roll` は `DiceData` を流用）、
  `src/ytbg/message.py` に `ResignData` / `OpeningData` / `MoveData`。
  `roll` / `end_turn` / `double` / `take` / `cancel_double` は既存の
  `DiceData` / `PlayerData` を流用（形が同じなので新しい dataclass を
  作らなかったと報告にあり、設計上も問題ない）。テストは
  `tests/test_named_ops.py` に 8 操作それぞれある
- [x] 登録表を 1 つにまとめる — `server.py` の `MESSAGE_TYPES` に統合、
  `message.py` の `DATA_TYPES` / `NO_HISTORY_TYPES` は消えている
  （`git diff src/ytbg/message.py` で確認）
- [x] `turn` が -1 に変わったときだけクロックを止める —
  `on_json()` の `if turn0 != -1 and self._gameinfo.turn == -1:`。
  わざと壊して確認済み（下記 3.）
- [x] `set_clock_switch` で両方のクロックを止める —
  `_on_set_clock_switch()` で `stop(0)` / `stop(1)` してから `set_switch()`
- [x] テストを足す（わざと壊して落ちることも確かめる） —
  `tests/test_named_ops.py`（33 件）。報告の「わざと壊して確かめたこと」
  20 通りのうち 5 通りを自分でも再現し、すべて報告どおり落ちた（下記 3.）
- [ ] `CLAUDE.md` の「状態と通信」を直す — 直っている
  （`git diff CLAUDE.md`）。登録表の説明、`parse()` の置き場所、
  履歴に積む type の一覧、ハンドラの戻り値と後処理の順、クロックの
  切り替えの説明が、いまの実装と一致している。

  **チェックボックス自体は TODO.md 上で未チェックのまま**（`- [ ]` が
  6 個すべて）。中身はすべて実装・確認できているので、これは verifier の
  指摘ではなく、実装者がチェックを入れ忘れている（または main が入れる
  運びになっている）だけだと考えられる。**判断が要る点**として報告する。

## 2. 検証コマンドの結果

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 269 passed, 1 warning（starlette の DeprecationWarning、変更前からある） | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | tests 99, pass 99, fail 0 | 0 |
| `node --test tests/browser/`（1 回） | tests 60, pass 60, fail 0 | 0 |

すべて implementer-report.md の記載と一致した。

## 3. わざと壊す確認（5 通り）

すべて `sed` で 1 行だけ書き換え → `uv run pytest -q` → `git diff --stat` で
元に戻ったことを確認、という手順。5 通りとも報告どおり、または狙いどおりに
落ちた。

1. **報告済みの壊し方**: `on_json()` のクロック停止の条件を `if False:` に。
   → `test_turn_to_minus1_stops_both_clocks` の `resign` / `move` / `set_turn`
   の 3 ケースが FAILED。復元後 `git diff --stat` は元の差分と同じ
   （208 insertions, 43 deletions）
2. **報告済みの壊し方**: `opening()` のダイスの並びを `[敗者, 0, 0, 勝者]` に
   反転。→ `test_opening_puts_winner_dice_first` と
   `test_opening_winner_0` が FAILED。復元後 `git diff --stat` は
   元と同じ（87 insertions, 2 deletions）
3. **報告済みの壊し方**: `take` の `_switch_to_turn()` を
   `_switch_clock(data.player)`（止める側を `player` に）に変更。
   → `test_take_accepts_and_runs_turn_clock` が FAILED。復元後 diff は
   元と同じ
4. **報告に無い壊し方（自分で考案）**: `turn0 != -1 and` の条件を消し、
   「処理の前も -1 でもクロックを止める」に変更
   （`if self._gameinfo.turn == -1:` だけにした）。
   → `test_take_outside_turn_does_not_touch_clock[-1]` と
   `test_turn_already_minus1_does_not_stop_clock` の 2 件が FAILED。
   指示の「処理の前は -1 でなかったときだけ」を確かめるテストが機能して
   いることを確認した
5. **報告に無い壊し方（自分で考案）**: `cancel_double` の置き場所を
   `data.player if cube.value > 1 else -1` から
   `(1 - data.player) if cube.value > 1 else -1` に変更（掛けた側では
   なく相手側に置くよう反転）。→
   `test_cancel_double_halves_and_runs_turn_clock` が FAILED

いずれも書き換え後に元ファイルへ戻し、`git diff --stat` が壊す前と同じ値
（該当ファイルの insertions/deletions 数）に戻ったことを確認した。

## 4. CLAUDE.md と実装の食い違い

- 「状態と通信」: 上記のとおり、いまの実装と一致している
- 「クロック」節: 変更されていない（`git diff` に含まれない）。読んだ限り、
  クロックの基本的な仕組み（`Clock` が持つ、`gameinfo` の外にある、
  など）の記述は今回の変更と矛盾しない。ただし「クロックの切り替え」の
  詳細（`double`/`take`/`cancel_double` でどちらを止めるか）は「状態と
  通信」側に書かれており、「クロック」節はそこに触れていないので
  重複や矛盾はない
- 「構成」節: `gameinfo.py` の説明にある更新メソッドの一覧
  （`put_checker()` / `cube()` / `dice()` / `set_turn()` /
  `set_playername()` / `set_score()` / `resign_game()` / `new_game()`）に、
  今回足した `opening()` / `move()` / `end_turn()` / `double()` / `take()` /
  `cancel_double()` が入っていない。実装者も報告の「範囲外で気づいたこと」
  で「指示の範囲が『状態と通信』だけなので触っていない」と明記しており、
  指示の範囲外という判断は妥当に見えるが、**「構成」節がいまの実装と
  食い違っている状態が残る**点は事実として報告する

## 確かめられなかったこと・判断できないこと

- TODO.md 上のチェックボックスが未チェックのままである点（1. 参照）。
  中身は確認できているので、チェックを入れるかどうかは管理者の判断
- `docs/design.md` との整合は確認したが、`docs/Developer.md` は実装者の
  報告どおり未修正のまま（「文書は触らない決まり」とあるので、TODO-050
  の範囲外という理解で問題ないか、念のため記載する）
- ブラウザテストは 1 回のみ実行（MEMORY の方針どおり）。10 回や 3 回の
  連続実行はしていない
