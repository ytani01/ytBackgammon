# TODO

**残っている項目: TODO-022 と TODO-024〜030 の 8 件。** これまでに 22 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-031` から。**

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

## TODO-024. gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `gameinfo.py` に `GameInfo` / `BoardState` / `CubeState` を作る
- [ ] `clock.py` に `Clock` を作り、`clock_limit` と `board.clock` を
      `GameInfo` から外す
- [ ] `_load_hist_ent()` の「クロックの残り時間だけは引き継ぐ」例外と、
      `new_game()` の退避・書き戻しを消す
- [ ] `storage.py` を作り、`~/ytbg-{server_id}.jsonl` へ 1 行 1 手で保存する
- [ ] 旧形式（`~/ytbg-{server_id}.json`）を `.jsonl` が無いときだけ読む。
      **旧ファイルは消さない**
- [ ] JS 側を最小限だけ追随させる
- [ ] テストを直し、`src/` をわざと壊して狙ったテストが落ちることを確かめる

### きっかけ

TODO-020 で決めた構成の中心。**構造・クロック・保存形式の 3 つは連動する**
ので 1 項目にまとめた（`GameInfo` が変われば `asdict` / `from_dict` も
保存形式も変わり、クロックを外すこと自体が `GameInfo` の構造変更）。

型と構造は [`docs/design.md`](docs/design.md) の「GameInfo」「クロックは
gameinfo の外」「保存は JSON Lines」にある。

**この項目が終われば、Python 側（TODO-025、026）と JS 側（TODO-027〜030）は
独立に進められる。**

### 分担

- **implementer** — 複数のファイルにまたがり、実装とテストがまとまって要る
- **verifier** — 4 つのテストと、旧形式の読み込み、`src/` を壊して落ちること
- **reviewer** — 挙動が変わる。履歴とクロックの絡みは TODO-016 で
  一度こじれている

---

## TODO-025. サーバを分割する（hub / history / storage / replay / app）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `hub.py`（`ClientHub`）、`history.py`（`History`）、
      `replay.py`（`Replayer`）を切り出す
- [ ] `app.py` に `create_app()` を置き、モジュールのグローバルだった
      `svr` と `app` を無くす
- [ ] `ytBackgammonServer` を `BackgammonServer` に、`ytBackgammon` は
      `GameInfo` に吸収して無くす
- [ ] WebSocket 経路そのもののテストを足す
- [ ] `src/` をわざと壊して狙ったテストが落ちることを確かめる

### きっかけ

`ytBackgammonServer`（722 行）が 7 つの責務を抱えている（接続管理・配信・
履歴・永続化・クロック・メッセージ分岐・HTTP 応答）。分割の一覧は
[`docs/design.md`](docs/design.md) の「モジュール構成」にある。
`storage.py` と `clock.py` は TODO-024 で作るので、ここは残りの分割。

**挙動は変えない。**

### 分担

- **implementer** — 複数のファイルにまたがる
- **verifier** — 4 つのテストと、`src/` を壊して落ちること
- **reviewer** — 責務の移し替えで取りこぼしが出やすい。特に `_replay_lock`
  の扱い（TODO-009 で、どこからも辿れない再生 Task が残る問題が起きている）

---

## TODO-026. メッセージを型付けし、on_json をディスパッチ表にする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `message.py` に type ごとの frozen dataclass と `parse(msg)` を置く
- [ ] `on_json()` の 20 個の `if` を登録表に置き換える
- [ ] ハンドラの戻り値で後処理を分ける（`None` は自分で送信済み、
      `float` はアニメーションの秒数）
- [ ] `src/` をわざと壊して狙ったテストが落ちることを確かめる

### きっかけ

`msg['data']['n']` のような生の dict へのアクセスが全域にあり、キーが
足りないと奥で `KeyError` になる。`parse()` で入口に寄せる。
戻り値の対応表は [`docs/design.md`](docs/design.md) の
「メッセージの型付けとディスパッチ」にある。

**挙動は変えない。**

### 分担

- **implementer** — 20 個の分岐を移す
- **verifier** — 4 つのテストと、`src/` を壊して落ちること
- **reviewer** — **分岐の構造そのものを変える。** 今の「前半は return し、
  後半は末尾の `add_history` と `emit_gameinfo()` へ落ちる」2 段構造を
  戻り値で表し直すので、落ち先を取り違えても気づきにくい

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
`node --test` は Node の標準機能なので、npm パッケージは要らない。

### 分担

- **implementer** — ルール層の切り出しと、新しいテスト
- **verifier** — `node --test tests/js/` と `tests/browser/`、
  `src/` を壊して落ちること
- **reviewer** — **判定の中身を移す。** 表示の副作用を外すときに
  判定そのものの意味を変えていないか

---

## TODO-028. JS を ES Modules に分割し、継承階層を組み直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `ytbg.js`（4,351 行）を `static/js/` の構成に分ける
      （[`docs/design.md`](docs/design.md) の「ファイル構成」）
- [ ] 属性を足すだけの中間クラスをやめ、`board` と `player` を
      コンストラクタのオプション引数で渡す（段数が 5 から 2 になる）
- [ ] `EmitButton` の 6 つのサブクラスを 1 つにし、生成時に type と data を渡す
- [ ] `BannerButton` の 3 つのサブクラスをコールバックで渡す形にする
- [ ] グローバル変数 `board` への依存を整理する

### きっかけ

`Board` が 1,200 行超、コンストラクタだけで 280 行。モジュール分割が無く
全部グローバルスコープで、`this.board` と `board` の参照が混在している。
クラス数は 35 前後から 20 前後になる見込み。

ルール層が先に出ていれば残りの分割が素直になるので、TODO-027 のあと。
**バンドラは入れない**（TODO-020 で決めた）。

### 分担

- **implementer** — ファイル分割と継承階層の組み直し
- **verifier** — `node --test tests/js/` と `tests/browser/`。
  ES Modules 化で読み込みが壊れやすいので、ブラウザでの確認が要
- **reviewer** — クラスの統合で引数の渡し方が変わる

---

## TODO-029. DOM 生成を JS へ移し、onClick 属性をやめる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `index.html` に残すのは header と `<div id="board">` だけにする
- [ ] `dom.js` が要素を作る（今はチェッカー 30 個 + ダイス 8 個の `<div>` が
      ベタ書きで、JS が `getElementById("p000")` で拾っている）
- [ ] `<body data-image-dir="..." data-server-id="...">` で値を渡し、
      `BgImage.get_image_dir()`（`src` の文字列から逆算）を消す
- [ ] `onClick` / `onChange` 属性を全部 `addEventListener` にする

### きっかけ

**ES Modules ではスコープが閉じてグローバル関数が見えなくなるので、
`onClick="new_game();"` は動かなくなる。** TODO-028 のあとに続けて要る。

### 分担

- **implementer** — DOM 生成とイベント登録の移し替え
- **verifier** — `tests/browser/` で全ボタンとチェックボックスが
  効くことを確かめる（`onClick` の付け替え漏れはテストでしか見つからない）
- **reviewer** — イベント登録の付け替えで、対象の要素や引数が変わっていないか

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

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
