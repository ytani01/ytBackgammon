# TODO-003 レビュー報告（reviewer）

対象: `git diff`（未コミット）。`CLAUDE.md`, `TODO.md`, `pyproject.toml`,
`src/ytbg/__main__.py`, `uv.lock`。

**要修正: 0 件。** 実装そのものに直すべき点は見つからなかった。以下は
「検討」6 件と「好みの範囲」2 件、および確認して問題が無かった点。

---

## 検討

### 1. `TODO.md:11` — 済んだ項目にチェックが付いていない

```
- [ ] gevent に移行して、Werkzeug の開発サーバをやめる
```

実装は済み、verifier の検証も通っている（`archives/agents/TODO-003/verifier-report.md`）。
「切り分けの結果」「対処」の節も既に書かれているのに、チェックボックスだけが
未チェックのまま。コミット前に確認してチェックする。

根拠: 利用者の `CLAUDE.md`「チェックボックスは、終わったものを確かめてから
マークする」。

### 2. `TODO.md:46` の記述が不正確

```
- gevent ではアクセスログが既定で出なくなるので、`-d` のときだけ出す
```

gevent 自体は逆で、`pywsgi.WSGIServer.__init__` の既定は `log='default'` =
`sys.stderr` へ出す（実測: `inspect.getsource(gevent.pywsgi.WSGIServer.__init__)`
の `_make_log`）。出なくなるのは flask_socketio の `run()` が
`log_output = kwargs.pop('log_output', debug)` で既定を `debug`(=False) にし、
`log = None` を渡すため（`.venv/lib/python3.14/site-packages/flask_socketio/__init__.py:621,718-727`）。

正しくは「flask_socketio の `run()` は `log_output` の既定が `debug`(=False) で、
アクセスログが出なくなる」。`TODO.md` はこのあと `archives/todo/` に残る文書なので、
直すなら今。

### 3. `ytbg-boot.sh` は常に `-d` を付ける

`ytbg-boot.sh` は 4 サーバとも `-d` 付きで起動する（`ytbg.sh -d -p $_port ...`）。
「アクセスログは `-d` のときだけ」という設計にしたが、**通常運用では 4 サーバ分の
アクセスログが常に出る**ことになる。socket.io の polling は数秒おきに GET/POST を
投げるので、行数はかなり増える。

これを許容するのか、`ytbg-boot.sh` から `-d` を外すのかは利用者の判断。
今回の差分の範囲外なので、直すなら別項目。

### 4. `save_data()` のファイル I/O は gevent では協調しない

`monkey.patch_all()` を呼んでも `builtins.open` は組み込みのまま（実測:
patch 後に `builtins.open` を表示すると `<built-in function open>`）。gevent は
通常ファイルの読み書きを patch しないので、`save_data()` / `load_data()` の間は
**プロセス全体（全 greenlet）が止まる**。

threading モードでは書き込み中に GIL が解放され、他スレッドが進めた。ここは
挙動が変わっている方向。`add_history()` は 1 手ごとに `save_data()` を呼ぶので、
履歴が伸びるほど 1 回の停止時間が伸びる。同じ理由で、連続再生を止める要求
（`_repeat_flag` の書き換え）の反映も `save_data()` の間だけ遅れる。

**実害の大きさは未確認**（保存ファイルのサイズと書き込み時間を測っていない）。
現状の 1 面・数 KB の JSON なら問題にならないと見るが、体感で引っかかるようなら
`gevent.fileobject` か別 greenlet への追い出しを検討することになる。

### 5. アクセスログが `MyLogger` を通らない

`log='default'` は `sys.stderr` そのもの（上の 2 と同じ根拠）。verifier のログ例
`127.0.0.1 - - [2026-09-10 00:29:57] "GET / HTTP/1.1" 200 10796 0.010539` のとおり、
`MyLogger` の書式とは揃わない。

`CLAUDE.md`「書き方の慣習」に「ログは `MyLogger.get_logger()` を使い」とある
一方、`socketio.run()` 経由では logger を渡せない（bool の `log_output` だけ）。
揃えるなら `pywsgi.WSGIServer` を自前で組む必要があり、この規模では割に合わない。
**現状の選択で妥当**だと考えるが、`CLAUDE.md` に「アクセスログだけは pywsgi が
stderr へ直接書く」と一行足しておくと、次に見たときに迷わない。

### 6. `E402` は今の設定では出ないが、選択を広げると落ちる

`monkey.patch_all()` の後ろに import が並ぶので E402 に当たる形だが、この
プロジェクトの ruff 設定では検出されない（実測: `uv run ruff check .` は 19 errors
= HEAD と同数。`--select E402` を明示すると `src/ytbg/__main__.py` に 8 件出る）。
`ruff check --show-settings` の enabled rules に
`module-import-not-at-top-of-file` は入っていない。

