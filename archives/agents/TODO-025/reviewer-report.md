# TODO-025 reviewer 報告

サーバの分割（hub / history / replay / app / server）のレビュー。
見たのは作業ツリーの差分（`git diff` ＋ 未追跡の `src/ytbg/{app,history,hub,replay,server}.py`、
`tests/test_ws.py`）と、分割前の `b47895e`。

**要修正は 0 件。** 挙動が変わっている箇所は見つからなかった。
検討が 6 件、好みの範囲が 3 件。

---

## 重大（要修正）

なし。

### main から挙がっていた「`Replayer.run()` が `_task` を `None` に戻さない」件

**成立しない。** 旧 `_run_replay()` も新 `run()` も、先頭で
`_cancel()`（旧 `_cancel_replay()`）を呼び、その中で `_task = None` に
している。名前を揃えて機械的に差分を取ると、違いは
**名前・改行位置・docstring だけ**だった。

- 旧 `yt_backgammon_server.py:404-416`（`_run_replay`）
  → 新 `replay.py:86-99`（`run`）: どちらも
  `async with lock: await cancel(); await func(...)`
- 旧 `yt_backgammon_server.py:364-372` → 新 `replay.py:46-54`:
  どちらも `task.cancel()` → `await task` →
  `except asyncio.CancelledError` でログ → 最後に `self._task = None`

`start()` も同じで、`_cancel()` と `create_task()` は**どちらもロックの中**
（`replay.py:81-84`）。TODO-009 の「cancel を待つ間に別の要求が入り込み、
どこからも辿れない再生 Task が残る」性質は崩れていない。
`asyncio.CancelledError` を `except Exception` の前に置いて `raise` し直す
形（`replay.py:65-69`）も、コメントごとそのまま移っている。

唯一落ちているのは、`_cancel()` の docstring にあった
「ロックの外で呼ぶと…辿れない再生が残る」の 2 行。これは
`replay.py:9-12`（モジュールの docstring）に移してあるので、説明が
消えたわけではない（→ 好みの範囲 3 を参照）。

---

## 検討（直したほうがよいかもしれない）

### 1. `GameInfo.new_game()` の既定引数で `server_version` が黙って消える

- **場所**: `src/ytbg/gameinfo.py:139`
  `def new_game(self, server_version: str = '') -> None:`
- **何が問題か**: 引数を省いて呼ぶと `server_version` が `''` になる。
  旧 `ytBackgammon.new_game()`（`b47895e:src/ytbg/yt_backgammon.py:42-58`）は
  自分が持つ `self.svr_ver` を入れ直していたので、**取り違えようがなかった**。
  引数に外出ししたことで、呼び忘れると静かに壊れる形になった。
- **根拠（実測）**:
  `GameInfo(server_version='1.2.3').new_game()` のあと
  `server_version == ''`。`new_game('1.2.3')` なら `'1.2.3'`。
- **いまは無害**: 呼び出しは `server.py:80` の 1 箇所だけで、
  `self._svr_ver` を渡している（旧と同値）。
- **ただしテストが無い**: `tests/` 全体で `server_version` を見ているのは
  `test_save_load.py:28,204`（保存形式）だけ。`test_on_json.py:496-515`
  の New Game のテストは checker / dice / cube / turn / resign しか
  比べていないので、`server.py:80` の引数を消しても 1 件も落ちない（未実測。
  コードを壊さずに確かめられないため、テストの assert を読んだ判断）。
- **案**: 既定値を外して必須引数にする、または New Game 後に
  `server_version` が残ることを見る assert を 1 行足す。

### 2. `/p1` `/p2` `/static` がどのテストも通らない

- **場所**: `src/ytbg/app.py:109-115`（旧 `__main__.py:86-94` ＋
  `yt_backgammon_server.py:569`(`app_index`) から移った分）
- **何が問題か**: HTTP のルートはこの項目でファイルをまたいで移った
  （`app_index()` がサーバから消えて `index()` の閉じ込めになった）のに、
  それを通るテストが無い。`tests/browser/helper.mjs:92,125,177` は
  `http://127.0.0.1:PORT`（`/`）しか開かないので、`/p1` と `/p2` の
  `Route` を落としても、`/static` の `Mount` を落としても、
  `uv run pytest` も `node --test` も気づかない。
- **根拠（実測）**: `TestClient` で叩くと
  `/` `/p1` `/p2` が 200（10232 バイト、同一）、
  `/static/images1a/board-base.png` が 200、`/favicon.ico` が 404。
  **いまは正しく動いている。** 足りないのはテストのほう。
