# TODO

**残っている項目: TODO-004、TODO-015、TODO-016。**
これまでに 13 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-017` から。**

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

## TODO-015. サーバからの受信を gameinfo 1 本にまとめる

**TODO-016 を先に済ませたほうがきれいになる。** クロックの動作中フラグと
`clock_sw` が `gameinfo` に載らないままだと、クロック系のメッセージだけが
例外として残る。

- [ ] サーバ: 操作系も `emit_gameinfo()` で返すようにし、直前の操作を添える
- [ ] クライアント: `ws.onmessage` の 8 分岐を消し、`gameinfo` と直前の操作から
      描き直す
- [ ] `tests/` と `CLAUDE.md` を直す

TODO-010 で「受信側だけ一方向にする」と決めた。サーバ → クライアントを
`gameinfo` ＋直前の操作の 1 本にまとめ、`type` の二重定義を無くす。

今は操作系（`put_checker`、`cube`、`dice`、`set_turn`、`set_playername`、
`set_score`、`set_clock_limit`、`set_player_clock` の 8 種類）で、サーバが
`gameinfo` を更新したうえで**受け取ったメッセージをそのまま転送**し、
受け取った JS が自分でもう一度同じ操作を適用している
（`yt_backgammon_server.py:540`、`ytbg.js:4210-4300`）。これを
`emit_gameinfo()` に寄せる。

「直前の操作」を添えるのは、チェッカーが動くアニメーションに必要だから
（状態だけでは、どこから動いたか分からない）。`emit_gameinfo()` は今も
`sec` を送ってアニメーションの時間を渡しているので、そこへ足す形になる。

### 変えないと決めていること（TODO-010）

- **ルール判定は JS 側に残す。** サーバにルール判定は 1 つも無く、移すと
  `yt_backgammon.py` にルールを新規実装することになる。`CLAUDE.md` の
  「ルールチェックは補助であり free move で無効化できる」とも合わない
- **先行適用は残す**（`ytbg.js:2557`、`2572`）。`on_mouse_up_xy()` は
  emit した直後に `put_checker()` を先行実行し、その盤面で `check_disable()` と
  `winner_is()` を呼ぶ。往復を待つと判定が 1 手古い盤面で走る

### 気をつけること

- **`gameinfo` を丸ごと送るので通信量が増える。** 履歴操作では今も全体を
  送っているので、増えるのは操作系の分
- **`resign` はサーバだけ、クロック系の 5 つは JS だけに分岐がある。**
  数を合わせるときに落とさない
- `emit_gameinfo()` は `broadcast()` を通るので、**いちばん遅い
  クライアントを待つ**（TODO-009 で残した制約）。操作系もその待ちに
  乗ることになる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- `ytbg.js` と `yt_backgammon_server.py` の両方が変わり、テストと `CLAUDE.md` も
  まとまって要るので、実装の担当も分ける
- 挙動が変わる項目なので、確認とは別にレビューの担当も入れる

## TODO-016. 再接続するとクロックの動作中／停止中が復元されない

- [ ] サーバがクロックの動作中フラグと `clock_sw` を保持する
- [ ] `on_connect()` で `gameinfo` と一緒に送る
- [ ] クライアントが受け取って復元する

TODO-010 の調査で見つかった。クロックが動いている最中に再接続すると、
**必ず停止した表示になる。**

`gameinfo` にはクロックの残り秒数（`board.clock`）しか無く、動いているか
どうかのフラグが無い。`Board.load_gameinfo()` は `history_flag` が偽のとき、
秒数を入れる前に必ず `player_clock[p].stop()` を呼ぶ（`ytbg.js:3587-3592`）。
動作中かどうかは `start_clock` / `stop_clock` / `resume_clock` という
その場限りのメッセージでしか伝わらず、サーバはこれらを解釈せずに転送する
だけなので（`yt_backgammon_server.py:496-540`）、あとから入ったクライアントには
届かない。`clock_sw`（クロック機能そのものの ON/OFF）も同じで、
`set_clock_switch` でしか伝わらない。

### 決めたこと（TODO-010 で利用者と相談した）

- **`gameinfo` には足さず、サーバが別に持つ。** `gameinfo` に足すと履歴にも
  載り、`back` / `fwd` で巻き戻したときにクロックの発着まで巻き戻ってしまう。
  `save_data()` の `hist_ent2str()` を直す必要も出る
- **`free_move` は各自の設定のままにする。** 盤面の状態ではなく「自分が
  ルールチェックを外す」操作設定で、操作そのものは転送されて盤面は同期する。
  この項目では触らない

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- 変更は小さいが挙動が変わるので、実装は main が行い、確認とレビューを分ける

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
