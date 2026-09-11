# TODO-024 reviewer 報告

規約（`CLAUDE.md`）と設計（`docs/design.md`、`archives/agents/TODO-024/README.md`
の 9 点）に照らしたレビュー。「動くか」は verifier 側。

レビューの対象は 2026-09-11 13:58〜14:00 の作業ツリー。
**その最中に verifier が `src/` をわざと壊しているのを 2 回見た**ので、
下の指摘は「壊れていない状態」で読んだ内容に対するもの（重大 3 参照）。

## 先に、確かめて問題が無かったところ

- **クロックの計算は旧実装と同値。** `Clock.cur()` / `freeze()` / `reset()` /
  `start()` / `resume()` / `stop()` / `set_switch()` / `set_limit()` /
  `set_clock()` を、`git show 0831b55:src/ytbg/yt_backgammon_server.py` の
  `_cur_clock()`（190〜209）/ `_freeze_clock()`（211〜220）/
  `_reset_clock()`（222〜231）と `on_json()` のクロック系 7 分岐
  （652〜701）と 1 対 1 に突き合わせた。猶予が 0 で止まること、持ち時間が
  マイナスまで行くこと、sw が off の間は進めないこと、`set_gameinfo` が
  freeze せずに止めるだけ（＝進んだ分を捨てる）ことまで、旧と同じ。
  `ytbg.js` の `PlayerClock.update()`（626〜649）/ `start()`（661〜667）/
  `reset()`（685〜690）とも一致
- **`clock_state` と `history_flag` は噛み合っている。** `ytbg.js:3581` の
  `if ( ! history_flag )` の中だけがクロックを触るので、`back` / `fwd` 中に
  サーバが送る `clock_state` はクライアントのクロックを動かさない。
  `_load_hist_ent()` から例外を消してもサーバ側のクロックは触られないので、
  動いているクロックは巻き戻らない（`tests/test_clock.py` の
  `test_back_does_not_rewind_running_clock` が見ている）。
  なお `clock_limit.set()` が `history_flag` の外なのは前と同じだが、
  **値の出どころが「履歴のエントリの clock_limit」から「今の limit」に
  変わったので、再生中に入力欄が昔の値に飛ばなくなった**（改善）
- **`to_dict()` / `from_dict()` の往復で失われるキーは無い。** 実測で
  `GameInfo.from_dict(g.to_dict()) == g`。`asdict()` が出すキーは
  `sn / server_version / game_num / match_score / score / turn / resign /
  board{playername, cube{side,value,accepted}, dice, checker}` の 15 個で、
  `from_dict()` は全部読んでいる
- **旧形式は実ファイルで読めた。** 利用者の `~/ytbg-1.json`（89 手）、
  `ytbg-2/3/4/test.json` をコピーして `Storage.load()` に通し、履歴の件数・
  `playername`・`score`・`clock_limit`・`board.clock` が復元されることを
  実測（`ytbg-3` は `limit=[120,12], clock=[[110.103,0],[79.112,0]]`）。
  旧 `hist_ent2str()` が書く形は素の JSON なので `json.load()` で読める
- `Storage.save()` が握るのは `OSError` だけで、`json.dumps()` を `try` の
  外に置いているところまで旧 `save_data()` と同じ形（下の 5 は別の話）

---

## 重大（要修正）

### 1. `sw` が実際には保存されない。テストがそれを隠している

- `src/ytbg/webroot/static/ytbg.js:3024` — `apply_clock_sw()` は
  `emit_msg("set_clock_switch", {...}, false)`、つまり **`history: false`**
- `src/ytbg/yt_backgammon_server.py:532` — `set_clock_switch` は `Clock` を
  変えるだけで、保存は末尾の `add_history`（`history` が真のときだけ）から
  しか走らない
- **実測**: `set_clock_switch` を `history: False` で送ってから同じ保存先で
  サーバを作り直すと `sw` は `True` に戻る（一時テストで確認、削除済み）
- `tests/test_save_load.py:149`（`test_clock_switch_is_saved`）は
  `'history': True` で送っているので通る。**クライアントが送らない形で
  「切ったまま再起動したら切れたまま」を保証しているように見える**

README の前提 5 は「`sw` は保存して復元する。利用者が切ったまま再起動したら
切れたまま」。いまの実装は「たまたま別の操作で履歴が積まれたら保存される」
だけで、前提を満たしていない。直すなら (a) クロックの操作でも保存する、
(b) 前提 5 を「履歴を積んだときに保存される」に直してテストも
`history: False` にする、のどちらか。**判断は main。**

### 2. `CLAUDE.md` が現状と食い違ったままになる