- **案**: `test_ws.py`（または新しい `test_app.py`）に、
  3 つの index が 200 で返ることと `image_dir` が埋め込まれることを
  見る数行を足す。`TestClient` があるので安い。

### 3. `History.cur_sn` は未使用で、docstring と実態が食い違う

- **場所**: `src/ytbg/history.py:43-46`
  （`"""最後に振った通し番号"""`）
- **何が問題か**: `load()`（`history.py:128-133`）は `_cur_sn` を
  更新しないので、保存ファイルから履歴を読んだ直後の `cur_sn` は
  **0 のまま**で、「最後に振った通し番号」ではない。
  旧実装（`b47895e:...:281-311` の `load_data()`）も `_cur_sn` を
  更新していなかったので**挙動は同じ**だが、旧は private な属性、
  新は docstring 付きの公開プロパティ。誤った説明を公開の面に出した。
- **使われていない**: `cur_sn` の参照は `src/` にも `tests/` にも無い
  （grep 実測）。次の `add()` が `self._history[-1].sn + 1` から
  数え直すので実害が出ないのも旧と同じ。
- **案**: プロパティごと消すか、docstring を
  「最後に `add()` / `clear()` で振った番号」に直す。
  実装担当も報告の「範囲外だが気づいたこと」で同じ点を挙げている。

### 4. `conftest` の差し替えがクラス単位なので、`create_app()` と併用すると黙って効く

- **場所**: `tests/conftest.py:179`
  `monkeypatch.setattr(ClientHub, 'broadcast', fake_broadcast)`
- **いまは問題ない**: `bg_server` が見るものは変わっていない。
  `emit_gameinfo()` は `self._hub.broadcast()` を呼ぶ（`server.py:134`）
  ので、旧（`self.broadcast()` を差し替え）と同じ呼び出しが同じ順で
  `emitted` に積まれる。`tests/test_broadcast.py` は
  `make_bg_server` に依存しない `bg_server_raw` を使うので差し替えの
  影響を受けず、`c0.sent == [msg]` のように**実際の送信**を見る役を
  保てている（`test_broadcast.py:26-30` ほか。実行して 6 件とも通る）。
- **何が気になるか**: 差し替える先が「サーバのメソッド」から
  「`ClientHub` というクラス」に変わったので、**そのテストの中で
  作られる `ClientHub` はすべて差し替わる**。いまは `test_ws.py` が
  独自のフィクスチャを使っていて重ならないが、将来 `bg_server` と
  `create_app()` を同じテストで使うと、`TestClient` 側の送信まで
  黙って止まる（`ws.send_json` が呼ばれない）。
- **案**: conftest の docstring に「クラスごと差し替えるので、
  同じテストで `create_app()` を使うと効いてしまう」と 1 行残す。

### 5. `add_history()` の DEBUG ログが二重になった

- **場所**: `src/ytbg/server.py:89` と `src/ytbg/history.py:66`
  （どちらも `self.__log.debug('gameinfo={}', gameinfo)`）
- **何が問題か**: 旧 `add_history()` は 1 回だけだった
  （`b47895e:...:93-94`）。分割で、サーバ側と `History` 側の両方が
  同じ `gameinfo` 全体を出すようになった。
  `CLAUDE.md` の「書き方の慣習」が書いているとおり、`mylog.py` は
  ハンドラを `level=0` で足してフィルタで水準を見るので、
  **抑制される水準でも文字列は組み立てられる**。
- **根拠（実測）**: `GameInfo` の repr は 491 文字、
  `'gameinfo={}'.format(g)` が 1 回 14 マイクロ秒。
  1 手ごとに 14 マイクロ秒＋ DEBUG 時は 1 行増える程度なので、
  **実害は小さい**。
- **案**: どちらか片方にする（`History.add()` 側を残すのが素直）。

### 6. `Replayer` の cancel が `_cancel()`（private）で、README の 5 番と違う

- **場所**: `src/ytbg/replay.py:40`
- **根拠**: `archives/agents/TODO-025/README.md:68-69` は
  「`start()` / `run()` / `cancel()` を持つ」と書いている。
  実装は `_cancel()` で、外から止める手段が無い。
- **いまは困らない**: 呼ぶのは `start()` と `run()` だけで、
  外部から止めたい場面は無い（`on_json()` の分岐はすべて
  `start()` か `run()` を通る）。旧 `_cancel_replay()` も private だった
  ので、旧実装に近いのはむしろこちら。
- **案**: このままにするなら README 側の記述に合わせておくか、
  「外から止める用は無い」と replay.py に 1 行書く。

