# TODO-001. uv への移行

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer + wording |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 32,431 | 174,890 | 41% |
| reviewer | Opus 5 | high | 23,678 | 104,993 | 28% |
| verifier | Sonnet 5 | medium | 15,071 | 157,093 | 15% |
| implementer | Opus 5 | medium | 5,196 | 71,788 | 14% |
| wording | Sonnet 5 | 記載なし | 7,652 | 32,275 | 2% |
| 合計 |  |  | 84,028 | 541,039 | 概算 $9.5 |

- implementer は定義のモデルが sonnet。複数のファイルにまたがる移行なので
  Opus 5 に上書きした
- reviewer も定義は sonnet。SocketIO の版上げが挙動を変えていないかを
  見る担当なので Opus 5 に上書きした
- wording は定義が haiku。Sonnet 5 に上書きした。定義に `effort` の行が
  無いので「記載なし」（もともと haiku は effort に対応しない）
- verifier は定義（sonnet / medium）のまま

## きっかけ

他のプロジェクト（ytsched）と同じく uv に揃えたい、という利用者の要望。

調べたところ、単に `pyproject.toml` を足すだけでは済まない状態だった。

- `requirements.txt` のピンが矛盾していて uv では解決できない。
  `Flask-SocketIO==4.3.2` は `python-socketio>=4.3,<5` を要求するのに
  `python-socketio==3.1.2` が指定されていた
- Flask-SocketIO 4.3.2 は Flask 3 で `_request_ctx_stack` の ImportError に
  なる。Python 3.14 で動かすなら 5.x へ上げるしかない

そこで、uv 化と依存の更新を一度にやることにした。

## やったこと

### uv 化とレイアウトの変更

- `pyproject.toml` を作った。hatchling、`requires-python >=3.14`、
  `[project.scripts] ytbg`、dev グループに ruff と mypy。
  version は静的に `0.80`（git タグが無いので hatch-vcs は使わない。
  ytsched とはここだけ違う）
- `src/ytbg/` へ移した。`ytbg.py` → `__main__.py`、
  `ytBackgammonServer.py` / `ytBackgammon.py` / `MyLogger.py` はそのままの
  ファイル名で配下へ。`templates/` と `static/` は
  `src/ytbg/webroot/` の下（ytsched と同じ）
- `Flask()` の `template_folder` / `static_folder` は `__file__` から
  組み立てた絶対パス。どこから起動しても解決する
- `setup.sh` と `requirements.txt` を削除した

### 依存の更新に伴う修正

- `handle_disconnect()` に `reason=None` を足した。python-socketio 5.x は
  切断理由をハンドラに渡す。python-socketio 側には引数の数が合わないときの
  フォールバックがあるが、Flask-SocketIO の `_handle_event()` が先に
  `TypeError` を捕まえて `on_error_default` へ回してしまうので届かない。
  足さないと切断のたびに `on_disconnect` が呼ばれず `_client_sid` が減らない
- `socketio.run()` に `allow_unsafe_werkzeug=True` を足した。5.x は標準入力が
  端末でないと `RuntimeError` で止まる。`&` 付きのバックグラウンド起動でも
  端末が外れていれば止まるため
- `socketio.run()` に `debug` を渡すのをやめた。渡すと Werkzeug の対話
  デバッガが `0.0.0.0` に出てしまう。`-d` はログレベルだけに効く
- `app.config['JSON_AS_ASCII']` を削除した。Flask 3 では無効で、
  `app.json.ensure_ascii` に置き換えても効かない。SocketIO の直列化は
  python-socketio 自身の `json.dumps` を通るので Flask の設定を見ない。
  `\u` エスケープのままでもブラウザの `JSON.parse` で元に戻るので、
  文字化けは起きない
- `emit(..., broadcast=True)` は 5.x でも正規の引数として残っており、
  非推奨の警告も出ないので変えていない
- クライアント側の socket.io を 1.3.5 → 4.8.1 に上げた
  （`index.html` の CDN の URL）。`ytbg.js` は無変更。`io.connect()` は
  4.x でも `io()` の別名として残っており、`ws.on()` / `ws.emit()` も
  API が変わっていない

### スクリプトと文書

