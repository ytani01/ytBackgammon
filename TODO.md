# TODO

**残っている項目: TODO-027、030〜032 の 4 件。** これまでに 28 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-033` から。**

**着手順は `027 → 030`。**
TODO-032 は TODO-026 が済んだので、いつでも着手できる。
TODO-031 は、手元のボードが新しい保存形式に移るのを待つので最後。
未完了の項目は番号の昇順で並べると決めてあるので、上から順に並んでいる
順番と着手順は一致しない。

---

## TODO-027. JS のルール層を純粋関数として切り出し、node --test を足す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `rules/position.js` に `Position`（`from_gameinfo()` / `owner()` /
      `count()` / `with_move()`）を作る
- [ ] `rules/move.js`（行き先の計算）と `rules/judge.js`（盤面の判定）に
      ルール判定を移す
- [ ] `BgBase` の `goal_point()` / `bar_point()` / `calc_dst_point()` /
      `get_pip()` をルール層へ移す
- [ ] 判定が表示を変えないようにする（`winner_is()` の `this.resign = -1`、
      `pip_count()` の `this.pip[player].set()`）
- [ ] `tests/js/` を足し、`node --test tests/js/` で走らせる
- [ ] `src/` をわざと壊して狙ったテストが落ちることを確かめる

### きっかけ

**ルール計算が全 UI 部品の基底クラス `BgBase` に入っている。** テキスト表示も
ボタンもチェッカーも、全部それを継承している。判定は
`this.point[p].checkers`（DOM を持つ `Checker` の配列）を見ているため、
盤面だけを渡して呼べない。**JS のテストが 0 件なのは、ここが
切り離せていないことが大きい。**

`Position` は TODO-024 の `gameinfo` から作るので、その後に着手する。
**さらに TODO-028・029 のあとにする。** 非モジュールの `ytbg.js` からは
ES Modules の `rules/` を import できず、先に切り出すと同じ判定が
2 つ存在する期間ができるため。

`node --test` は Node の標準機能なので、npm パッケージは要らない。
テストは `tests/js/*.test.mjs` に置く（`tests/browser/` と揃える）。

### 分担

- **implementer** — ルール層の切り出しと、新しいテスト
- **verifier** — `node --test tests/js/` と `tests/browser/`、
  `src/` を壊して落ちること
- **reviewer** — **判定の中身を移す。** 表示の副作用を外すときに
  判定そのものの意味を変えていないか

---

## TODO-030. 表示更新の経路を 1 本にする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `Board.apply(gameinfo, {sec, history_flag, clock_state, last_op})` を
      表示を変える唯一の経路にする
- [ ] `Checker.on_mouse_up_xy()` の**先行実行は残す**が、`put_checker()` を
      直接呼ぶのをやめ、`Position.with_move()` で予測した gameinfo を
      `apply()` に渡す
- [ ] `put_checker()` と `load_gameinfo()` の二重実装を消す

### きっかけ

`Checker.on_mouse_up_xy()` がサーバの応答を待たずに `put_checker()` を
呼んでおり、`load_gameinfo()` の配置と別経路になっている。共有ボードなので
**ドラッグを離した瞬間の反応は残す**（無いと操作感が悪い）。

`Position` とルール層が揃ってからでないと予測が作れないので、最後。

### 分担

- **implementer** — 経路の統合
- **verifier** — `tests/browser/`。2 枚のタブでドラッグの同期を見る
- **reviewer** — **先行実行と、サーバから戻る gameinfo の食い違いが出やすい。**
  予測が外れたときに表示が戻るか

---

## TODO-031. 旧形式（`~/ytbg-{server_id}.json`）の読み込みを消す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |

- [ ] `Storage` から旧形式の読み込み（`_load_old()` / `_old_clock()`）を消す
- [ ] 旧形式のテストを消す
- [ ] `CLAUDE.md` の「履歴」の節から旧形式の記述を消す

### きっかけ

TODO-024 で保存を JSON Lines（`~/ytbg-{server_id}.jsonl`）へ移した。
`.jsonl` が無いときだけ旧形式（`.json`）を読むようにしてあり、
旧ファイルは消さずに残している。移行が済んだら、この読み込みを消す。

### 決めること

- **いつ消すか。** 手元の 4 つのボード（`~/ytbg-1〜4`）が `.jsonl` に
  移り、しばらく動かしてからにする。**着手する前に、`.json` しか無い
  `server_id` が残っていないかを確かめる**
- 旧ファイル（`.json`）そのものを消すかどうか。消さずに残しておいても
  実害は無い

---

## TODO-032. history フラグの付け方を見直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `history: true` で送っているのに、盤面が変わらないメッセージを洗い出す
- [ ] 履歴に積むかどうかを、クライアントの `emit_msg()` の引数ではなく
      サーバ側で決めるかどうかを決める
- [ ] 決めた形に直し、`back` / `fwd` で「盤面が変わらない手」が
      挟まらないことを確かめる

### きっかけ

TODO-024 で `clock_limit` を `gameinfo` から出したあと、reviewer が
見つけた。`ytbg.js` の `ClockLimit.emit_set()` は `set_clock_limit` を
`history: true` で送るが、`clock_limit` は `gameinfo` に無くなったので、
**積まれるエントリは `sn` 以外すべて 1 つ前と同じになる**。

積まれること自体は TODO-024 より前からだが、積まれるものが
「差分のあるエントリ」から「同じエントリ」に変わった。`back` を 1 回
押しても盤面が変わらない手が挟まる（前は、戻すと clock_limit の
入力欄が昔の値に戻っていた）。

`set_player_clock` も同じ性質を持つ。

### 決めること

- **履歴に積むかどうかを誰が決めるか。** いまはクライアントが
  `emit_msg()` の第 3 引数で決めている。サーバ側の `type` ごとの
  表で決める形にすると、クライアントの付け忘れ・付けすぎが効かなくなる。
  **TODO-026 でディスパッチ表を作るので、そこに乗せられる**
- 盤面が変わらないエントリを、積む前に落とすかどうか
  （1 つ前と同じなら積まない、という判定を入れるか）

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-029.** DOM 生成を JS へ移し、onClick 属性をやめる](archives/todo/TODO-029.%20DOM%20生成を%20JS%20へ移し、onClick%20属性をやめる.md)
- [**TODO-028.** JS を ES Modules に分割し、継承階層を組み直す](archives/todo/TODO-028.%20JS%20を%20ES%20Modules%20に分割し、継承階層を組み直す.md)
- [**TODO-026.** メッセージを型付けし、on_json をディスパッチ表にする](archives/todo/TODO-026.%20メッセージを型付けし、on_json%20をディスパッチ表にする.md)
- [**TODO-025.** サーバを分割する（hub / history / storage / replay / app）](archives/todo/TODO-025.%20サーバを分割する（hub%20_%20history%20_%20storage%20_%20replay%20_%20app）.md)
- [**TODO-024.** gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す](archives/todo/TODO-024.%20gameinfo%20を%20dataclass%20にし、クロックを外し、保存を%20JSON%20Lines%20へ移す.md)
- [**TODO-022.** favicon が無く、初回ロードで 404 になる](archives/todo/TODO-022.%20favicon%20が無く、初回ロードで%20404%20になる.md)
- [**TODO-023.** デッドコードを消す](archives/todo/TODO-023.%20デッドコードを消す.md)
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