implementer が意図して触っていない（報告の「判断が要る点 1」）が、
`CLAUDE.md` は規約の正なので、この差分をコミットすると次の項目
（TODO-025 以降）が誤った前提で進む。食い違っているのは実際に:

- 「構成」— `gameinfo.py` / `clock.py` / `storage.py` が無い
- 「状態と通信」— `gameinfo` の列挙に `clock_limit` と `board.clock` が残る。
  「`ytBackgammon.init_gameinfo()` に構造がある」も違う
- 「クロック」— `_clock_sw` / `_clock_active` / `_clock_start` は無い。
  `clock_state` は 4 つになった
- 「履歴」— 「クロックの残り時間だけは引き継ぐ」は消えた。
  「`save_data()` が文字列連結」「`hist_ent2str()` も直さないと落ちる」
  「`~/ytbg-{server_id}.json`」はすべて現状と違う

あわせて `TODO.md:26` の「旧形式の読み込みを消すための項目を TODO-031 として
立てる」が未着手（`grep TODO-031 TODO.md` で項目そのものは無い）。

### 3. コミット前に作業ツリーの状態を確かめること

レビュー中、同じ作業ツリーに **verifier がわざと壊した版が入っている瞬間が
2 回あった**（実測）。

- 13:59 `src/ytbg/yt_backgammon_server.py:157` が
  `"""壊した版: reset() も呼ぶ"""` ＋ `self._clock.reset(0/1)`
- 同じころ `src/ytbg/gameinfo.py:107` が
  `"""壊した版: clock_limit と board.clock を残す"""` で
  `d['clock_limit'] = [600, 60]` を注入

どちらも数十秒後には元に戻っていたので、verifier の手順どおりの一時的な
書き換えだと思われる。ただし **この状態で `git add` / `git commit` すると
壊れた版が入る**。verifier の完了を待ってから、`git diff` に「壊した版」が
残っていないことを見てからコミットすること
（`grep -rn 壊した版 src tests` が 0 件であることを確認済み: 14:00:51 時点）。

---

## 直したほうがよい（検討）

### 4. `GameInfo.from_dict()` が必須キーの綴り違いを黙って既定値にする

- `src/ytbg/gameinfo.py:116-134`、`76-86`
- **実測**: `board.checker` を `cheker` に綴り違えた dict を渡すと、例外も
  警告も無く **初期配置の盤面**になる（`checker[0][0] == [6, 0]`、`sn` は
  保持）。`Storage._load_jsonl()` はこれをそのまま履歴に積むので、
  途中で壊れた `.jsonl` は「初期配置の 89 手」として読まれうる
- 旧実装では、キーが欠けた履歴は `hist_ent2str()` が `KeyError` で落ちて
  分かった（`save_data()` は `try` の外で呼んでいた）。**大きく落ちるから
  黙って既定値に**変わっている
- implementer も「範囲外だが気づいたこと」に書いているが、そちらは
  `set_gameinfo` の入口の話。**ファイルからの読み込みも同じ性質**なので、
  少なくとも `_load_jsonl()` では必須キーの欠落を検出して
  「壊れたファイル」（＝空の履歴）として扱うほうが安全。
  入口の検査は TODO-026 送りでよい

### 5. ファイルを開くときに encoding を指定していないのに `ensure_ascii=False`

- `src/ytbg/storage.py:88`（`open('w')`）、`116`、`155`
- 旧 `save_data()` は `json.dumps()` の既定（`ensure_ascii=True`）だったので
  書き出す内容は必ず ASCII で、encoding 未指定でも影響が無かった。
  日本語のプレーヤー名をそのまま書くようにした以上、**書き込みは
  ロケール依存**になる
- **実測**: `LC_ALL=C` では Python が UTF-8 モードに入るので `田中` は書けた
  （`open()` の `encoding` が `utf-8` になる）。**非 UTF-8 ロケール
  （`ja_JP.eucJP` など）での挙動は未確認**（この機械には非 UTF-8 ロケールが
  入っていない）
- 壊れ方は重い: 書き込み側の `UnicodeEncodeError` は `ValueError` なので
  `Storage.save()` の `except OSError` では捕まらず `add_history()` から
  上へ抜ける。読み込み側は `LOAD_ERRORS` に捕まって**履歴が丸ごと捨てられ、
  次の保存で上書き**される
- `encoding='utf-8'` を 3 箇所に足すだけで塞げる

### 6. `LOAD_ERRORS` が広く、しかも冗長

- `src/ytbg/storage.py:38-39`
- `json.JSONDecodeError` と `UnicodeDecodeError` は `ValueError` の
  サブクラスなので、この並びは実質 `(OSError, KeyError, IndexError,
  TypeError, AttributeError, ValueError)`。列挙してあるぶん狭く見える
