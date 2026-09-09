# TODO-005 verifier 報告

## 1. 指示どおりか

- **ログ呼び出し 47 箇所の書き換え** ○
  - `.debug(` `.info(` などの呼び出し件数: `yt_backgammon_server.py` 26、
    `yt_backgammon.py` 15、`__main__.py` 6 → 合計 47（報告と一致）
  - `my_logger` / `get_logger` / `_log = ` の残りは `mylog.py` 自身
    （新規追加ファイル内の定義・サンプル）以外に無い
    （`grep -rn "my_logger\|get_logger\|_log = " src/ytbg/*.py` で確認）
  - ログ呼び出しの `%s` `%d` `%a` 書式は残っていない。ただし
    `yt_backgammon_server.py:202-223` の `hist_ent2str()` に `%d` `%s` が
    17 箇所残っている（ruff UP031 の指摘と一致）。これは JSON 文字列を
    手で組み立てている箇所で、**ログ呼び出しではない**。実装者報告も
    「範囲外（TODO-007 と関わる）」と明記しており、TODO-005 の
    「ログ呼び出し 47 箇所」には含まれない。指示との食い違いではないと判断した
- **f-string になっていないか** ○
  - `mylog.py:141`（`exmsg()`）内と `yt_backgammon_server.py:41`
    （`_datafile_path` の組み立て）に f-string が 1 件ずつあるが、
    どちらもログ呼び出しではない（前者は tmr からのコピーそのまま、
    後者はファイルパスの文字列生成）。ログ呼び出しは全て `{}` と
    引数渡しになっている
- **`%a` → `{!a}`** ○
  - `yt_backgammon.py:22` `svr_ver={!a}`、`:101` `_gameinfo[board][cube]={!a}`
    の 2 箇所を確認。実際に起動して `svr_ver='0.80'`（クオート付き = repr）
    と出ることを確認済み（下記「3. 実際に動くか」参照）
- **`debug` 引数と `self._dbg` が落ちているか** ○
  - `yt_backgammon.py.__init__(self, svr_ver='')`、
    `yt_backgammon_server.py.__init__(self, svr_name, svr_ver, svr_id, image_dir)`
    のどちらにも `debug` 引数が無い。`_dbg` の残りも無い
    （`grep -n "debug\b\|_dbg"` で確認。ヒットしたのは
    click のオプション定義、`loggerInit(debug)` 呼び出し、コメントのみ）
- **`src/ytbg/mylog.py` が `~/work/tmr/src/tmr/mylog.py` と同一か** ○
  - `diff -u ~/work/tmr/src/tmr/mylog.py src/ytbg/mylog.py` の終了コード 0
    （差分なし）
- **`src/ytbg/my_logger.py` が消えているか** ○
  - ファイルが存在しない。`git status` でも `deleted: src/ytbg/my_logger.py`
    としてステージ済み

## 2. 検証コマンド

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 10 passed（終了コード 0） |
| `uv run ruff check .` | 19 errors（UP031 x17、BLE001 x2。終了コード 1。実装前と同じ内訳・同じ原因で、いずれも TODO-005 の範囲外） |
| `uv run mypy src` | 7 errors（終了コード 1。すべて `__main__.py` の `svr = None` に対する `attr-defined`。TODO-002 由来の既存分） |

実装者報告の数値と一致。ruff/mypy とも新規の指摘は無い。

## 3. 実際に動くか

`./ytbg.sh -p 5099 -i images1a 99` を `-d` 無し・`-d` 付きの 2 回、
`run_in_background` で起動して確認した。

**`-d` 無し（INFO まで）**

```
09/10 02:26:50 ℹ️ INFO __main__.py:104 main()> server_id=99, port=5099, image_dir=images1a
09/10 02:26:50 ⚠️ WARNING yt_backgammon_server.py:281 load_data()> FileNotFoundError:[Errno 2] No such file or directory: '/home/ytani/ytbg-99.json'.
09/10 02:26:50 ⚠️ WARNING yt_backgammon_server.py:54 __init__()> load_data(/home/ytani/ytbg-99.json): error
```

DEBUG ログは出ていない。`curl -s -o /dev/null -w '%{http_code}' http://localhost:5099/`
は `200`。

**`-d` 付き（DEBUG まで）**

