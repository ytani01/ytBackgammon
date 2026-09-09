# TODO-001 verifier への依頼

## 目的

uv 移行（TODO-001）の実装が、実際に動くかを確かめる。
implementer の報告は `archives/agents/TODO-001/implementer-report.md`。
依頼の全文は `implementer-task.md`。

## 確かめること

1. **完了条件の再現**
   - `uv sync` が通る
   - `uv run ytbg --help` が動く
   - `./ytbg.sh -d -p 5011 -i images1a 99` で起動し、`/`、`/p1`、`/p2`、
     `/static/ytbg.js`、`/static/images1a/board-base.png` が 200 を返す
   - `./ytbg-boot.sh` で 5001〜5004 の 4 面が同時に起動し、
     `./ytbg-stop.sh` で全部止まる（`ps` で残っていないことまで見る）
2. **socket.io 4.x での通信**（ここが今回の山）
   - `python-socketio` のクライアント（`uv run --with 'python-socketio[client]'`
     などで用意してよい）でサーバに接続する
   - **クライアントを 2 つ繋ぎ**、片方から `json` イベントを送って、
     もう片方に broadcast されることを確かめる。送る中身は
     `src/ytbg/ytBackgammonServer.py` の `on_json()` の分岐を読んで、
     チェッカーを動かす `put_checker` などの実際に使われている `type` を選ぶ
   - 接続直後にサーバから盤面（`gameinfo`）が送られてくることを確かめる
   - **切断の処理**を確かめる。implementer が `handle_disconnect(reason=None)`
     を足しているので、クライアントを切ったときにサーバのログで
     `on_disconnect` が呼ばれ、`on_error` に落ちていないことを見る
   - 履歴の戻し／進め（`back`, `fwd` など該当する `type`）が動くか
3. **状態ファイル**
   - `~/ytbg-99.json` が書かれ、サーバを再起動すると読み込まれること。
     **確認が済んだら消すこと**（`\rm` でエイリアスを避ける）

## 注意

- ポートは 5011 など、常用の 5001〜5004 とぶつからないものを使う
  （`ytbg-boot.sh` の確認のときだけ 5001〜5004）
- 起動したサーバは必ず止めてから終わる
- `pkill` は使わない。`pgrep` で PID を確かめてから kill する
- `cp` / `mv` / `rm` は `-i` にエイリアスされているのでバックスラッシュを付ける
- **コードは直さない。** 見つけたことを報告するだけ

## 報告

`archives/agents/TODO-001/verifier-report.md` に書く。何を試して何が
どうだったかを、再現できる形（コマンドと出力の要点）で。返事は
「終わったか・報告ファイルのパス・判断が要る点」を 5 行以内で。

---

# 2 巡目の依頼（レビュー後の修正の確認）

レビューと利用者の判断を受けて、管理者が次の 4 点を直した。作業ツリーの
現状を確かめてほしい。

1. `src/ytbg/__main__.py` — `socketio.run()` に `debug` を渡すのをやめた
   （Werkzeug の対話デバッガが `0.0.0.0` に出るのを避けるため）
2. `src/ytbg/__main__.py` — `app.json.ensure_ascii = False` を削除した
   （実測で効いていなかったため）
3. `pyproject.toml` — wheel と sdist の `exclude` を足した
4. `README.md` と `CLAUDE.md` — 手順を uv 版に書き換えた。
   `~/bin` へのシンボリックリンク運用はやめ、「リポジトリの中で
   `./ytbg.sh`」に統一した
5. `ytbg.sh` / `ytbg-boot.sh` — 未使用の `MYNAME` を削除。
   `.gitignore` — コメントだけの「uv」の節を削除

## 確かめること

- `./ytbg.sh -d -p 5011 -i images1a 99` で、**ログは DEBUG になるのに
  Werkzeug の reloader とデバッガ PIN が出ない**こと。python のプロセスが
  1 面あたり 1 つになっていること（以前は reloader で 2 つだった）
- 通信が壊れていないこと（1 巡目と同じく 2 クライアントで broadcast、
  日本語を含む `set_playername` が相手に正しく届くこと。
  `ensure_ascii` を消した影響を見る）
- `uv build` で wheel に `.xcf` / `.pptx` が入らず、sdist に `docs/` と
  `archives/` が入らないこと。wheel に `webroot` の png/js/css/mp3 は
  ちゃんと入っていること。**確認後、`dist/` は消すこと**
- **`README.md` に書いたとおりに操作して動くこと。**
  `uv sync` → `./ytbg.sh -p ... -i ... {id}` → `uv run ytbg --help` →
  `./ytbg-boot.sh` → `./ytbg-stop.sh`。書いてある内容と実際が食い違う
  ところがあれば報告する
- `CLAUDE.md`「実行」に書いたコマンドがすべて動くこと

1 巡目と同じ注意（ポートは 5011、`pkill` を使わない、`\rm` を使う、
起動したサーバは止める、状態ファイルは消す、コードは直さない）。

報告は `archives/agents/TODO-001/verifier-report.md` に
「## 2 巡目」の節を足す形で。
