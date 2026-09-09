# TODO-003. 切断のたびにログへ ConnectionError と 500 が出る

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 72,434 | 137,102 | 73% |
| reviewer | Opus 5 | high | 14,772 | 121,468 | 18% |
| verifier | Sonnet 5 | medium | 7,410 | 117,136 | 9% |
| 合計 |  |  | 94,616 | 375,706 | 概算 $9.8 |

- reviewer は定義のモデルが sonnet。挙動が変わる項目なので Opus 5 に上書きした
- 最初に verifier と reviewer を同時に起動したときは、セッションの上限に当たって
  2 つとも途中で落ちた。上限が戻ってから 1 つずつ起動し直している。
  落ちた分の消費も上の表に含まれる

## きっかけ

TODO-001（uv への移行）の確認中に見つかった。クライアントが切断したタイミングで、
サーバのログに websocket アップグレードの GET に対する 500 と
`ConnectionError` のトレースバックが出る。機能は壊れていないが、ログが読みにくい。

```
"GET /socket.io/?transport=websocket&EIO=4&sid=...&t=... HTTP/1.1" 500 -
  File ".../engineio/async_drivers/_websocket_wsgi.py", line 19, in __call__
    raise ConnectionError()
```

## やったこと

### 切り分け

- **Werkzeug の開発サーバが websocket を扱えないことが原因。**
  simple-websocket は「このソケットはもう HTTP ではない」と伝えるために
  `ConnectionError` を投げるが、Werkzeug はそのソケットを keep-alive で
  読み直してしまう。手元で再現したときは 400（`Bad HTTP/0.9 request type` に
  続いて websocket のフレームがそのまま出る）だった。500 と 400 の違いは
  経路の差で、根は同じ
- **polling だけで繋いで切断したときは、何も出ない**（実測）
- **古い版で出ていなかったのは、websocket を使っていなかったから。**
  `python-engineio` 3.13.2 の threading ドライバは `_async['websocket']` が
  `None` で、Werkzeug 上では polling しか使えなかった。engineio 4.x で
  simple-websocket 経由の websocket が入り、アップグレードするようになった。
  uv への移行そのものではなく、それに伴うバージョンアップで現れた

### 対処

利用者と相談し、4 つの案（polling に固定する / 本番向けの WSGI サーバに
替える / ログを抑える / 対応しない）から **gevent への移行**を選んだ。

- `pyproject.toml` に `gevent>=26.8.0` を足した（Python 3.14 の
  aarch64 wheel がある）
- `src/ytbg/__main__.py`
  - ファイルの先頭、他の import より前に `monkey.patch_all()` を置いた。
    履歴の連続再生が `time.sleep()` を使っているので、置き換えないと
    再生中にサーバ全体が止まる
  - `SocketIO(..., async_mode='gevent')` と明示した。自動検出の順は
    eventlet → gevent_uwsgi → gevent → threading で、明示しておけば
    将来 eventlet が依存に紛れ込んでも切り替わらない
  - `socketio.run()` から `allow_unsafe_werkzeug=True` を外し、
    `log_output=debug` を渡した。flask_socketio の `run()` は
    `log_output` の既定が `debug`(=False) なので、そのままだと
    アクセスログが出ない
- `pyproject.toml` の mypy overrides に `gevent,gevent.*` を足した
  （gevent には型スタブが無く、既存の click / flask と同じ扱いにした）
- `CLAUDE.md` に、gevent で動かすこと、`monkey.patch_all()` があるので
  import の順番と `__init__.py` の import を変えないこと、アクセスログは
  `pywsgi` が stderr へ直接書くので `MyLogger` の書式とは揃わないことを書いた

## 確かめたこと

- `uv run ruff check .` は 19 errors、`uv run mypy src` は 9 errors。
  どちらも変更前と同数（TODO-002 で残した既存の指摘）
- socketio クライアントで接続・切断。`transports=['polling']` と
  `['polling','websocket']` の両方で、切断の 5 秒後まで見て
  400 / 500 / トレースバックが出ないこと
- 履歴の連続再生の最中に `curl` が 0.01 秒で 200 を返すこと
  （`monkey.patch_all()` が効いている）
- `-d` を付けたときだけアクセスログが出ること
- **ブラウザ（playwright、画面表示あり）で 2 タブを開いて操作した。**
  お互いに Roll でダイスを振り（先手決め）、チェッカーをドラッグし、
  1 手戻す・進める、全部戻す（連続再生）を行い、片方のタブを閉じた。
  同期は取れ、連続再生の最中も他方のタブが 0.004 秒で応答し、
  ログにトレースバックは 1 件も出なかった
- `./ytbg-boot.sh` で 4 サーバを起動し、5001〜5004 がすべて 200 を返すこと

## 残ること

- **`save_data()` / `load_data()` のファイル I/O は gevent では協調しない。**
  `monkey.patch_all()` を呼んでも `builtins.open` は組み込みのままで、
  読み書きの間はプロセス全体が止まる。threading のときは他のスレッドが
  進めたので、振る舞いが変わっている。今の規模（数 KB の JSON）なら
  実害は小さい見込みだが未確認。**TODO-004 として立てた**
- `ytbg-boot.sh` は 4 サーバとも `-d` 付きで起動するので、通常運用では
  アクセスログが常に出る。項目にはしないと決めた
- `__main__.py` の `ytBackgammonServer(..., debug=True)` は `-d` の値に
  関わらず True 固定（以前からの振る舞い）。項目にはしないと決めた

## 分担の振り返り

`archives/agents/TODO-003/` に依頼と報告がある。

- **verifier**（Sonnet 5 / effort medium）は、lint が増えていないこと、
  切断時のエラーが消えたこと、連続再生の最中も応答が返ること、`-d` の
  効き方を実測した。範囲外だが `debug=True` の固定にも気づいた
- **reviewer**（Opus 5 / effort high）は要修正 0 件としたうえで、
  `TODO.md` の「gevent ではアクセスログが既定で出なくなる」が不正確
  （出なくするのは flask_socketio の `log_output` の既定）という指摘、
  `save_data()` が gevent では協調しないという指摘、`ytbg-boot.sh` が
  常に `-d` である指摘を出した。gevent-websocket を足さなくてよい根拠も
  取っている。**文書の誤りは reviewer だけが見つけた**
- 見込み（`implementer + verifier`）は着手時に `verifier + reviewer` へ
  書き直した。方針が gevent 移行に決まった時点で、変更は小さいが挙動は
  変わると分かったので、実装より確認とレビューに重みがあると見た。
  結果もそのとおりで、実装は main だけで足りた
- **料金は main が 73% を占めた。** 切り分けの実測（サーバを起動して
  socketio クライアントで試す、engineio 3.x と 4.x のコードを見比べる）と、
  ブラウザでの確認を main がやったため
- **次に同じ規模の項目をやるなら、ブラウザでの確認まで verifier に渡す。**
  playwright のスクリプトを書いて動かし、ログを見るだけなので判断は要らない。
  切り分けは判断が続くので main に残す
- **サブエージェントを同時に 2 つ起動しない。** 最初に verifier と reviewer を
  同時に起動して、両方ともセッションの上限で落とした。1 つずつ起動すれば
  落ちた分の消費は要らなかった