- `ytbg.sh` は `uv run ytbg` を呼ぶだけにした。venv ディレクトリの引数は廃止
- `~/bin` にシンボリックリンクを張る運用をやめた。リンク越しに叩くと
  `dirname $0` がリンク側のディレクトリを返し、`uv run` が
  `pyproject.toml` を見つけられずに落ちる。**リポジトリの中で
  `./ytbg.sh` を叩く**形に統一し、README と CLAUDE.md にもそう書いた
- `ytbg-boot.sh` を新しい `ytbg.sh` に合わせた。`ytbg-stop.sh` の
  `ps` のパターンは `python.*/bin/[y]tbg` に変えた（`[y]` で grep 自身を
  拾わないので `grep -v grep` を落とせた）
- `uv build` の配布物から、デザインの元データ（`.xcf` 12 件、`.pptx`）と
  `docs/`（デモ動画が数十 MB）、`archives/` を除外した
- `README.md` と `CLAUDE.md` の手順を uv 版に書き換えた

## 確かめたこと

- `uv sync`、`uv run ytbg --help`、`./ytbg.sh -d -p 5011 -i images1a 99`、
  `./ytbg-boot.sh` で 4 面同時起動、`./ytbg-stop.sh` で全部停止
- python-socketio のクライアントを 2 つ繋いで、`put_checker` の broadcast、
  接続直後の `gameinfo` の配信、`back` での履歴の戻し、切断時に
  `on_disconnect` が呼ばれ `on_error` に落ちないこと
- 日本語を含む `set_playername`（全角スペース込み）が 1 文字違わず
  相手に届くこと
- `-d` 付きでもデバッガ PIN と reloader が出ないこと。python のプロセスが
  1 面あたり 1 つ（4 面で 8 → 4 に減った）
- `uv build` の wheel に `.xcf` / `.pptx` が入らず、`webroot` の
  png / js / css / mp3 は入っていること。sdist に `docs/` と `archives/` が
  入らないこと
- 状態ファイル `~/ytbg-{server_id}.json` の場所と内容が変わらず、
  再起動で履歴が読み込まれること
- `README.md` に書いたとおりに操作して動くこと（verifier が再現した）
- **ブラウザでの実操作**（利用者が確認した）

## 残ること

- ruff 38 件、mypy 33 件の指摘が残っている（TODO-002）
- 切断のたびにログへ `ConnectionError` と 500 が出る（TODO-003）

## 分担の振り返り

依頼と報告は [archives/agents/TODO-001/](../agents/TODO-001/README.md) にある。

- **implementer** は移行そのものを一度で通し、依存の版上げで実際に壊れる
  2 点（`handle_disconnect` の引数、`allow_unsafe_werkzeug`）を自分で
  見つけて直した。文書は定義で触らないことになっているので、直すべき箇所を
  列挙して管理者に返した。この受け渡しはうまく働いた
- **verifier** は python-socketio のクライアントを 2 つ立てて broadcast と
  履歴と切断を確かめ、実装の報告に無かった「切断時の 500」を見つけた
  （TODO-003 になった）。2 巡目では README のとおりに操作する再現もやり、
  プロセス数が 8 → 4 に減ったことまで数えた
- **reviewer** が一番効いた。`app.json.ensure_ascii` が**実際には効いて
  いない**ことを実サーバで測って示し、`~/bin` のシンボリックリンク越しに
  `ytbg.sh` が落ちることを実際にリンクを張って再現し、`-d` と
  `allow_unsafe_werkzeug` の組み合わせで対話デバッガが `0.0.0.0` に出る
  ようになったことを指摘した。どれもテストが通ることを見ているだけでは
  出てこない
- **見込みとの食い違い**: 見込みには入れていなかった wording を、利用者の
  指示で TODO.md に通した（2%）。それ以外の編成は見込みどおり
- **次に同じ規模の項目をやるなら**: implementer に文書まで含めた依頼を
  書かない。定義で触らないと決まっているので、最初から管理者の担当として
  分けておけば、依頼と報告を 1 往復減らせた。
  reviewer には最初から Opus 5 を充てる（今回そうした。28% を使ったが、
  見つけたものの質から見て安い）。verifier の 2 巡目は 1 巡目の文脈が
  残っているので、新しく起動せず `SendMessage` で続けるのが安い（今回そうした）
