# TODO-032 レビュー報告（reviewer）

対象: `git diff`（HEAD = d172eec、未コミット）。
根拠は「実測」「コード」「CLAUDE.md」のどれかを各項目に書いた。
実測は、いまの作業ツリーの `src/` と HEAD 版 `src/` を別ディレクトリに
固定し、同じスクリプトを両方で走らせて比べたもの。

---

## 要修正 1. New Game が `_fwd_hist` を捨てなくなった（進むと前のゲームが戻る）

- 場所: `src/ytbg/history.py:69-76`（重複排除）＋ `src/ytbg/server.py:391`
  （`_on_new()` → `new_game()` → `add_history()`）
- `new_game()` は `score` / `playername` / `game_num` / `match_score` を
  残す（`src/ytbg/gameinfo.py:137-154`、CLAUDE.md にも同じ記述）。
  そのため、**いまの盤面がすでに初期配置なら、New Game 後の `gameinfo` は
  直前のエントリと `sn` 以外すべて同じ**になり、`add()` が `False` で返る。
  `_fwd_hist` を捨てる処理は `add()` の中にしかないので、**進む側の
  スタックがそのまま残る。**
- 実測（`back_all` で初期配置まで戻す → New Game → `fwd_all`）:

  | | 作業ツリー | HEAD |
  |---|---|---|
  | New Game 後 hist/fwd | 1 / 1 | 2 / 0 |
  | `fwd_all` 後の `checker[0][0]` | `[5, 0]` | `[6, 0]` |
  | `fwd_all` 後の `dice[0]` | `[3, 1, 0, 0]` | `[0, 0, 0, 0]` |

  New Game のあとに「進む」を押すと、捨てたはずの前のゲームの手が
  復活する。共有ボードなので、押した本人以外の画面も一緒に戻る。
- クライアントは `hist_i` / `hist_n` を一切見ていない（`static/js/` を
  grep して 0 件）ので、**進む側に中身が残っていることは画面から
  分からない。**
- なお、New Game は「全員の盤面が戻るので `confirm()` を出す」ほどの
  操作（CLAUDE.md「履歴」節）で、利用者の意図は明確に「捨てる」。
  盤面が同じかどうかとは別の話になっている。
- 補足: 決定 3 の「`_fwd_hist` を捨てない」は、クロック系 7 つには
  そもそも効かない（決定 1 の `NO_HISTORY_TYPES` で `add()` まで
  届かないため）。つまり **この性質が効くのは New Game と、盤面が
  変わらない盤面系の操作だけ**で、いま分かっている効果は上の不具合。
  直し方は管理者の判断（`_on_new()` で明示的に進む側を捨てる、
  `add()` が積まなくても進む側だけは捨てる、など）。

## 要修正 2. `set_clock_limit` がファイルに保存されなくなった

- 場所: `src/ytbg/webroot/static/js/ui/clock.js:47-51`（常に `history:false`）
  ＋ `src/ytbg/message.py:195-206` ＋ `src/ytbg/server.py:545`
- 保存（`save_data()`）が呼ばれるのは、`add_history()` が実際に積んだとき
  （`server.py:136-139`）、`clear_history()`、`backward_hist()` /
  `forward_hist()` の `finally`、`_on_set_clock_switch()` の 4 か所だけ。
  これまで持ち時間の変更は `history: true` → `add_history()` →
  `save_data()` の経路で保存されていたが、その経路が消えた。
- 実測（`set_clock_limit` で `limit[0]` を 111 にした直後のファイル 1 行目）:

  | | メモリ | ファイル |
  |---|---|---|
  | 作業ツリー | `[111, 12]` | `[120, 12]`（保存されない） |
  | HEAD | `[111, 12]` | `[111, 12]` |

- `_on_set_clock_switch()` には
  「`history: false` で送るので、ここで保存しないと `sw` が残らない
  （TODO-024）」というコメントがあり（`server.py:479-491`）、
  **今回の `set_clock_limit` はそれと同じ状況になった**のに、
  `save_data()` が足されていない。
- 緩和材料: 次に盤面が変わる操作か `back` / `fwd` があれば、そのときの
  `save_data()` でクロックごと書かれる。**変更直後にサーバを落とすと
  黙って元に戻る**という範囲の不具合。
