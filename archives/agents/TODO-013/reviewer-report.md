# TODO-013 レビュー報告（reviewer）

対象: `tests/conftest.py` の差分と、新規の `tests/test_on_json.py`。
`src/` は変更されておらず、範囲外の変更も無い。テストの本数（55 passed）や
17 分岐の網羅は依頼どおり。以下は「守るべきものを守れているか」の観点。

**確かめ方**: リポジトリを scratchpad へ複製し、`src/` に故意の変更
（ミューテーション）を入れて `pytest -q` が落ちるかを実測した。
「55 passed」と書いてあるものは、その変更を入れてもテストが全部通った
＝ 移行でそこが壊れても気づけない、という意味。

---

## 直すべき

### 1. 「受け取った msg がそのまま broadcast される」が実質いつも真（要修正）

`tests/test_on_json.py:47`（`test_put_checker_broadcasts_msg`）、
同 `:177`（`test_fallthrough_types_broadcast_the_received_msg`）。

`on_json()` は末尾で `emit('json', msg, broadcast=True)` と**受け取った
オブジェクトをそのまま**渡すので、`emitted.last is msg` が成り立つ。
`assert emitted.last == msg` は同じオブジェクト同士の比較になり、
送信前に `msg` を書き換えても通る。

実測: `emit()` の直前に `del msg['history']` と `msg['src'] = 'server'` を
足しても **55 passed**。

期待値を `copy.deepcopy(msg)` で先に取っておくか、送るべき dict を
べた書きして比べる必要がある。

### 2. `broadcast=True` が一度も検証されていない（要修正）

`tests/conftest.py:45-52`、`tests/test_on_json.py` 全体。

`EmittedMessages` は `calls` に kwargs を積んでいるが、`messages` /
`types` / `last` はどれも kwargs を捨てるので、テストからは
`broadcast=True` が見えない。実際どのテストも `calls` を見ていない。

実測: `emit()` の呼び出しから `broadcast=True` を全部外しても **55 passed**。

依頼書（reviewer-task.md）が名指しした「broadcast の有無」がそのまま
抜けている。TODO-009 では「送信先が全員か送り主だけか」がまさに実装し直す
部分なので、ここは押さえておきたい。`EmittedMessages` に kwargs を返す
アクセサを足すのが素直。

### 3. `history_flag` の値が一度も検証されていない（要修正）

`tests/test_on_json.py:317`（`test_emit_gameinfo_message_shape`）は
`set(data.keys())` でキー名だけを見ており、値を見ていない。
`test_back_moves_hist_i_by_n`（同 `:336`）も `hist_i` / `hist_n` だけ。

`history_flag` はクライアントが「履歴の再生中か」を判断するために読む。

実測（どちらも 55 passed）:
- `backward_hist()` / `forward_hist()` の `emit_gameinfo(sec, history_flag=True)`
  を `False` に変える
- `new` の `emit_gameinfo(3, False)` を `emit_gameinfo(3, True)` に変える

### 4. `sec`（アニメーションの秒数）が `new` 以外で検証されていない（要修正）

`test_new_...` の `data['sec'] == 3` だけが `sec` を見ている。
履歴の再生で送られる `sec`（`SEC_CHECKER_MOVE = 0.2`、`n == 0` のときは
`0.1`）は誰も見ていない。

実測: `SEC_CHECKER_MOVE` を `0.2` → `0.9` に変えても **55 passed**。

なお期待値は `bg_server.SEC_CHECKER_MOVE` を参照せず `0.2` とべた書きする
こと（参照すると定数を変えたときテストも一緒に変わってしまう）。
**ただし「定数を変えたらテストが落ちる」形でよいかは利用者の判断**。

### 5. `hist_i` は差分でしか見ておらず、絶対値が固定されていない（要修正）

`tests/test_on_json.py:336`（`test_back_moves_hist_i_by_n`）は、基準値
`hist_i0` を**テスト対象と同じ `emit_gameinfo()`** から取っている。
そのため `hist_i` の定義そのもの（`len(self._history)`）がずれても、
差分だけは合ってしまう。

