# TODO

**残っている項目: TODO-003。** これまでに 2 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-004` から。**

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

- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
