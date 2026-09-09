# TODO-003 検証報告（verifier）

## 1. lint

- `uv run ruff check .` → 19 errors、終了コード 0（`check_exit=$?` は
  シェルの都合で拾えなかったが、出力最終行「Found 19 errors」で確認）。
  変更前と同じ件数
- `uv run mypy src` → 9 errors。同じく変更前と同じ件数
- **増えていないことを確認した。**

## 2. 起動と切断のログ

ポート 5099、server_id `test003` で `nohup uv run ytbg -d -p 5099 test003` を起動。
`uv run --with "python-socketio[client]" python` で以下のスクリプトを実行し、
2 秒待ってから disconnect、その後 5 秒以上待ってからログを確認した。

- `transports=['polling']` のみ: ログには `on_connect` → `on_disconnect` →
  polling の GET/POST が並ぶだけ。400/500 やトレースバックは**出なかった**
- `transports=['polling','websocket']`: `on_connect` → 2 秒後に `on_disconnect`
  → `GET /socket.io/?transport=websocket...` が 200 で応答（`2.047749` 秒かけて
  返している＝websocket の long-poll が切断で正常終了したことを示す）。
  400/500 やトレースバックは**出なかった**

移行前に出ていたという「切断の数秒後の `code 400, message Bad HTTP/0.9
request type`」は再現しなかった。

## 3. monkey patch が効いているか

`put_checker`（`history: true`）を 5 回 emit して履歴を 6 件（初期状態＋5手）に
した後、`back_all` を送信。ほぼ同時に `curl -m 3 http://127.0.0.1:5099/` を
別プロセスで実行した。

サーバのログでは `backward_hist` が `time.sleep(0.1)` を挟みながら
00:29:55〜00:29:57 の約 2 秒間ループしている最中に、`GET /` へのアクセスが
00:29:57 に到着し、**0.010539 秒**で 200 を返している
（`127.0.0.1 - - [2026-09-10 00:29:57] "GET / HTTP/1.1" 200 10796 0.010539`）。
`curl` コマンド自体の実測も `real 0.018s` 程度だった。

再生中でもサーバ全体が止まっていないことを確認した。`monkey.patch_all()` が
import 順どおりに効いている。

## 4. `-d` の効き方

- `-d` あり（`uv run ytbg -d -p 5099 test003`）: ログに
  `127.0.0.1 - - [...] "GET /socket.io/... HTTP/1.1" 200 ...` の形の
  アクセスログが**出た**
- `-d` なし（`uv run ytbg -p 5099 test003`）: 同じ操作（`curl /`）をしても
  アクセスログの行は**出なかった**（`app_index` の DEBUG ログだけが出た）

`socketio.run(..., log_output=debug)` が意図どおりに効いていることを確認した。

### 気づいたこと（判断は不要、参考情報）

`src/ytbg/__main__.py:108` の
`svr = ytBackgammonServer(MY_NAME, VERSION, svr_id, image_dir, debug=True)` は
`-d` の値に関わらず常に `debug=True` を渡しており、`ytBackgammonServer` 側の
DEBUG ログ（`__init__`, `load_data`, `app_index` など）は `-d` なしでも
出続けている。**この行は今回の diff の対象外**（TODO-003 の変更前から
同じ書き方）で、アクセスログ（`log_output`）とは別の話。TODO-003 の
確認項目である「アクセスログの有無」自体には影響していないため、
今回の検証の合否には関係ないと判断したが、念のため報告する。

## 変更されたファイルと指示の範囲

`git status` / `git diff` で確認した変更ファイル:

- `src/ytbg/__main__.py` — 依頼どおり（`monkey.patch_all()`,
  `async_mode='gevent'`, `log_output=debug`, `allow_unsafe_werkzeug` 削除）
- `pyproject.toml` — 依頼どおり（`gevent` 追加、mypy overrides に
  `gevent,gevent.*` 追加）
- `uv.lock` — `gevent` 追加に伴う自動更新（`cffi`, `greenlet`, `pycparser`,
  `zope-event`, `zope-interface` が新規に入っている）。依頼の範囲内
- `CLAUDE.md` — TODO-003 の内容を反映した記述の更新。依頼文には明記が
  無いが、変更内容の説明として自然な範囲
- `TODO.md` — TODO-003 の項目の更新（チェックボックス、切り分けの結果、
  対処の記録、分担の見込みの行）。依頼の範囲内

指示に無いファイルの変更は見当たらなかった。

## 後始末

- ポート 5099 の `test003` サーバ（`-d` あり／なし、両方）を停止し、
  `ps -ef` で消えたことを確認した
- `\rm -f ~/ytbg-test003.json` を実行し、存在しないことを確認した
- ポート 5001〜5004 の既存サーバは触っていない（`ps -ef` で PID・起動時刻が
  検証前後で変わっていないことを確認した）

## 確かめられなかったこと・判断できないこと

- 「移行前は websocket のときだけ、切断の数秒後に 400 が出ていた」という
  記述そのものを、変更前のコードに戻して再現する形での比較はしていない
  （`git stash` で戻すと gevent 依存が入った状態と依存関係の整合が崩れる
  懸念があり、今回は変更後の状態でエラーが出ないことの確認にとどめた）。
  もし「移行前に確実に出ていたこと」自体の裏取りが必要なら、別途指示してほしい
- ブラウザでタブを閉じたときの挙動は未確認（socketio クライアントでの
  disconnect のみ試した）
- `__main__.py:108` の `debug=True` 固定については、直すかどうかの判断は
  行っていない（報告のみ）
