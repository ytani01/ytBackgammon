# TODO-013 実装の依頼（implementer）

`ytBackgammonServer.on_json()` の `type` ごとのテストを足す。
作業ディレクトリは /home/ytani/work/ytBackgammon。

## 目的

TODO-009 で通信層を Flask-SocketIO から Starlette + 素の WebSocket へ
入れ替える予定で、そのときに壊れるとしたら `on_json()` の分岐。
**「この `type` を投げたら `gameinfo` がこう変わり、こう送られる」**を先に
固めておき、移行後は同じテストを通すだけで済むようにする。

だから**網羅率を上げるのが目的ではない**。移行で壊れたら困るものを
書き留めるのが目的。

## 対象範囲

- `tests/conftest.py` — フィクスチャの作り替え（下の設計のとおり）
- `tests/test_on_json.py` — 新規。`on_json()` の分岐のテスト

**`src/` は変更しない。** テストのためにプロダクションコードを直したくなったら、
直さずに報告すること。

## conftest.py の設計（この形で作る）

### 1. `emitted` を「送られたメッセージの列」を見る形にする

いまの `emitted` は `emit()` の呼び出し引数を `(event, data, kwargs)` の
タプルで積むリスト。**まだどのテストからも使われていない**ので、自由に変えてよい。

`EmittedMessages` クラスを `conftest.py` に置き、`emitted` フィクスチャが
そのインスタンスを返すようにする。

- `calls` — `(event, data, kwargs)` をそのまま積んだリスト（逃げ道として残す）
- `messages` — `event == 'json'` の `data`（メッセージ本体）だけの列
- `types` — `messages` の各要素の `'type'` の列
- `last` — `messages` の最後。無ければ `None`
- `clear()` — 積んだものを捨てる

`fake_emit()` はこのインスタンスへ積む。

**なぜこの形にするか**をクラスの docstring に書くこと。TODO-009 で通信層が
変わっても、`fake_emit` の差し替え方だけを直せばテスト側は残せる、という理由。

### 2. `request` フィクスチャを足す

`on_json(request, msg)` の第 1 引数。中では `request.sid` をログに出すだけなので、
`types.SimpleNamespace(sid='test-sid')` で足りる。

### 3. `no_sleep` フィクスチャを足す

`back_all` / `back2` / `fwd_all` / `fwd2` は `on_json()` の中から
`backward_hist(0)` / `forward_hist(0, sleep_sec=.5)` を呼ぶので、
**テストからは `sleep_sec` を渡せない**。`monkeypatch` で
`yt_backgammon_server.time.sleep` を何もしない関数に差し替える。

`monkeypatch` なのでテストが終われば戻る。**`gevent.monkey.patch_all()` は
呼ばない**（`CLAUDE.md` の「テストを足すときの注意」）。

## test_on_json.py に書くこと

`on_json()` の分岐は 17 個。**全部について書く。**

### 末尾へ落ちる型（`put_checker` / `cube` / `dice` / `set_turn` /
### `set_playername` / `set_score` / `resign` / `set_clock_limit` /
### `set_player_clock`）

この 9 つは `return` せず、末尾の `add_history` と broadcast まで落ちる。
それぞれについて:

- **`gameinfo` の該当箇所が指定どおり変わること。**
  変えた場所だけが変わり、隣（別のプレーヤーの側など）が変わっていないことも
  見る。`put_checker` は ID を 100 で割ってプレーヤーを求めるので、
  `ch: 101` のような 100 台の ID でも確かめること
- **受け取った `msg` がそのまま broadcast されること**
  （`emitted.last` が送った `msg` と等しい）
- **`history: true` のときだけ履歴が 1 件増えること。**
  `history: false` では増えないこと。これは 9 つ全部で繰り返さなくてよく、
  代表 1 つで真偽の両方を見れば足りる

`data` の形は `on_json()` のコメントと `src/ytbg/yt_backgammon.py` の
各メソッドを見て決める。

### `return` する型（`back` / `back2` / `back_all` / `fwd` / `fwd2` /
### `fwd_all` / `new` / `set_gameinfo`）

この 8 つは末尾まで落ちない。**元の `msg` が broadcast されないこと**を
確かめる（`emitted.types` に送った `type` が入っていないこと）。ここが
移行で崩れやすい。

- `back` / `fwd` — `data` の `n` の数だけ履歴が動くこと。
  `_history` と `_fwd_hist` の増減の両方を見る
- `back_all` / `fwd_all` — 履歴の端まで動くこと。`backward_hist` は
  **先頭 1 件を残す**（`len(self._history) > 1` が条件）
- `back2` / `fwd2` — `back_all` / `fwd_all` と同じ動きになること
  （違いは `sleep_sec` だけで、テストからは見えない）
- `new` — `score` / `playername` / `clock_limit` が**引き継がれ**、
  盤面（`checker` / `dice` / `cube` / `turn`）が初期配置に戻ること。
  履歴に 1 件積まれること。`emitted.last` が `type == 'gameinfo'` で、
  `data.sec == 3` であること
- `set_gameinfo` — `gameinfo` が渡したもので置き換わり、履歴に積まれ、
  `type == 'gameinfo'` が送られること

### 履歴系で送られるもの

`emit_gameinfo()` が送るメッセージの形（`src` / `dst` / `type` / `data` の
`gameinfo` / `sec` / `hist_i` / `hist_n` / `history_flag`）は、そのまま
クライアントが読んでいる。**`hist_i` と `hist_n` が履歴の位置を表すこと**を
1 つは確かめておくこと（`back` を 1 回したら `hist_i` が 1 減り、`hist_n` は
変わらない）。

## 書き方

- 既存の `tests/test_history.py` / `tests/test_save_load.py` の書き方に合わせる。
  ファイル先頭の `#\n# (c) Yoichi Tanibayashi\n#` と docstring、
  テスト関数ごとの日本語 1 行 docstring
- テスト関数の名前は既存に合わせて英語
- **`bg_server` フィクスチャは初期化のときに履歴を 1 件積んでいる**
  （`load_data()` が失敗するので `add_history()` が呼ばれる）。
  履歴の件数を数えるテストは、この 1 件を前提に書く
- 同じ形の確認が並ぶところは `pytest.mark.parametrize` を使ってよい。
  ただし**読んで何を守っているのか分かること**を優先する

## 終わったら

- `uv run pytest -q`、`uv run ruff check .`、`uv run mypy src` を走らせる。
  変更前は pytest 16 passed、ruff 0、mypy 7 errors（すべて `__main__.py`、
  TODO-002 で残した既存の指摘）。**mypy は `tests/` を見ていない**
- `archives/agents/TODO-013/implementer-report.md` に、書いたテストの一覧
  （どの `type` で何を守っているか）、実行結果、`src/` を直したくなったが
  直さなかった箇所を書く

返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
ファイルの全文を返事に貼らない。
