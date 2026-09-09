# TODO-012 検証報告（verifier）

## 1. lint / mypy / pytest

- `uv run ruff check .` → `All checks passed!`（終了コード 0）。指示にあった基準
  （変更前 ruff 0）と一致
- `uv run mypy src` → `Found 7 errors in 1 file`。すべて `src/ytbg/__main__.py`
  （55, 61, 67, 72, 78, 83, 89 行の `"None" has no attribute ...`）。
  指示にあった基準（変更前 mypy 7 errors、すべて `__main__.py`）と一致。
  終了コード 1（既存の TODO-002 の指摘のみで、増減なし）
- `uv run pytest -q` → `16 passed in 0.07s`（終了コード 0）。指示にあった基準
  （変更前 16 passed）と一致

いずれも変更前後で指摘・失敗の数に変化なし。

## 2. 変更範囲

`git diff` で確認した差分は次の 2 ファイルのみ。

- `src/ytbg/yt_backgammon_server.py`: `on_json()` から中身が `pass` の 5 分岐
  （`set_clock_swith` / `resume_clcok` / `start_clcok` / `stop_clcok` /
  `reset_clcok`）を削除。`set_clock_limit` と `set_player_clock` は残っている
- `CLAUDE.md`: 「状態と通信」節の該当記述を「クロックの進行はクライアント側
  だけで動いている」という記述に書き直し

指示の範囲どおりで、それ以外のファイルの変更は無い（`archives/agents/TODO-012/`
は今回作業用の未追跡ディレクトリ）。

## 3. 到達不能な分岐だけを削除したことの確認

`src/ytbg/webroot/static/ytbg.js` の `emit_msg(` 呼び出しをすべて拾い、
送られる `type` の一覧を作った（`EmitButton.on_mouse_down_xy()` の
`emit_msg(this.type, this.data)` のような動的送信を含む）。

一覧: `set_clock_limit`, `set_player_clock`, `resume_clock`, `start_clock`,
`stop_clock`, `reset_clock`, `set_playername`, `set_score`, `cube`, `dice`,
`set_clock_switch`, `set_turn`, `set_gameinfo`, `put_checker`, `new`, `back`,
`back2`, `back_all`, `fwd`, `fwd2`, `fwd_all`（`EmitButton` 経由の動的送信は
別途 `ytbg.js` 内の `EmitButton` 生成箇所を確認していないが、綴りの誤った
5 種はいずれの `emit_msg(` 呼び出しにも見当たらない）。

削除した 5 つの綴り（`set_clock_swith` / `resume_clcok` / `start_clcok` /
`stop_clcok` / `reset_clcok`、いずれも `clcok` / `clock_swith` を含む）は
JS 側のどの呼び出しにも**無い**ことを確認した。

`on_json()` に残っている分岐（`set_clock_limit`, `set_player_clock` を含む
全 17 分岐）を JS 側の一覧と突き合わせたところ、綴りの食い違いは見当たらない。

## 4. 実機での動作確認（socketio クライアント 2 本）

ポート 5099、`server_id=test012` でサーバを起動し、`python-socketio[client]`
で 2 クライアントを接続して確認した。

- `start_clock` / `stop_clock` / `reset_clock` / `resume_clock` /
  `set_clock_switch` を `history: false` で送信 → いずれも送信内容が
  そのまま片方のクライアントへ broadcast された（`{'src': 'a', 'type': ...,
  'data': ..., 'history': false}` を確認）
- `start_clock` を `history: true` で送信 → `~/ytbg-test012.json` の
  `history` 配列が 1 → 2 に増えた（1 手として積まれたことを確認）
- サーバのログ（起動時の `FileNotFoundError` の警告のみで、これは
  `test012.json` が無い状態での初回起動の想定内の警告）にトレースバックは
  出ていない

## 5. `set_clock_limit` / `set_player_clock` の実データ確認

`history: true` で送信し、`~/ytbg-test012.json` の保存内容で確認した。

- `set_clock_limit` に `{'index': 0, 'clock_limit': 999}` を送信
  → 保存された `gameinfo.clock_limit` が `[999, 12]` になった（`index=0` の
  要素だけが変わった）
- `set_player_clock` に `{'player': 1, 'clock': [111, 222]}` を送信
  → 保存された `gameinfo.board.clock` が `[[111, 222], [111, 222]]` になった。
  一見両方の要素が変わったように見えるが、これはこの直前に行った手順 4 の
  テスト（`set_player_clock` に `player: 0` を `history: false` で送っており、
  `history: false` でも実際のサーバ内 `gameinfo` は書き換わる）の結果が
  そのまま残っていたためで、`player: 1` を送った今回の呼び出しでは
  `clock[1]` だけが更新されている。`yt_backgammon.py` の実装
  （`set_player_clock`: `self._gameinfo['board']['clock'][data['player']] =
  data['clock']`）も見て、意図どおり `player` で指定した要素だけを
  書き換えることを確認した

いずれも壊れていないことを確認した。

## 後始末

- サーバプロセス（PID 574468）を `kill` で停止済み
- `~/ytbg-test012.json` を `\rm -f` で削除済み
- ポート 5001〜5004 のサーバには触れていない

## 確かめられなかったこと・判断が要る点

- ブラウザでの目視確認は依頼どおり対象外（利用者に任せる）
- `EmitButton` を生成している箇所（`type` を動的に渡す部分）まではコード上
  すべて洗っておらず、`this.type` に渡り得る文字列の全量までは追い切れて
  いない。ただし `emit_msg(` の直接呼び出しはすべて確認しており、削除した
  5 つの綴りはどこにも見当たらなかった
- 判断が要ることは見当たらなかった
