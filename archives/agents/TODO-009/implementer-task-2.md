# TODO-009 implementer への依頼（2 回目）

reviewer の指摘（`archives/agents/TODO-009/reviewer-report.md`）と
verifier の指摘（`archives/agents/TODO-009/verifier-report.md`）を受けた直し。
利用者の判断は出ている。**全部この項目でやる。**

まず上の 2 つの報告を読むこと。指摘の番号（R1、C1〜C8）はそれに従う。

## 1. R1: 連続再生の cancel の競合（要修正）

`_cancel_replay()` が `await task` で待つ間に別の `_start_replay()` が
入ると、`_replay_task` から辿れない再生 Task が残る。reviewer の実測では
逆方向の 2 本が 10 秒以上打ち消し合い、`gameinfo` を 203 通送った。

**直し方は任せる**が、次を満たすこと。

- 走っている再生は、**必ず 1 本だけ**にする
- 新しい再生要求が来たら、前の再生が確実に止まってから始まる
- `_replay_task` から辿れない Task が残らない
- reviewer が使った壊し方（走行中の `back_all` に `back_all` と `fwd_all`
  を `asyncio.gather()` で同時にぶつける）で再現しないこと。
  **同じ形で自分でも実測して確かめる**

reviewer は「`_replay_task = None` を cancel のあとにするだけでは足りない
（`await` を挟む限り同じ窓が空く）」と書いている。

## 2. C1: `back` / `fwd`（n > 0）が同時に来ると 1 手分失われる

履歴 11 件で `back`（n=1）を 2 通同時に処理させると、移行前は 2 手
戻ったが、今は 1 手しか戻らず broadcast も 1 通だけになる。

**移行前と同じ結果に戻す。** reviewer は「n > 0 は Task にせず `await`
して返す形なら、呼び出し側から見た順序も移行前と同じに戻る」と書いている。
そのとおりにするかは任せるが、**移行前と同じ結果**になること。

## 3. C2: 再生 Task の例外が `on_error()` に届かない

移行前は `backward_hist()` の例外が `on_error_default` → `on_error()` へ
届いていた。今は Task の中なので届かず、GC のときに asyncio の既定
ハンドラが stderr へ traceback を出すだけになる（loguru の書式でもない）。

**再生 Task の中で起きた例外も `on_error()` へ届くようにする。**
再生 Task は特定のクライアントに紐づかないので、`on_error()` の引数を
どうするかは任せる（`ws` を省けるようにする、など）。
`asyncio.CancelledError` は例外として扱わないこと（正常な停止なので）。

## 4. C3: `broadcast()` が 1 クライアントずつ `await` する

詰まったクライアントが 1 つあると、他全員への送信も再生も止まる。

- `asyncio.gather(..., return_exceptions=True)` で**並行に送る**。
  失敗したものは今までどおり warning に出す（どのクライアントで
  何が起きたかが分かること）
- **同じクライアントへ送るメッセージの順序が入れ替わらないこと**を
  確かめる（`broadcast()` 自体は `await` されるので、次の broadcast は
  前が終わってから始まるはず。念のため確かめて報告に書く）
- **これでも「いちばん遅いクライアントを待つ」点は残る**（クライアント
  ごとの送信キューにするまでは消えない）。**そのことを報告に書くこと。**
  キュー化はこの項目ではやらない

## 5. C4: `on_connect()` が `try` の外にある

`__main__.py:54` の `await svr.on_connect(websocket)` は `try` の前に
あるので、ここで `CancelledError` が飛ぶと `on_disconnect()` が呼ばれず
`_clients` に残る。**`try` の中へ入れる。**

## 6. C7: `WEBROOT` の定義が 2 つのモジュールに分かれた

`__main__.py:31` と `yt_backgammon_server.py:23-24` に同じものがある。
**1 箇所に寄せる。** 置き場所は任せる（`monkey.patch_all()` が無くなった
ので `__init__.py` に定数を置く制約も消えている）。

