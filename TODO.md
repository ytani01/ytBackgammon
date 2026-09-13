# TODO

**残っている項目: TODO-050〜055。** これまでに 49 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-056` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、これで全部終わった。**
手元の 4 つのボードは 2026-09-12 に `.jsonl` へ移行済み
（旧 `.json` も消さずに残してある）。

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果（15 件）は、
TODO-037（削除）・038（集約）・039（標準機能への置き換え）として
すべて片付いた。

**TODO-042 で決めた構成の見直し（第 2 弾）の実装（TODO-043〜048）も、
2026-09-13 に全部終わった。**

**TODO-049 で決めた構成の見直し（第 3 弾）は、TODO-050〜055 で実装する。**
設計は `docs/design.md` にある。

---

## TODO-050. サーバに操作の type を足し、登録表を 1 つにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] 名前付きの 8 つの操作（`roll` / `opening` / `move` / `end_turn` / `double` / `take` / `cancel_double` / `resign`）のハンドラと dataclass を足す
- [ ] type ごとの「`data` の型・ハンドラ・履歴に積むか」を `server.py` の 1 つの表にまとめ、`DATA_TYPES` と `NO_HISTORY_TYPES` を消す
- [ ] `turn` が -1 になったら、共通の後処理で両方のクロックを止める
- [ ] `set_clock_limit` / `set_clock_switch` を受けたら、両方のクロックを止める
- [ ] `tests/` にテストを足す（わざと壊して落ちることも確かめる）

設計は `docs/design.md` の「メッセージ」。

- **古い type はまだ消さない。** 履歴に積むかどうかも、古い type では
  今までどおりメッセージの `history` を見る。**今のクライアントのまま
  `tests/browser/` が通る**こと
- `resign` は `{player}` と `{player, score}` の両方を受ける（`score` が
  無ければ今の動き）。古い形は TODO-051 で消す
- 止めるときは `Clock.stop()` を 2 回呼ぶ。**`Clock.stop_all()` は
  経過分を残り時間に反映しない**ので使わない
- クロックを止める側は、`double` と `take` では `player`、`cancel_double`
  では `1 - player`（今の `change_turn()` の呼び方と同じ）

---

## TODO-051. 操作を `actions.js` から 1 通で送る

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `actions.js` を作り、ゲームを進める処理と「押してよいか」の判定を `ui/` から移す
- [ ] `emit_msg` を import するのを `actions.js` だけにする（ボタン・メニュー・名前・得点・クロック・設定も）
- [ ] `emit_msg` から `history` をなくす
- [ ] `Board.set_turn()` と `apply()` から送信をなくし、`emit` / `predict` 引数を消す。`winner_is()` が `resign` を書き換えないようにする
- [ ] `move` の予測に使ったダイス（11〜16）を書き込み、`apply()` のあとの `disable()` をやめる
- [ ] `apply()` の演出を新しい type の `last_op` から出す
- [ ] サーバから使わなくなった type（`cube` / `set_turn` / `set_player_clock` / `start_clock` / `set_gameinfo`）と、`history` を見る処理と、`Clock.stop_all()` を消す
- [ ] `tests/`・`tests/browser/` を新しい type に合わせる

設計は `docs/design.md` の「メッセージ」と「クライアント」の
「送信は `actions.js` にまとめる」「表示の更新は何も送らない」「先行実行」。

- **TODO-050 のあとに行う**
- `clicks.test.mjs` は送られた `type` / `data` を見ているので、期待値を
  書き直す。**書き直したテストが、壊したときに落ちることを確かめる**
- 手元の 4 つのボードの `.jsonl` は形を変えないので、そのまま読めること

---

## TODO-052. 判定が `gameinfo` を読むようにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `Board.turn` / `resign`、`Cube.value` / `accepted` / `player`、`PlayerScore.score`、`Dice.value`、`RollButton.dice_active` を消し、`board.gameinfo` を読む
- [ ] `gameinfo` がまだ届いていないときは、何も操作できないものとして扱う
- [ ] `tests/browser/` の、消した属性を直接触っているテストを直す

設計は `docs/design.md` の「判定は `gameinfo` だけを読む」。
**TODO-051 のあとに行う。**

---

## TODO-053. `Board` からドラッグと設定を切り出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] チェッカーとキューブの「掴む・動かす・離す」を `drag.js` へ移し、`moving_checker` と `Cube.moving` をそこで持つ
- [ ] 音・free move・PIP の表示・cookie のプレーヤー番号を `settings.js` のクラスへ移す
- [ ] `ui/base.js` のクラス階層図と `CLAUDE.md` の構成を直す

設計は `docs/design.md` の「`Board` を分ける」。

- クロックの ON/OFF と持ち時間の表示は `Board` に残す
- ルール層の薄い包み（`get_dst_points()` など）は消さない。
  `tests/browser/rules.test.mjs` が呼んでいる
- **TODO-052 のあとに行う**

---

## TODO-054. 部品に id ではなく要素を渡す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `build_dom()` が作った要素を返し、`main.js` から `Board` へ渡す
- [ ] `BgBase` が id ではなく要素を受け取るようにする
- [ ] チェッカーがプレーヤーと通し番号を数値で持ち、`parseInt(ch.id.slice(1))` と `Board.search_checker()` をなくす

設計は `docs/design.md` の「部品には要素を渡す」。

- id 属性は残す（`tests/browser/` が要素を探すのに使う）
- **画像の読み込みを待ってから `Board` を作る順番（TODO-029）は変えない。**
  テストでは守られないので、順番に触れたら画像の応答を遅らせて配置を実測する
- **TODO-053 のあとに行う**

---

## TODO-055. サーバの小さいものをまとめて直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- [ ] `DATAFILE_DIR` を、import したときではなく `BackgammonServer` を作るときに環境変数から読む
- [ ] `add_history()` の `gameinfo=None` と `History.add()` の `None` 分岐を消し、`History._cur_sn` をローカル変数にする
- [ ] `load_data()` が件数の組ではなく、読めたかどうかを返す
- [ ] `backward_hist()` / `forward_hist()` の docstring を `n <= 0` に揃える

設計は `docs/design.md` の「サーバの細かい修正」。

- `tests/conftest.py` と `tests/browser/helper.mjs` の保存先の差し替えが
  効き続けること（利用者の `~/ytbg-*` を読み書きしない）
- **最後に行う**（`server.py` を TODO-050 と取り合う）
- 全部終わったら `docs/Developer.md` と `CLAUDE.md` の「状態と通信」を直し、
  `docs/design.md` の扱いを決める

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-049.** モジュール構成とクラス構成を見直す（第 3 弾）](archives/todo/TODO-049.%20モジュール構成とクラス構成を見直す（第%203%20弾）.md)
- [**TODO-048.** 小さいものをまとめて直す](archives/todo/TODO-048.%20小さいものをまとめて直す.md)
- [**TODO-047.** `message.py` の `from_dict` をまとめる](archives/todo/TODO-047.%20message.py%20の%20from_dict%20をまとめる.md)
- [**TODO-046.** `Board` のコンストラクタから配置を切り出す](archives/todo/TODO-046.%20Board%20のコンストラクタから配置を切り出す.md)
- [**TODO-045.** `Checker.on_mouse_up_xy()` を分ける](archives/todo/TODO-045.%20Checker.on_mouse_up_xy()%20を分ける.md)
- [**TODO-044.** 盤面の状態を `gameinfo` 1 つにする](archives/todo/TODO-044.%20盤面の状態を%20gameinfo%201%20つにする.md)
- [**TODO-043.** JS のルール層に合法手の判定を移す](archives/todo/TODO-043.%20JS%20のルール層に合法手の判定を移す.md)
- [**TODO-042.** モジュール構成とクラス構成を見直す（第 2 弾）](archives/todo/TODO-042.%20モジュール構成とクラス構成を見直す（第%202%20弾）.md)
- [**TODO-041.** 先手決めの自動クリックが `this` を取り違えている](archives/todo/TODO-041.%20先手決めの自動クリックが%20%60this%60%20を取り違えている.md)
- [**TODO-038.** 同じ形の繰り返しをまとめる](archives/todo/TODO-038.%20同じ形の繰り返しをまとめる.md)
- [**TODO-039.** 手書きを標準機能に置き換える](archives/todo/TODO-039.%20手書きを標準機能に置き換える.md)
- [**TODO-037.** 呼ばれていないコードを消す](archives/todo/TODO-037.%20呼ばれていないコードを消す.md)
- [**TODO-040.** `-i` の既定値に対応するディレクトリが無い](archives/todo/TODO-040.%20%60-i%60%20の既定値に対応するディレクトリが無い.md)
- [**TODO-036.** README と docs/ の日本語を見直す](archives/todo/TODO-036.%20README%20と%20docs_%20の日本語を見直す.md)
- [**TODO-031.** 旧形式（~/ytbg-{server_id}.json）の読み込みを消す](archives/todo/TODO-031.%20旧形式（~_ytbg-{server_id}.json）の読み込みを消す.md)
- [**TODO-033.** README.md,とドキュメント類を整備](archives/todo/TODO-033.%20README.md,とドキュメント類を整備.md)
- [**TODO-032.** history フラグの付け方を見直す](archives/todo/TODO-032.%20history%20フラグの付け方を見直す.md)
- [**TODO-035.** LICENSE を置き、ファイル先頭の表記を揃える](archives/todo/TODO-035.%20LICENSE%20を置き、ファイル先頭の表記を揃える.md)
- [**TODO-034.** basedpyright の型チェックの水準を揃える](archives/todo/TODO-034.%20basedpyright%20の型チェックの水準を揃える.md)
- [**TODO-030.** 表示更新の経路を 1 本にする](archives/todo/TODO-030.%20表示更新の経路を%201%20本にする.md)
- [**TODO-027.** JS のルール層を純粋関数として切り出し、node --test を足す](archives/todo/TODO-027.%20JS%20のルール層を純粋関数として切り出し、node%20--test%20を足す.md)
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
