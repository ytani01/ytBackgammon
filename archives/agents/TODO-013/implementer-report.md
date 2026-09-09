# TODO-013 実装報告（implementer）

## 変更したファイル

- `tests/conftest.py`
  - `EmittedMessages` クラスを追加（`calls` / `messages` / `types` / `last` /
    `clear()`）。docstring に「なぜこの形にするか」（TODO-009 で通信層が
    変わっても fake_emit の差し替え方だけ直せばテスト側は残せる）を記載
  - `emitted` フィクスチャが `EmittedMessages` のインスタンスを返すように変更
  - `req` フィクスチャを追加（`types.SimpleNamespace(sid='test-sid')`）
  - `no_sleep` フィクスチャを追加（`yt_backgammon_server.time.sleep` を
    monkeypatch で無効化）
  - `bg_server` の `fake_emit` を `emitted.append` に差し替え（クロージャ不要に）
- `tests/test_on_json.py` — 新規。`on_json()` の 17 分岐すべてを対象にした
  テスト（55 テスト中 39 件が新規、既存 16 件は変更なし）

## src/ を直したくなったが直さなかった箇所

なし。`src/` は変更していない。

## 判断が要った点（仕様と食い違ったため、依頼と異なる形にした）

- **`request` という名前のフィクスチャは作れなかった。** pytest は
  `request` を予約済みフィクスチャ名として扱っており、
  `@pytest.fixture def request(): ...` を conftest.py に置くと
  収集時に `Failed: 'request' is a reserved word for fixtures` で
  即座に失敗する（実測）。そのため、依頼書の設計どおりの役割
  （`on_json(request, msg)` の第 1 引数の代わり）を持つフィクスチャは
  `req` という名前で作った。テストファイル側もすべて `req` を使っている。

## テストの一覧（何を守っているか）

### 末尾へ落ちる型（9 つ）

- `test_put_checker_updates_only_target` — `ch: 101` のような 100 台の ID で
  対象の checker だけが動き、同じプレーヤーの別の checker・もう片方の
  プレーヤーは変わらないこと
- `test_put_checker_broadcasts_msg` — 受け取った msg がそのまま broadcast
  されること
- `test_history_true_appends_one_entry` / `test_history_false_does_not_append`
  — `history: true` のときだけ履歴が 1 件増えること（代表として `set_score`
  で確認。9 つ全部では繰り返していない）
- `test_cube_updates_gameinfo` — `board.cube` が丸ごと置き換わること
- `test_dice_updates_only_target_player` — 指定したプレーヤーの目だけが
  変わり、もう片方は変わらないこと
- `test_set_turn_updates_turn_and_resign` — `turn` と `resign` の両方が
  変わること
- `test_set_playername_updates_only_target_player` — 指定したプレーヤーの
  名前だけが変わること
- `test_set_score_updates_only_target_player` — 指定したプレーヤーの得点
  だけが変わること
- `test_resign_updates_resign` — `resign` にプレーヤー番号が入ること
- `test_set_clock_limit_updates_only_target_index` — 指定した index だけが
  変わること
- `test_set_player_clock_updates_only_target_player` — 指定したプレーヤーの
  clock だけが変わること
- `test_fallthrough_types_broadcast_the_received_msg`
  （`pytest.mark.parametrize` で 9 type すべて）— 受け取った msg がそのまま
  broadcast されること（`gameinfo` の変化は個別テストで見ているので、
  ここは broadcast だけをまとめて確認）

### return する型（8 つ）

- `test_returning_types_do_not_broadcast_original_msg`
  （8 type すべてを parametrize）— 元の msg の `type` が
  `emitted.types` に入らないこと
- `test_back_moves_history_by_n` — `back` が `data.n` の数だけ `_history` を
  減らし `_fwd_hist` を増やすこと
- `test_fwd_moves_history_by_n` — `fwd` が `data.n` の数だけ逆方向に動くこと
- `test_back_all_leaves_one_entry` — `back_all` が履歴の先頭 1 件を残して
  全部戻ること
- `test_fwd_all_moves_history_to_the_end` — `fwd_all` が履歴の末尾まで
  全部進むこと
- `test_back2_behaves_like_back_all` / `test_fwd2_behaves_like_fwd_all` —
  `back2` / `fwd2` が `back_all` / `fwd_all` と同じ結果になること
- `test_new_keeps_score_playername_clock_limit_and_resets_board` — `new` で
  `score` / `playername` / `clock_limit` が引き継がれ、`checker` / `dice` /
  `cube` / `turn` が初期配置（`ytBackgammon(svr_ver='test')` の初期値）に
  戻ること。履歴が 1 件増えること。`emitted.last` が
  `type == 'gameinfo'` かつ `data.sec == 3` であること
- `test_set_gameinfo_replaces_gameinfo` — `gameinfo` が渡したもので
  置き換わり、履歴に積まれ、`type == 'gameinfo'` が送られること

### emit_gameinfo() の形と履歴位置

- `test_emit_gameinfo_message_shape` — `emit_gameinfo()` が送るメッセージが
  `src` / `dst` / `type` に加え、`data` に `gameinfo` / `sec` / `hist_i` /
  `hist_n` / `history_flag` の 5 キーを持つこと
- `test_back_moves_hist_i_by_n` — `back` を 1 回したら `hist_i` が 1 減り、
  `hist_n` は変わらないこと

依頼書の「`on_connect()` 経由で確かめる」は、`on_connect()` が
`request.event['args'][0]['REMOTE_ADDR']` にアクセスして
`types.SimpleNamespace` では属性エラーになったため、代わりに
`emit_gameinfo()` を直接呼んで確認した。

## 検証結果

- `uv run pytest -q` — 55 passed（変更前 16 passed、新規 39 件）
- `uv run ruff check .` — All checks passed（0 件。作成直後に import 順の
  指摘が 1 件出たため `--fix` で解消済み）
- `uv run mypy src` — 7 errors（変更前と同一。すべて `__main__.py`、
  TODO-002 で残した既存の指摘。`tests/` は対象外）

## 残る懸念

- `test_fallthrough_types_broadcast_the_received_msg` は broadcast の
  確認のみで、`gameinfo` の変化は個別テストで別途見ている（依頼書の
  意図どおり、変化の確認は代表以外は繰り返していない）
- `history: true/false` の分岐は `set_score` を代表にした（依頼書の
  「代表 1 つで真偽の両方を見れば足りる」の指示どおり）
