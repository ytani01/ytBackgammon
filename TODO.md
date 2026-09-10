# TODO

**残っている項目: TODO-020。** これまでに 19 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-021` から。**

---

## TODO-020. モジュール構成とクラス構成を見直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ |

- [ ] Python 側の新しいモジュール構成・クラス構成を決める
- [ ] JS 側の新しいファイル構成・クラス構成を決める
- [ ] クライアント ↔ サーバのメッセージ仕様を 1 箇所に書き出す
- [ ] `gameinfo` と保存ファイルの新しい構造を決める
- [ ] 実装を TODO-021 以降のどの項目に分けるかを決める

**この項目では設計を決めるだけで、`src/` は触らない。** 決まった構成は
`archives/todo/` のファイルに残し、実装は別の項目として立てる。

### きっかけ

全体的な見直しをしたいという相談から。細かいリファクタリングではなく、
モジュール構成・クラス構成といった基本設計から見直す。動作に問題が
出ないなら、大きく変えてよい。質の良いコードを優先する。

### 現状で分かっていること

`ytBackgammonServer`（722 行）が 7 つの責務を抱えている。

| 責務 | 該当 |
|------|------|
| 接続管理 | `_clients`, `on_connect`, `on_disconnect`, `client_name` |
| 配信 | `broadcast`, `emit_gameinfo` |
| 履歴 | `_history`, `_fwd_hist`, `backward_hist`, `forward_hist`, `_replay*` |
| 永続化 | `save_data`, `load_data`, `hist_ent2str` |
| クロック | `_clock_sw`, `_clock_active`, `_clock_start`, `_cur_clock`, `_freeze_clock` |
| メッセージ分岐 | `on_json`（150 行、`if msg['type'] ==` が 20 個） |
| HTTP 応答 | `app_index` |

そのほか Python 側:

- `ytBackgammon` のカプセル化が壊れている。`self._bg._gameinfo[...]` への
  外部からの直接アクセスが 20 箇所以上あり、`new_game()` はサーバ側で
  gameinfo の中身を組み立てている。2 クラスに分かれている意味がほぼ無い
- `gameinfo` もメッセージも型が無い。生の dict の入れ子で、`msg['data']['n']`
  のようなアクセスが全域。mypy が中身を見ていない
- `save_data()` が JSON を文字列連結で組み立てており、キーを足すと
  `hist_ent2str()` も直さないと落ちる
- クロックの状態が 4 箇所に分散し（`_clock_sw` / `_clock_active` /
  `_clock_start` / `gameinfo['board']['clock']`）、残り時間の計算が
  `ytbg.js` の `PlayerClock.update()` と二重実装になっている
- `svr` と `app` がモジュールのグローバルで、WebSocket 経路そのものの
  テストが書けていない

JavaScript 側（`ytbg.js` 4,351 行が 1 ファイル）:

- `Board` が 1,200 行超、コンストラクタだけで 280 行。レイアウト計算、
  DOM 生成、ルール判定、通信、クロック、音、Cookie、設定 UI が同居している
- ルール判定が UI クラスに埋まっている（`Checker.dice_check()`,
  `RollButton.check_disable()`, `Board.get_dst_points()` / `winner_is()` /
  `all_inner()` / `closeout()`）。**JS のテストが 0 件なのは、ここが
  切り離せていないことが大きい**
- モジュール分割が無く全部グローバルスコープ。`board` がグローバル変数で、
  `this.board` と `board` の参照が混在している
- 継承階層が見た目で分類されている（`BgBase` から 5 段）。`EmitButton` の
  6 つのサブクラスは引数が違うだけ
- DOM が `index.html` に手書き。チェッカー 30 個 + ダイス 8 個の `<div>` を
  並べ、JS が `getElementById("p000")` で拾う
- `Checker.on_mouse_up_xy()` がサーバの応答を待たずに先行して
  `put_checker()` を呼んでおり、`load_gameinfo()` の配置と別経路になっている
- デッドコード: `gen_gameinfo()` は古い `point` 形式を返し
  `board.player_name`（実際は `playername`）を読む壊れた状態。
  `write_gameinfo` / `read_gameinfo` は `index.html` でコメントアウト済み。
  `get_available_points()` は `return []` の T.B.D.。`clock_on` / `clock_off` は未使用
- 座標が `bx` / `by` の絶対値配列、`console.log` が全域、eslint 無し、
  `index.html` に `for"disp-pip"` のようなタイプミス

### 決まっていること（この項目で蒸し返さない）

着手前に相談して決めた。

- 保存ファイル（`~/ytbg-*.json`）と `gameinfo` の構造は**変えてよい**。
  ただし**旧形式の読み込みは残す**（手元の対局記録が生き残るように）
- JS は **ES Modules** で複数ファイルに分ける。バンドラは入れない
  （`uv` だけで済んでいる運用を変えない）
- ルール判定は**クライアントの純粋ロジック層**へ切り出す。
  サーバはルールを持たない
- 「1 枚のボードを全員で共有して自由に触れる」という目的と、
  free move モードは変えない

### この項目で決めること

- Python のモジュール分割の粒度と、クラスの境界
  （接続管理／履歴／永続化／クロック／ディスパッチ）
- `gameinfo` の型付けの方式（dataclass か TypedDict か）と、保存形式
- JS のファイル分割と、`Board` から何をどこへ出すか
- 継承階層（`BgBase` 5 段、`EmitButton` の 6 サブクラス）をどう組み直すか
- DOM 生成を `index.html` から JS へ移すか
- 楽観的更新（`Checker.on_mouse_up_xy` の先行 `put_checker`）を残すか
- 実装項目の分割と順番

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
