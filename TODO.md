# TODO

**残っている項目: TODO-004、TODO-009、TODO-010、TODO-013。**
これまでに 9 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-014` から。**

---

## TODO-004. save_data() のファイル I/O が gevent では全体を止める

- [ ] 実際にどれだけ止まるのかを測る
- [ ] 実害があるなら対処する

`add_history()` は 1 手ごとに `save_data()` を呼ぶが、`save_data()` は履歴全体を
毎回 JSON 文字列に組み立て直してファイルに書き込む。`monkey.patch_all()` は
`builtins.open` を置き換えないため、gevent は通常ファイルの読み書きを非同期に
しない。そのため 1 回の書き込みの間、プロセス全体（全 greenlet）が止まり、
他のクライアントの処理も進まない。

threading のときは書き込み中に GIL が解放されるので、他のスレッドは進めた。
TODO-003 で gevent へ移行したときに、reviewer が見つけた。

- 履歴が伸びるほど 1 回の書き込み量が増え、止まる時間も伸びる
- 連続再生を止める要求（`_repeat_flag` の書き換え）の反映も、`save_data()` の
  実行中は遅れる
- **停止時間は測っていない。** 今の規模（数 KB の JSON）なら問題にならないと
  見ているが、根拠は無い。まず測ってから、対処するかを決める
- 対処するなら、`gevent.fileobject` を使うか、保存を別の greenlet へ追い出す
- **TODO-009 で Starlette + uvicorn へ移したら、この節を書き直す。** asyncio でも
  `open()` はイベントループを止めるので問題は残るが、gevent 前提の説明と
  `gevent.fileobject` の案は当てはまらなくなる（対処は `asyncio.to_thread()`）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

---

## TODO-009. Flask + gevent から Starlette + uvicorn へ移す

- [ ] サーバを Starlette + 素の WebSocket + uvicorn で書き直す
- [ ] `ytbg.js` の通信部分を素の WebSocket に替え、再接続を足す
- [ ] `index.html` から socket.io の CDN 読み込みを消す
- [ ] テストを async に合わせる
- [ ] `ytbg.sh` と `CLAUDE.md` を直す

gevent は `monkey.patch_all()` が前提なので、import の順番と `__init__.py` に
置ける import が縛られている（TODO-003、TODO-005）。socket.io は再接続以外の
機能を使っておらず、`index.html` が CDN から読んでいるので外部に依存する。
asyncio へ移せば待ちが `await` として見え、通信層も薄くなる。

利用者と相談して決めたこと。

- **Starlette + 素の WebSocket + uvicorn にする。** Tornado も候補だったが、
  ASGI の外に出るので選ばなかった（python-socketio の Tornado 対応は
  `# pragma: no cover` で、作者のテストが通っていない）
- **socket.io はやめる。** 使っているのは再接続だけ。ping は uvicorn が
  既定で 20 秒ごとに送り（`ws_ping_interval`）、ブラウザは pong を自動で
  返すので JS 側には要らない。**インターネット越しに使うが**、`on_connect`
  が `gameinfo` を丸ごと送るので、つなぎ直せば復旧する。取りこぼした差分を
  埋める仕組みは要らない
- **プロトコルの一方向化はこの項目ではやらない。** 今は操作メッセージの
  転送と状態の丸ごと送信の 2 経路があり、同じ更新ロジックが Python と JS の
  両方にある。直すなら `ytbg.js` の作り直しになるので、別に立てる

やること。

- `emit(..., broadcast=True)` の代わりに、接続中の WebSocket の集合を持って
  回す。今の `_client_sid` がその実体になる
- 連続再生の `time.sleep()` を `await asyncio.sleep()` に、`_repeat_flag` を
  Task の `cancel()` に置き換える
- `emit()` がリクエストコンテキストに依存しなくなるので、`conftest.py` の
  差し替えを見直す

変えないもの。

- メッセージの形（`{src, type, data, history}`）
- 保存の形式と `save_data()` の呼び方。**同期のまま移す。**
  `asyncio.to_thread()` へ逃がすかは TODO-004 で決める
- 盤面のロジック、画像、`ytbg.html`

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- 複数のファイルにまたがり、実装・テスト・文書が同時に要るので実装も分ける
- 通信層が変わるのでレビューの担当も入れる
- ブラウザでの操作確認は verifier に任せる（TODO-003 と同じ手順が使える）

---

