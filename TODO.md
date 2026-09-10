# TODO

**残っている項目: TODO-015、TODO-018。**
これまでに 16 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-019` から。**

---

## TODO-015. サーバからの受信を gameinfo 1 本にまとめる

**前提の TODO-016 と TODO-017 は済んだ。** クロックの状態はサーバが持つように
なり、`load_gameinfo()` は位置が変わったチェッカーだけを動かすようになった。

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
- **`resign` はサーバだけに分岐がある。** 数を合わせるときに落とさない。
  クロック系の 5 つ（`set_clock_switch` / `start_clock` / `stop_clock` /
  `resume_clock` / `reset_clock`）は TODO-016 でサーバにも分岐ができたので、
  今は両方にある
- `emit_gameinfo()` は `broadcast()` を通るので、**いちばん遅い
  クライアントを待つ**（TODO-009 で残した制約）。操作系もその待ちに
  乗ることになる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- `ytbg.js` と `yt_backgammon_server.py` の両方が変わり、テストと `CLAUDE.md` も
  まとまって要るので、実装の担当も分ける
- 挙動が変わる項目なので、確認とは別にレビューの担当も入れる

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
