# TODO

**残っている項目: TODO-074、TODO-075。** これまでに 73 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-076` から。**

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

**TODO-056 で決めた構成の見直し（第 4 弾）の実装（TODO-057〜060）も、
2026-09-15 に全部終わった。** 設計は `archives/docs/design-4.md` に移した。

---

## TODO-074. 呼ばれていないコードと、通らない分岐を消す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |

2026-09-16 に `src/` 全体を過剰実装の観点で読み直した結果のうち、
**消すだけで盤面の挙動が変わらないもの**。書き直しで短くするものは TODO-075。

JS:

- [ ] `rules/move.js` の `dst_points()` — 先頭の `dice_vals.length == 0` の
  早期 return（下のループと `dst_p.length == 0` の判定で同じく `[]` になる）
- [ ] `rules/judge.js` の `pip_count()` の `isNaN` と、`rules/position.js` の
  `get_pip()` の `point === undefined`（`points_of()` は undefined を返さない）
- [ ] `rules/judge.js` の `closeout()` のプレーヤー番号の範囲チェック
  （呼ぶのは `render_turn()` で、turn が 0 か 1 のときだけ）。
  `tests/js/judge.test.mjs` の範囲のテストも消す
- [ ] `rules/position.js` の `Position.from_points()`（`new Position()` を呼ぶだけ）。
  `tests/js/helper.mjs` は `new Position()` を呼ぶ形にする
- [ ] `ui/base.js` の `BgText.get()` と `ui/label.js` の `PlayerScore.get()`（呼び出しが無い）
- [ ] `ui/base.js` の `this.el` のガード（要素は必ず `build_dom()` が作って渡す）
- [ ] `board_view.js` の投了・勝ちのバナーの `on_click`（log を出すだけ。
  `BannerButton` は `on_click` を省略できる）
- [ ] `ui/label.js` の `PlayerPipCount.set()` の `move()` / `rotate()`
  （`BgText.set()` の中で、オーバーライドした同じものが呼ばれている）
- [ ] `ui/dice.js` の `this.image_el` の代入（`BgImage` が入れている）と、
  `get_filename()` の `val %= 10`（呼ぶ側で済んでいる）
- [ ] `main.js` の `e.key.length === undefined` の判定と、`keyCode` のログ
- [ ] `settings.js` の `CookieBase` の `this.cookie` と、`load()` の戻り値
- [ ] `lobby.js` の `board_url()` で、prefix が無い分岐の `${b.prefix}`（常に空）

Python:

- [ ] `server.py` の `_on_roll()`（`_on_dice()` と同じ中身。登録表の `roll` に
  `_on_dice` を渡す）
- [ ] `server.py` の `_load_hist_ent()`（1 行で、呼ぶのも 1 か所）
- [ ] `replay.py` の `_replay()` の `except asyncio.CancelledError: raise`
  （書かなくても同じ動き）
- [ ] `__main__.py` の `MY_NAME` / `VERSION`（別名を付けているだけ）
- [ ] `__init__.py` の `__package__` が無いときの分岐（パッケージとして読まれるので通らない）

確かめること:

- [ ] `uv run pytest`・`ruff`・`mypy src`・`basedpyright`・`node --test tests/js/`・
  `node --test tests/browser/` が通る
- [ ] 文書（`CLAUDE.md`・`docs/Developer.md`）に消した名前が残っていない

**対象にしないもの:** `mylog.py` の未使用の口（他でも使い回すので残す。TODO-037）、
`winner_is()` の `by_resign`（TODO-051 で残すと決めた）、1 行だけの
コメントアウト（TODO-037 で範囲外にした）。

ガードや分岐を消すので、「本当に通らないか」を reviewer に見させる。

---

## TODO-075. 同じ処理を短く書き直す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |

TODO-074 と同じ読み直しの結果のうち、**挙動を変えずに短く書き直すもの**。

- [ ] `rules/move.js` の `dst_points()` — 目を足していく 3 段の入れ子を
  1 つのループにする
- [ ] `rules/move.js` の `dice_for_move()` — 3 個と 4 個のゾロ目の判定を
  1 つのループにする
- [ ] `rules/judge.js` の `calc_gammon()` — `points` の if/else を三項演算子にする
- [ ] `board_view.js` の `render_turn()` の `update_roll` — 直前で全部
  `off()` にしているので、`on()` にする条件だけを残す
- [ ] `board_view.js` のコンストラクタ — プレーヤーごとに 2 回ずつ書いている
  スコアと ▲▼ をループにし、名前の 2 つのループを 1 つにまとめる
- [ ] `board_view.js` の `inverse()` — `rotate(180 * player, ...)` の 1 行にする
- [ ] `ui/cube.js` の `Cube.set()` — 2 回ある回転の if/else を分岐の前の 1 回にする

確かめること:

- [ ] `node --test tests/js/` と `node --test tests/browser/` が通る
- [ ] `dst_points()` と `dice_for_move()` は、`src/` をわざと壊して
  狙ったテストが落ちるかを見る（ループの境界を 1 つずらす、など）

ルール層の条件式を書き換えるので、分岐の意味が変わっていないかを reviewer に
見させる。

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-073.** lobby のページの見出しを消し、その分ボードを大きく出す](archives/todo/TODO-073.%20lobby%20のページの見出しを消し、その分ボードを大きく出す.md)
- [**TODO-072.** lobby で大きく出しているボードだけ音を出す](archives/todo/TODO-072.%20lobby%20で大きく出しているボードだけ音を出す.md)
- [**TODO-071.** lobby の大きいボードを、ウィンドウに収まる範囲でなるべく大きく出す](archives/todo/TODO-071.%20lobby%20の大きいボードを、ウィンドウに収まる範囲でなるべく大きく出す.md)
- [**TODO-070.** lobby の小さいボードをウィンドウの幅で折り返して並べる](archives/todo/TODO-070.%20lobby%20の小さいボードをウィンドウの幅で折り返して並べる.md)
- [**TODO-069.** lobby のボードへのリンクをパスにし、lobby に届いたらボードへリダイレクトする](archives/todo/TODO-069.%20lobby%20のボードへのリンクをパスにし、lobby%20に届いたらボードへリダイレクトする.md)
- [**TODO-068.** 4 つの文書の見出しと表記を揃える](archives/todo/TODO-068.%204%20つの文書の見出しと表記を揃える.md)
- [**TODO-067.** リバースプロキシの設定](archives/todo/TODO-067.%20リバースプロキシの設定.md)
- [**TODO-066.** 過去に使っていた不要なファイルを削除する](archives/todo/TODO-066.%20過去に使っていた不要なファイルを削除する.md)
- [**TODO-065.** インストールを `uv tool install .` に変え、`ytbg.sh` を削除する](archives/todo/TODO-065.%20インストールを%20%60uv%20tool%20install%20.%60%20に変え、%60ytbg.sh%60%20を削除する.md)
- [**TODO-064.** board と lobby に URL のプレフィクスを指定できるようにする](archives/todo/TODO-064.%20board%20と%20lobby%20に%20URL%20のプレフィクスを指定できるようにする.md)
- [**TODO-063.** 複数サーバーの制御](archives/todo/TODO-063.%20複数サーバーの制御.md)
- [**TODO-060.** BoardController と BoardView を入れる](archives/todo/TODO-060.%20BoardController%20と%20BoardView%20を入れる.md)
- [**TODO-059.** 盤面の参照と操作の予測を純粋関数へ移す](archives/todo/TODO-059.%20盤面の参照と操作の予測を純粋関数へ移す.md)
- [**TODO-062.** ブラウザテストで画面を表示するモードに切り替えられるようにする](archives/todo/TODO-062.%20ブラウザテストで画面を表示するモードに切り替えられるようにする.md)
- [**TODO-058.** ブラウザテストが `board` を触る箇所を `helper.mjs` に集める](archives/todo/TODO-058.%20ブラウザテストが%20%60board%60%20を触る箇所を%20%60helper.mjs%60%20に集める.md)
- [**TODO-057.** CLAUDE.md の実装の説明を整理し、落とし穴を `docs/Developer.md` へ移す](archives/todo/TODO-057.%20CLAUDE.md%20の実装の説明を整理し、落とし穴を%20%60docs_Developer.md%60%20へ移す.md)
- [**TODO-061.** サーバを Session と protocol に分け、操作の結果を型で表す（対応しない）](archives/todo/TODO-061.%20サーバを%20Session%20と%20protocol%20に分け、操作の結果を型で表す.md)
- [**TODO-056.** モジュール構成とクラス構成を見直す（第 4 弾）](archives/todo/TODO-056.%20モジュール構成とクラス構成を見直す（第%204%20弾）.md)
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
