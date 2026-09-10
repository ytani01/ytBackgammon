# TODO

**残っている項目: TODO-022。** これまでに 21 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-023` から。**

---

## TODO-022. favicon が無く、初回ロードで 404 になる

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |

- [ ] favicon をどう用意するか決める
- [ ] 用意して 404 が出ないようにする
- [ ] `tests/browser/` の除外を外す

### きっかけ

TODO-021 でブラウザの確認を作ったときに実測した。初回ロードで
`/favicon.ico` が 404 になる。

```
INFO: 127.0.0.1:35490 - "GET /favicon.ico HTTP/1.1" 404 Not Found
```

`static/` に favicon が無く、`__main__.py` のルーティングにも
`/favicon.ico` が無い。ブラウザは初回ロードのときだけ取りに行くので、
リロードでは出ない。

実害はコンソールにエラーが 1 件出ることだけだが、
`tests/browser/helper.mjs` の `console_errors()` がこれを既知として
除外している。**除外があると、同じ経路の本当のエラーを見落としやすい。**

### 決めること

**favicon をどう用意するか。** 着手するときに相談する。

- ボードの画像（`static/images*/`）から作る。デザインごとに変えるかどうかも決まる
- 汎用の 1 枚を `static/` に置き、`index.html` に
  `<link rel="icon" ...>` を書く
- 空の 204 を返すルートを足す（画像を用意しない）

### 分担

`~/.claude/agents/` の常設の定義で足りる。

- **main** — 画像 1 枚とルート 1 つ。実装の担当を分けるほどの規模ではない
- **verifier** — `tests/browser/` を走らせ、除外を外しても通ることを確かめる
- **reviewer は入れない。** 分岐や条件式が変わらない

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-021.** ブラウザでの動作確認の仕組みを作る](archives/todo/TODO-021.%20ブラウザでの動作確認の仕組みを作る.md)
- [**TODO-020.** モジュール構成とクラス構成を見直す](archives/todo/TODO-020.%20モジュール構成とクラス構成を見直す.md)
- [**TODO-019.** 履歴を削除する機能をメニューから使えるようにする](archives/todo/TODO-019.%20履歴を削除する機能をメニューから使えるようにする.md)
- [**TODO-018.** _history が上限なく伸び続ける（対応しない）](archives/todo/TODO-018.%20_history%20が上限なく伸び続ける.md)
- [**TODO-015.** サーバからの受信を gameinfo 1 本にまとめる](archives/todo/TODO-015.%20サーバからの受信を%20gameinfo%201%20本にまとめる.md)
- [**TODO-004.** save_data() のファイル I/O がイベントループを止める（対応しない）](archives/todo/TODO-004.%20save_data()%20のファイル%20I_O%20がイベントループを止める.md)
- [**TODO-017.** load_gameinfo() が毎回チェッカーを全部置き直す](archives/todo/TODO-017.%20load_gameinfo()%20が毎回チェッカーを全部置き直す.md)
- [**TODO-016.** 再接続するとクロックの動作中／停止中が復元されない](archives/todo/TODO-016.%20再接続するとクロックの動作中／停止中が復元されない.md)
- [**TODO-010.** プロトコルを一方向にするか決める](archives/todo/TODO-010.%20プロトコルを一方向にするか決める.md)
- [**TODO-009.** Flask + gevent から Starlette + uvicorn へ移す](archives/todo/TODO-009.%20Flask%20+%20gevent%20から%20Starlette%20+%20uvicorn%20へ移す.md)
- [**TODO-014.** バージョンを git tag に連動させる](archives/todo/TODO-014.%20バージョンを%20git%20tag%20に連動させる.md)
- [**TODO-013.** on_json の分岐ごとのテストを足す](archives/todo/TODO-013.%20on_json%20の分岐ごとのテストを足す.md)
- [**TODO-012.** on_json のクロック系の分岐を消す](archives/todo/TODO-012.%20on_json%20のクロック系の分岐を消す.md)
- [**TODO-007.** board.roll が使われていない](archives/todo/TODO-007.%20board.roll%20が使われていない.md)
- [**TODO-011.** ruff の指摘を解消する](archives/todo/TODO-011.%20ruff%20の指摘を解消する.md)
- [**TODO-008.** app_top() と top.html を消す](archives/todo/TODO-008.%20app_top()%20と%20top.html%20を消す.md)
- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
