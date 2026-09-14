# TODO

**残っている項目: TODO-056。** これまでに 55 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-057` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、全部終わった。**
手元の 4 つのボードは 2026-09-12 に `.jsonl` へ移行済み
（旧 `.json` も消さずに残してある）。

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果（15 件）は、
TODO-037（削除）・038（集約）・039（標準機能への置き換え）として
すべて片付いた。

**TODO-042 で決めた構成の見直し（第 2 弾）の実装（TODO-043〜048）も、
2026-09-13 に全部終わった。**

**TODO-049 で決めた構成の見直し（第 3 弾）の実装（TODO-050〜055）も、
2026-09-14 に全部終わった。** 設計は `archives/docs/design-3.md` に移した。

---

## TODO-056. モジュール構成とクラス構成を見直す（第 4 弾）

|      | main | 担当 |
|------|------|------|
| 見込み | GPT-6 / reasoning effort は取得できないため未確認 | main（設計）+ reviewer（設計確認） |

### 背景

利用者から、動作を保てるなら大幅な変更も許容し、より美しい設計を
目指してモジュール構成とクラス構成を見直す依頼があった。
2026-09-14 に、以下の方針で設計を具体化する項目の追加が承認された。
同日に設計への着手が承認された。

現行コードでは、`Board` が画像クラスを継承し、状態保持・部品生成・
ルール呼び出し・予測・表示・演出を担当している。`actions.js` の行き先判定と
`Board.predict_gameinfo()` も `Checker` などの表示部品に依存する。
状態から判断し、その結果を表示する構成へ整理する。

### やること

- [x] 現在のコードで責務・依存関係・状態の所有者を確認し、設計を
  `docs/design-4.md` にまとめる。過去の見送り理由は archives で確認する。
- [x] `BoardModel`・`BoardView`・`BoardController` への責務分担を具体化する。
  状態の重複を作らず、操作判断と予測は盤面データとチェッカーIDで行う。
- [x] 盤面の描画と、音・ダイスの回転などの演出を分離する。
- [x] `BgBase` の表示・入力・座標変換を整理し、表示部品に渡す値と
  コールバックを定める。`BoardPoint` は配置座標を返す形で
  `layout.js` へ集約する案を具体化する。
- [x] サーバの通信の入口と操作実行を分離し、操作結果を明示する型を設計する。
  操作の登録表は一つに保ち、既存の履歴・クロック・保存・配信・再生の責務を活かす。
- [x] `settings.js` と `log.js` の循環依存の解消方法を決める。
- [x] reviewer が現行コードとの対応、責務分担、動作維持の確認方法を検討する。
- [ ] 設計調査後に、モジュールの公開インターフェースと移行順を確定し、
  実装項目の分割案を提示する。段階的に移す案と一括で置き換える案を、
  依存関係と検証のしやすさで比較し、設計確定時に利用者へ確認する。

### 検証方法

上の完了印は設計案への記載を表し、ソースコードの実装完了ではない。
[設計案](docs/design-4.md) は作成済み。レビューの指摘4点を反映し、
reviewerの再確認も完了。設計と4段階の実装分割案は利用者の確認待ち。
ソースコードとテストは変更していない。`git diff --check` は問題なし。

この項目は設計までとし、ソースコードの実装は後続項目で行う。
main と別の reviewer が、設計を現行コードと照合する。
分担理由と報告は `archives/agents/TODO-056/` に残す。

実装時の検証として、Python・JS ルール層・ブラウザの既存テストと
ruff・mypy・basedpyright を組み込み、追加が必要な確認を設計に記載する。
特に、先行実行とサーバ応答による復元、ドラッグ中の受信、音の重複、
履歴再生中のクロック、画像の遅延読み込み、複数画面の同期、保存・読み込みを
対象にする。純粋関数へ移す操作判断と予測は、ブラウザなしで検証できる形にする。

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-055.** サーバの細かい修正をまとめて行う](archives/todo/TODO-055.%20サーバの細かい修正をまとめて行う.md)
- [**TODO-054.** 表示部品（`ui/` のクラス）に id ではなく要素を渡す](archives/todo/TODO-054.%20表示部品（ui_%20のクラス）に%20id%20ではなく要素を渡す.md)
- [**TODO-053.** `Board` からドラッグと設定を切り出す](archives/todo/TODO-053.%20Board%20からドラッグと設定を切り出す.md)
- [**TODO-052.** 表示部品が持つ状態の写しをなくし、判定では `gameinfo` を読む](archives/todo/TODO-052.%20表示部品が持つ状態の写しをなくし、判定では%20gameinfo%20を読む.md)
- [**TODO-051.** 1 つの操作を 1 通で送り、送信を `actions.js` にまとめる](archives/todo/TODO-051.%201%20つの操作を%201%20通で送り、送信を%20actions.js%20にまとめる.md)
- [**TODO-050.** サーバに名前付きの操作を足し、type の登録表を 1 つにする](archives/todo/TODO-050.%20サーバに名前付きの操作を足し、type%20の登録表を%201%20つにする.md)
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