```
09/10 02:27:06 ℹ️ INFO __main__.py:104 main()> server_id=99, port=5099, image_dir=images1a
09/10 02:27:06 🐞 DEBUG yt_backgammon_server.py:31 __init__()> svr_name=ytBackgammon Server, svr_ver=0.80, svr_id=99, image_dir=images1a
09/10 02:27:06 🐞 DEBUG yt_backgammon_server.py:42 __init__()> _datafile_path=/home/ytani/ytbg-99.json
09/10 02:27:06 🐞 DEBUG yt_backgammon.py:22 __init__()> svr_ver='0.80'
09/10 02:27:06 🐞 DEBUG yt_backgammon.py:72 init_gameinfo()> _gameinfo={'sn': 0, ...}
09/10 02:27:06 🐞 DEBUG yt_backgammon_server.py:275 load_data()> path_name=/home/ytani/ytbg-99.json
09/10 02:27:06 🐞 DEBUG yt_backgammon_server.py:286 load_data()> _history=(1), _fwd_hist=(0)
09/10 02:27:10 🐞 DEBUG __main__.py:54 top()> 
09/10 02:27:10 🐞 DEBUG yt_backgammon_server.py:436 app_index()> 
127.0.0.1 - - [2026-09-10 02:27:10] "GET / HTTP/1.1" 200 10852 0.020023
```

`svr_ver='0.80'` のように `{!a}` が repr（クオート付き）で出ることを確認。
`curl` は `200`、DEBUG ログにも例外は出ていない。

なお、1 回目（`-d` 無し）の起動時に `~/ytbg-99.json` が無く
`FileNotFoundError` の WARNING が出たが、これは正常系（初回起動時の想定挙動、
TODO-005 と無関係）。1 回目の終了時に保存され、2 回目（`-d` 付き）の起動時は
`_history=(1)` として読み込めている。

終了はプロセスを `pgrep -af ytbg` で PID を確認したうえで `kill` した
（`pkill` は使っていない）。両回とも停止を `pgrep` で再確認済み。
確認後 `~/ytbg-99.json` は `\rm` で削除した。

## 4. `git status` / 変更ファイルの範囲

ステージ済み: `src/ytbg/my_logger.py`（削除）、`src/ytbg/mylog.py`（新規）
未ステージ: `CLAUDE.md`、`pyproject.toml`、`src/ytbg/__main__.py`、
`src/ytbg/yt_backgammon.py`、`src/ytbg/yt_backgammon_server.py`、`uv.lock`
未追跡: `archives/agents/TODO-005/`（本報告と implementer 報告）

TODO.md の項目（`mylog.py` を持ってくる／ログ呼び出しを書き換える／
`my_logger.py` を消す／`CLAUDE.md` を直す）と一致。`pyproject.toml` /
`uv.lock` は `loguru` 追加に伴う変更で、`uv add loguru` によるもの。
指示に無いファイルの変更は無い。

`CLAUDE.md` の差分は「## 実行」の `-d` の説明と「書き方の慣習」の
ログの節のみで、実装内容（`loggerInit(debug)` を `main()` の先頭で
1 度だけ呼ぶ、`{}` 書式、`__log = getLogger(__qualname__)`）と一致している。

## 5. 確かめられなかったこと・判断できなかったこと

- **`hist_ent2str()` の `%` 書式（ruff UP031 x17）を範囲外とした判断の是非**
  は、TODO-005 の「ログ呼び出し 47 箇所」という書き方だけからは
  ログ呼び出しかどうかの線引きが自明ではない。今回は「ログ呼び出しでは
  ない（JSON 文字列の組み立て）」という理由で妥当と判断したが、
  範囲の解釈そのものは管理者の確認が要る可能性がある
- **クライアント側の動作確認**（ブラウザで実際にチェッカーを動かす、
  複数タブでの共有など）は行っていない。CLAUDE.md にも「ブラウザ側の
  動作確認は実際に触って行う」とあり、今回は起動とトップページの
  HTTP 応答のみを確認した。websocket 経由のログ出力（`on_json` など）
  は未確認
- **ログの書式が変わる点の影響**（実装者報告にある「ログを見る外部の
  ツールがあるなら影響する」）は、そのようなツールの有無を把握していない
  ため判断できない
- `tests/` 側で `loggerInit()` を呼んでいない点（実装者報告の懸念）は
  今回のテスト実行では問題なく通っており、実害は確認していない

---

## 追記: reviewer 検討 3 への対応（未実行だった 12 行を実際に通す）

管理者の依頼で、reviewer が「pytest でも実サーバ確認でも一度も実行されて
いない」と挙げたログ行を、実際にサーバを起動して通した。コードは直していない。

### やり方

1. `./ytbg.sh -d -p 5099 -i images1a 99` を `run_in_background` で起動
   （ログはファイルへ落とした）
2. `uv run --with "python-socketio[client]" python <script>` で使い捨ての
   `python-socketio` クライアントを作り、接続 → `json` メッセージを
   `new` / `set_gameinfo` / `set_playername` / `set_score` / `resign` /
   `set_clock_limit` / `set_player_clock` / `put_checker`（`p=26` でバー、
   `hit` の DEBUG も通した）/ `cube` / `dice` / `set_turn` の順に送信 →
   最後に `type` キーの無い壊れたメッセージを送って `on_error` を意図的に
   起こす → 切断、まで通した（プロジェクトの依存には追加していない）
