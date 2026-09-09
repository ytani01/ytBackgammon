# TODO-003 レビューの依頼（reviewer）

TODO-003（クライアント切断のたびに Werkzeug がログへエラーを出す件）の変更を
レビューする。**コードは直さない。** 見つけたことを報告するだけ。

作業ディレクトリは /home/ytani/work/ytBackgammon。対象は `git diff`（未コミット）。
Werkzeug の開発サーバから gevent の WSGI サーバへ移行する変更。

動作の検証は別の担当（verifier）が済ませている。報告は
`archives/agents/TODO-003/verifier-report.md`。lint は変更前と同数、
切断時のエラーは消え、履歴の連続再生中も他のリクエストが即座に返ることを
確認済み。**「動くか」ではなく「良いか」を見ること。**

## 観点

1. **`monkey.patch_all()` の位置と副作用。** 引数なしで全部置き換えている。
   このアプリ（Flask + Flask-SocketIO、`logging`、`~/ytbg-*.json` への
   ファイル I/O）で問題が起きないか。import の順番に壊れやすさは無いか
2. **`async_mode='gevent'` を明示したこと。** 自動検出に任せる場合との差、
   検出順（eventlet → gevent_uwsgi → gevent → threading）を踏まえた妥当性
3. **`socketio.run(..., log_output=debug)`。** flask_socketio の `run()` は
   `debug = kwargs.pop('debug', app.debug)`、
   `use_reloader = kwargs.pop('use_reloader', debug)` という実装
   （`.venv/lib/python3.14/site-packages/flask_socketio/__init__.py`）。
   「アクセスログだけを `-d` で切り替え、リローダは無効のまま」という意図どおりか
4. **websocket の実装。** gevent 使用時、engineio は gevent-websocket が
   無ければ simple-websocket にフォールバックする
   （`.venv/lib/python3.14/site-packages/engineio/async_drivers/gevent.py`）。
   この構成で問題がないか、gevent-websocket を明示的に入れるべきか
5. `pyproject.toml` の mypy overrides に `gevent,gevent.*` を足したこと
6. `CLAUDE.md` と `TODO.md` の記述が実装と合っているか
7. **挙動が変わることによる見落とし。** 同時接続、履歴の連続再生
   （`back_hist()` / `forward_hist()` の `_repeat_flag` と `time.sleep()`）、
   状態ファイルの保存が greenlet 上でどうなるか。threading から greenlet に
   変わることで、競合の起き方が変わっていないか

## 注意

- サーバを起動して試す必要は無い。ポート 5001〜5004 で利用者のサーバが
  動いているので触らないこと

## 報告

`archives/agents/TODO-003/reviewer-report.md` に書く。返事は 5 行以内で、
終わったか・報告ファイルのパス・判断が要る点だけ。ファイルの全文を返事に貼らない。