---

## 好みの範囲

### 1. `BackgammonServer.client_name()` の素通しが残っている

`src/ytbg/server.py:264-272` は `self._hub.name(ws)` を返すだけ。
README の 3 番が禁じたのは `broadcast()` の素通しなので**違反ではない**が、
同じ理屈なら `on_error()` / `on_json()` から `self._hub.name(ws)` を
直接呼べる（呼び出しは `server.py:297,304` の 2 箇所だけ）。

### 2. `hub.py` の docstring に、消えたクラス名が残っている

`src/ytbg/hub.py:9` の「ytBackgammonServer が抱えていた接続管理と
broadcast を…」。経緯の説明なので誤りではないが、`archives/` を除く
リポジトリ全体で旧クラス名が残るのはここ 1 箇所だけ（grep 実測）。

### 3. `_cancel()` を呼ぶときの注意が、ファイルの先頭にしかない

「ロックの外で呼ぶと辿れない Task が残る」の理由は
`replay.py:9-12`（モジュール docstring）にあり、`_cancel()` 自身の
docstring（`replay.py:44`）は「**LOCK を持った状態で呼ぶこと**」だけになった。
旧は同じ docstring に理由まで書いてあった
（`b47895e:src/ytbg/yt_backgammon_server.py:360-362`）。
直す人が最初に読むのは呼び出し先の docstring なので、理由を
1 行だけ戻しておくと、ロックの外へ出す改変を思いとどまりやすい。

---

## 確かめて問題が無かったところ

### 旧 32 メソッドの移送先（抜け・重複なし）

`ytBackgammonServer`（21）と `ytBackgammon`（11）を 1 対 1 で突き合わせた。
**どこにも行っていないものは無い。**

| 旧 `ytBackgammonServer` | 新 |
|---|---|
| `__init__` | `server.py:39`（`svr_name` / `image_dir` は `app.py` へ） |
| `new_game` | `server.py:72` ＋ `GameInfo.new_game()` |
| `add_history` | `server.py:88` ＋ `History.add()`（`history.py:55`） |
| `clear_history` | `server.py:94` ＋ `History.clear()`（`history.py:82`） |
| `broadcast` | `ClientHub.broadcast()`（`hub.py:70`） |
| `_load_hist_ent` | `server.py:111` |
| `emit_gameinfo` | `server.py:120` |
| `backward_hist` | `server.py:151` ＋ `History.back()`（`history.py:98`） |
| `forward_hist` | `server.py:188` ＋ `History.forward()`（`history.py:113`） |
| `save_data` | `server.py:225` |
| `load_data` | `server.py:236` ＋ `History.load()`（`history.py:128`） |
| `client_name` | `server.py:264` →`ClientHub.name()`（`hub.py:58`） |
| `on_connect` | `server.py:274` ＋ `ClientHub.add()`（`hub.py:34`） |
| `on_disconnect` | `server.py:280` ＋ `ClientHub.remove()`（`hub.py:50`） |
| `on_error` | `server.py:290` |
| `_cancel_replay` | `Replayer._cancel()`（`replay.py:40`） |
| `_replay` | `Replayer._replay()`（`replay.py:56`） |
| `_start_replay` | `Replayer.start()`（`replay.py:73`） |
| `_run_replay` | `Replayer.run()`（`replay.py:86`） |
| `on_json` | `server.py:300` |
| `app_index` | `app.py:54`（`index()`） |
| モジュール直下の `templates` | `app.py:31` |

| 旧 `ytBackgammon` | 新 |
|---|---|
| `__init__` | `GameInfo(server_version=...)`（`server.py:55`） |
| `init_gameinfo` | 消えた（README の 2 番で「消す」と決めた分） |
| `player` 属性 | 消えた（同上。旧も未使用） |
| `new_game` | `gameinfo.py:139`（引数で `server_version` を受ける） |
| `set_gameinfo` | 消え、`on_json()` が `GameInfo.from_dict()` を直接呼ぶ（`server.py:356`） |
| `put_checker` / `cube` / `dice` / `set_turn` / `set_playername` / `set_score` | `gameinfo.py:157/175/185/194/201/208` に同名で |
| `resign` | `GameInfo.resign_game()`（`gameinfo.py:216`。名前は main が了承済み） |

