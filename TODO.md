# TODO

**残っている項目: TODO-002、TODO-003。** これまでに 1 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-004` から。**

---

## TODO-002. ruff / mypy の指摘を解消する

安全に直せるものだけを直す。挙動が変わりうるものは今回やらず、決着させる
ときに新しい項目として立てるかを相談する（2026-09-09 に決めた）。
着手時点の指摘は ruff 38 件、mypy 33 件。

- [ ] モジュール名を snake_case にする（N999 3 件）。
      `MyLogger.py` → `my_logger.py`、`ytBackgammon.py` → `yt_backgammon.py`、
      `ytBackgammonServer.py` → `yt_backgammon_server.py`。
      クラス名とプロジェクト名（`ytBackgammon`）は変えない
- [ ] 機械的に直せるものを直す（I001 2 件、PLR2044 3 件、C408 2 件、
      PLR1711 2 件、RUF059 1 件）
- [ ] shebang を消す（EXE001 2 件）。`my_logger.py` と
      `yt_backgammon_server.py` は import 専用なので消す。`chmod +x` はしない
- [ ] `open()` を `Path.open()` にする（PTH123 2 件）
- [ ] `get_logger()` の 2 分岐を `or` で統合する（SIM114 1 件）。
      `type(debug) == int` は `isinstance` に変えない。変えると `bool` が
      `int` 扱いになり、`debug=True` で `setLevel(True)`（= 1）になってしまう
- [ ] `_datafile_path` の組み立てを f-string にする（UP031 1 件）
- [ ] `_gameinfo` に型注釈を付ける（mypy の `Any | None` 24 件）
- [ ] `yt_backgammon_server.py` の `__class__` を調べる（mypy 1 件）。
      同じ書き方の `yt_backgammon.py` で出ない理由が掴めなければ今回は残す

### 今回やらないもの

- **UP031 17 件** — すべて `hist_ent2str()` の中。保存ファイルの中身そのもので、
  `%d` と `{}` では float が来たときの結果が違う
- **BLE001 2 件** — `load_data()` / `save_data()` の `except Exception`。
  捕まえる例外を絞るのは挙動の変更になる
- **mypy 7 件** — `__main__.py` のグローバル `svr = None`。`None` の判定を
  足すと挙動が変わる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

---

## TODO-003. 切断のたびにログへ ConnectionError と 500 が出る

- [ ] 古い版（Flask-SocketIO 4.x / socket.io 1.3.5）でも出ていたのかを切り分ける
- [ ] 出さずに済ませられるなら対処する

TODO-001 の確認中に見つかった。クライアントが切断したタイミングで、
サーバのログに websocket アップグレードの GET に対する 500 と
`ConnectionError` のトレースバックが出る。

```
"GET /socket.io/?transport=websocket&EIO=4&sid=...&t=... HTTP/1.1" 500 -
  File ".../engineio/async_drivers/_websocket_wsgi.py", line 19, in __call__
    raise ConnectionError()
```

- クライアントが polling で繋いだあと、裏で websocket へのアップグレードを
  試みる。その GET が届いた時点で既にソケットが消えていると起きる（競合）
- Flask-SocketIO のイベントハンドラ（`on_error`）は経由しておらず、
  WSGI のレベルで 500 を返しているだけ。**機能は壊れていない**
- **Werkzeug の開発サーバを使っていることが原因かもしれない。**
  そうであれば、本番向けの WSGI サーバに替えるかどうかという話になる
  （TODO-001 では別の判断として保留した）
- ブラウザでタブを閉じたときにも同じことが起きるかは未確認

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier |

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
