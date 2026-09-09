# TODO

**残っている項目: TODO-004、TODO-007、TODO-009、TODO-010、TODO-011、TODO-012。**
これまでに 6 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-013` から。**

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

## TODO-007. save_data() が board.roll を保存しない

- [ ] `board.roll` が何に使われているかを確かめる（クライアント側を含む）
- [ ] 直すか、対応しないかを決める
- [ ] 直すなら `hist_ent2str()` に `roll` を足し、
      `tests/test_save_load.py` の往復テストから `roll` を除く処理を消す

TODO-006 でテストを書いたときに見つかった。`init_gameinfo()`
（`yt_backgammon.py:61`）は `board.roll` を持つが、`hist_ent2str()`
（`yt_backgammon_server.py:200-228`）が出力しないので、**保存 → 読み込みの
往復で `board.roll` が失われる**。実際に保存した JSON に `roll` キーが
無いことを確かめてある。

`CLAUDE.md` の「`gameinfo` にキーを足したときは `hist_ent2str()` も直さないと
保存されずに落ちる」に、まさに当てはまる。

- **まず `roll` の役割を確かめる。** 失われても実害が無いなら、
  その理由を書いて対応しないという結論もありうる
- 今の `tests/test_save_load.py::test_save_and_load_roundtrip` は、
  この差異を吸収するため比較前に両辺から `roll` を除いている。
  直したらその処理も消す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- 保存する内容が変わるのでレビューの担当を入れる
- 変更は `hist_ent2str()` の数行の見込みなので、実装は main が行う

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

## TODO-011. ruff の指摘を解消する

- [ ] `hist_ent2str()` の `%` 書式を直す（UP031、17 件）
- [ ] 直す前後で保存ファイルの中身が変わらないことを確かめる
- [ ] `save_data()` / `load_data()` の `except Exception` をどうするか
      決めて直す（BLE001、2 件）

TODO-002 で ruff を入れたが、`yt_backgammon_server.py` の指摘が 19 件
残っている。TODO-009 で Starlette へ移すときは「保存の形式と `save_data()` の
呼び方は同期のまま移す」と決めているので、`hist_ent2str()` は移行では
触らない部分。整形の差分と設計の差分が混ざらないよう、先に片付ける。

- UP031 は `'      "sn": %d,\n' % h['sn']` の形が 17 個
  （`yt_backgammon_server.py:202-223`）。書式を置き換えても
  **保存ファイルの中身が 1 バイトも変わらないこと**が条件
- BLE001 は `save_data()`（258 行）と `load_data()`（280 行）の
  `except Exception`。絞るなら `save_data()` は `OSError`、`load_data()` は
  それに加えて `json.JSONDecodeError` と、`data['history']` が無いときの
  `KeyError` が要る。**何を拾って何を落とすかを決める。** 絞らずに `noqa` で
  抑えるのも選択肢

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- 例外の扱いが変わるのでレビューの担当を入れる
- 機械的な置換が主なので実装は main

---

## TODO-012. on_json のクロック系の分岐を消す

- [ ] `set_clock_swith` / `resume_clcok` / `start_clcok` / `stop_clcok` /
      `reset_clcok` の 5 つの分岐を消す
- [ ] `CLAUDE.md` の該当記述を直す
- [ ] ブラウザでクロックが今までどおり動くことを確かめる

`on_json()` のこの 5 つは中身が `pass` で、しかも綴りが誤っている。

| サーバ（`on_json`） | クライアント（`ytbg.js`） |
|---|---|
| `set_clock_swith` | `set_clock_switch` |
| `resume_clcok` | `resume_clock` |
| `start_clcok` | `start_clock` |
| `stop_clcok` | `stop_clock` |
| `reset_clcok` | `reset_clock` |

名前が一致しなくても末尾の `add_history` と broadcast へ落ちるので、いまも
正しく動いている（クロックはクライアント側で完結している）。消しても
経路は変わらない。

TODO-009 で「`type` はサーバとクライアントの両方に同じ名前で書く」を
写すときに、誤った綴りごと運ばないよう先に消す。サーバ側でクロックを
持つことにしたら、そのときに改めて足す。

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier |

- `pass` を消すだけで挙動は変わらないのでレビューの担当は置かない
- ブラウザでクロックが動くことの確認は verifier

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-008.** app_top() と top.html を消す](archives/todo/TODO-008.%20app_top()%20と%20top.html%20を消す.md)
- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
