# TODO-050 reviewer 報告

対象: 未コミットの `git diff` と `tests/test_named_ops.py`。
照らし合わせたもの: `TODO.md` の TODO-050、`docs/design.md` の「メッセージ」、
`CLAUDE.md`、実装者の報告。テストの一式は走らせていない（verifier の担当）。
挙動の確かめは、使い捨ての Python スクリプトで `on_json()` を直接呼んで行った
（保存先は scratchpad の一時ディレクトリ）。

## まとめ

- **要修正: 0 件。** 指示と設計の表からずれている箇所は見つからなかった
- 特に見るよう頼まれた点の結果
  - 履歴に積む条件: 古い type の結果は今の `NO_HISTORY_TYPES` と同じ
    （表で `False` になっているのはクロック系の 6 つだけ。`True` の古い type は
    `m.history` だけで決まる。自分で送る 9 つは `None` を返すので条件まで来ない）。
    `resign` は新しい 8 つに入ったので `history: false` でも積むが、
    今のクライアントは `resign` を送っていない（`set_turn` で送っている）ので影響は無い
  - `turn` が -1 になったときのクロック停止: 位置は `add_history()`
    （保存を含む）と `emit_gameinfo()` の前で、止めた状態が保存と配信に載る。
    `turn0` を読んでからハンドラが戻るまでに `await` は無い（`float` を返す
    ハンドラはどれも中で待たない）ので、他の要求が割り込んで `turn0` が古くなることは無い。
    例外のときは止めない（盤面も送らない）。`set_turn` にも効く
  - 各ハンドラ: opening の目の拾い方と並び、double / take / cancel_double の
    キューブとクロック、得点とキューブの上限、1 に戻ったら中央、はすべて設計の表どおり
  - `set_clock_switch` で止める件: 今のクライアントが `set_clock_switch` を送るのは
    メニューのチェックを変えたときだけ（`Board` のコンストラクタの中の送信は
    接続前なので `emit_msg()` が捨てる）。つないだだけで他人のクロックが
    止まることは無い
  - `CLAUDE.md`: 数（自分で送る 9 つ、`float` の 20 個）と後処理の順は実装と合う。
    造語は見当たらない

## 検討

### 1. 同じ操作が 2 回届くと、値が 2 回ぶん変わる（判断が要る）

- 場所: `src/ytbg/gameinfo.py:284`（`double`）、`:220`（`resign_game`）、
  `:263`（`move` の `score`）、`:297`（`cancel_double`）
- 問題: 名前付きの操作はサーバの値からの差分で書き換えるので、
  **2 通届くと 2 回ぶん効く。** 古い `cube` / `set_score` は値そのものを
  送っていたので、2 回届いても結果は同じだった
- 起きる状況: 共有ボードで、同じ側を 2 枚のタブ（または 2 人）が見ていて、
  ほぼ同時に押したとき。どちらのクライアントも古い `gameinfo` で
  「押してよい」と判定するので、クライアントの判定では防げない。
  TODO-051 でクライアントが新しい type を送り始めると表に出る
- 実測（初期状態から、`turn = 0`）
  - `double {player:0}` を 2 回 → `CubeState(side=1, value=4, accepted=False)`（2 のはずが 4）
  - `resign {player:0, score:1}` を 2 回 → `score == [0, 2]`
  - `double` → `take` のあとに `cancel_double` → テイク済みのキューブが 1 に戻り中央へ
  - `end_turn {player:0}` を 2 回 → 盤面は同じ（`turn = 1`）。ただし 2 回目で
    相手の猶予がもう一度戻る。こちらは実害が小さい
- 設計の「古い値で上書きされない」は満たしているが、その裏返しの
  「重ねて効く」については設計に何も書かれていない
- 直し方の案（どれにするかは利用者の判断）
  - a. サーバで、今の盤面と合わないものを捨てる（`double` は `accepted` が
    `False` なら無視、`take` / `cancel_double` は `accepted` が `True` なら無視、
    `resign` と `move` の `score` は `turn` が既に -1 なら足さない）。
    「ルールの判定はクライアント」という方針とどこまで折り合うかを決める必要がある
  - b. このまま受け入れ、`CLAUDE.md` に既知の挙動として書く
  - c. TODO-051 の項目で扱う（クライアント側の送信とまとめて決める）

### 2. `back` / `fwd` で勝負のついた盤面に来ても、クロックは止まらない（判断が要る）

- 場所: `src/ytbg/server.py:582-595`（止める処理は `float` を返したときだけ）
- 問題: 履歴の操作（`back` / `fwd` / 連続再生）で `turn` が -1 の盤面に
  なっても、止める処理を通らない
