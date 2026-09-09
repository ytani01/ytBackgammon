# TODO-013 修正の依頼（implementer・2 回目）

レビューで、**値を変えてもテストが通ってしまう箇所**が実測で 7 件見つかった。
`archives/agents/TODO-013/reviewer-report.md` の「直すべき」1〜7 を直す。
**報告の実測結果まで読むこと**（何をどう壊したら通ってしまったかが書いてある）。

`src/` は変更しない。直すのは `tests/` だけ。

## 直すもの

### 1. `msg` がそのまま broadcast されることの確認（報告の 1）

`emitted.last == msg` は同一オブジェクトの比較になっている。
**送る前に `copy.deepcopy(msg)` で期待値を取っておき**、それと比べる。

### 2. `broadcast=True` を見えるようにする（報告の 2）

`EmittedMessages` に kwargs を返すアクセサを足す
（`messages` と同じ並びで kwargs を返すもの、`last_kwargs` など。
名前は既存の `last` / `types` と揃えて決めてよい）。
末尾へ落ちる型の代表 1 つと、`emit_gameinfo()` が送るもの 1 つで
`broadcast=True` が付いていることを確かめる。

TODO-009 では「送信先が全員か送り主だけか」がまさに書き直す部分なので、
ここを押さえておく。

### 3. `history_flag` の値を見る（報告の 3）

- `back` / `fwd` 系で送られるものは `history_flag == True`
- `new` で送られるものは `history_flag == False`

### 4. `sec` の値を見る（報告の 4）

**期待値はべた書きする**（`bg_server.SEC_CHECKER_MOVE` を参照しない）。
`SEC_CHECKER_MOVE` を変えたらテストが落ちる形でよい ―― 利用者と相談して
そう決めた。意図して変えたときだけテストも直す。

- `back` / `fwd`（`n > 0`）で送られるものは `sec == 0.2`
- `back_all` / `fwd_all` / `back2` / `fwd2`（`n == 0`）は `sec == 0.1`
- `new` は `sec == 3`（既にある）

### 5. `hist_i` / `hist_n` を絶対値で固定する（報告の 5）

いまは基準値をテスト対象と同じ `emit_gameinfo()` から取っているので、
定義がずれても差分だけは合ってしまう。**`add_history()` を決まった回数
呼んだ状態で `hist_i == 3`, `hist_n == 3` のようにべた書き**で固定する。
`back` を 1 回したあとの値もべた書きで見る。

`bg_server` フィクスチャが初期化時に履歴を 1 件積んでいることに注意。

### 6. `fwd` / `fwd2` / `fwd_all` の「broadcast されない」が空振りしている（報告の 6）

前準備で `_fwd_hist` が空のまま `forward_hist()` を呼んでいるので、
emit が 1 通も起きないまま条件が成立していた。
**先に `backward_hist(-1, sleep_sec=0)` で戻してから**投げること。
併せて `emitted.types` に `'gameinfo'` が入っていること（＝何かは
送られたこと）も確かめ、空振りでは通らないようにする。

### 7. 78 文字を超える行（報告の 7）

`tests/conftest.py` の `no_sleep` の 1 行。`pyproject.toml` の
`line-length = 78` に収める。

## 併せて直すもの（報告の「記録しておく」から拾う）

### 8 →「隣は変わらない」の比較（報告の 8）

`before1 = ...['dice'][1]` は list への参照なので、実装が in-place 更新に
変わると一緒に変わってしまう。**`copy.deepcopy()` で取るか、初期値を
べた書きする。** `test_put_checker_updates_only_target` のプレーヤー 0 側は
`[6, 0]` とべた書きしていて、そちらの書き方が良い。

### 9 → 送信の通数（報告の 9）

代表 1 つで `len(emitted.messages) == 1` を見る。通信層を入れ替えると
「全員へ 1 通」が「接続ごとに 1 通ずつループ」に変わるので、
二重送信が起きやすい。

### 10 → `set_gameinfo` のテスト（報告の 10）

`board` 以下まで置き換わることと、`set_gameinfo()` が渡された dict と
縁を切っている（`copy.deepcopy` している）ことを確かめる。
**渡した dict を after で書き換えても `gameinfo` が変わらないこと**を見れば足りる。

### 12 → `no_sleep` を使っていないテスト（報告の 12）

`test_back_moves_history_by_n` / `test_fwd_moves_history_by_n` が
実際に 0.1 秒眠っている。`no_sleep` を足す。

### 13 → `no_sleep` の docstring（報告の 13）

`yt_backgammon_server.time` は stdlib の `time` そのもので、この差し替えは
テストの間プロセス全体に効く。**その旨を 1 行のコメントか docstring に断る。**

### 14 → `fake_emit` を残す（報告の 14）

`monkeypatch.setattr(yt_backgammon_server, 'emit', emitted.append)` は、
記録用の API と送信スタブが 1 つのメソッドに同居している。
**`fake_emit()` を挟む形に戻す**（差し替え口を 1 か所に隔離する）。

### 好みの範囲 → `last` が `None` のとき

1 通も送られていないときに `emitted.last['type']` が
`TypeError: 'NoneType' object is not subscriptable` になる。
分かりやすい失敗の仕方になるよう直してよい（任意）。

## 直さないもの（利用者と相談して決めた）

- **報告の 11（`on_connect()` の初期配信）** — 押さえるには `src/` に手が要る。
  **TODO-009 へ持ち越す。**
- **報告の 15（未知の `type` の扱い）** — 仕様として決まっていない。
  いま現状をテストで固定すると、TODO-009 で決める余地を先に潰すことになる。
  **書かない。**
- **報告の 16（`CLAUDE.md` の記述）** — TODO-012 で既に直っている

## 終わったら

- **直した 1 件ごとに、報告に書かれたミューテーションを自分でも入れ直し、
  今度はテストが落ちることを確かめる。** 壊す → `pytest` → **`git checkout src/`
  で必ず戻す**、を 1 つずつ。`src/` が変更された状態で終わらせない
- `uv run pytest -q`、`uv run ruff check .`、`uv run mypy src`
- `archives/agents/TODO-013/implementer-report2.md` に、直した箇所と、
  ミューテーションでテストが落ちることを確かめた結果を書く

返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
