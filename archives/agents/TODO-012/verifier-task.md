# TODO-012 検証の依頼（verifier）

TODO-012（`on_json()` のクロック系 5 分岐を消す件）の変更を検証する。
**コードは直さない。** 見つけたことは報告するだけ。

作業ディレクトリは /home/ytani/work/ytBackgammon。

## 変更の内容

`git diff` を見ること。要点:

- `src/ytbg/yt_backgammon_server.py` の `on_json()` から、中身が `pass` の
  5 分岐を削除した: `set_clock_swith` / `resume_clcok` / `start_clcok` /
  `stop_clcok` / `reset_clcok`
- これらはサーバ側の綴りが誤っており、クライアント（`ytbg.js`）が実際に送るのは
  `set_clock_switch` / `resume_clock` / `start_clock` / `stop_clock` /
  `reset_clock`。つまり削除前も一致しておらず、末尾の `add_history` と
  broadcast へ落ちていた
- 実体のある `set_clock_limit` と `set_player_clock` は**残している**
- `CLAUDE.md` の「状態と通信」の節の該当記述を書き直した

## 確認すること

1. **lint とテスト。** `uv run ruff check .`、`uv run mypy src`、`uv run pytest`。
   変更前と比べて指摘・失敗が増えていないこと（変更前は ruff 0、mypy 7 errors
   （すべて `__main__.py`、TODO-002 で残した既存の指摘）、pytest 16 passed）

2. **削除したのが到達不能な分岐だけであること。** `src/ytbg/webroot/static/ytbg.js`
   の `emit_msg(` の呼び出しを全部拾い、送られる `type` の一覧を作る。その中に
   削除した 5 つの綴り（`clcok` / `clock_swith`）が**無い**こと。逆に、
   `on_json()` に残っている分岐が JS 側の綴りと食い違っていないかも見る

3. **クロック系メッセージが今までどおり全クライアントへ届くこと。**
   ポート 5099、server_id `test012` を使う
   - `nohup uv run ytbg -p 5099 test012 > <ログファイル> 2>&1 &` で起動
   - `uv run --with "python-socketio[client]" python` で socketio クライアントを
     **2 つ**繋ぎ、片方から `json` イベントで
     `{'src': ..., 'type': 'start_clock', 'data': {'player': 0}, 'history': False}`
     を送る。**もう片方がそのメッセージをそのまま受け取ること**
   - `stop_clock` / `reset_clock` / `resume_clock` / `set_clock_switch` でも
     同じことを確かめる
   - `history: true` を付けたときに履歴へ 1 手として積まれること
     （`~/ytbg-test012.json` の中身か、`back` を送って戻れることで見る）
   - ログにトレースバックが出ていないこと

4. **`set_clock_limit` / `set_player_clock` が壊れていないこと。**
   それぞれを送って `gameinfo` の `clock_limit` / `board.clock` が
   変わること（`on_json()` と `yt_backgammon.py` を読んでデータの形を決める）

**ブラウザでの目視確認は依頼に含めない**（playwright は使えない）。
そこは利用者に任せる。何が確かめられていないかを報告に書くこと。

## 後始末（必須）

- 起動したサーバを止める。**`pkill` は使わない**（パターンが自分のシェルに
  一致して巻き込む）。`ps -ef | grep "[b]in/ytbg -p 5099"` で PID を
  確かめてから kill する
- `\rm -f ~/ytbg-test012.json`（`rm` は `-i` にエイリアスされているので
  バックスラッシュを付ける）
- **利用者がポート 5001〜5004 でサーバを動かしている。絶対に触らない**

## 報告

`archives/agents/TODO-012/verifier-report.md` に書く（確かめた手順、結果、
残る懸念）。返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
ファイルの全文を返事に貼らない。
