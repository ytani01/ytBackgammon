# TODO-051 reviewer の報告

対象: 未コミットの差分一式（`actions.js` と `tests/browser/last_op.test.mjs` を含む）。
変更前は `git show HEAD:<path>` と `git diff` で見比べた。テストの一式は走らせていない。
実際に動かしたのは、`Storage.load()` に壊れた `.jsonl` を読ませる小さなスクリプトだけ（下の 1）。

**まとめ:** 要修正 2 件、検討 5 件、好みの範囲 1 件。

ゲームの進み方（オープニング、振る、動かす、パス、手番を渡す、ダブル・リダブル・
テイク、投了、free move、名前・得点・クロック・設定・メニュー）は、読んだ限り
変更前と同じ。サーバが捨てる条件に、今のクライアントの正しい操作は引っかからない。
「押してよいか」の判定（`can_pick_checker()` / `can_hold_cube()` / `roll()` の
キューブの確認 / `click_dice()`）は、変更前の条件をそのまま移しており、
緩くも厳しくもなっていない。音とダイスの回転は TODO.md の箇条書きどおり。
接続時と履歴の再生では `last_op` が `None` なので鳴らない（`server.py:284`、
`_replay_hist`）。先行実行の予測は、変更前に `roll_btn` でやっていた
`disable()` と `check_disable()` と同じ入力で同じ結果になる。

---

## 要修正

### 1. `src/ytbg/storage.py:31-38` — `LOAD_ERRORS` の直上のコメントがコードと逆のことを言っている。`TypeError` を拾うテストも無い

- **問題:** コメントには「TypeError / AttributeError / ValueError まで握ると、
  gameinfo.py 側の書き間違いを『壊れたファイル』として黙って握りつぶして
  しまう (TODO-024)」とあるが、そのすぐ下で `TypeError` を拾っている。
  拾うようにした理由（`strict` をなくしたので `"board": null` が
  `KeyError` ではなく `TypeError` になる）がどこにも書かれていない
- **起きる状況:** 次に読んだ人が、コメントに合わせて `TypeError` を外すと、
  壊れたファイルで起動しなくなる。反対に、コメントが警告している
  「書き間違いを握りつぶす」ことも実際に起きる。`from_dict()` や
  `Clock.from_dict()` に `TypeError` になる書き間違いが入ると、読み込みに
  失敗して初期配置で始まり、`__init__()` の `add_history()` →
  `save_data()`（`server.py:84-107`、`110-113`）が**利用者の `.jsonl` を
  上書きする**。これはコードを読んで確かめた（書き間違いを入れて実際に
  上書きさせてはいない）
- **実測:** 今の差分で、壊れた 1 行を `Storage.load()` に読ませた結果

  | 壊し方 | 結果 |
  |--------|------|
  | `"board": null` | `TypeError` を拾い、空で始まる |
  | `"cube": null` | 同上 |
  | `"h"` が list | 同上 |
  | `"score": 5` | 同上（変更前も `list(5)` の `TypeError` で、起動に失敗していた） |
  | `"dice": null` | **読めてしまう**（変更前も同じ。後退ではない） |

- **直し方の案:** 少なくともコメントを、拾う理由（TODO-051）と引き換えに
  失うもの（書き間違いも握りつぶす）が分かるように書き直す。
  `tests/test_save_load.py` の `test_jsonl_missing_key_is_broken_file` の
  隣に、`board` / `cube` が `null` のファイルを空で始めるテストを足す。
  書き間違いまで握りつぶしたくないなら、`TypeError` を拾う代わりに
  `from_dict()` の入口で「dict でなければ `KeyError`」とする手もある
  （どちらにするかは管理者が判断する）

### 2. テイク・リダブル・ダイスを押して手番を渡す操作の送信に、テストが無い

- **場所:** `src/ytbg/webroot/static/js/ui/cube.js:155-172`（`take()` と
  `double(board, 0|1, true)`）、`actions.js:150-153`（`click_dice()` から
  `end_turn()`）
- **問題:** `tests/browser/` を grep した限り、キューブを動かしてテイクや
  リダブルを送るテストも、ダイスを使い切って押したときに `end_turn` を
  送るテストも無い。`clicks.test.mjs` が見ているのは、中央からの `double`、
  パスのバナー、スペースキーまで。テイクは後始末として `send_msg()` で
  送っているだけ
- **なぜ問題か:** どれも呼び出しと引数を書き直した箇所で、渡す `player`
  を間違えるとサーバが捨てる（TODO-050）。捨てたときはサーバのログに
  警告が出るだけで、画面はエラーにならず、テストも落ちない。
  実装者が壊して確かめた 21 通り（#13 は中央からのダブルだけ）にも
  含まれていない
- **直し方の案:** `clicks.test.mjs` に 3 件足す。(a) 未テイクのキューブを
  自分の側へドラッグして `take {player}` だけを送る、(b) 反対側へ
  ドラッグして `double {player}` だけを送る（リダブル）、(c) ダイスが
  全部 11〜16 のときに押して `end_turn {player}` だけを送る。
  足したら、`player` を `1 - player` にして落ちることを確かめる

---

## 検討

### 3. 消した名前や挙動を書いたコメントが残っている

後始末の漏れ。どれも動作には影響しない。