- 同じ理屈で、New Game のときの `_clock.reset(0)/reset(1)` も
  保存されなくなっている（要修正 1 と同じ条件のとき）。実測:
  残り時間 `[10.0, 2.0]` を保存済みの状態で New Game →
  メモリは `[120, 12]` に戻るが、ファイルは `[10.0, 2.0]` のまま。
  HEAD では `[120, 12]` に書き換わる。
  （`_on_set_gameinfo()` の `_clock.stop_all()` も同経路。ただし
  `set_gameinfo` を送るクライアントは無いので影響は無い。）

## 検討 1. 「積むと進む側が捨てられる」ほうのテストが無い

- 場所: `tests/test_history.py:127-146`
- 新規テストは「同じなら積まない・進む側を捨てない」側だけを固定して
  いる。**対になる「違えば積んで、進む側を捨てる」は誰も見ていない**
  （`tests/` を `fwd_entries` で grep した。`test_add_history_appends_with_incrementing_sn`
  は進む側を作らずに `== []` を見ているだけ）。
  要修正 1 は、まさにこの対の片方が条件付きになったことで起きた。
  CLAUDE.md の「対で保守すべきもの」と同じ話で、片方だけ固定すると
  もう片方が壊れても落ちない。

## 検討 2. `NO_HISTORY_TYPES` の取りこぼしを検出できない

- 場所: `tests/test_message.py:201-208`
- 見ているのは `set(DATA_TYPES) >= NO_HISTORY_TYPES`（部分集合）だけ。
  クロック系の `type` を後から足して `NO_HISTORY_TYPES` に入れ忘れても
  落ちない。`DATA_TYPES` と `_handlers` は「キーの集合が一致すること」で
  守られている（CLAUDE.md）のに対し、こちらは片側だけの確認になる。
  実害は「無駄なエントリが 1 件増える」程度なので、直すかは判断次第。

## 検討 3. CLAUDE.md の追記が、進む側の話に触れていない

- 場所: `CLAUDE.md:302-306`
- 追記の内容そのものは実装と合っている（クロック系 7 つ、`sn` 以外が
  同じなら積まない）。ただし **「積まなかったときは `_fwd_hist` を
  捨てない」**という、いちばん引っかかる性質が書かれていない。
  置き場所も「状態と通信」の節だが、`_fwd_hist` の説明は
  「履歴（戻す・進める）」の節にある。要修正 1 の扱いが決まってから、
  そちらへ 1 行足すのが筋。

## 検討 4. 追加・変更した行が `line-length = 78` を超えている

- `pyproject.toml` の `[tool.ruff] line-length = 78`。ruff の
  `extend-select` に `E501` が無いので `ruff check` では落ちないが、
  周りのコードはこの幅で書かれている。
- 今回**新たに** 78 文字を超えた行（HEAD 時点では収まっていたもの）:
  `tests/test_on_json.py` の `test_back_all_leaves_one_entry`(89) /
  `test_back2_behaves_like_back_all`(82) / `test_fwd2_behaves_like_fwd_all`(80) /
  `test_clear_hist_leaves_one_entry`(91) / `test_back_moves_hist_i_by_n`(86)、
  `tests/test_clock.py:355`(80)。
  （`test_back_sends_sec_for_checker_move` など 3 行は HEAD でも超えていた）

## 好みの範囲

- `tests/test_history.py:148-159` の docstring
  「盤面が変われば、直前と `sn` しか違わなくても積む」が、テストの
  中身（`game_num` を 1 増やす）とも条件とも食い違う。
  実際に見ているのは「`sn` 以外にも違いがあれば積む」で、`game_num` は
  盤面ではない。
- `src/ytbg/webroot/static/js/ui/clock.js:228-236` の `PlayerClock.emit()`
  の JSDoc は、いまも `@param {boolean} [add_hist=true]`（実際の既定は
  `false`）と `@param {number} player` / `@param {number[]} clock`
  （引数に無い）のまま。今回の変更点ではないが、`emit_set()` の JSDoc を
  直した流れで目に付く。

---

## 実測で確かめて、問題が無かったもの

