# TODO-063 レビューの報告（reviewer）

対象: 作業ツリーの差分（`git diff` とステージ済みの削除、新規の `lobby.py`・`lobby.html`・`lobby.js`・
`test_lobby.py`・`lobby.test.mjs`・`ytbg.toml`）。作業ツリーは書き換えていない。
実測は scratchpad に置いたスクリプトで、別ポート・一時の `YTBG_DATA_DIR` で行った。

## 要修正

### 1. 停止から起動したボードの iframe がエラー画面のまま戻らない

- 場所: `src/ytbg/webroot/static/js/lobby.js:81-84`（`update()`）、説明は `docs/Developer.md` の
  「一覧サーバ」の最後の項目
- 問題: 起動のボタンを押すと、`POST .../start` は子を `create_subprocess_exec` した直後に返り
  （`lobby.py:169-171`）、続く `refresh()` で `running` が true になる。その場で `iframe.src` を
  入れ直すので、ボードが listen する前に読み込みに行って接続を拒否される。以後 `running` は true の
  ままなので、二度と入れ直さない
- 実測: lobby を起動し、一覧ページで b1 を停止 → 1 秒待って起動 → 状態が「動作中」になってから
  8 秒待つと、b1 の iframe の URL は `chrome-error://chromewebdata/`（b2 は正常）。
  ボード単体は起動から listen まで約 0.26 秒かかる（`python -m ytbg board` を起動して計った）
- どうなるか: 「落ちたボードは起動のボタンで起動する」（Admin.md）の手順で、一覧ページの枠が
  エラー表示のまま。利用者は一覧ページのリロードが要る
- テスト: `tests/browser/lobby.test.mjs:154-168` は状態の文字しか見ていないので、この壊れ方を
  捕まえられない。起動後に iframe の中のページが読めていること（例: frame の URL が
  `chrome-error` でない、または盤面の要素がある）を見る必要がある
- 直し方の案（どれにするかは管理者の判断）:
  - API の状態に「listen しているか」を入れる（lobby がポートに接続を試す）。`update()` はそれが
    false → true に変わったときに入れ直す。Developer.md の「動作中はプロセスが生きていることしか
    意味しない」と、ポートが塞がったボードが一瞬「動作中」になる件も同時に解ける
  - JS 側だけで、動作中に変わってからしばらくの間、読み直しのたびに入れ直す（簡単だが、時間の
    当て推量になる）
- 補足（未確認）: 一覧ページの最初の読み込みも同じ形。lobby は子を起動した直後から一覧ページを
  返すので、lobby の起動直後に開くと枠がエラーになりうる。今回の実測では `uv run` の起動に時間が
  かかり、ボードの方が先に listen していたので再現しなかった

### 2. `server_id` を整数でも受けて文字列に直す（main の決定に合わせる）

- 場所と直す箇所:
  - `src/ytbg/lobby.py:61` — `_REQUIRED` の `server_id` が `str` だけ
  - `src/ytbg/lobby.py:99-108` — 型の判定。`server_id` だけ `int` も通す。`bool` は今の
    `isinstance(val, bool)` の判定で引き続き弾く（`server_id = true` を `"True"` にしない）。
    `float`（`1.5`）も弾く
  - `src/ytbg/lobby.py:113` — `BoardConfig(**ent)` の前に `str()` で直す。重複の判定
    （`:115-121`）は直したあとの値で行われるので、`1` と `"1"` は重複として弾かれる
  - `src/ytbg/lobby.py:72` — docstring の例（`server_id = "1"`）は、そのままでもよいが整数も書けると一言
  - `tests/test_lobby.py:72-73` — `server_id = 1` をエラーとして固定しているケースを、正しく読める
    ケース（`'1'` になる）に変える。`server_id = true` がエラー、`1` と `"1"` の重複がエラー、を足す
  - `docs/Admin.md:93` — `# 文字列で書く` のコメント
- 同じ箇所で検討（未確認。実際には試していない）: `server_id = ""` や `/` を含む値は検証を通るが、
  API のパス `/api/boards/{server_id}/start` に当たらない（Starlette の既定の変換は `/` を含まない）
  ので、一覧ページのボタンが 404 になるはず。弾くなら同じ判定に足す

### 3. 絶対 URL でない `url` が検証を通り、一覧ページが全部出なくなる

- 場所: `src/ytbg/lobby.py:99-108`（`url` は `str` かしか見ない）、
  `src/ytbg/webroot/static/js/lobby.js:25-28`（`new URL(board_url(b))`）
- 問題: `url = "/board1/"`（同じホストのパスでリバースプロキシする形）や `url = "ytbg1.example.net/"`
  は、`new URL()` が基準の URL 無しでは `TypeError: Invalid URL` を投げる（node で実測）。
  `make_card()` の中で投げるので `refresh()` が reject し、最上位の `await refresh()` で
  モジュールの実行が止まる（コードを読んで確認。`setInterval` も登録されない）
- どうなるか: 設定の誤りが起動時に止まらず、一覧ページが**全部のボードについて**空になる。
  依頼の「設定の誤りは起動時に分かるエラーで止める」に合わない