実測: `'hist_i': len(self._history)` を `len(self._history) - 1` に
変えても **55 passed**（`hist_n` を `len(self._history)` だけに変えた
場合はこのテストが落ちたので、`hist_n` 側は守れている）。

`add_history()` を 2 回呼んだ直後に `hist_i == 3`, `hist_n == 3` のように
べた書きで固定すれば足りる。

### 6. `fwd` / `fwd2` / `fwd_all` の「broadcast されない」は常に真（要修正）

`tests/test_on_json.py:198`
（`test_returning_types_do_not_broadcast_original_msg`）。

前準備が `add_history()` を 2 回呼ぶだけなので `_fwd_hist` は空
（`add_history()` は `_fwd_hist` を捨てる）。`forward_hist()` の
`while len(self._fwd_hist) > 0` に入らず、**emit が 1 通も起きない**まま
`msg_type not in emitted.types` が成立する。

実測（同じ前準備で emit 数を数えた）:
`back: 1 / back2: 2 / back_all: 2 / fwd: 0 / fwd2: 0 / fwd_all: 0`。

fwd 系は先に `backward_hist(-1, sleep_sec=0)` で戻しておくこと。
併せて、`emitted.types` に `'gameinfo'` が入っていること（＝何かは
送られたこと）も見ておくと、空振りで通らなくなる。

### 7. `tests/conftest.py:98` が 84 文字（要修正・小）

`monkeypatch.setattr(yt_backgammon_server.time, 'sleep', lambda *_a, **_kw: None)`

`pyproject.toml` の `[tool.ruff] line-length = 78` を超えている。E501 は
`select` されていないので `ruff check` では出ないが、`tests/` の他の行は
すべて 78 以下で、この 1 行だけが外れている（実測: 78 文字超はこの行のみ）。

---

## 直さなくてよいが記録しておく

### 8. 「隣は変わらない」の比較が、in-place 更新に対しては無力（検討）

`test_dice_updates_only_target_player`（`:80`）、
`test_set_player_clock_updates_only_target_player`（`:150`）、
`test_put_checker_updates_only_target`（`:28`）。

`before1 = ...['dice'][1]` は list への参照なので、実装が list を
**その場で書き換える**形に変わると `before1` も一緒に変わり、
`assert ...[1] == before1` が常に真になる。

実測: `dice()` / `set_player_clock()` を
`[0][:] = data[...]` `[1][:] = data[...]`（両プレーヤーを壊すバグ）に
変えても **55 passed**。

今の `yt_backgammon.py` はどれも**代入で置き換える**実装なので、現状は
テストとして機能している（`before1` は古いオブジェクトを指したまま）。
`copy.deepcopy(before1)` にするか、初期値をべた書きすれば固くなる。
`test_put_checker_updates_only_target` はプレーヤー 0 側を `[6, 0]` と
べた書きしていて、そちらの書き方のほうが良い。

### 9. 送信の「通数」を見ていない（検討）

どのテストも `emitted.last` しか見ていないので、同じメッセージが
2 通送られても気づけない。実測: 末尾の `emit()` を 2 回に増やしても
**55 passed**。通信層を入れ替えるときは「全員へ 1 通」が
「接続ごとに 1 通ずつループ」に変わるので、二重送信は起きやすい形。
少なくとも代表 1 つで `len(emitted.messages) == 1` を見ておくと良い。

### 10. `set_gameinfo` のテストが弱い（検討）

`tests/test_on_json.py:289`。`bg_server._bg._gameinfo.copy()`（浅いコピー）
を渡して `score` だけを見ているので、
- `board` 以下が本当に置き換わるか
- `set_gameinfo()` が `copy.deepcopy()` していること（＝受け取った dict と
  状態が縁を切れていること）

が見えない。実測: `set_gameinfo()` の `copy.deepcopy(gameinfo)` を
`gameinfo`（参照代入）に変えても **55 passed**。
現在の実装と現在のクライアントの使い方では実害は出ていない。

### 11. `on_connect()` の初期配信が未テスト（検討）

