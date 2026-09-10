# TODO

**残っている項目: TODO-021。** これまでに 20 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-022` から。**

---

## TODO-021. ブラウザでの動作確認の仕組みを作る

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `package.json` を作る（devDependency は playwright だけ）
- [ ] `.gitignore` に `node_modules/` を足す
- [ ] `tests/browser/` に確認用のスクリプトを置く
- [ ] テストが利用者のデータに触れないようにする
- [ ] `CLAUDE.md` の「実行」の節に走らせ方を足す

### きっかけ

TODO-020 で決めた見直し（[`docs/design.md`](docs/design.md)）を実装していく
にあたり、**クライアントの JS を大きく変える項目が 4 つある**
（TODO-026〜029）。今はブラウザ側の確認を手で行っており、確認の担当を
分けても JS の変更を確かめられない。

できるのではという指摘を受けて試したところ、playwright で
**盤面の描画・Roll・ドラッグ・2 枚目のタブへの同期・コンソールエラー**まで
確かめられた。仕組みとして残す。

### 作るもの

`tests/browser/` に、サーバを起動 → ページを開く → 操作する → 内部状態を
読む、という共通のヘルパーと、基本の確認を置く。実測できた範囲:

- 盤面が描画される（スクリーンショット）
- Roll ボタンでダイスが出る（`board.roll_btn[0].get()` を読む）
- チェッカーをドラッグできる（`moving_checker.cur_point` が変わる）
- **2 枚目のタブに同期する**（共有ボードの本体部分）
- コンソールエラーが出ていない

### 実測で分かっていること

**ブラウザはシステムの `/usr/bin/chromium` を `executablePath` で指定する。**
`~/.cache/ms-playwright/` にあるリビジョン（1234）は playwright 1.63.0 が
要求するもの（1243）と合わず、そのままでは起動しない。
**この理由をコメントに残すこと。** 残さないと、次に触る人が
`npx playwright install` で数百 MB を落としに行く。

**`#p000` を掴むと `moving_checker` は `p002` になる。** 「クリックされた
ポイントの先端のチェッカーに持ち換える」という `Checker.on_mouse_down_xy()`
の意図どおりで、正しい挙動。テストを書くときに取り違えやすい。

初回ロード時にコンソールエラーが 2 件（404）出る。2 回目以降は出ない。
**正体は未特定なので、この項目で調べて、既存の不具合なら記録する。**

### 利用者のデータに触れないようにする

`ytBackgammonServer.DATAFILE_DIR` が `os.getenv('HOME')` 固定で、保存先は
`~/ytbg-{server_id}.json`。`tests/conftest.py` は `DATAFILE_DIR` を
差し替えているが、**ブラウザの確認では実プロセスを起動するので
差し替えられない。**

`os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')` にして、テストは一時
ディレクトリを渡す。この 1 行がこの項目で唯一の本体側の変更で、
TODO-024（サーバ分割）で `Storage` へ移る。

調査では `server_id` を `cctest` にして手で消したが、**消す前に一度
シェルごと落としている**（`pgrep -f 'ytbg.*cctest'` が、そのコマンドを
走らせているシェル自身のコマンドラインにもマッチした）。環境変数で
分けるほうが確実。

### 分担

`~/.claude/agents/` の常設の定義で足りる。

- **implementer** — `package.json` / `tests/browser/` / `CLAUDE.md` /
  `DATAFILE_DIR` の 4 箇所にまたがる
- **verifier** — 実際にブラウザの確認を走らせて通ることを確かめる。
  **`YTBG_DATA_DIR` を渡したときに `~/ytbg-*.json` が増えないことも確かめる**
- **reviewer** — `DATAFILE_DIR` の条件式が変わるため入れる。範囲はそこと、
  テストが確かめている中身が狙いどおりか（通ることだけを見ていないか）に絞る

### 決めること

- playwright のバージョンを固定するか（今回試したのは 1.63.0）
- `tests/browser/` を `uv run pytest` から呼べるようにするか、
  `node` で直接走らせるか

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

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
