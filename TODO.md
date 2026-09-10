# TODO

**残っている項目: TODO-004。**
これまでに 13 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-015` から。**

---

## TODO-004. save_data() のファイル I/O がイベントループを止める

- [ ] 実際にどれだけ止まるのかを測る
- [ ] 実害があるなら対処する

`add_history()` は 1 手ごとに `save_data()` を呼ぶ。`save_data()` は履歴全体を
毎回 JSON の文字列に組み立て直し、同期の `open()` と `write()` で書き出す。
**書いている間は asyncio のイベントループが止まる。** 止まっている間は、
他のクライアントのメッセージも、連続再生の次の 1 手も進まない。

TODO-003 で gevent へ移行したときに reviewer が見つけた。そのときは
「`monkey.patch_all()` が `builtins.open` を置き換えないので、書き込みの間は
全 greenlet が止まる」という形だった。TODO-009 で asyncio へ移しても
**同じことが起きる**（説明が変わっただけ）。保存は判断を先送りして、
同期のまま移してある。

- 履歴が伸びるほど 1 回の書き込み量が増え、止まる時間も伸びる。手元の
  `~/ytbg-1.json` は 38 手で 29 KB（2026-09-10 時点）
- **停止時間は測っていない。** この程度の量なら問題にならないと見ているが、
  根拠は無い。まず測ってから、対処するかを決める
- 連続再生（`backward_hist()` / `forward_hist()`）が `save_data()` を呼ぶのは、
  ループを抜けたあとの `finally` で 1 回だけ。1 手ごとではない
- `load_data()` も同期だが、コンストラクタの中で起動時に 1 回呼ぶだけなので、
  イベントループには関係しない
- 対処するなら `asyncio.to_thread()` へ逃がす。ただし `add_history()` が
  async になり、**コンストラクタから呼べなくなる**（`__init__` では
  await できない）。起動時の 1 回をどうするかまで含めて考える
- TODO-009 で残した「`broadcast()` はいちばん遅いクライアントを待つ」と
  **同じ性質の話**（1 か所の待ちが全体を止める）。まとめて測ってもよい

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
