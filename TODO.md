# TODO

**残っている項目: TODO-019。** これまでに 18 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-020` から。**

---

## TODO-019. 履歴を削除する機能をメニューから使えるようにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- [ ] サーバに履歴を消す処理を足す（`yt_backgammon_server.py`）
- [ ] `on_json()` に `clear_hist` の分岐を足す
- [ ] クライアントに `clear_hist()` を足す（`ytbg.js`）
- [ ] メニューに「履歴を削除」を足す（`index.html`）
- [ ] テストを足す（`src/` をわざと壊して落ちることも確かめる）
- [ ] `CLAUDE.md` の「履歴（戻す・進める）」に書き足す

### きっかけ

`_history` は溜まる一方で、消す手段がサーバの再起動しか無い。TODO-018 では
「上限を設けるのは、戻せる範囲が減るので損」として対応しないと決めたが、
**利用者が区切りたいときに自分で消せる**なら、その心配は要らない。

### 決めたこと

- **消す範囲は「今の盤面だけ残して全部消す」。** `_history` を現在の
  `gameinfo` 1 件だけにし、`_fwd_hist` は空にする。盤面そのものは変えない
- **押した人の画面に `confirm()` を出す。** 1 枚のボードを全員で共有して
  いるので、消すと全員の履歴が消え、元に戻せない

### 設計

- `clear_history()` を足す。`_fwd_hist` を空にし、`_history` を現在の
  `gameinfo` 1 件だけにして `sn` を振り直し、`save_data()` する
- `on_json()` の `clear_hist` は、**`_replay_lock` を握って
  `_cancel_replay()` してから消す**（`back` と同じ扱い）。連続再生の Task が
  走っている最中に `_history` を差し替えると、Task 側が pop し続けて壊れる
- 消したあと `emit_gameinfo()` で全員へ送る（`hist_i` / `hist_n` が 1 / 1 になる）
- メニューは「連続で進める(高速)」の下に新しい `<ul>` を作り、New Game の上に置く

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