`on_connect()` は `request.event['args'][0]['REMOTE_ADDR']` を読むため
`SimpleNamespace` では通らず、implementer は `emit_gameinfo()` を直接
呼ぶ形に替えている（報告のとおり。判断は妥当）。
結果として「接続したクライアントに現在の `gameinfo` が届く」経路は
テストに載っていない。TODO-009 で最初に書き直すのはまさにここなので、
テストで押さえるなら `src/` 側に手が要る（`request` の読み方を変える）。
**この項目の範囲では直さなくてよいが、TODO-009 に持ち越すこと。**

### 12. `no_sleep` を使っていないテストが本当に 0.1 秒眠る（検討）

`test_back_moves_history_by_n`（`:210`）、`test_fwd_moves_history_by_n`
（`:224`）。`n=2` なので `backward_hist(2)` の既定 `sleep_sec=0.1` が
1 回効く。実測: `--durations` でこの 2 件だけが 0.10s。
`CLAUDE.md` の「`back` / `fwd` 系には `sleep_sec=0` を渡す」の趣旨からは
外れる。`no_sleep` を足すだけで済む（落ちはしないので優先度は低い）。

### 13. `no_sleep` は実質 `time.sleep` のグローバル差し替え（検討）

`tests/conftest.py:98`。`yt_backgammon_server.time` は stdlib の `time`
モジュールそのものなので、この差し替えはテストの間**プロセス全体**の
`time.sleep` を無効にする。`monkeypatch` なので戻るが、docstring の
「`yt_backgammon_server.time.sleep` を差し替える」は、モジュール内に
閉じているかのように読める。1 行コメントで断っておくと誤解が減る。

### 14. `fake_emit` を残さなかったこと（検討）

依頼書は「`fake_emit()` はこのインスタンスへ積む」だったが、実装は
`monkeypatch.setattr(yt_backgammon_server, 'emit', emitted.append)` と
`append` を直接差し替えている。動きは同じで行数も減るが、
- `append` が `emit(event, data=None, **kwargs)` という
  **Flask-SocketIO のシグネチャそのもの**になっており、記録用 API と
  送信スタブが 1 つのメソッドに同居している
- TODO-009 では結局このシグネチャを直すことになる

依頼書の意図（差し替え口を 1 か所に隔離する）としては `fake_emit` を
残したほうが素直。**とはいえ、直す箇所が conftest の 1〜2 行で済む点は
変わらないので、依頼書の要件 3「テスト側を書き換えずに済むか」は
満たしている。**

### 15. 未知の `type` の扱いが未テスト（検討）

どの分岐にも当たらない `type` は末尾まで落ちて `add_history` と
broadcast が起きる。これが意図した動きなのかは `on_json()` からは
読み取れない。移行時に「知らない type は捨てる」に変えても気づけない。
**仕様として決まっていないので、テストにするかどうかは利用者の判断。**

### 16. 参考: `CLAUDE.md` の記述が古い（範囲外）

`CLAUDE.md` の「状態と通信」に `set_clock_swith` / `resume_clcok` /
`start_clcok` の説明が残っているが、TODO-012（`49929bb`）で消えている。
本差分の範囲外なので、この項目で直す必要は無い。

---

## 好みの範囲

- `EmittedMessages.last` は空のとき `None` を返すので、`emitted.last['type']`
  が `TypeError: 'NoneType' object is not subscriptable` になる。
  1 通も送られていないときの失敗メッセージが分かりにくい。

---

## まとめ

- 分岐の網羅と `gameinfo` の変化の確認は、依頼書の要求を満たしている。
- 一方で、**依頼書が名指しした「送られるメッセージの形」のうち
  `broadcast` / `history_flag` / `sec` / `hist_i` は、値を変えても
  テストが通る**（実測）。移行後にここが崩れても気づけない。
- 「受け取った msg がそのまま broadcast される」は同一オブジェクト比較で、
  送信直前に書き換えても通る（実測）。
- 要修正は 1〜7 の 7 件。うち 1〜5 は `tests/test_on_json.py` への
  アサーション追加と `conftest.py` への kwargs アクセサ追加で済む。
