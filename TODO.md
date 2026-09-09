# TODO

**残っている項目: TODO-001、TODO-002、TODO-003。** これまでに 0 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-004` から。**

---

## TODO-001. uv への移行

- [ ] `pyproject.toml` を作る（hatchling + hatch-vcs、`requires-python >=3.14`、
  `[project.scripts] ytbg`、dev グループに ruff / mypy）
- [ ] `src/ytbg/` レイアウトへ移す（`ytbg.py` → `__main__.py`、
  `ytBackgammonServer.py` / `ytBackgammon.py` / `MyLogger.py` を配下へ。
  `templates/` と `static/` は ytsched に倣って `src/ytbg/webroot/` へ）
- [ ] 依存を最新へ（Flask 3 / Flask-SocketIO 5.x）。`emit(broadcast=True)` と
  `JSON_AS_ASCII` の扱いを直す
- [ ] クライアント側の socket.io を 1.3.5 → 4.x へ（`templates/index.html`）
- [ ] `setup.sh` を廃止し、`ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh` を
  `uv run` ベースに書き換える
- [ ] `requirements.txt` を削除、`.gitignore` を uv 向けに直す
- [ ] `README.md` と `CLAUDE.md` の実行手順を更新する

他のプロジェクト（ytsched）と同じく uv に揃える。以下は決まっているので
項目にはしない。

- `requirements.txt` のピンは既に矛盾していて uv では解決できない
  （`Flask-SocketIO==4.3.2` は `python-socketio>=4.3,<5` を要求するのに
  `python-socketio==3.1.2` を指定している）
- Flask-SocketIO 4.3.2 は Flask 3 で `_request_ctx_stack` の ImportError に
  なる。Python 3.14 で使うなら 5.x へ上げるしかない
  （5.16 で import が通ることは実測した）
- 5.x でも `emit(..., broadcast=True)` は残っているので Python 側の修正は
  僅か。実質の山はクライアント側 socket.io の更新と、ブラウザでの動作確認
- テストの仕組みは無いので、確認はブラウザで実際に触って行う
  （`ytbg-boot.sh` で 4 面）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

複数のファイルにまたがり、実装とスクリプトと文書がまとまって要るので
実装を分ける。SocketIO の版が上がって挙動が変わるので、確認とは別に
レビューも入れる。担当はグローバルの `~/.claude/agents/` の定義で足りる。

---

## TODO-002. ruff / mypy の指摘を解消する

- [ ] TODO-001 で導入した ruff / mypy の指摘を片付ける

既存のコードには相当数の指摘が出るはずなので、移行そのものとは分ける。
TODO-001 では設定を置いて通すところまで（必要なら除外を書く）にとどめる。

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort high | implementer + verifier |

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
  （TODO-001 では「別の判断」として保留した）
- ブラウザでタブを閉じたときにも同じことが起きるかは未確認

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier |

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

（まだ無い）
