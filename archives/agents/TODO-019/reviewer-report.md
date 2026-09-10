# TODO-019 reviewer 報告

対象: `git diff`（作業ツリー、コミット前）。
`src/ytbg/yt_backgammon_server.py`、`src/ytbg/webroot/static/ytbg.js`、
`src/ytbg/webroot/templates/index.html`、`tests/test_history.py`、
`tests/test_on_json.py`、`CLAUDE.md`。

**要修正の指摘は無し。** すべて「検討」または確認結果の報告。
`uv run ruff check .` / `uv run mypy src` / 該当テスト
（`tests/test_history.py` `tests/test_on_json.py`）は手元で実行し、
全て通ることを確認済み（55 件 pass、ruff/mypy とも 0 件）。

## 検討

### 1. `clear_hist` だけが `confirm()` を持ち、`new_game()` には無い

- 場所: `src/ytbg/webroot/static/ytbg.js` の `clear_hist()`
  （新規, `nav.checked=false` の直後）と `new_game()`（既存、L4039-4043）
- 何が問題か: `clear_hist()` は押した時点で `confirm()` を出すが、
  同じく「全員が見ている共有ボードに、元に戻せない形で影響する」操作である
  `new_game()`（盤面を初期配置に戻す）には確認が無い。依頼の観点 5
  「既存のメニュー項目との一貫性」に照らすと、今回の変更でメニューの中に
  「確認を取る操作」と「取らない操作」が混在することになる。
- 根拠: `grep -n "confirm(" ytbg.js` はこの diff の 1 件のみ。既存の
  `new_game()` / `backward_hist()` などに確認を取る処理は無いことを実際に
  読んで確認した。
- どうするか: `clear_hist` の方がより破壊的（履歴そのものが戻せなくなる。
  `new_game` は履歴には残る）という理由で区別しているなら妥当だが、
  意図した非対称かどうかは管理者の判断が要る。

### 2. `_run_replay()` を再利用せず、ロック＋キャンセルを `on_json` にインライン化している

- 場所: `src/ytbg/yt_backgammon_server.py` L597-601（`on_json` の
  `clear_hist` 分岐）と、既存の `_run_replay()`（L537-549）
- 何が問題か: `_run_replay(func, *args, **kwargs)` は
  「`_replay_lock` を握る → `_cancel_replay()` → 関数を実行」という
  同じ手順を既に持っているが、`clear_history()` が同期関数
  （`_run_replay` の `await func(...)` にそのまま渡せない）のため、
  `on_json` 側で同じ手順を書き写している。
- 根拠: 実コードを読み比べた（`_run_replay` と `clear_hist` 分岐の
  ロック順序は現状一致している）。
- どうするか: 今は挙動として問題ないが、将来 `_run_replay()` 側の
  手順だけを変えると `clear_hist` 側が追随せずロック順序がずれる余地が
  残る。`clear_history()` を `async def` にして `_run_replay` に
  統一するかどうかは設計判断なので、直すかどうかは管理者に委ねる。

### 3. 連続再生の途中で `clear_hist` を割り込ませると、割り込んだ時点の中間盤面が固定される

- 場所: `src/ytbg/yt_backgammon_server.py` の `clear_history()` の
  docstring・`CLAUDE.md` の追記（「盤面そのものは変えない」）
- 何が問題か: `clear_history()` 単体は確かに盤面を変えないが、
  `on_json` の `clear_hist` 分岐は先に `_cancel_replay()` を呼ぶ。
  `back_all` などの連続再生が走っている最中に `clear_hist` が届くと、
  再生はその時点でキャンセルされ、**キャンセルされた時点まで戻った
  中間盤面**が `clear_history()` によってそのまま 1 件の履歴として
  固定される。これは既存の `back`（n>0, `_run_replay`）が
  「走っている再生をキャンセルしてから、その時点の `_history` に対して
  自分の操作を行う」という前例と同じ挙動で、新しいバグではないが、
  `CLAUDE.md` の「盤面そのものは変えない」という一文だけを読むと
  「常に今見えている盤面がそのまま残る」という程度の理解で止まり、
  「連続再生中に割り込むと、その割り込んだ時点の中間状態が残る」点までは
  書かれていない。
- 根拠: `_run_replay()` / `_cancel_replay()` のコードと
  `backward_hist()` のキャンセル時の挙動を読んで確認した。
  **実際にブラウザで back_all 中に「履歴を削除」を押す動作は未確認**
  （コードを読んでの判断のみ）。
- どうするか: 既存の `back` の前例に倣った一貫した挙動ではあるので
  直す必要は無いと考えるが、`CLAUDE.md` にもう一言
  （「連続再生の途中で押すと、止まった時点の盤面が残る」）足すかどうかは
  管理者判断。

### 4. クロックへの無影響を直接固定するテストが無い

- 場所: `tests/test_history.py` / `tests/test_on_json.py` の
  `clear_hist` 系テスト一式
- 何が問題か: 依頼の観点 1 で名指しされている「クロックへの影響」を
  直接検証するテストが無い。コードを読む限り `clear_history()` は
  `_clock_sw` / `_clock_active` / `_clock_start` /
  `gameinfo['board']['clock']` のいずれにも触れず、
  `self._history` / `self._fwd_hist` / `self._cur_sn` /
  `self._bg._gameinfo['sn']` だけを書き換えるので、実害は無いと判断できる。
  ただし、それを保証するテストが無いので、将来 `clear_history()` に
  手を入れてクロックへ副作用が漏れても検知できない。
- 根拠: `clear_history()` の実装を読んで、クロック関連フィールドへの
  参照が無いことを確認した（実測ではなくコードリーディングによる確認）。
- どうするか: `test_clear_hist_leaves_one_entry` などに
  「クロックが動いていれば動いたまま」「`clock_state` が変わらない」を
  1 行足すかどうかは管理者判断（無くても致命的ではない）。

## 確認して問題無しと判断したもの（参考）

- **保存・読み込み**: `clear_history()` は `_history` を必ず 1 件残す
  （`save_data()`/`load_data()` の役割分担と、`backward_hist()` の下限
  `len(self._history) > 1` の前提を崩さない）。`test_clear_history_saves_data`
  で往復を確認済み。
- **ロックの使い方**: `on_json` の `clear_hist` 分岐は `_replay_lock` を
  握ってから `_cancel_replay()` → `clear_history()` の順で、`_run_replay()`
  と同じ順序。`_cancel_replay()` の `await task` 完了後に `clear_history()`
  が上書き保存するので、キャンセルされたタスクの `finally` 節の
  `save_data()` と競合しない（ロックの中で逐次実行されるため）。
  `test_clear_hist_stops_running_replay` は実時間の `sleep` を潰さずに
  走らせて検証しており、通るだけで中身を見ていないテストではない。
- **ログ・docstring・コメントの書式**: `{}` と引数で渡すログ、
  `**強調**` を使う docstring の書き方、`#` コメントで「なぜ」を書く
  スタイルはいずれも既存コード（`_cancel_replay()` など）と揃っている。
- **`CLAUDE.md` の追記内容**: `clear_history()` の実装と、
  `on_json` の `clear_hist` 分岐の実装のどちらとも矛盾しない
  （上記「検討 3」の一文が足りない点を除く）。
- **範囲**: 依頼書に挙げられた 5 ファイル以外への変更は無い。
