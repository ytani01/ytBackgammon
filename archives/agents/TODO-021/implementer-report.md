# TODO-021 implementer 報告

## 変更したファイル

### 追加

- `package.json` — `devDependencies` に `playwright: ^1.63.0`。
  `scripts.test` は `node --test tests/browser/`。`private: true`
- `package-lock.json` — `npm install` が作ったもの（lockfileVersion 3、
  playwright 1.63.0 と playwright-core 1.63.0 の 2 パッケージ）。
  入れるときは `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` を付けたが、
  **playwright 1.63.0 では付けなくてもブラウザは落ちてこない**
  （reviewer の実測。`~/.cache/ms-playwright` に変化なし）
- `tests/browser/helper.mjs` — 共通のヘルパー
  - `helper.mjs:32` `CHROMIUM_PATH` — `/usr/bin/chromium` を
    `executablePath` に渡す。理由（ms-playwright のリビジョン 1234 と
    1.63.0 が要求する 1243 が合わない、`npx playwright install` を
    しないこと）をコメントに書いた
  - `helper.mjs:43` `free_port()` — 固定ポートを使わず OS に選ばせる
    （5001〜5004 や他の作業とぶつからないように）
  - `helper.mjs:64` `start_server()` — `uv run ytbg -p <port> -i images1a
    browsertest` を `detached: true` で起動し、`YTBG_DATA_DIR` に
    `mkdtemp` の一時ディレクトリを渡す。`stop()` は
    `process.kill(-pid, 'SIGTERM')` →（5 秒待って）`SIGKILL` で
    プロセスグループごと落とし、一時ディレクトリを消す。
    `uv run` の下に python がぶら下がるのでグループへ送る。`pkill` は使わない
  - `helper.mjs:162` `open_board()` — ページを開き、`board` が組み上がって
    最初の `gameinfo` が届くまで待つ。コンソールエラーは `page.ytbg_errors` へ
  - `helper.mjs:205` `console_errors()` — 既知の `/favicon.ico` の 404 と、
    サーバ以外（font awesome の CDN）を除外。理由をコメントに書いた
  - `helper.mjs:226` `center_of()` / `helper.mjs:242` `wait_for()` /
    `helper.mjs:266` `sleep()`
- `tests/browser/board.test.mjs` — 基本の確認 5 件。サーバ 1 つに
  ページ 2 枚（page1 が操作、page2 が同期を見る）
  1. 盤面が描画される — チェッカー 30 枚が point に乗っていること、
     `board-base.png` の `naturalWidth > 0`、スクリーンショットが撮れること
  2. Roll ボタンでダイスが出る — `#rollbutton0` をクリックし、
     `board.roll_btn[0].get()` にオープニングロールの 1 個が入るまで待つ
  3. チェッカーをドラッグできる — free move にしてから `#p000` を掴み、
     別の point のチェッカーの位置へ落とす
  4. 2 枚目のタブに同期する — 3 の結果が page2 に届くこと、
     逆向き（page2 でプレーヤー名を変えると page1 に届く）
  5. コンソールエラーが出ていない

### 変更

- `src/ytbg/yt_backgammon_server.py:27-29` —
  `DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')`
  にし、理由のコメントを 2 行足した。**本体側の変更はここだけ**
- `.gitignore:1-5` — 1 行目の `*.json` は残し、`!package.json` と
  `!package-lock.json` の例外を足した（コメント付き）。
  末尾に `# Node.js` / `node_modules/` を足した
- `CLAUDE.md:35-41` — 実行のコード例に `npm install` と
  `node --test tests/browser/` を足し、pytest の行に「Python のテスト」と
  注記した
- `CLAUDE.md:62-83` — 「ブラウザ側の動作確認は今までどおり実際に触って行う」
  を書き換え、Python は pytest・JS は node という分担と、`tests/browser/` の
  注意点（chromium のパス、`YTBG_DATA_DIR`、ポートと後始末、favicon の 404、
  わざと壊して落ちることを確かめる）を書いた

## 検証

| コマンド | 結果 |
|---|---|
| `node --test tests/browser/` | pass 5 / fail 0（約 10 秒）、終了コード 0 |
| `uv run pytest` | 101 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed!、終了コード 0 |
| `uv run mypy src` | Success: no issues found in 5 source files、終了コード 0 |

