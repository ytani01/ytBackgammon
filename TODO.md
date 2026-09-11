# TODO

**残っている項目: TODO-031, TODO-032, TODO-033 の 3 件。** これまでに 31 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-035` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、これで全部終わった。**
TODO-032 は TODO-026 が済んだので、いつでも着手できる。
TODO-031 は、手元のボードが新しい保存形式に移るのを待つ。

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

## TODO-033. README.md,とドキュメント類を整備

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier |

- README.md: このプログラムの特徴をアピール
- Player.md: ブラウザでボードを触りプレーする人向けの操作マニュアル。スクリーンショットに番号や矢印などを入れて、視覚的にわかりやすいように工夫する。
- Admin.md: サーバーを起動・管理する人向け。具体的なコマンドラインなど。
- Developer.md: 本プロジェクトの開発者向けに、内部構造の説明。および、テスト方法なども。

### design.md と Developer.md の関係
docs/design.md は、実装前の設計として、実装が終わったら、アーカイブする。
Developer.mdには、改めて、開発プロジェクトに新規加入した人向けに、実装に合わせて、わかりやすく作り直す。このとき、コードの細かい内容は、コードを読めばわかるので省いて良い。主にモジュール構成、クラス構成、それぞれの関係について、mermaid図を入れて説明する。

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
