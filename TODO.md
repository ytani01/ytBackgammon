# TODO

**残っている項目: TODO-042。** これまでに 41 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-043` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、これで全部終わった。**
手元の 4 つのボードは 2026-09-12 に `.jsonl` へ移行済み
（旧 `.json` も消さずに残してある）。

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果（15 件）は、
TODO-037（削除）・038（集約）・039（標準機能への置き換え）として
すべて片付いた。

---

## TODO-042. モジュール構成とクラス構成を見直す（第 2 弾）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ |

- [ ] 実装項目 6 つの中身を詰める（移す関数の名前と引数、置き場所）
- [ ] 決めた設計をこのファイルに書く
- [ ] 実装項目を立てる

TODO-020 と同じ**決めるだけの項目**。確かめるものが無いので担当は
`main のみ`（`~/.claude/CLAUDE.md` の例外）。設計は
`archives/todo/TODO-042. ....md` に書き、実装が全部終わったところで
`docs/Developer.md` を直す（`docs/design.md` は TODO-033 で archives へ
移したので、新しく作らない）。

### 分かっていること

Python 側は TODO-024〜026、037〜039 で整理済みで、新しく立てる項目は
`message.py` の 1 つだけ。**残っているのは JS 側**で、TODO-027 の積み残しが
固まっている。

| 見つけたもの | 場所 |
|--------------|------|
| 合法手の判定がルール層に入っていない | `Board.get_dst_points()` / `get_dst_point1()` / `all_inner()`、`RollButton.check_disable()`、`Checker.dice_check()` |
| 盤面の状態が 2 つある | `BoardPoint.checkers`（表示）と `gameinfo.board.checker`（真の状態） |
| `Checker.on_mouse_up_xy()` が 150 行 | 行き先の決定・ヒット判定・予測・送信・ダイス消費・勝敗・得点 |
| `Board` が 1,154 行、コンストラクタが 380 行 | 座標が `dom.js` / `Board` / `layout.js` の 3 か所に分かれている |

`rules/move.js` は 33 行で `calc_dst_point()`（引き算するだけ）しか無い。
**ベアオフ、バーからの復帰、ゾロ目、使えないダイスの判定にテストが
1 件も無い**のは、これらが `Board` と `RollButton` から切り離せていないため。

### 相談して決めたこと

| 論点 | 決めたこと |
|------|-----------|
| 範囲 | JS と Python の両方 |
| 盤面の状態 | **表示側の `BoardPoint.checkers` を捨て、`gameinfo` を唯一の状態にする** |
| `Board` のコンストラクタ | 座標計算と部品生成を切り出す |
| `log()` | `?debug` のクエリで切り替える（既定では出さない） |
| 小さい修正 | まとめて 1 項目にする |
| `ytbg.html` | 今回も対象外（TODO-020 と同じ） |
| 座標のレスポンシブ化 | 今回もやらない（TODO-020 と同じ） |
| eslint とバンドラ | 今回も入れない（playwright だけ例外。TODO-020 と同じ） |

### 実装項目の分割（案）

| 順 | 見出し | 中身 |
|----|--------|------|
| 1 | JS のルール層に合法手の判定を移す | 上の 5 つの関数を `rules/move.js` の純粋関数にする。受け取るのは `Position` と数値だけ。`tests/js/` にベアオフ・バーからの復帰・ゾロ目・使えないダイスのテストを足す |
| 2 | 盤面の状態を `gameinfo` 1 つにする | `BoardPoint.checkers` を捨て、`Board` が `Position` を持つ。`BoardPoint` は座標だけの部品にする。「ポイントの先端の駒を掴む」は表示の話なので、`gameinfo` から引き直して今と同じ挙動を保つ |
| 3 | `Checker.on_mouse_up_xy()` を分ける | 行き先の決定と、動かしたあとの処理を分ける |
| 4 | `Board` のコンストラクタから配置を切り出す | 380 行の座標計算と部品生成を `layout.js` 側へ寄せる |
| 5 | `message.py` の `from_dict()` 13 個をまとめる | `dataclasses.fields()` で 1 つに。`GameInfoData` と list をコピーする 2 つだけ残す。約 60 行減 |
| 6 | 小さいものをまとめて直す | `?debug` での `log()` の切り替え、`ScoreButton` の player 引数が全部 0、`PlayerScore` と `ScoreButton` で二重の score 操作、`Dice.set()` の `image_el` 混在、`RollButton.roll()` の未使用変数、`<html lang="jp">` → `ja` |

順番の理由:

- **1 が先頭。** ルール層が `Position` を受け取る形になっていないと、
  2 で `checkers` を消せない
- **2 は 1 のあと、3 は 2 のあと。** ヒット判定と `idx` の数え方が 2 で
  変わるので、先に `on_mouse_up_xy()` を分けると二度手間になる
- **4 と 5 は独立。** 1〜3 の途中に割り込ませてよい
- **6 が最後。** 触るファイルが他の項目と重なるので、差分に無関係な
  修正が混ざらないようにする

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