`~/ytbg-*.json` は 1〜4 の 4 つが残っているだけで、**タイムスタンプは
作業前のまま**（いちばん新しいもので 04:43、作業は 07:0x 以降）。
`browsertest` の名前のファイルは作られていない。走らせたあとに
`pgrep -af ytbg` でプロセスも `/tmp/ytbg-test-*` も残っていないことを確かめた。

### わざと壊して落ちることを確かめた（4 通り）

| 壊した場所 | 落ちたテスト |
|---|---|
| `ytbg.js` `Checker.on_mouse_down_xy()` の `this.board.moving_checker = ch;` を消す | ドラッグ、同期 |
| `ytbg.js` `RollButton.roll()` をダイスを決める前に return | Roll |
| `yt_backgammon_server.py` `broadcast()` の宛先を 1 つ目だけに | 5 件全部（page2 が最初の gameinfo を受け取れず before で落ちる） |
| `ytbg.js` `Checker.on_mouse_move_xy()` に `console.error()` を足す | コンソールエラー |

いずれも元に戻してある（`git status` の変更は上に挙げた 3 ファイルだけ）。

## コンソールエラー（404）の正体

**`/favicon.ico` の 404 だけ**だった。`-d` 付きでサーバを起動して
アクセスログを見た結果:

```
INFO: 127.0.0.1:35490 - "GET /favicon.ico HTTP/1.1" 404 Not Found
```

`static/` にも favicon は無く、`__main__.py` のルーティングにも
`/favicon.ico` は無い。ブラウザは初回ロードのときだけ取りに行くので、
リロードでは出ない（TODO.md の「2 回目以降は出ない」と一致）。
**直していない**（範囲外。直すなら favicon を用意してルートを足すか、
`index.html` に `<link rel="icon" ...>` を置く）。

TODO.md には「404 が 2 件」とあったが、**今回の実測では 1 件**。
調査時は 2 枚のタブを開いていたか、2 回ロードしたためだと思われる
（1 ページにつき 1 件）。

## 判断が要る点・残る懸念

- **favicon の 404 を直すかどうか**（上記）。今はテストの判定から除いている
- **`#p000` を掴んだときの `moving_checker` は `p004`**（`p002` ではない）。
  新しい盤面では `p000` は point 6 に積まれた 5 枚のいちばん下なので、
  先端は `p004` になる（`yt_backgammon.py:60` の初期配置）。
  TODO.md の `p002` は別の盤面での観測だと思われる。テストは
  「その point の先端」を実際に引いてから比べる形にし、
  `p000` そのものではないことも見ている
- **テストは書いた順に依存している**（ドラッグ → 同期）。node:test は
  ファイル内を順に走らせるので今は問題ないが、並行に走らせるようにすると壊れる
- **font awesome を CDN から読んでいる**ので、ネットワークが無いところでは
  読み込みに失敗する。コンソールエラーの判定からはサーバ以外の URL を
  除いてあるので、テストは通る
- `npm install` でブラウザが落ちてくることを心配していたが、
  playwright 1.63.0 では起きなかった（reviewer が通常の env と `env -i`
  の両方で実測。`~/.cache/ms-playwright` に変化なし）。
  `CLAUDE.md` にも `npm install` とだけ書いてある
- 検証で `uv run` を挟むぶん、サーバの起動に 2〜3 秒かかる。
  テスト全体で約 10 秒

---

## 追記（レビュー後の 3 点）

要修正 0 件を受けての追加。

1. `tests/test_datafile_dir.py`（新規）— `DATAFILE_DIR` の決まり方を
   pytest でも見る。`importlib.reload` で環境変数を差し替える
   フィクスチャ（`datafile_dir`）を置き、YTBG_DATA_DIR が設定されて
   いればその値、無ければ HOME、空文字なら HOME、保存先のパスが
   その下になる、の 4 件。後始末で `monkeypatch.undo()` してから
   読み直し、モジュールを元に戻す（`conftest.py` の bg_server は
   import 時のクラスを掴んでいるので食い違わない）。
   **`os.getenv('HOME')` に戻すと 4 件のうち 2 件が落ちる**ことを
   確かめた。`uv run pytest` は 105 passed、`uv run ruff check .` も
   通る
2. `tests/browser/helper.mjs:200-201` — `console_errors()` の docstring に
   「origin での振り分けは url が空文字のもの（スタックの位置が取れない
   `console.error()`）も一緒に除いてしまう」という但し書きを足した。
   挙動は変えていない
3. この報告の `npm install` の記述を、reviewer の実測（1.63.0 では
   ブラウザのダウンロードは起きない）に合わせて直した