## TODO-010. プロトコルを一方向にするか決める

**TODO-009 が済んでから着手する。** 通信層が変わったあとで考える。

- [ ] `ytbg.js` のどこに盤面の更新ロジックがあるかを調べ、波及範囲を見積もる
- [ ] 一方向にするか、今のままにするかを決める

今は同じ変化を 2 つの経路で伝えている。操作系（`put_checker`、`dice` など）は、
サーバが状態を更新したうえで**受け取ったメッセージをそのまま全員へ転送**し
（`yt_backgammon_server.py:426`）、受け取った JS が**自分でもう一度同じ操作を
適用する**。履歴系（`back`、`fwd`、`new`）は `emit_gameinfo()` で**状態を
丸ごと送る**。

結果、**同じ更新ロジックが Python と JS の両方にある**。`CLAUDE.md` の
「`type` を足すときは両方直す」は、この設計の帰結。ズレたら壊れる。

### 決めること

一方向にするかどうか。一方向にすると、

- クライアント → サーバ: **操作だけ**
- サーバ → 全クライアント: **更新後の状態 ＋ 直前の操作**
- クライアントは**描画するだけ**

`type` の二重定義が消え、JS から更新ロジックが消える。「直前の操作」を添える
のは、チェッカーが動くアニメーションに必要だから（状態だけでは、どこから
動いたか分からない）。

### 引っかかる点

- **自分の操作の反応が遅くなる。** 今はクライアントが自分で先に適用するので
  即座に映る。一方向にすると往復を待つことになり、**インターネット越しでは
  体感に出る**。先に描いてサーバの状態で上書きする（楽観的更新）なら防げるが、
  そうすると JS 側に更新ロジックが残り、目的の一部が失われる。ここが判断の
  分かれ目
- 1 手ごとに `gameinfo` 全体を送るので通信量が増える。ただし履歴操作では
  今も全体を送っている
- `ytbg.js` は 4000 行超。改造の規模が読めていない

### 選択肢

- 一方向にする（往復を待つ）
- 一方向にしつつ、自分の操作だけ楽観的更新にする
- 今のまま 2 経路を残す

**波及範囲を調べたうえで、利用者に選んでもらう。**

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | Explore（調査） |

- 調べて決めるだけでコードは変えないので、確認とレビューの担当は置かない
- `ytbg.js` の調査は Explore に任せる。読ませたいファイルは依頼文で名指しする

---

## TODO-013. on_json の分岐ごとのテストを足す

**TODO-012 が済んでから着手する。** 消すものを消した最終形に
対して書く（逆順だとテストを二度直すことになる）。

- [ ] `on_json()` の `type` ごとに、`gameinfo` の変化と送られるメッセージを
      確かめるテストを書く
- [ ] `conftest.py` の `emit` の差し替えを、送られたメッセージの列を見る形へ
      寄せる

TODO-009 で通信層を入れ替えたときに壊れるとしたら `on_json()` の分岐。
「この `type` を投げたら `gameinfo` がこう変わり、こう送られる」を先に
固めておけば、移行後は同じテストを通すだけで済む。

いまの `tests/` は 10 件で、`gameinfo` の更新、履歴、保存・読み込みだけを
見ている（TODO-006）。

- `conftest.py` の `emit` の差し替えは `flask_socketio.emit` が前提。
  **テスト側は「送られたメッセージの列」を見る形に寄せておく**と、
  移行時はフィクスチャだけ直せば残せる
- `back` / `fwd` 系には `sleep_sec=0` を渡す（`gevent.monkey.patch_all()` は
  呼ばない）
- ブラウザ側の JS はテストしない。今までどおり実際に触って確かめる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- テストの量があるので実装も分ける
- 「分岐を網羅しているか」ではなく「守るべきものを守っているか」を見るには
  別の目が要るので、レビューの担当も入れる

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-012.** on_json のクロック系の分岐を消す](archives/todo/TODO-012.%20on_json%20のクロック系の分岐を消す.md)
- [**TODO-007.** board.roll が使われていない](archives/todo/TODO-007.%20board.roll%20が使われていない.md)
- [**TODO-011.** ruff の指摘を解消する](archives/todo/TODO-011.%20ruff%20の指摘を解消する.md)
- [**TODO-008.** app_top() と top.html を消す](archives/todo/TODO-008.%20app_top()%20と%20top.html%20を消す.md)
- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
