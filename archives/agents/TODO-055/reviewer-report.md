# TODO-055 レビュー（reviewer）

対象: 未コミットの差分（`tests/browser/helper.mjs` の `headless: false` は対象外）。
テストの一式は走らせていない（verifier の担当）。

## 結論

**要修正は 0 件。** 動きは変わっていない。保存先を差し替える箇所にも、
利用者の `~/ytbg-*` を読み書きしてしまう経路は無い。検討 6 件、好みの範囲 2 件。

## 確かめたこと（問題なし）

- **`load_data()` の戻り値と `__init__` の判断は変更前と同じ。**
  変更前の `hist_len` は `len(self._hist)` で、`History.__len__` は `_history`
  だけを数える（`history.py:40`）。新しい `len(self._hist) > 0` と条件は同じ。
  変更前（`git archive HEAD`）と変更後の写しを scratchpad に作り、次の 3 通りの
  ファイルで起動して比べた。3 通りとも結果が一致した。
  - ヘッダだけ（`{"v": 2, "clock": {... "sw": false ...}}`）: 履歴 1 件・sn 1・
    `sw` はファイルの値（False）・ファイルは 2 行
  - ヘッダと `f` の行だけ: 履歴 1 件・進む側 0 件（`add_history()` が捨てる）
  - 壊れたファイル（`{`）: 履歴 1 件・`sw` は初期値（True）
- **`History.add()` の `None` 分岐と `_cur_sn` を消した。** `add_history()` を
  引数なしで呼ぶ箇所は `src/` にも `tests/` にも無い（grep で確認）。
  sn の求め方も前と同じ。
- **保存先の差し替え。** `BackgammonServer(` を呼ぶ箇所は
  `app.py:65`、`conftest.py`（`make_bg_server` と `bg_server_raw`）、
  `test_datafile_dir.py` だけ。どこでも、作る前に `YTBG_DATA_DIR` を
  `tmp_path` へ差し替えている。`create_app()` を使うのは `test_ws.py` だけで、
  こちらも作る前に差し替えている。`helper.mjs:79` は子プロセスの env に
  渡しているので、今までどおり効く。環境変数は `__init__` でしか読まないので、
  monkeypatch がテストの終わりで戻っても、作ったあとのサーバには影響しない。
- **`test_datafile_dir.py` は、クラス変数に戻すと落ちる。** scratchpad の写しで
  `DATAFILE_DIR` をクラス変数に戻して走らせたところ、4 件とも落ちた
  （`HOME` は scratchpad へ逃がした）。
- `backward_hist()` / `forward_hist()` の `n <= 0` は、`_replay_hist()` の
  `if n > 0 and count >= n` と合っている。
- `Developer.md` に TODO 番号は無い。`history` 付きのメッセージ、2 つの登録表
  （`DATA_TYPES` / `_handlers`）、`NO_HISTORY_TYPES`、`apply_move()` /
  `after_move()`、「1 手の区切り」の説明は残っていない（grep で確認）。
  `actions.js` / `drag.js` / `settings.js` / `rules/` の関数名と
  クラス図は、コードと合っている（`disable_unusable()`・`copy_gameinfo()` が
  あること、`Drag.drop_checker()` が戻すこと、`Board extends BgImage` も確認）。

## 検討

### 1. クラス変数に戻す退行が起きると、テスト一式が本物の `$HOME` に書く

- 場所: `tests/conftest.py:174`, `:220`、`tests/test_ws.py:34`、`tests/test_datafile_dir.py`
- 問題: 差し替えは「環境変数を作るときに読む」実装に頼っている。
  import のときに読む形へ戻ると、`bg_server` を使う全テストが
  `$HOME/ytbg-test.jsonl` を読み書きする。落ちるのは `test_datafile_dir.py` の
  4 件だけで、ほかのテストは通ってしまう。
- 起きる状況: 退行したとき。もう 1 つは、verifier が CLAUDE.md の
  「`src/` をわざと壊して確かめる」手順でこの箇所を壊すとき。実測では、
  壊した写しで 3 ファイルを走らせると、`HOME` に `ytbg-test.jsonl` が作られた。
  利用者のボード（`ytbg-1`〜`4`）とは名前が違うので、上書きはされない。
  なお `~/ytbg-test.jsonl` は今も実在するが、日付は 2026-09-12 04:53 で、
  この変更の前からある。