- **`sn` だけを除く比較**: 別の盤面を同じと見なす経路は見つからなかった。
  `to_dict()` は `dataclasses.asdict()` で、比較はすべて値の比較
  （`playername` / `dice` / `checker` の入れ子リストも含む）。
  `server_version` が入っているので、版が上がったあとの 1 件目は必ず積まれる。
  逆向き（同じ盤面を違うと見なす）も、複製やオブジェクトの同一性に
  依存する箇所は無い。float と int は `1 == 1.0` で同じと見なされるが、
  これは「落とす」側にしか効かず、`score` / `dice` が int で届く限り無害。
- **起動直後**（`load_data()` が失敗して 1 件積む、`server.py:115-118`）:
  `_history` が空なので重複排除の分岐に入らない。積まれる。
- **`clear_hist`**: `History.clear()` を通るので今回の変更と無関係。
- **複数人が同時に触る場合**: 比較の相手は常に `_history[-1]` なので、
  誰が送ったかで結果は変わらない。同じ値を 2 人が続けて送ったとき
  （得点を同じ値に、名前を同じ名前に）は 2 件目が積まれなくなるが、
  これは TODO-032 が狙ったとおりの動き。
- **`tests/conftest.py` の `add_history` フィクスチャの `game_num`**:
  `game_num` を判定に使っているテスト（`tests/test_on_json.py:487-504`、
  `tests/test_save_load.py`）は、このフィクスチャを使っていない。
  docstring の主張どおり。
- **`sn` の扱い**: 積まなかったときは `gameinfo.sn` が振り直されないので、
  `set_gameinfo` でクライアントが勝手な `sn` を入れた場合だけ、
  履歴とずれた `sn` が配信される。クライアントは `sn` を読んでいない
  （`static/js/` を grep して、コメント 2 件以外は 0 件）ので実害なし。

## 作業中に気づいたこと（レビュー対象外）

レビューの途中で、作業ツリーの `src/ytbg/history.py` が一瞬 HEAD の
内容（重複排除なし）に戻り、また戻った。壊して落ちることを確かめる
担当が `git stash` を使っていると思われる。**同じ作業ツリーで並行に
stash すると差分を失いかねない**ので、担当を並行に走らせるなら
別の worktree を使わせるほうが安全（レビュー側は
`git worktree add --detach` で比較用の HEAD を作り、終わったあと
削除した）。

---

# 再レビュー（要修正 2 件の修正ぶん）

対象: `git diff`（HEAD = d172eec）。前回の指摘の再掲はしない。
**要修正は 0 件。** 実測は、いまの `src/` を別ディレクトリに固定して
同じスクリプトを走らせ、前回と同じ 4 つの筋書きで比べた。

## 直っていることの確認（実測）

| 筋書き | 前回 | いま |
|---|---|---|
| `back_all` → New Game → `fwd_all` | fwd が 1 件残り、前のゲームの手が復活（`checker[0][0]=[5,0]`、`dice[0]=[3,1,0,0]`） | New Game 直後に fwd = 0。`fwd_all` は空振りで、盤面は初期配置のまま |
| `set_clock_limit` 直後のファイル | `limit` が `[120, 12]` のまま | `[111, 12]` に更新される |
| 残り時間 `[10.0, 2.0]` を保存済み → New Game | ファイルは `[10.0, 2.0]` のまま | `[120, 12]`（limit）に戻る |
| 進む側を捨てたことの永続化 | — | ファイルも h/f = 1/0 になり、**サーバを作り直して読み直しても戻らない**（新規に実測） |

手元で `uv run pytest`（233 passed）と `uv run ruff check .`（All checks
passed）も通ることを確認した（警告 1 件は starlette 由来で前からあるもの）。

## 戻り値の意味を変えたことの影響（`add_history()` を呼ぶ 4 か所）

`History.add()` の戻り値は `BackgammonServer.add_history()` からしか
見ていない（`src/ytbg/server.py:143` のみ。`grep` で確認）。
4 経路を 1 つずつ見て、副作用は見つからなかった。

- `__init__`（`server.py:118`、読み込み失敗時）— `_history` が空なので
  重複排除の分岐に入らず、これまでどおり積んで保存する
