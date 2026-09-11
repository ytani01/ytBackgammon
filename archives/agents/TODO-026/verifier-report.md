# TODO-026 verifier 報告

メッセージの型付けと `on_json()` のディスパッチ表化の確認。
**コードは直していない。**

## 1. 標準の検証

すべて終了コード 0。

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 210 passed, 1 warning（既知の `anyio` の DeprecationWarning のみ） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 12 source files |
| `node --test tests/browser/` | tests 5 / pass 5 / fail 0 |

## 2. わざと壊して、報告どおりに落ちるか（4 通り）

`src/ytbg/server.py` をその都度 1 箇所だけ書き換え → `uv run pytest` →
scratchpad に取ったバックアップから復元、を繰り返した。
最後に `diff` でバイト単位で元に戻ったことを確認済み。

| # | 壊した内容 | 実際に落ちたテスト | 報告と一致 |
|---|---|---|---|
| 1 | `_on_new` が `None` ではなく `0` を返す | `test_returning_types_do_not_broadcast_original_msg[new]`、`test_new_keeps_score_playername_limit_and_resets_board`（2 件） | 一致 |
| 2 | `_on_cube` が `0` ではなく `None` を返す | `test_fallthrough_types_send_gameinfo_with_last_op[cube-...]`（1 件） | 一致 |
| 3 | 登録表の `'stop_clock'` に `self._on_resume_clock` を割り当てる | `test_stop_clock_freezes_elapsed`、`test_clock_ops_send_gameinfo_with_clock_state`（2 件） | 一致 |
| 4 | 登録表から `'reset_clock'` のエントリを削除 | `test_reset_clock_restores_limit_and_stops`、`test_clock_ops_send_gameinfo_with_clock_state`、`test_tables_have_same_keys`、`test_fallthrough_types_send_gameinfo_with_last_op[reset_clock-...]`（4 件、`KeyError: 'reset_clock'` を含む） | 一致（implementer 報告は `test_tables_have_same_keys` を含む 4 件と書いており、件数・内容とも合致） |

4 通りとも、狙ったところが実際に落ちることを確認した。
復元後は `uv run pytest` が 210 passed に戻ることも確認済み。

## 3. 実プロセスでの UI 動作確認（2 タブ）

`tests/browser/helper.mjs` の `start_server` / `launch_browser` /
`open_board` / `center_of` / `wait_for` を使い、`YTBG_DATA_DIR` を
一時ディレクトリにして、以下をすべて実際にクリック・入力して確認した
（スクリプトは scratchpad に置き、リポジトリには残していない）。

- **Roll** — `#rollbutton0` クリックでダイスが出て、2 枚目のタブにも
  同期
- **Cube（ダブル）** — `#cube` の中心でマウスの down/up を発生させ、
  `board.cube.value` が 1 → 2 になり、2 枚目のタブにも同期。
  クライアント側のガード（`board.turn` / `board.player` /
  `dice_active`）はゲームの整合性を問わず、クリックが実際に
  `emit_msg("cube", ...)` → サーバの `cube` ハンドラへ届くことだけを
  見るため、evaluate で直接それらしい値に設定してから操作した
- **New Game** — メニューの `new_game()` が出す `confirm()` を
  `page.once('dialog', d => d.accept())` で承認し、`board.cube.value`
  が 1 に戻ることを確認
- **1 つ戻す / 1 つ進める** — `#button-back` / `#button-fwd` クリックで
  ダイスの表示が変わり、戻ることを確認
- **Clock のチェックボックス** — `#clock_sw` をクリックして
  チェック状態が反転し、2 枚目のタブにも同期

すべて成功し、ディスパッチ表への移し忘れは見つからなかった。

## 4. 登録表に無い `type` を送る

実プロセスに対して、ブラウザの `page.evaluate()` から

```js
ws.send(JSON.stringify({src:'x', type:'no_such_type', data:{}, history:true}))
```

を送り、サーバの stdout/stderr（`-d` 付きで起動）を確認した。

```
09/11 15:06:09 🐞 DEBUG app.py:97 websocket_endpoint()> msg={"src": "x", "type": "no_such_type", "data": {}, "history": true}
09/11 15:06:09 ℹ️ INFO server.py:528 on_json()> msg={'src': 'x', 'type': 'no_such_type', 'data': {}, 'history': True}
09/11 15:06:09 ⚠️ WARNING server.py:535 on_json()> unknown message type: 'no_such_type': ignored
```

- `ws.readyState` は送信後も `1`（OPEN）のまま
- そのあとの `Roll` クリックが普通に通り、`gameinfo` が返ってダイスが
  表示された
- ログに `WARNING` が実際に出ている（README 4 番「警告をログに出して
  無視する」を満たす）

## 5. 変更範囲

```
 M CLAUDE.md
 M docs/design.md
 M src/ytbg/server.py
 M tests/test_on_json.py
 M tests/test_ws.py
?? archives/agents/TODO-026/
?? src/ytbg/message.py
?? tests/test_message.py
```

TODO-026 の範囲（`message.py` の新設、`server.py` のディスパッチ化、
関連テスト、`CLAUDE.md` / `docs/design.md` の追記）に収まっている。
`git diff --stat bbe50a2 -- TODO.md` は差分無し（`TODO.md` は
変更されていない）。

`grep -rn "壊した版" src tests` は 0 件。壊すのに使った文字列
（`no_such_type` など）は、確認のたびに元へ戻したため `src/` には
残っていない。作業終了時点の `git status` / `git diff --stat` は
確認開始時と一致することを確認済み。

## 確かめられなかったこと・判断が要る点

- implementer / reviewer が挙げていた次の 3 点は、README で
  verifier に割り当てられていないため、今回は再確認していない
  （報告を読んだのみ）。
  - `cube` の `data` が旧より厳しくなった点（reviewer 指摘 1）
  - `type` がハッシュ不可のとき `UnknownMessageType` ではなく
    `TypeError`（受け皿）へ行く点（reviewer 指摘 2）
  - `msg['data']` / `msg['history']` が全 type で必須になった点
    （implementer の「判断が要る点 1」）
  これらは main が「重大なものは無い」「実経路では変わらない」と
  判断できる材料が reviewer 報告に揃っているので、直すかどうかは
  main の判断に委ねる
- Cube のクリックはゲームの正規の手順（Roll → 手番の確定 →
  ダブル可能な状態）を経ておらず、クライアント側のガード変数を
  `evaluate()` で直接書き換えてから操作した。**サーバ側の `cube`
  ハンドラが実際の WebSocket 経路で呼ばれることは確認できたが、
  「ゲームとして正しい手順でダブルを掛けられること」までは
  見ていない**（TODO-026 の眼目である「ディスパッチが正しく動くか」
  には十分だが、念のため明記する）