- 直し方の案: 次のどちらか。
  - `make_bg_server` / `bg_server_raw` / `client` で `HOME` も `tmp_path` へ差し替える
  - verifier への依頼に「壊して確かめるときは `HOME` を一時ディレクトリにする」と書く

### 2. `Developer.md` の「type を足すときに直すのはこの表（と dataclass とハンドラ）だけ」

- 場所: `docs/Developer.md:164-165`
- 問題: 「だけ」と言い切っている。CLAUDE.md の「状態と通信」には、
  「演出が要るときだけ `apply()` にも足す」とある。
- 直し方の案: 「音やダイスの回転が要るときは、クライアントの `Board.apply()` にも足す」と 1 文足す。

### 3. `Developer.md` の「free move の目の変更と得点の ▲▼ は、同じように予測してから送る」

- 場所: `docs/Developer.md:190-191`
- 問題: 「free move の」が「得点の ▲▼」にも掛かって読める。コードでは、
  得点の ▲▼（`actions.js` の `set_score()`）は free move かどうかに関係なく、
  毎回予測してから送る。予測を free move に限っているのは目の変更
  （`click_dice()`）だけ。さらにこの行は、ドラッグの説明の箇条書きの中に
  入っている。
- 直し方の案: 「free move での目の変更と、得点の ▲▼（free move に限らない）も、
  予測した盤面を先に表示してから送る」と分けて書く。

### 4. `load_data()` の docstring の 1 行目

- 場所: `src/ytbg/server.py:256`
- 問題: 「読めなければ何も書き換えずに False を返す」とある。ただ、ヘッダだけの
  ファイルでは、読めてクロックを差し替えたうえで False を返す（上の実測で `sw` が
  ファイルの値になった）。`Returns` の説明は合っているが、1 行目だけ読むと、
  False なら何も書き換えていないと受け取れる。挙動は変更前から同じで、
  説明の書き方だけの問題。
- 直し方の案: 「履歴が 1 件も無ければ False（クロックだけは読んだものに
  差し替わることがある）」のように書き足す。

### 5. `TODO.md` がまだ `docs/design.md` を指している

- 場所: `TODO.md:18`, `:35`
- 問題: ファイルはもう移してある。項目を閉じるときに消える行なら、それで足りる。
- 直し方の案: 閉じるときに一緒に直す（直し漏れの防止として書いておく）。

### 6. CLAUDE.md で「現行仕様ではない」が 2 回続く

- 場所: `CLAUDE.md:219-221`
- 問題: 足した行の末尾「**どちらも現行仕様ではない。**」の直後に、前からある
  「**現行仕様ではないので、実装の根拠として引かないこと。**」が続き、同じことを
  2 回言っている。
- 直し方の案: 足した側の太字の 1 文を消し、次の行を
  「**どちらも現行仕様ではないので、実装の根拠として引かないこと。**」にする。

## 好みの範囲

### 7. 足した行が行長を超えている

- 場所と表示幅:
  - `src/ytbg/history.py`（`Returns` の「履歴が変わったかどうか…」）: 87
  - `tests/test_named_ops.py:372`: 80
  - `src/ytbg/webroot/static/js/rules/position.js:79`: 94
- 問題: 表示幅（全角を 2 と数える）は `pyproject.toml` の `line-length = 78` を
  超えている。E501 は有効にしていないので、ruff は通る。
- 直し方の案: 折り返す。

### 8. 消した `None` の名残

- 場所: `tests/test_clock.py:301` の `fake_add_history(gameinfo=None)`、
  `src/ytbg/server.py:110` の `add_history(self, gameinfo)`
- 問題: 前者は既定値の `None` が残っている。後者は注釈が無く、
  `History.add()` に `GameInfo` と付けたのと揃っていない。
- 直し方の案: 既定値を消し、`gameinfo: GameInfo` を付ける。