- `IndexError` は `lines[0]`（storage.py:119）に要る。`TypeError` /
  `AttributeError` まで握ると、`gameinfo.py` 側の書き間違いを
  「壊れたファイル」として黙って握りつぶす（起動はするが履歴が消える）
- 旧 `load_data()` は `(OSError, UnicodeDecodeError, JSONDecodeError,
  KeyError)` だった

### 7. `test_on_json.py` のクロック 5 件が、コメントの言うことを検査していない

- `tests/test_on_json.py:213-226`
- コメントは「クロックは gameinfo の外に出したので gameinfo は変わらない。
  変わらないことを見る」だが、`get_value` は 5 件とも `lambda g: g['turn']`
  で期待値 `2`。`turn` はこれらの msg と無関係な既定値なので、
  **クロックが gameinfo に戻ってきても落ちない**
- `'clock_limit' not in g` / `'clock' not in g['board']` を見るほうが
  意図と合う（同じ趣旨の検査は `tests/test_clock.py` の
  `test_clock_is_not_in_history` にあるので、重複を嫌うなら
  パラメータから外して素の 5 件にする手もある）

### 8. `set_clock_limit` が「中身の同じ」履歴を 1 件積む

- `src/ytbg/yt_backgammon_server.py:514-522`、`ytbg.js:3045`
  （`emit_set(index, limit, true)`）
- **実測**: `set_clock_limit` を `history: True` で送ると履歴は 1 → 2 に
  増え、増えたエントリは `sn` 以外すべて前と同じ
- 積まれること自体は前からだが、**積まれるものが「差分のあるエントリ」から
  「同じエントリ」に変わった**。`back` を 1 回押しても盤面が変わらない手が
  挟まる（前は、戻すと clock_limit の入力欄が昔の値に戻っていた）
- implementer の報告どおり、直すなら `history` の付け方の見直しで別項目

### 9. `new_game()` が `server_version` を更新しなくなった

- 旧 `new_game()` は `init_gameinfo()` 経由で `server_version` に
  `svr_ver` を入れ直していた（`0831b55:...:95`）。新しい
  `ytBackgammon.new_game()`（yt_backgammon.py:42-54）は `board` / `turn` /
  `resign` しか触らないので、**古いファイルから読んだ `server_version` が
  New Game のあとも残る**
- 影響は保存ファイルの中身だけ（`grep server_version` で JS に参照は無く、
  画面には出ていない）。README の前提 7 は `server_version` に触れて
  いないので、どちらでもよいが、意図した変更かどうかは確かめたい

### 10. `set_gameinfo` で渡されたクロックが無視される

- `src/ytbg/yt_backgammon_server.py:473-477`、`yt_backgammon.py:56-63`
- 旧実装は `gameinfo` を丸ごと deepcopy していたので、渡された
  `clock_limit` と `board.clock` が反映され、クライアントもそれに追随した。
  いまは `GameInfo.from_dict()` が読み捨て、`Clock` は `stop_all()` で
  止まるだけ（＝限度も残り時間も**送り手の値にならない**）
- ただし **`set_gameinfo` を送るクライアントは無い**
  （`grep -rn set_gameinfo --include=*.js --include=*.html` が 0 件）。
  外部から使う予定が無いなら実害は無い（**未確認**: 手元の道具で使って
  いないかどうかまでは見ていない）

### 11. `Clock.stop_all()` の docstring が、無い使い方を書いている

- `src/ytbg/clock.py:125-134` — 「盤面ごと入れ替わる set_gameinfo と、
  **保存したものを読み込んだ直後に使う**」とあるが、呼び出しは
  `yt_backgammon_server.py:476` の 1 箇所だけ。読み込みは
  `Clock.from_dict()` が最初から止まった状態で作るので `stop_all()` は
  通らない

---

## 好みの問題

### 12. `clock.py:55` が 79 文字（`line-length = 78`）

`pyproject.toml:67` は 78。`ruff check` が通るのは `E501` が
`extend-select`（`I, B, SIM, UP, PTH`）にも既定の選択にも入っていないため。
`git ls-files '*.py'` を数えたところ、78 文字を超えるのは
`tests/test_broadcast.py` と `tests/test_on_json.py` だけで、**`src/` では
ここが初めて**。

### 13. `ytbg.js:3154` のコメントが `_clock_active` を指している

いまは `Clock.active`（`clock_state.active`）。中身の説明は今も正しい。

### 14. `ytBackgammon.init_gameinfo()` が `src/` から呼ばれなくなった

使っているのは `tests/test_yt_backgammon.py:9` だけ。TODO-025 で
`ytBackgammon` ごと消える予定なので、いま消す必要は無い。