つまり**今回の差分で lint は増えていない**（HEAD を `git archive` で取り出して
同じ ruff にかけ、19 errors で一致することを確認した）。将来 `E` を全部選ぶと
一斉に落ちるので、`# noqa: E402` を付けておくか、放置するかは判断。

---

## 好みの範囲

- `src/ytbg/__main__.py:117` の `port=int(port)` は、click が `type=int` で
  既に int にしているので冗長。変更前からある書き方で、今回触った行なので参考まで
- 同 111 行のコメント「Werkzeug の開発サーバは websocket を扱えず」は簡略化。
  実際は「アップグレード後のソケットを keep-alive で読み直してしまう」。
  詳細は `TODO.md` 側にあるので、コメントはこのままでよいと考える

---

## 確認して問題が無かった点

### `monkey.patch_all()` の位置

- `logging` は patch より前に import されていない（実測:
  `import ytbg` 直後に `'logging' in sys.modules` が `False`）。
  patch 後に `my_logger` が読まれるので、gevent が最も嫌う並びは避けられている
- `threading` は `ytbg/__init__.py` の `importlib.metadata` 経由で先に入っているが
  （実測）、gevent は既存の `threading` を in-place で patch し、`logging` が
  設定済みなら `logging._lock` も差し替える
  （`.venv/lib/python3.14/site-packages/gevent/monkey/_patch_thread_common.py:212-229`）。
  `-W error::Warning` を付けて `ytbg.__main__` を import しても MonkeyPatchWarning は
  出なかった（実測）
- ただし前提は「`src/ytbg/__init__.py` が `socket` / `ssl` を触らない」こと。
  `CLAUDE.md` の追記は「import の順番を変えない」までなので、`__init__.py` に
  import を足さない、という条件も含む理解でよいかは一応確認しておきたい

### `async_mode='gevent'` の明示

妥当。engineio の自動検出は eventlet → gevent_uwsgi → gevent → threading の順なので、
明示しておけば将来 eventlet が依存に紛れ込んでも切り替わらない。明示すると gevent が
無いときはフォールバックせずエラーになるが、`pyproject.toml` の必須依存にしたので整合。
実測で `socketio.async_mode` / `socketio.server.eio.async_mode` とも `gevent`。

### `log_output=debug` とリローダ

`run()` は `debug = kwargs.pop('debug', app.debug)`。`app.config['DEBUG'] = False`
なので `debug=False` → `use_reloader=False`、`DebuggedApplication` も挟まれない
（`flask_socketio/__init__.py:620-652`）。`log_output` だけを別に渡しているので、
「アクセスログだけを `-d` で切り替え、リローダは無効のまま」という意図どおり。

なお `pywsgi` の `error_log` は `log` と別引数で `'default'`(=stderr) のまま
残るので、**アプリ例外のトレースバックは `-d` なしでも出る**（実測: `_make_log`）。
落ちたときに何も出ない、という事故にはならない。

### websocket の実装（gevent-websocket は不要）

- engineio の gevent ドライバは gevent-websocket が無ければ simple-websocket に
  フォールバックし、その際 gevent の `Event` / `selectors` / Greenlet を渡す
  （`engineio/async_drivers/gevent.py:1-42`）。monkey patch の有無に依存しない作り
- simple-websocket は python-engineio の必須依存（`uv.lock` の python-engineio の
  dependencies に `simple-websocket`）なので、消える心配も無い
- gevent-websocket を足すと `flask_socketio.run()` が `WebSocketHandler` 経路へ
  切り替わる（`flask_socketio/__init__.py:711-724`）。Python 3.14 での動作は
  未確認で、変更が増えるだけ。**足さない判断でよい**

### mypy overrides への `gevent,gevent.*` 追加

必要。override から gevent を外して mypy をかけると
`src/ytbg/__main__.py:14: error: Library stubs not installed for "gevent" [import-untyped]`
が出る（実測）。既存の click / flask と同じ書き方で統一されており、置き場所も適切。
（mypy は `types-gevent` を勧めてくるが、他の依存と揃える方を採ったのは妥当）

### threading → greenlet で競合の起き方が変わっていないか

- python-socketio は `async_handlers=True` が既定で、イベントごとに
  `start_background_task` を起こす（`socketio/server.py:590`）。threading では
  スレッド、gevent では greenlet。**同時実行の意味は変わっていない**
- `backward_hist()` / `forward_hist()` の `_repeat_flag` の受け渡しは
  `time.sleep()` を挟むので greenlet でも成立する（verifier が実測）
- むしろ切り替わり点が yield（`time.sleep` と `emit` の I/O）に限られる分、
  `_history.pop()` → `_bg._gameinfo` 代入の間で割り込まれる余地は減っている。
  競合は起きにくくなる方向

### 範囲

指示に無い変更は見当たらない。`uv.lock` の増分（cffi / greenlet / pycparser /
zope-event / zope-interface）は gevent の依存で、すべて aarch64 の wheel がある。