3. `curl` で `/` と `/p1` を叩き、`app_index`（`top()` / `index_p1()` 経由）
   を通した

### 結果

対象に挙げられた行のうち、以下は実際に実行され、`IndexError` /
`KeyError` などの書式由来の例外は出ず、`{}` は正しく展開され、`{!a}` も
repr（クオート付き）で出た:

- `yt_backgammon_server.py`: `:61`（new_game）、`:293-294`（on_connect。
  `request.sid={!a}` → `'MHCibGuZG-ud51lkAAAB'`）、`:303`（on_disconnect）、
  `:307-309`（on_error。`e='KeyError':KeyError('type')` /
  `event[message]='json'` / `event[args]=({...},)` と、狙いどおり
  意図的に起こした `KeyError('type')` の内容が repr で出ている）、
  `:315-316`（on_json の入口）、`:436`（app_index）
- `yt_backgammon.py`: `:75`（set_gameinfo）、`:126`（set_playername）、
  `:133`（set_score）、`:144, 146`（resign。`gameinfo.resign=1` と
  数値が正しく出た）、`:152`（set_clock_limit）、`:159`（set_player_clock）
- `__main__.py`: `:88`（handle_json）、`:104`（main() の `_log.info`）、
  `:120`（`main()` の `finally` の `_log.info('end')`。今回はプロセスを
  `kill` で止めたため、シグナル経由で `finally` を通るログとして
  ログファイルの最後には出ていないが、`ytbg-stop.sh` 相当の通常終了では
  通る想定。**今回この行だけは実際の出力では確認できていない**）

**通せなかった行:**

- `yt_backgammon_server.py:429`（`app_top`）— **実行できなかった。**
  `grep -rln "app_top" .` で調べたところ、`app_top()` を呼んでいるのは
  `yt_backgammon_server.py` 自身の定義だけで、`__main__.py` の
  `@app.route(...)` のどこからも呼ばれていない（`/`, `/p1`, `/p2` は
  いずれも `app_index()` を呼ぶ）。**到達不能なコード**になっており、
  今回のような接続確認では通しようがない。書式は静的には
  `self.__log.debug('')`（引数なし）で、reviewer が確認した「置換
  フィールド数＝引数の数」のチェックは通っているので、実行できれば
  例外は起きないはずだが、実際には確認できていない
- `__main__.py:120`（`finally` の `_log.info('end')`）— 上記のとおり
  `kill` で止めたため確認できていない。書式は引数無しの `'end'` のみで、
  静的には問題なさそうだが、実行しての確認はできていない

### ログ全体の確認

`_log.debug`/`.info`/`.error` の出力を全行目視したが、`{` `}` が
展開されずリテラルのまま残っている行、`IndexError` / `KeyError` /
`ValueError` などの書式由来の例外は無かった（ログファイル全文は
`/tmp/claude-649/-home-ytani-work-ytBackgammon/8b6537fc-1034-4501-82e3-eea4d0b7baa9/scratchpad/ytbg5099-socketio.log`
に残したが、セッション終了後は消える一時ファイルなので、再現手順を
上に書いた）。

なお、ログとは無関係だが、切断直後に gevent の pywsgi が
`Invalid HTTP method` という警告を 1 行出している。これは `python-socketio`
クライアントが `websocket` transport で切断した際の生パケットが
別リクエストとして解釈されたもので、`pywsgi` 自身のログ（loguru を
経由していない）であり、TODO-005 の変更とは無関係と判断した。

### 後始末

`pgrep -af ytbg` で PID（`487549` `487576`）を確認したうえで `kill`。
再度 `pgrep -af "ytbg.*99"` で停止を確認した（`pkill` は使っていない）。
`~/ytbg-99.json` は `\rm -f` で削除し、消えたことを確認した。

### 追加で確認した 3 点の変更

- `CLAUDE.md`: `{}` 渡しの理由が「速さのためではない。抑制される水準でも
  文字列は作られる」という趣旨に直っていることを確認した
  （`git diff HEAD -- CLAUDE.md` で確認）
- `tests/conftest.py`: `loggerInit(False)` が追加されており、
  `uv run pytest -q -s` の出力が **15 行**になっていることを実測で確認した
  （reviewer 報告の「111 → 15」と一致）
- `__main__.py:37` の `getLogger('main')` が単引用符になっていること、
  `yt_backgammon.py:94` 付近の行末 `;` が無くなっていることを
  `git diff HEAD` で確認した