- 直し方の案: `load_config()` で `http://`・`https://` で始まる絶対 URL に限る（`urllib.parse` で
  scheme と netloc を見る）。相対パスも許すなら、JS 側を `new URL(board_url(b), location.href)`
  にする（`a.href` は相対でもそのまま効く）。どちらにするかは判断が要る

## 検討

### 4. 最初の読み込みで lobby に届かないと、覚えていた選択が消える

- 場所: `src/ytbg/webroot/static/js/lobby.js:106-108`
- 問題: 最初の `refresh()` が失敗すると（lobby の再起動中に開いたなど）`cards` が空のまま
  `select_main(undefined)` になり、`localStorage` に文字列 `"undefined"` を書く。覚えていた選択が消え、
  後の読み直しでカードが出ても大きく出るボードが無い（全部小さい）
- 根拠: コードを読んだだけ（未実測）
- 直し方の案: カードが 1 枚もなければ `select_main` を呼ばず、カードを最初に作った読み直しで選ぶ。
  あわせて `post()`（`:38-42`）も fetch の失敗を拾っていない（未処理の reject がコンソールに出る）

### 5. テストが見ていない分岐

- `tests/test_lobby.py` — 動作中のボードに `POST .../start` を送っても PID が変わらないこと。
  `lobby.py:158-159` の `if self.running: return` を外すと、2 つ目の子が同じポートで起動に失敗し、
  `_proc` がそちらに差し替わる。1 つ目の子は動いたまま「停止中」と表示され、停止のボタンも lobby の
  終了も届かず残る（コードを読んだ推論。壊して試してはいない）。依頼の「二重に起動する」の観点に当たる
- 同じく、知らない `server_id` で 404、lobby の `-d` がボードに渡ること（`lobby.py:163-164`）は
  テストが無い。後の 2 つは影響が小さいので、足すかは判断でよい

### 6. 使われていない名前

- `src/ytbg/lobby.py:39` — `_log = getLogger('lobby')` はどこからも使われていない（ログは
  `BoardProcess` の `self.__log` だけ）
- `src/ytbg/lobby.py:248` — `app.state.procs = procs` は `src/`・`tests/` のどちらからも読まれていない
  （grep で確認）。依頼の「使われない引数・抽象・分岐」に当たる

## 好みの範囲

### 7. `templates` の二重定義

- `src/ytbg/lobby.py:41` は `src/ytbg/app.py:29` と同じ `Jinja2Templates` を作っている。
  `NoCacheStaticFiles` と同じく `app.py` から import すれば 1 つで済む

## 問題が無かった点（確かめたこと）

- CLI: `ytbg board` の引数・オプション・既定値は変更前の `main`（`git show HEAD:src/ytbg/__main__.py`）と
  同じ。uvicorn の呼び方も `_run()` に移しただけで同じ。`lobby` の `-c`（既定 `ytbg.toml`）・
  `-p`（既定 5000）・`-d` は依頼どおり
- 停止: 一覧ページの iframe が WebSocket でつながった状態でも、停止のボタンから「停止中」まで 216 ミリ秒。
  SIGKILL には至らず、ログは `returncode=-15`（INFO）。ボードに SIGINT を送ると終了コード 0（Ctrl+C の
  経路でも WARNING は出ない）
- lobby の終了: `uv run ytbg lobby` の uv に SIGTERM を送ると、2 面とも止めてから終わった（実測のログ）。
  lobby のポートが塞がっていても、uvicorn 0.52.4 は bind の失敗で lifespan の shutdown を呼んでから
  終わる（`uvicorn/server.py:180-183`）ので、子は残らない
- 起動と停止の競合: `asyncio.Lock` で順に処理し、`stop()` は子の終了（`_wait` の Task）を待ってから
  返すので、止めた直後の起動でも前の子とポートが重ならない。lifespan の終了は uvicorn が処理中の
  リクエストを待ってから呼ぶ
- エスケープ: テンプレートに設定の値は埋めていない。JS は `textContent`・`href`・`dataset` で入れ、
  `innerHTML` は固定の文字列だけ
- テストの後始末: pytest は lobby を `start_new_session` で起動し `killpg` で SIGKILL、ブラウザは
  `detached` で起動し止まらなければグループへ SIGKILL。どちらも `YTBG_DATA_DIR` を一時ディレクトリにし、
  子へは環境変数がそのまま引き継がれる
- docs: README・Admin・Developer・Player に、消した 3 ファイルへの言及は残っていない
  （`sound.test.mjs:14` の「以前の ytbg.html は」は経緯の説明で、差し支えない）。
  `pgrep -af 'ytbg (board|lobby)'` は、子（`python -m ytbg board`）と lobby（`bin/ytbg lobby`）の
  両方に当たる。Developer.md に TODO 番号は書かれていない。要修正 1 を直すときは Developer.md の
  「停止中から動作中に変わったボードだけ、iframe の src を入れ直す」も合わせて直すこと
- CLAUDE.md の実行の節（`./ytbg.sh -d -p ...`・`ytbg-boot.sh`・`ytbg-stop.sh`）が古いままなのは、
  implementer の報告どおり main の担当
