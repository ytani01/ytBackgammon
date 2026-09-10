# TODO-009 reviewer への依頼（2 回目）

1 回目のレビュー（`reviewer-report.md`）の指摘を受けた直しと、
main が書いた文書を見てもらう。

**1 回目に「問題が無かった」と書いたところは繰り返さなくてよい。**

読むもの。

- `archives/agents/TODO-009/reviewer-report.md`（自分の 1 回目の指摘）
- `archives/agents/TODO-009/implementer-report-2.md`（直しの報告）
- `archives/agents/TODO-009/implementer-task-2.md`（直しの依頼）
- `archives/agents/TODO-009/verifier-report-2.md`（直しの確認）

**コードは直さないこと。**

## 利用者が決めたこと（前提。蒸し返さない）

- **R1・C1・C2 は直す**（移行前と同じ挙動に戻す）
- **C3 も直す**（`asyncio.gather()` で並行に送る）。ただし
  **「いちばん遅いクライアントを待つ」制約は残す**。クライアントごとの
  送信キューはこの項目ではやらない
- **C6 は文書を実態に合わせる**（受信ループは `__main__.py` に置いたまま）
- **C8 のテストは足す**
- **n > 0 の `back` / `fwd` が実行中に cancel できない点は、このままにする。**
  `ytbg.js` は n = 1 しか送らず、待たされるのは 1 手分だけなので、
  残る差として記録する

## 見てほしいところ

### 1. 直しが正しいか

とくに **R1 の直し（`asyncio.Lock`）** を丁寧に見てほしい。

- `_replay_lock` の使い方で、**本当に追跡外の Task が残らないか**。
  ロックの外に出る経路、ロックを取らずに `_replay_task` を触る経路が
  無いか
- **デッドロックの恐れが無いか**。ロックを持ったまま `await` する箇所
  （`_run_replay()` は握ったまま再生を走らせる）で、同じロックを
  取り直す経路が無いか
- `_cancel_replay()` / `_replay()` / `_start_replay()` / `_run_replay()` の
  4 つに分かれた構造が読みやすいか。責務が重なっていないか
- C2 の `_replay()` が `CancelledError` を再送出し、それ以外を
  `on_error(None, e)` へ渡す形が正しいか
- C3 の `gather(..., return_exceptions=True)` と
  `zip(clients, results, strict=True)` の対応が正しいか。
  **`broadcast()` の途中で `_clients` が変わっても壊れないか**
- C4（`on_connect()` を `try` の中へ）、C5（`wait_replay()` を消した）、
  C7（`WEBROOT` を `__init__.py` へ）が妥当か

### 2. 足したテストの質

`tests/test_broadcast.py`（6 件）と `tests/test_replay.py`（5 件）。

- **テストが本当にその性質を確かめているか**（通るだけの形になって
  いないか）。implementer 自身が「最初に書いた `test_only_one_replay_runs`
  は、`_history` と `_fwd_hist` の両方に中身が無いと壊しても落ちなかった」と
  報告している。**同じ穴が他のテストにも無いか**
- `bg_server_raw` / `FakeClient` の作りが妥当か
- テスト名と中身が合っているか

### 3. M6 の食い違い（実測の食い違い）

M6（C1 の直し前に戻す壊し方）で、implementer の報告は **4 件失敗**、
verifier の再現は **6 件失敗**だった。verifier は「壊し方は依頼どおり
最小限（2 行）」と書いている。

**どちらが正しいか、原因が分かるなら書いてほしい**（分からなければ
「分からない」でよい）。テストの守備範囲としては問題ないと両者とも
見ているので、**これ自体は要修正ではない**。

### 4. 文書（main が書いた）

`git diff CLAUDE.md README.md TODO.md` を見る。

- **書いてあることが実態と合っているか。** とくに
  - サーバの節（uvicorn、`/ws`、ping、再接続、`-d` の効き方）
  - テストを足すときの注意（`asyncio_mode`、`no_sleep`、
    `bg_server` と `bg_server_raw` の使い分け、`_replay_task` の待ち方）
  - 構成の `__init__.py` と `__main__.py`（受信ループの例外の分け方）
  - 履歴の節（Task、`_replay_lock`、n > 0 をロックのまま走らせる理由）
  - `TODO.md` の TODO-004（asyncio 前提に書き直した）
- **移行前の説明が残っていないか**（`git grep` で
  `flask` / `gevent` / `socketio` / `_repeat_flag` / `time.sleep` を
  探すとよい。`archives/` は対象外）
- 造語や、このリポジトリで使っていない言い回しが入っていないか
- 日本語として読めるか（英語からの直訳になっていないか）

### 5. 決着に向けて

この項目はこのあと `archives/todo/` へ移して決着させる。

- **記録に残すべきこと**で、報告に書かれていないものがあれば挙げてほしい
  （残った制約、次に触るときに引っかかること、など）
- **新しく項目を立てたほうがよいもの**があれば挙げてほしい
  （立てるかどうかは利用者が決める）

## 報告

`archives/agents/TODO-009/reviewer-report-2.md` に書く。

- **要修正**と**気になる点**を分ける
- 根拠はコードの行か、実際に確かめた結果。**推定は推定と明示する**
- 要修正が 0 件ならそう書く

## 注意

ポート 5001〜5004 は利用者のサーバが動いている。**触らないこと。**
試すなら 5099 などを使う。

**返事は「終わったか・報告ファイルのパス・要修正の件数」の 5 行以内**。
