# = サーバの動かし方

ボードを立てて動かす人向け。遊び方は [Player.md](Player.md)、
中の作りは [Developer.md](Developer.md) にある。

## == 用意するもの

- [uv](https://docs.astral.sh/uv/)。Python 本体も uv が用意する
- ブラウザ(遊ぶ人の側。サーバには要らない)

```bash
git clone https://github.com/ytani01/ytBackgammon.git
cd ytBackgammon
uv tool install .
```

`ytbg` コマンドが `~/.local/bin` に入る(`uv tool dir --bin` で確かめられる)。
PATH に無ければ `uv tool update-shell` で足す。

**タグごと clone すること。** バージョンは git のタグから取っているので、
`--no-tags` や `--depth 1` で clone すると、エラーにならないまま
`0.1.devN` という誤ったバージョンになる。

**インストールした時点のファイルがコピーされる。** clone したディレクトリで
ファイルを変えても、`ytbg` には反映されない。`git pull` したとき、デザインを
足したときは、`uv tool install --reinstall .` を実行し直す。
アンインストールは `uv tool uninstall ytbg`。

## == 起動する

ボードを 1 面だけ立てるときは `board` を使う。複数のボードをまとめて
立てるときは、後述の `lobby` を使う。

```bash
ytbg board -d -p 5001 -i images1a 1
```

| 引数・オプション | 意味 |
|------------------|------|
| `SERVER_ID`(引数) | ボードの識別子。**状態ファイルとクッキーの名前がこれで分かれる** |
| `-p`, `--port` | ポート番号(既定 5001) |
| `-i`, `--image_dir` | 盤面のデザイン。`static/` の下のディレクトリ名 |
| `--prefix` | URL のプレフィクス(例 `/board1`。既定は無し)。後述 |
| `-d`, `--debug` | ログを DEBUG まで出す |

`ytbg board --help` でも同じものが出る。

**`-i` は毎回指定すること。** 既定値は `static/` に無いディレクトリを指しているので、
省くと盤面の画像が出ない。

ブラウザで `http://<ホスト>:<ポート>/` を開く。`/p1` と `/p2` も同じページ。
**盤面の向きは URL では決まらない。** 「ボード回転」で変えた向きは
ブラウザごと・ボードごとに覚えるが、Cookie に期限を付けていないので
**ブラウザを終了すると既定の向きに戻る。**

### === URL のプレフィクス

`--prefix /board1` を付けると、ボードは `http://<ホスト>:<ポート>/board1/` で開く
(`/board1/p1`・`/board1/p2` も同じページ)。**`/` では開かない。**
`/board1` は `/board1/` へリダイレクトする。
`board1`・`/board1`・`/board1/` は同じ意味。`/a/b` のように段を重ねてもよい。
前後の `/` はいくつあっても取る。各段に使える文字は英数字と `.` `_` `~` `-` だけで、
途中の空の段(`/a//b`)と `.`・`..` は書けない。

1 つのホストのパスごとにボードを振り分けるリバースプロキシで使う。
**プロキシはパスを外さずにそのまま渡すこと。** nginx なら `proxy_pass` に URI を
付けない(`http://127.0.0.1:5001/` のように `/` を付けると、パスが書き換わる)。
WebSocket(`/board1/ws`)も通すように、`Upgrade` を渡す。

```nginx
location /board1/ {
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### === 盤面のデザイン

`src/ytbg/webroot/static/` の下にある。

| ディレクトリ |
|--------------|
| `images0a` |
| `images1a` |
| `images2` |
| `images3` |

ファイル名(`board-base.png`、`checker0.png`、`dice01.png`、`cube01.png` など)は
共通なので、デザインを足すときは同じ名前を揃える。足したあとは
`uv tool install --reinstall .` を実行する。

画像を作った元のファイル(GIMP の `*.xcf`、PowerPoint の `*.pptx` など)も、
同じディレクトリに置いてコミットする。配布物には入らない(`pyproject.toml` の `exclude`)。

## == 複数のボードを立てる

**サーバ 1 プロセス ＝ ボード 1 面。** 複数のボードは、`server_id` を変えた
プロセスを別のポートで起動する。まとめて扱うには一覧サーバ(lobby)を使う。

```bash
ytbg lobby -c ytbg.toml          # ポート 5000 で一覧ページを出す
ytbg lobby -d -p 8000 -c ytbg.toml
```

lobby は起動すると、設定ファイルにあるボードを**すべて子プロセスとして起動する。**
lobby を止める(Ctrl+C、`kill`)と、ボードも止まる。

| オプション | 意味 |
|------------|------|
| `-c`, `--config` | 設定ファイル(既定はカレントディレクトリの `ytbg.toml`) |
| `-p`, `--port` | 一覧ページのポート番号(既定 5000) |
| `--prefix` | 一覧ページの URL のプレフィクス(書き方はボードと同じ)。ボードには渡さない |
| `-d`, `--debug` | ログを DEBUG まで出す。ボードにも `-d` を付ける |

### === 設定ファイル

TOML で、ボードごとに `[[board]]` を書く。リポジトリのトップの `ytbg.toml` は、
`server_id` 1〜4 をポート 5001〜5004 に、デザインを `images2` / `images0a` /
`images1a` / `images3` の順で割り当てている。

```toml
[[board]]
server_id = 1            # 整数でも文字列（"1"）でもよい
port = 5001
image_dir = "images2"
prefix = "/board1"       # 省略可。ボードを --prefix で起動する
```

`server_id`・`port`・`image_dir` は必須。`server_id` とポートが重なっていたり
(`1` と `"1"` も重なりとみなす)、知らないキーがあったりすると、lobby は起動せずに
エラーを出す。`server_id` は空にできず、`/` も含められない。

`prefix` の書き方は `--prefix` と同じ。この設定のまま、直接開いても
nginx などのリバースプロキシの裏に置いても動く(リダイレクトの仕組みは
下の「一覧ページ」を参照)。
**ボードの数は設定ファイルで決まる。** 一覧ページから足したり消したりはできない。

### === 一覧ページ

ブラウザで `http://<ホスト>:5000/` を開く。ボードを iframe で並べ、選んだ 1 面を
大きく、残りを小さく出す(「大きく表示」で選ぶ。選んだボードはブラウザに覚える)。

- **iframe の URL** は、`prefix` のあるボードなら一覧ページと同じオリジンの、
  ボードの `prefix` のパス(`http://<一覧ページのホスト>:<一覧ページのポート>/board1/`)。
  `prefix` の無いボードは、一覧ページを開いたホスト名にボードのポートを付けたもの
  (`http://<ホスト>:5001/`)。`prefix` のあるボードへは、lobby がそのパスを受けたら
  ボード自身のポート(`http://<ホスト>:5001/board1/`)へ 302 でリダイレクトする
- iframe のボードは音を出さない(全面の音が重なるため)。ボード名を押すと、
  音の出るボードが別のタブで開く
- ボードごとに状態と、起動・停止のボタンを出す。状態は「停止中」、
  「起動中」(プロセスはあるが、まだ接続を受け付けていない)、「動作中」の 3 つ。
  **認証は無い。** 一覧ページを開ける人は誰でも押せる

**落ちたボードは自動で起動し直さない。** 一覧ページに「停止中」と出るので、
起動のボタンで起動する。起動できない理由(ポートが塞がっているなど)は、
ボードのエラーがそのまま lobby の端末に出て、lobby のログに終了コードが出る。

**lobby の外で動いているボードは扱わない。** `ytbg board` で別に起動した
ボードは一覧に出ず、同じポートを設定に書くと、そのボードは起動できずに停止中になる。
このとき、起動に失敗して終わるまでの一瞬に状態を読むと「動作中」になり、
iframe に外のボードが出たまま残ることがある。

## == 設定例

lobby とボード 2 面を、1 つのホストのパスで分けて HTTPS で出す例。
ytbg はホスト `board-host` で動かし、nginx はそれとは別のホストで HTTPS を受ける。

| URL | 中身 | board-host のポート |
|-----|------|---------------------|
| `https://www.example.net/ytbg/` | 一覧ページ(lobby) | 5000 |
| `https://www.example.net/ytbg1/` | ボード 1 | 5001 |
| `https://www.example.net/ytbg2/` | ボード 2 | 5002 |

### === board-host の設定ファイル

`~/ytbg/ytbg.toml`

```toml
[[board]]
server_id = 1
port = 5001
image_dir = "images2"
prefix = "/ytbg1"

[[board]]
server_id = 2
port = 5002
image_dir = "images0a"
prefix = "/ytbg2"
```

### === board-host で起動する

lobby がボードを起動するので、起動するのは lobby だけ。systemd のユーザーサービスにする。

`~/.config/systemd/user/ytbg.service`

```ini
[Unit]
Description=ytBackgammon lobby
After=network-online.target

[Service]
ExecStart=%h/.local/bin/ytbg lobby -c %h/ytbg/ytbg.toml -p 5000 --prefix /ytbg
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now ytbg
sudo loginctl enable-linger $USER   # ログインしていなくても動かし続ける
```

止めるときは `systemctl --user stop ytbg`。ボードも止まる。
ログは `journalctl --user -u ytbg` で見る。

### === nginx

`server_name www.example.net;` の `server`(HTTPS を受けるもの)の中に足す。

```nginx
location /ytbg/ {
    proxy_pass http://board-host:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
location /ytbg1/ {
    proxy_pass http://board-host:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
location /ytbg2/ {
    proxy_pass http://board-host:5002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

- `location` の末尾の `/` は省かないこと。`location /ytbg` と書くと `/ytbg1` にも当たる。
  `/` があれば、末尾に `/` の無い `/ytbg1` は nginx が `/ytbg1/` へリダイレクトする
- `proxy_pass` にはパスを付けない(付けるなら `location` と同じパスにする)。
  プレフィクスが外れると、ボードが開かない
- 別のホスト名から一覧ページへ飛ばすなら、そのホストの `server` に
  `rewrite ^(.*)$ https://www.example.net/ytbg$1 permanent;` を書く
- ボードの `location`(`/ytbg1/` など)を書き忘れると、外から `/ytbg1/` が
  nginx に届かず、lobby がそのパスを受けて `board-host:5001` への 302 を返す。
  外から届かないホスト名へのリダイレクトになり、ボードが開かないので、
  「lobby は動くのにボードだけ開かない」ときはここを疑う

**一覧ページには認証が無い。** 開ける人は誰でもボードを起動・停止できる。

## == 状態の保存

盤面と履歴は **`~/ytbg-{server_id}.jsonl`** に保存される(JSON Lines)。

- 1 行目がメタ情報(形式の版とクロック)
- 2 行目以降が履歴。1 行 1 手

プロセスを落としても、次に同じ `server_id` で起動すれば続きから始まる。
**バックアップも引っ越しも、このファイルをコピーするだけ。**

保存先は環境変数 `YTBG_DATA_DIR` で変えられる(省くとホームディレクトリ)。

```bash
YTBG_DATA_DIR=/var/lib/ytbg ytbg board -p 5001 -i images1a 1
```

**古い版が書いた `~/ytbg-{server_id}.json` は、もう読まない。**
消しもしないが、**中身は使われない。** `.json` しか無いボードを起動すると
初期配置から始まり、1 手でも動かすと `.jsonl` が新しく書かれる
(ログに「旧形式のファイルがあるが読まない」と出る)。
**中の対局を取り戻したいときは、`.json` を読める古い版で一度起動して
`.jsonl` に移してから、新しい版に戻すこと。**

クロックは、持ち時間・機能の ON/OFF・残り時間が保存される。
**動作中かどうかは保存しない**(落ちている間の時間は数えられないので、
読み込んだときは必ず止まった状態で始まる)。

## == ログ

`-d` を付けると DEBUG まで出て、uvicorn 自身のログ(`Uvicorn running on ...`、
`connection open`)も出る。付けないと、どちらも出ない。

uvicorn のログは別系統なので、`-d` を付けたときも書式は揃わない。

## == 止める

lobby で起動したボードは、一覧ページの停止のボタンで止める。lobby ごと
止めるときは、lobby の端末で Ctrl+C を押すか、lobby に `kill` を送る
(SIGTERM。ボードも止めてから終わる)。

**lobby を `kill -9`(SIGKILL)で止めると、ボードが残る。** そのときは
PID を確かめてから、残ったボードを kill する。`board` で 1 面だけ起動した
ときも同じ。

```bash
pgrep -af 'ytbg (board|lobby)'
kill <PID>
```

**`pkill` でパターン指定して止めないこと。** 関係の無いプロセスまで巻き込む。

## == バージョンを上げたとき

タグを打ったあと、または `git pull` したあとは、`uv tool install --reinstall .` を
実行する。`uv tool list` で入っている版を確かめられる。

## == 困ったとき

**ポートが塞がっている**(`Address already in use`)

```bash
pgrep -af 'ytbg (board|lobby)'   # 前のプロセスが残っていないか
```

**ブラウザからつながらない**

外から見えるようにするには、そのポートがファイアウォールで開いている必要がある。
`-d` を付けて起動し、`connection open` がログに出るかを見る。

**画面が真っ白、または盤面の画像が出ない**

`-i` で指定したディレクトリが `static/` の下にあるかを確かめる。

**つないだ画面の盤面が戻ってしまう**

**共有ボードなので、誰かが「New Game」や「1 つ戻す」を押すと全員の画面が変わる。**
故障ではない。New Game と「履歴を削除」は、押した人の画面で確認を出している。

**盤面がおかしくなった**

「履歴を削除」で履歴だけを消せる(盤面は変わらない)。それでも直らないときは、
サーバを止めて `~/ytbg-{server_id}.jsonl` を退避してから起動し直す。
新しいファイルが作られ、初期配置から始まる。