- `new_game()`（`server.py:134`）— 明示の `save_data()` が付いた。後述
- `_on_set_gameinfo()`（`server.py:407` 付近）— 積まないときは保存も
  されないが、直前にしている `Clock.stop_all()` は
  **残り時間を書き換えず**（`clock.py:124-132` のコメントと実装）、
  `active` はそもそも保存対象外（CLAUDE.md）。よって保存を落としても
  ファイルの中身は変わらない。害なし（コード確認。実測はしていない）
- `on_json()` の末尾（`server.py:553`）— 盤面が変わらない `history: true`
  のメッセージでも、進む側を捨てて保存するようになった。これは HEAD
  （TODO-032 以前）と同じ動きで、戻したかった性質そのもの

クロック系 7 つは `NO_HISTORY_TYPES` で `add()` まで届かないので、
**履歴を見ている最中に時計をいじっても進む側が消えない。** これは HEAD
からの変化だが、望ましい方向。

## `new_game()` の二重保存

- `new_game()` の呼び出し元は `_on_new()` だけ（`server.py:396`。`grep` で確認）
- `save_data()` は毎回ファイル全体を書き直すので、2 回書いても結果は同じ。
  New Game のときだけ書き込みが 2 倍になるが、まれな操作という判断は妥当
- 保存の回数を数えているテストは無いので（`tests/` を `save_data` で
  grep）、二重になったことで落ちるテストも無い

## 検討 1. New Game のテストが「積まない道」を通ったことを固定していない

- 場所: `tests/test_on_json.py:171-202`（`test_new_after_back_all_clears_fwd_hist`）
- 見ているのは `fwd_entries == []` と盤面だけで、**`History.add()` が
  積まなかったこと（`len(entries) == 1`）を確かめていない。**
  いまは確かに積まない道を通っている（同じ手順を実測して、New Game 後の
  h/f が 1/0 になることを確認済み）。ただし、あとで `new_game()` が
  `game_num` を進めるようになると、盤面が直前と違うことになって
  **普通に積む道**へ移り、このテストは通ったまま「積まないときも進む側を
  捨てる」を見なくなる。`assert len(bg_server._hist.entries) == 1` を
  1 行足せば固定できる。

## 検討 2. `test_set_clock_limit_is_saved` の docstring と中身が食い違う

- 場所: `tests/test_save_load.py:123-135`
- docstring は「`history: false` で届くので、`add_history()` 経由の保存が
  効かない」と書いているのに、送っているのは `'history': True`。
  実際のクライアントは `false` を送る（`ui/clock.js:47-51`）。
  `True` で送るなら「`NO_HISTORY_TYPES` に阻まれても保存されること」を
  見ていることになるので、docstring をそちらに合わせるか、`False` に
  するかのどちらか。

## 好みの範囲

- `tests/test_on_json.py` の 3 行（`test_back_sends_sec_for_checker_move`
  94 文字 / `test_fwd_sends_sec_for_checker_move` 93 文字 /
  `test_fwd_all_moves_history_to_the_end` 95 文字）は、HEAD では 81〜83
  文字だったものが引数の追加でさらに伸びている。「もともと超えていた行」
  ではあるが、折り返した他の 5 行と扱いが揃わない。
  （ほかに 79 文字の行が `tests/test_on_json.py` と
  `tests/test_save_load.py` に 1 行ずつ。1 文字超過）
- `src/ytbg/server.py:141-144` の `add_history()` には、戻り値の意味が
  「積んだか」から「履歴が変わったか（保存が要るか）」に変わったことが
  書かれていない（`History.add()` の docstring にはある）。
  `if self._hist.add(...)` を読んだ人が「積んだときだけ保存」と
  受け取りかねない。1 行のコメントで足りる。

## CLAUDE.md

追記（`CLAUDE.md:421-426`、「履歴（戻す・進める）」の節）は実装と
合っている。書きすぎも無い。強いて言えば、**「進む側を捨てたことも
保存される（そのために戻り値の意味を変えた）」**までは書かれていないが、
保存は `BackgammonServer` の担当という構成の説明が別にあるので、
無くても誤解はしないと判断した。