旧 `self._bg` への参照は 19 箇所（`_gameinfo` 9 ＋ メソッド呼び出し 10）。
すべて新側に対応があることを、上の表と `on_json()` の差分で確かめた。
`archives/` を除くリポジトリに `yt_backgammon` / `ytBackgammonServer` を
指す**コード上の参照は 1 つも残っていない**（`hub.py:9` のコメントのみ）。
`README.md`・`ytbg.sh`・`ytbg-boot.sh`・`tests/browser/` にも
旧モジュール名や `ytbg.__main__:app` への依存は無い（grep 実測）。

### `on_json()` は完全に同値

旧 `yt_backgammon_server.py:418-567` と新 `server.py:300-449` を差分で
突き合わせた。違いは `self._bg.X(...)` → `self._gameinfo.X(...)` と
`_run_replay` / `_start_replay` → `_replayer.run` / `_replayer.start` の
置換だけ。**20 個の `if` の順序、`return` する分岐と落ちる分岐の別、
`msg['history']` の位置、`sec` の決め方、クロック 5 分岐の
`save_data()` の有無まで同じ。**

### 受信ループ（`app.py`）は `svr` の閉じ込め以外そのまま

旧 `__main__.py:43-83` と新 `app.py:66-106` は、`svr` がグローバルから
クロージャになった以外は 1 文字も違わない（差分で確認）。

- `WebSocketDisconnect` → `break`
- `json.JSONDecodeError` → `on_error()` して `continue`（接続を保つ）
- 受信のその他の例外 → `on_error()` して `break`
- `on_json()` の中の例外 → `on_error(ws, e, msg)` して**接続を保つ**
- `finally: await svr.on_disconnect(websocket)`

ルーティング（`Route` 3 本 ＋ `WebSocketRoute('/ws')` ＋ `Mount('/static')`）も
同じ並び。足されたのは `app.state.svr`（`app.py:119`）だけ。

### `tests/test_ws.py` の 2 件は、狙った経路を本当に通っている（実測）

`uv run pytest tests/test_ws.py -s` のログで、受け皿に届いた例外を確認した。

- `test_broken_json_keeps_connection`:
  `on_error()> c1@testclient:50000: e='JSONDecodeError':...` が出て、
  `msg=None`（受信側の分岐＝`app.py:85` を通った証拠。`on_json()` の
  受け皿なら `msg` に本文が入る）。そのあと次のメッセージが
  `on_json()> msg={... 'ch': 1 ...}` として処理されている
- `test_error_in_on_json_keeps_connection`:
  `on_error()> ... e='KeyError':KeyError('ch')` と
  `msg={'src': 'test', 'type': 'put_checker', 'data': {}, ...}` が出て、
  `app.py:101` の受け皿を通ったことが分かる。直後に次のメッセージが
  処理されている

**`TestClient` が握りつぶして素通りしている、ということはない。**
実装担当がわざと壊した 6 通りのうち 1・2 が、この 2 件を狙ったもの。

### 規約・形式

- 1 行 78 **文字**（`ruff` の `line-length = 78`）超えは、`src/` に 0 件。
  `tests/` に 4 件あるが、いずれも `b47895e` の時点から同じ行
  （`test_broadcast.py:114`、`test_on_json.py:315,342,371`）で、
  この項目で増やしたものではない
- `uv run ruff check .` → `All checks passed!`、
  `uv run mypy src` → `Success: no issues found in 11 source files`（実行して確認）
- ログはすべて `{}` と引数の形。新しい 4 ファイルに f-string のログは無い
  （grep 実測）。`{}` の数と引数の数も合っている
- クラスは `__log = getLogger(__qualname__)`、クラスの無い `app.py` は
  モジュール先頭に `_log`（`app.py:29`）。`GameInfo.__log` は注釈が
  無いので dataclass のフィールドにならない（`dataclasses.fields()` が
  8 個のまま、`to_dict()` のキーも 8 個、`copy()` の等価も成り立つことを実測）
- コメントは「なぜ」を書いている。TODO-009 / TODO-015 / TODO-016 /
  TODO-019 / TODO-024 の経緯は、移した先にそのまま付いて行っている
- `CLAUDE.md` の書き直しと実装に食い違いは見つからなかった。
  `create_app(svr_name, svr_ver, svr_id, image_dir)` の引数、
  `bg_server._replayer._task`、`ClientHub.broadcast()` の差し替え、
  `Replayer.run()` に `clear_hist` を渡すこと、モジュールの一覧、
  いずれも実装どおり

### 範囲

`src/` と `tests/` の差分に、指示の外の変更は見当たらない。
`TODO.md` の差分だけは TODO-025 と無関係（TODO-032 を新しく立てた分）で、
実装担当の報告にも出てこない。main の作業と思われるが、
**コミットを分けるかどうかは確認したほうがよい**（未確認）。
