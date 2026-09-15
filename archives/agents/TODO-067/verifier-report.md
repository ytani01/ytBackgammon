# TODO-067 verifier 報告

対象: `docs/Admin.md` に足した「## 設定例」節（`git diff docs/Admin.md` で見た差分）。
コード・文書は変更していない。

## 1. lobby + ボード 2 面を実際に起動して確認

設定ファイル（scratchpad に作成。リポジトリの `ytbg.toml` の設定例と同じ内容）:

```toml
[[board]]
server_id = 1
port = 5001
image_dir = "images2"
prefix = "/ytbg1"
url = "/ytbg1/"

[[board]]
server_id = 2
port = 5002
image_dir = "images0a"
prefix = "/ytbg2"
url = "/ytbg2/"
```

起動コマンド（リポジトリ内、`YTBG_DATA_DIR` を scratchpad の一時ディレクトリへ）:

```
uv run ytbg lobby -c <scratchpad>/ytbg.toml -p 5000 --prefix /ytbg
```

ポート 5000〜5002 は空いていたので、そのまま使用（ポートを変えたコピーは不要だった）。

### curl での確認

```
http://127.0.0.1:5000/ytbg/  -> 200
http://127.0.0.1:5001/ytbg1/ -> 200
http://127.0.0.1:5002/ytbg2/ -> 200
http://127.0.0.1:5000/       -> 404
http://127.0.0.1:5001/       -> 404
```

`/` では開かず、`/ytbg…/` でのみ開く、という記述どおり。

### 一覧ページの API（iframe の URL を決める材料）

`curl http://127.0.0.1:5000/ytbg/api/boards` の返事:

```json
[
  {"server_id": "1", "port": 5001, "image_dir": "images2",
   "url": "/ytbg1/", "prefix": "/ytbg1", "running": true, "listening": true, ...},
  {"server_id": "2", "port": 5002, "image_dir": "images0a",
   "url": "/ytbg2/", "prefix": "/ytbg2", "running": true, "listening": true, ...}
]
```

`src/ytbg/webroot/static/js/lobby.js` の `board_url()` を読むと、
`b.url != null` のとき `new URL(b.url, location.href).href` で iframe の URL を
決める。`url = "/ytbg1/"` は一覧ページの URL 相対で解決されるので、
一覧ページを `https://www.example.net/ytbg/` で開けば iframe は
`https://www.example.net/ytbg1/` になる。これは nginx が `/ytbg1/` を
`board-host:5001` へ振り分けることが前提（設定例はその構成そのもの）。

**このホストには nginx が無いので**、lobby 自身のポート（5000）に直接
`http://127.0.0.1:5000/ytbg1/` を curl すると 404 になることを確認した
（lobby は `/ytbg1/` を自分では配らない。これは設計どおりで、設定例が
「nginx が前段にある」ことを前提にしているためで、バグではない）。
ブラウザで iframe の描画そのものは確認していない（playwright を使わず、
API と JS のソースコードの突き合わせで確認した）。この点は判断が要れば
追加でブラウザ確認する。

### `url` を省いた場合の記述

`url` が無いときの `board_url()` は
`${location.protocol}//${location.hostname}:${b.port}${b.prefix}/` を返す
（`src/ytbg/webroot/static/js/lobby.js` 28 行目）。これは
`docs/Admin.md` の「設定例」節にある
「省くと iframe の URL が `https://www.example.net:5001/ytbg1/` になり、
一覧ページにボードが出ない」という記述と一致する（ホスト名はそのまま、
ポートを付ける）。実際にこの設定（`url` を外したコピー）を起動して
ブラウザで確認してはいないが、コードの読み取りで裏付けが取れている。

### WebSocket 接続

```
uv run python -c "... websockets.connect('ws://127.0.0.1:5001/ytbg1/ws') ..."
```

629 バイトの JSON（`type` を含む）を受信できた。`/ytbg1/ws` への接続は問題ない。

### SIGTERM でボードも止まるか

`pgrep -af 'ytbg (board|lobby)'` で lobby 本体の PID（uv run の子の python
プロセス）を確認し、その PID へ `kill -TERM` を送った。ログ:

```
lobby.py:250 stop()> stop: server_id=1, pid=3728588
lobby.py:250 stop()> stop: server_id=2, pid=3728590
lobby.py:241 _wait()> server_id=2: exited (pid=3728590, returncode=-15)
lobby.py:241 _wait()> server_id=1: exited (pid=3728588, returncode=-15)
```

3 秒後に `pgrep -af 'ytbg (board|lobby)'` は該当なし（終了コード 1）。
lobby と 2 面のボードすべてが SIGTERM で止まることを確認した。
`pkill` は使わず、`pgrep` で見つけた PID を個別に kill した。

## 2. systemd ユニットの書式確認

「設定例」節の `ytbg.service`（`ExecStart` の `%h` を含む）をそのまま
`~/.config/systemd/user/ytbg-verify.service` に置き、
`systemd-analyze --user verify ytbg-verify.service` を実行。**エラー・警告
無し（終了コード 0）。** 確認後、ファイルは削除した（enable・start はしていない）。

## 3. nginx の記述の整合性（このホストに nginx は無いので実行はしていない）

- `proxy_pass` にパスを付けない、という記述は、既存の「### URL の
  プレフィクス」節（56〜78 行目）の例
  （`location /board1/ { proxy_pass http://127.0.0.1:5001; ... }`）と
  同じ形で、矛盾は無い
- `location` 末尾の `/` を省くと `/ytbg1` にも当たる、という記述は、
  nginx の prefix マッチの一般的な挙動と合っている（`location /ytbg` は
  `/ytbg1` にも前方一致する）
- WebSocket 用のヘッダ（`Upgrade` / `Connection: upgrade`）も既存の節と
  同じ書き方

## 4. `ExecStart` のパスと「用意するもの」節との整合性

`docs/Admin.md` 冒頭の「用意するもの」節（14〜17 行目）に
「`uv tool install .` を実行すると `ytbg` コマンドが `~/.local/bin` に
入る」とあり、`ExecStart=%h/.local/bin/ytbg ...` と一致する。

## 変更されたファイル

`git status` は `docs/Admin.md` の変更のみ。確認作業で作ったのは
scratchpad と `~/.config/systemd/user/` の一時ファイルだけで、後者は削除済み。
リポジトリ側にコード・文書の変更は加えていない。

## 確かめられなかったこと・判断が要る点

- **iframe が実際にブラウザで正しく描画されるかは見ていない。**
  nginx が無いこの環境では設定例をそのまま再現できず、API の返事と
  JS のソースの突き合わせで確認した。ブラウザでの見た目まで確かめる
  なら、nginx（または同等のプロキシ）を用意して playwright で見る
  必要がある。管理者が要る水準を判断してほしい
- nginx の設定そのもの（`nginx -t` 相当）は、このホストに nginx が
  無いため実行していない（依頼どおり、記述の整合性の読み合わせのみ）
- systemd ユニットは書式確認のみ。実際に `enable --now` して
  `loginctl enable-linger` まで試してはいない（依頼どおり）
