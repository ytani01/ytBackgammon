# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

ネットワーク共有型のバックギャモンボード。Flask + Flask-SocketIO のサーバと、
ブラウザ上の JavaScript クライアントからなる。**対戦相手を組ませるゲームサーバではなく、
「1 枚のボードを全員で共有して自由に触れる」ことを目的にしている**（観戦者も操作できる）。
ルールチェックは補助であり、free move モードで無効化できる。

## 実行

uv を使う（TODO-001 で移行した）。**リポジトリのディレクトリの中で実行する。**
`~/bin` にシンボリックリンクを張る運用はやめた（`uv run` が
`pyproject.toml` を見つけられないため）。

```bash
uv sync          # .venv を作って依存を入れる

# サーバ起動
./ytbg.sh -d -p 5001 -i images1a 1     # 引数は server_id、-i は static/ 以下の画像ディレクトリ
uv run ytbg --help                     # ytbg.sh は uv run ytbg を呼ぶだけ

./ytbg-boot.sh   # ポート 5001〜5004 で 4 サーバを同時起動
./ytbg-stop.sh   # ps + grep で kill

uv run ruff check .
uv run mypy src
```

`-d` / `--debug` はログレベルを DEBUG にするだけ（`MyLogger.get_logger(name, debug)`）。
Flask の debug モードには渡していない。渡すと Werkzeug の対話デバッガが
`0.0.0.0` に出てしまうため（TODO-001）。

テストの仕組みは無い。動作確認はブラウザで実際に触って行う。
ruff と mypy は入っているが、既存コードの指摘はまだ残っている（TODO-002）。

## 構成

Python は `src/ytbg/` にある（パッケージ名は `ytbg`）。`templates/` と
`static/` は `src/ytbg/webroot/` の下。

- `src/ytbg/__main__.py` — エントリポイント（`[project.scripts]` の `ytbg`）。
  Flask のルーティング（`/`, `/p1`, `/p2` はすべて同じ `index.html`）と SocketIO の
  イベント登録だけを行い、処理は `svr` に委譲する。`svr` はグローバルで、
  `main()` の中で生成される。`template_folder` / `static_folder` は
  `__file__` から組み立てた `webroot/` の絶対パスなので、どこから起動しても解決する
- `src/ytbg/ytBackgammonServer.py` — サーバ側の中心。クライアントからの `json`
  メッセージの分岐、履歴の管理、`~/ytbg-{server_id}.json` への保存・読み込み、
  全クライアントへの broadcast
- `src/ytbg/ytBackgammon.py` — `gameinfo`（盤面の状態そのもの）を保持し、
  更新するだけのクラス。ルール判定は持たない
- `src/ytbg/webroot/static/ytbg.js`（4000 行超）— クライアントのほぼ全て。
  ファイル先頭のコメントにクラス階層図がある
  （`BgBase` → `BgText`/`BgImage` → 各表示要素、`Board`）
- `src/ytbg/webroot/templates/index.html` — ボード 1 面。JS/CSS はタイムスタンプ付き
  URL で動的に読み込む（キャッシュ避け）。画像パスに `{{image_dir}}` が埋め込まれる。
  socket.io はクライアント側 4.x を CDN から読む
- `ytbg.html` — 複数サーバの画面を iframe で並べる一覧ページ（Flask 経由ではなく静的）

### サーバ 1 プロセス ＝ ボード 1 面

`server_id` ごとに別プロセスを別ポートで起動する。状態ファイルもクッキー名も
`server_id` で分かれる。複数ボードは「複数プロセス ＋ iframe」で実現している。

### 状態と通信

`gameinfo` が唯一の状態（`ytBackgammon.init_gameinfo()` に構造がある）。
`turn`（-1 以下:操作不可、0/1:各プレーヤー、2 以上:両方可）、`resign`、`score`、
`clock_limit`、`board`（`playername` / `clock` / `cube` / `dice` / `checker`）。

チェッカーは `checker[player][i] = [point, idx]` の配列で、**ID は
`player * 100 + i`**（例: 012, 101）。サーバ側の `put_checker()` はこの ID を
100 で割ってプレーヤーを求める。

ポイント番号は 0〜25 が盤上（0 と 25 がゴール = `goal_point(player)`）、
**26, 27 がバー**（`bar_point(player) = 26 + player`）。プレーヤー 0 は番号が
減る方向、プレーヤー 1 は増える方向に進む（`calc_dst_point()`）。

メッセージは全て SocketIO の `json` イベント 1 本で、
`{src, type, data, history}` の形（クライアント側は `emit_msg()`）。
`type` の分岐はサーバの `on_json()` とクライアントの `ws.on("json")` の
**両方に同じ名前で書かれている**ので、`type` を足すときは両方直す。
`history: true` を付けたメッセージだけが履歴に 1 手として積まれる。

なお、`ytBackgammonServer.on_json()` の `set_clock_swith`、`resume_clcok`、
`start_clcok` などは綴りが誤っているうえ中身も `pass` で、クロック関係は
クライアント側だけで完結している。

### 履歴（戻す・進める）

`_history` と `_fwd_hist` の 2 つのスタック。戻すと `_history` から pop して
`_fwd_hist` へ積む。連続再生は `_repeat_flag` を見ながら `time.sleep()` で
1 手ずつ emit するので、**再生中に別の再生要求が来ると前の再生を止めてから始める**。

保存は `save_data()` が JSON を文字列連結で組み立てている（`json.dump` ではない）。
1 手 1 行に近い読みやすい形にするためで、`gameinfo` にキーを足したときは
`hist_ent2str()` も直さないと保存されずに落ちる。

### 画像ディレクトリ

`src/ytbg/webroot/static/` の `images0a` `images1a` `images2` `images3` が
ボードのデザイン。
起動時の `-i` で選ぶ。ファイル名（`board-base.png`, `checker0.png`, `dice01.png`,
`cube01.png` など）は共通で、デザインを足すときは同じ名前を揃える。

## 書き方の慣習

- ログは `MyLogger.get_logger()` を使い、クラスでは `__class__._log` に入れる
- コード内のコメント・docstring は日本語と英語が混在している。周りに合わせる
- クライアント側の座標は `Board` の `this.bx` / `this.by` の配列を基準に
  組み立てられている。位置を直すときはこの配列を見る