## 7. C5: `wait_replay()` がテスト専用の公開メソッドになっている

`src/` からは呼ばれず、テストからだけ呼ばれている。
**公開メソッドを増やさない形を優先する**（テストが `_replay_task` を
直接待つなど。テストが `_history` を直に触っている前例はある）。
1 の直しで作りが変わるはずなので、そのときに決めてよい。
**どちらにしたかを報告に書く。**

## 8. 好みの範囲（reviewer の指摘。まとめて直す）

- `yt_backgammon_server.py:123` — `self._clients.get(ws)` を
  `client_name()` に揃える（未登録のとき `None` ではなく `'?'`）
- `yt_backgammon_server.py:126` — warning の書式の末尾の `.` を
  周りに揃える
- `ytbg.js:4237-4238` — `board.roll_btn[...].set(` の継続行の位置を直す

## 9. C8: テストを足す

verifier が「`broadcast()` を壊しても pytest が 1 件も落ちない」ことを
実測した。reviewer の挙げた 3 つを足す。

1. **`broadcast()` 単体** — `send_json` を持つスタブを 3 つ `_clients` に
   入れ、真ん中が例外を投げても**残り 2 つに届く**こと。
   失敗した 1 つが `_clients` に残ること（外すのは受信ループの担当、
   という判断をテストで固定する）
2. **`on_connect()` / `on_disconnect()`** — `_clients` に入る・抜けること、
   接続時に**全員へ** `gameinfo` が飛ぶこと（送信元だけに変えたら
   落ちること）
3. **再生の cancel** — 走っている `back_all` に `fwd` をぶつけると
   前が止まって後が走ること。**1 と 2 の直しのリグレッションテストになる
   ように書く**（R1 の再現形（同時に 2 本ぶつける）と、C1 の再現形
   （`back` n=1 を 2 通同時）を含めること）

`CLAUDE.md` の「テストが通ることだけを見ない。`src/` をわざと壊して、
狙ったテストが落ちることを確かめる」に従い、**足したテストそれぞれに
ついて、対応する箇所を壊すと落ちることを確かめる**。壊したら必ず戻す。
何を壊して何件落ちたかを報告に書く。

## 触らないもの

- `src/ytbg/yt_backgammon.py`（盤面のロジック）
- `CLAUDE.md` / `README.md` / `TODO.md`（**main が書く**）
- メッセージの形、`type` の名前、保存の形式
- `on_json()` の分岐ごとの振る舞い（1〜3 で直す部分を除く）

## 完了条件

- `uv run pytest` が全件通る（足したぶんも含めて）
- `uv run ruff check .` / `uv run mypy src` が 0 件のまま
- **R1 と C1 が、reviewer の再現手順で再現しないことを実測する**
- C2 が直っていることを実測する（再生の中でわざと例外を起こし、
  `on_error()` のログが出て、stderr に
  `Task exception was never retrieved` が出ないこと）
- サーバを起動し、WebSocket クライアント 2 本で、移行後の基本の動き
  （接続時の gameinfo、`put_checker` の broadcast、連続再生、
  再生中の別メッセージ、不正な JSON で切れないこと）が
  **前と同じように動く**こと
- ログに traceback が出ない

## 進め方

- **commit しない**
- ポート 5001〜5004 では利用者のサーバが動いている。**触らない。**
  自分で試すときは 5099 などを使う
- 判断に迷ったら勝手に決めずに報告に書く

## 報告

`archives/agents/TODO-009/implementer-report-2.md` に書く。

- R1・C1〜C8 それぞれ、何をどう直したか（ファイルと行）
- 実測の結果（再現手順と、直った証拠）
- 足したテストの一覧と、壊して落ちることを確かめた結果
- 決めたこと（C5 をどうしたか、C7 の置き場所、C3 で残る制約）
- 判断が要る点

**返事は 5 行以内**。報告の全文を貼らないこと。
