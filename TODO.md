# TODO

**残っている項目: TODO-018。**
これまでに 17 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-019` から。**

---

## TODO-018. _history が上限なく伸び続ける

- [ ] 上限を設けるのか、ゲームの区切りで分けるのか、何もしないのかを決める
- [ ] 決めたとおりに直す（何もしないなら、その理由を残す）

`new_game()` は `_history` をクリアしない。**プロセスを再起動しない限り、
何ゲーム続けても履歴は増え続ける**（クリアしているのはコンストラクタだけ）。

- `save_data()` の所要時間は履歴の数にほぼ比例する。TODO-004 で測ったところ
  38 手で 0.92ms、100 手で 2.3ms、300 手で 7.6ms。1 手ごとに保存するので、
  長く動かすほど 1 手あたりの待ちが伸びる
- 手元の `~/ytbg-1.json` は 38 手で 29KB、`~/ytbg-3.json` は 37 手で 28KB
  （2026-09-10 時点）。いまはまだ小さい
- **単純に上限で切ってよいかは決まっていない。** 戻せる範囲が減る。
  ゲームの区切りで別ファイルへ移す、という手もある

### 決めること

- 上限を設けるのか、ゲームの区切りで分けるのか、何もしないのか
- 何もしないと決めるなら、**どこまで伸びたら困るのか**の目安

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ（方針を決めるまで） |

- まず利用者と方針を決める項目なので、決めるところまでは担当を分けない。
  直すと決まったら、そこで担当を組み直す

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