- 実測: `resign` → `back 1` → `Clock.start(0)` → `fwd 1` のあと、
  `turn == -1` で `active == [True, False]`
- 起きる状況: 今は、クライアントの `Board.set_turn()` が勝者のクロックを見て
  `stop_clock` を送るので止まる。**TODO-051 で `apply()` から送信を消すと、
  この経路が無くなり、止まらなくなる**
- TODO-050 の指示（「`on_json()` がハンドラのあとに行う処理の中で」）どおりの
  実装なので、TODO-050 の不備ではない。設計の「`turn` が -1 に変わったら」を
  履歴の操作にも当てはめるかを、TODO-051 の前に決めておくのがよい
- 直し方の案: a. 履歴の操作でも止める（`_load_hist_ent()` の前後で `turn` を比べる）
  b. 履歴の操作では止めないと決め、TODO-051 の節か `docs/design.md` に書く

### 3. take / cancel_double / double のテストが、取り違えの片方しか捕まえない

- 場所: `tests/test_named_ops.py:189`（take）、`:212`（cancel_double）、`:162`（double）
- 問題: 各テストは組み合わせを 1 つだけ使っているので、止める側の
  取り違え方のうち 1 通りしか区別できない
  - take（`turn = 0`, `player = 0`）: `1 - turn` と `1 - player` がどちらも 1。
    **`_switch_clock(1 - data.player)`（テイクした側を動かす）と書き違えても通る。**
    通常のテイク（`player = 1 - turn`）ではこの書き違えは結果が変わる
  - cancel_double（`turn = 0`, `player = 0`）: 同じく `1 - player` と区別できない
  - double（`turn = 1`, `player = 1`）: `_switch_clock(turn)` と区別できない
- 根拠: 実装者の報告の「わざと壊した」表にある書き違えは `player` を使う版だけで、
  `1 - player` の版と、double の `turn` の版は試されていない（未確認だが、
  値の組から結果が同じになることは読めば分かる）
- 直し方の案: 3 つとも、通常の場面（take は `player = 1 - turn`、
  cancel_double は `player = turn`）とビーバーの場面（`player` が逆）の
  2 通りで parametrize する

### 4. 1 手のうち途中で例外になると、盤面が半分だけ書き換わったまま残る

- 場所: `src/ytbg/gameinfo.py:263`（`move`）
- 問題: `moves` の 2 つ目で例外になると、1 つ目の駒は置かれたまま、
  配信も履歴も無しで終わる。次に誰かが操作したときに、その盤面が配られる
- 実測: `moves = [{ch:0,p:5,idx:0}, {ch:15,p:5,idx:1}]` で `IndexError`、
  その後 `checker[0][0] == [5, 0]`、送信 0 通
- 起きる状況: クライアントが壊れた `ch` を送ったときだけ。今の
  `put_checker` 1 通でも例外なら同じ扱いで、信頼できるクライアント前提なので
  優先度は低い
- 直し方の案: `move()` の先頭で全部の `ch` を確かめる、または複製に適用してから
  差し替える。見送るなら何もしなくてよい

### 5. `CLAUDE.md` の「構成」の `gameinfo.py` の説明が古いまま

- 場所: `CLAUDE.md:217-222`
- 問題: 更新のメソッドの一覧に `opening()` / `move()` / `end_turn()` /
  `double()` / `take()` / `cancel_double()` が無い。`resign_game()` が
  `turn` と得点も変えるようになったことも書かれていない
- 根拠: 実装者も「範囲外で気づいたこと」で挙げている。TODO-050 の指示は
  「状態と通信」だけなので、直すかどうかは管理者の判断
- 直し方の案: 一覧に足す（1〜2 行）。TODO-051 でまとめて直すなら、その節に書き足す

## 好みの範囲

- `CLAUDE.md:338` 「`on_json()` の `NAMED_TYPES`」: `NAMED_TYPES` は
  `server.py` のモジュールの定数で、`on_json()` の中には無い。
  「`server.py` の `NAMED_TYPES`」の方が探しやすい
- `tests/test_save_load.py:124`: 表示幅 89 で、`pyproject.toml` の
  `line-length = 78` を超える（ruff の既定の規則には E501 が無いので指摘は出ない）。
  周りの docstring は 78 以内に折っている
- `src/ytbg/gameinfo.py:55`: `CUBE_MAX` / `SCORE_MAX` が `init_checker()` と
  `init_dice()` の間に挟まっている。定数はファイルの上の方にまとめた方が見つけやすい