- `src/ytbg/app.py:85` — 「メッセージは全て `{'src', 'type', 'data', 'history'}`
  の JSON」。`history` は無くなった
- `src/ytbg/history.py:53-54` — 「`set_clock_limit` のように … `history: true`
  で届いても」。メッセージの `history` はもう読まない（積まない理由は
  登録表の値になった）
- `src/ytbg/webroot/static/js/rules/judge.js:4-6`、`70-72` — 「状態の書き換え
  （`resign = -1`）は呼んだ側が行う」。TODO-051 で書き換えはどこからもしない
  ことにしたので、今は誤り。`by_resign` を使うのは `tests/js/judge.test.mjs`
  だけになった
- `src/ytbg/webroot/static/js/rules/position.js:198-199` — 「`ui/checker.js` の
  `apply_move()` が `moves` に 2 手ぶん積む」。今は `actions.js` の `move()`

直し方の案: 上の 4 か所を今の名前に直す。`by_resign` は、戻り値ごと消すか
残すかを決める（残すなら「使っているのはテストだけ」と書く）。

### 4. `disable_unusable()` を `actions.js` に置き、`board.js` がそれを import している

- **場所:** `actions.js:38-47`、`board.js:2-5`、`board.js:920-929`
- **問題:** 盤面とダイスから使えない目を求めるだけの関数で、送信とは
  関係ない。`rules/move.js` の `usable_dice()` のすぐ上に位置する処理だが、
  `actions.js` にあるので、`board.js` の `predict_gameinfo()` が送信の
  モジュールに依存する形になった（`actions.js` も `board.predict_gameinfo()`
  を呼ぶので、双方向に参照し合っている。import の循環ではない）
- **なぜ検討か:** CLAUDE.md は `actions.js` を「サーバへ送る操作」と説明し、
  ルール層は「値を返すだけ」としている。TODO-053 で `Board` を分けるときに、
  これが余計な依存として残る
- **直し方の案:** `rules/move.js` に、配列を書き換えずに新しい配列を返す
  形で移す。`tests/js/` で直接テストできるようにもなる

### 5. サーバを更新したとき、開いたままのタブは古い type を送り続ける

- **問題:** `ws.js` はつなぎ直すだけで、モジュールは読み直さない。
  更新前から開いていたタブは `set_turn` / `cube` / `start_clock` を送り、
  サーバはそれを登録表に無い type として無視する。`dice` や `set_score` は
  受け付けるので、手番を渡すと「ダイスは消えたが手番が変わらない」ように
  見える
- **なぜ検討か:** 手元の 4 ボードを動かしたまま入れ替えると、この状態になる。
  コードの不具合ではない（未確認。古いタブを実際に開いて試してはいない）
- **直し方の案:** コミットメッセージか、`ytbg-boot.sh` で再起動する手順に、
  「開いているタブを読み込み直す」と一言添える

### 6. `CLAUDE.md` の 2 か所が、実装より少し広く言い切っている

- `CLAUDE.md` の「`opening` / `end_turn`: 手番が変わる音。**`turn` が変わったかは
  見ない**」 — 鳴らすのは `Board.set_turn()` の `turn` が 0 / 1 のところだけなので、
  同じ目の `opening`（`turn` が 2 に戻る）では鳴らない（`board.js:476-490`）。
  変更前も鳴らなかったので、挙動は変わっていない。「（同じ目で `turn` が 2 に
  戻るときは鳴らない）」と足すと正確になる
- `CLAUDE.md` の「**0 / 1 / -1 から 2 へは戻せない**」 — `helper.mjs` の
  `set_turn()` は、-1 から 0 / 1 へも戻せず例外になる（`helper.mjs` の
  `else` の分岐）。「-1 からはどこへも戻せない」も書いておく

造語は見当たらなかった。ほかの書き直し（登録表の件数 24 = 送信済み 8 + 秒数 16、
クロック系 4 つ、`parse()`、先行実行の箇条書き）は、コードと合っている。

### 7. 取り消しの `cancel_double()` には、UI からたどり着けないように見える（前からそう。未確認）

- **場所:** `ui/cube.js:173-175`、`actions.js` の `can_hold_cube()`
- **問題:** 未テイクのキューブは `cube.player`（受けた側）に置かれ、
  `can_hold_cube()` は `cube.player != board.player` なら掴ませない。
  掴めた画面では `on_mouse_up_xy()` の `this.player == this.board.player` が
  必ず真になるので、`cancel_double()` の行に来ない。コードを読んだだけで、
  ブラウザでは確かめていない
- **なぜ検討か:** TODO-051 の後退ではない（変更前も同じ判定）。
  ただ今回 `cancel_double(board, 1 - this.player)` と引数を書き直した行なので、
  たどり着けないならテストも書けない。範囲外として TODO に残すかを決める

---

## 好みの範囲

### 8. `tests/browser/clicks.test.mjs` の投了のテストが、期待値を実装と同じ式で求めている

- **場所:** `clicks.test.mjs` の「投了ボタン → resign {player: 0, score} だけを送る」
- 期待値の `cube.accepted ? cube.value * 3 : cube.value / 2` が、`actions.js` の
  `resign()` と同じ式になっている。式を間違えても一緒に間違える。この時点の
  キューブは、直前のテストのダブルとテイクで値 2・テイク済みなので、
  `score: 6` と数を書けば足りる
