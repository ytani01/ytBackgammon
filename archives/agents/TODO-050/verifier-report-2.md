# TODO-050 verifier 報告（レビュー後の修正の確認）

対象: `implementer-report.md` の「レビュー後の修正」節。コードは変えていない。

## 1. 捨てる条件と `docs/design.md` の箇条書きの一致

`docs/design.md`「1 つの操作を 1 通で送る」の該当箇所（50〜61 行）:

> - `double`: 「テイク済みで、中央か自分の側にあるキューブ」でも
>   「自分に掛けられたキューブ（リダブル）」でもない
> - `take` と `cancel_double`: テイク済み
> - `resign`: 勝負のついたあと（`turn` が -1）
> - `end_turn`: 手番でないプレーヤーから
> - `opening`: `turn` が 2 以外

1 つずつ、コードとテストを照らした。

- **`double`**（`src/ytbg/gameinfo.py:317`）
  ```python
  if not (cube.side == p
          or (cube.accepted and cube.side == -1)):
      return False
  ```
  受け付ける条件は「`side == p`（テイク済みかどうか問わず）」または
  「`accepted` かつ `side == -1`」。これは design の「テイク済みで中央か
  自分の側」（`accepted and side in (p, -1)`）「または自分に掛けられた
  キューブ＝リダブル」（`not accepted and side == p`）を論理式で
  展開したものと**一致する**。
  テスト: `test_named_ops.py` の `CUBE_CASES`（172 行付近、normal/beaver の
  2 通り）、`test_redouble_is_accepted`（512 行）、
  `test_named_op_not_matching_board_is_ignored` の `double` の 3 ケース
  （470〜472 行: テイク済みで相手側、未テイクで相手側、未テイクで中央）

- **`take`**（`gameinfo.py:335`）・**`cancel_double`**（`gameinfo.py:348`）
  ```python
  # take
  if cube.accepted or cube.side != data.player:
      return False
  # cancel_double
  if cube.accepted or cube.side != 1 - data.player:
      return False
  ```
  design の文字どおりの条件は「テイク済み」（`accepted`）だけで、
  `side` の一致は書かれていない。実装は `accepted` に加えて
  **`side` が一致しないときも捨てる**（`take` は `side == player`
  でなければ捨てる、`cancel_double` は `side == 1 - player` でなければ
  捨てる）。これは design の箇条書きの文字面より条件が狭い（捨てる場合が
  多い）。
  - `CLAUDE.md`「状態と通信」（432〜434 行）は実装と同じ条件
    （`take` は「未テイクで、キューブが `p` の側」、`cancel_double` は
    「未テイクで、キューブが `1 - p` の側」）を書いており、
    実装・`CLAUDE.md`・テストの 3 つは揃っている。**`docs/design.md` の
    文言だけが「テイク済み」という短い書き方のまま**になっている
  - 実際にテストが `side` 不一致を捨てる場合として見ている:
    `test_named_op_not_matching_board_is_ignored`（490 行）の
    `('take', 0, cube(1, 2, False), {'player': 0})` （未テイクだが
    キューブが相手の側＝掛けた側がテイクしようとした）と
    `('cancel_double', 0, cube(1, 2, False), {'player': 1})`
    （未テイクだがキューブが自分の側＝掛けられた側が取り消そうとした）
  - **これは design.md の文字どおりの記述とは異なる。** 実装者の報告
    （115 行）は「今のクライアントの操作と照らして、不自然な条件は
    見つからなかった」としており、動作としては筋が通っているが、
    `docs/design.md` の箇条書きを「テイク済みだけを見る」と読むなら
    一致しない。**design.md の文言を実装に合わせて直すか、実装を
    文言どおりに緩めるか、管理者の判断が要る**（verifier では
    どちらが正しいか決められない）

- **`resign`**（`gameinfo.py:220`）: `if self.turn == -1: return False`。
  design の「勝負のついたあと（`turn` が -1）」に一致。
  テスト: `test_named_op_twice[resign]`（438 行）、
  `test_named_op_not_matching_board_is_ignored` の `resign` ケース（474 行）

- **`end_turn`**（`gameinfo.py:300`）: `if self.turn != data.player:
  return False`。design の「手番でないプレーヤーから」に一致。
  テスト: `test_named_op_twice[end_turn]`、`..._is_ignored` の
  `end_turn` 2 ケース（475〜476 行、`turn` が 1 と 2 のとき `player=0`）

- **`opening`**（`gameinfo.py:257`）: `if self.turn < 2: return False`。
  design の文字どおりは「`turn` が 2 以外」で捨てるが、実装は
  「`turn` が 2 未満」で捨てる（`turn` が 3 以上でも受け付ける）。
  turn の取り得る値は `-1` / `0` / `1` / `2` だけなので実害は無いはずだが
  （`CLAUDE.md` の turn の説明「2 以上:両方可」より）、**design の文言
  そのものとは完全には一致しない**。軽微で、上の take/cancel_double ほどの
  問題ではないが、あわせて報告する

### 捨てたときに履歴へ積まず盤面も送らないことのテスト

`test_named_op_not_matching_board_is_ignored`（490〜509 行）が、盤面
（`bg_server._gameinfo == before`）・履歴の件数（`len(...) == hist_len`）・
クロック（`bg_server._clock.active == [True, False]`）が変わらないことと、
**`emitted.messages == []`**（何も送らない）を確認している。12 通り
（`double` 3、`take` 2、`cancel_double` 2、`resign` 1、`end_turn` 2、
`opening` 2）すべてでこのアサーションを通している。`test_named_op_twice`
（438 行）も 2 回目が `emitted` を増やさないことを見ている。**確かめられている**

## 2. 検証コマンド

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 292 passed, 1 warning（starlette の DeprecationWarning、変更前からある） | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | tests 99, pass 99, fail 0 | 0 |
| `node --test tests/browser/`（1 回） | tests 60, pass 60, fail 0 | 0 |

すべて implementer-report.md の記載と一致した。

## 3. 報告に無い壊し方（3 通り）

1 か所ずつ `python3` で書き換え、`uv run pytest -q tests/test_named_ops.py`
を走らせて狙ったテストだけが落ちることを確認し、バックアップ
（scratchpad 内）との `diff` が空になることを確認して戻した。

1. **`double` の条件を「常にテイク済みを要求」に変更**（リダブルを捨てる
   ように）。`cube.side == p or (accepted and side == -1)` を
   `cube.accepted and (cube.side == p or cube.side == -1)` に変更。
   → `test_double[beaver]` と `test_redouble_is_accepted` が FAILED。
   復元後 `diff` は空
2. **`end_turn` の手番判定を外した**（`if self.turn != data.player:
   return False` を削除）。
   → `test_named_op_twice[end_turn]`、
   `test_named_op_not_matching_board_is_ignored[end_turn-1-...]`、
   `[end_turn-2-...]` の計 3 件が FAILED。復元後 `diff` は空
3. **`move` の勝負のついたあとの得点判定を外した**（`if data.score >= 1
   and self.turn != -1:` から `and self.turn != -1` を外した）。
   → `test_move_twice_sends_but_does_not_add_score` が FAILED（得点が
   3 のままのはずが 5 になった）。復元後 `diff` は空

いずれも `\cp` でバックアップを取ってから壊し、壊した内容を戻したあとに
`diff` でバックアップと完全一致することを確認した（gameinfo.py 全体）。

## 4. `CLAUDE.md` の書き足しと実装の一致

- **捨てる条件の表**（424〜437 行）: 実装（`side` の一致まで含む
  `take` / `cancel_double` の条件）と完全に一致する
- **戻る・進むでは止めない**（421〜422 行）:
  「履歴の操作（`back` / `fwd` と連続再生）では、勝負のついた盤面に
  なってもクロックを止めない」。`docs/design.md`（77〜78 行）の
  「『戻る』『進む』（履歴の操作）で勝負のついた盤面に来ても、クロックは
  止めない」と一致。実装者の報告どおり、この項目はコードを変えず
  文書だけの追記（今の `on_json()` の後処理は元々 `float` を返す
  ハンドラのあとにしか止める処理を通さないので、履歴の操作では
  最初から止まらない。変更不要という判断は妥当に見える）
- **`gameinfo.py` の構成の説明**（217〜235 行）: 新しく足したメソッド
  （`opening()` / `move()` / `end_turn()` / `double()` / `take()` /
  `cancel_double()`）と、`resign_game()` が `turn` と得点も変えること、
  盤面と合わないときに `False` を返すこと（`move()` は戻り値が無いことも
  明記）が実装と一致する

## 確かめられなかったこと・判断できないこと

- **`take` / `cancel_double` について、`docs/design.md` の文言
  （「テイク済み」とだけ書かれている）と実装（`side` の不一致も捨てる）が
  一致しない。** 実装・`CLAUDE.md`・テストの 3 つは揃って `side` の
  条件を含んでいるので、実装そのものにバグがあるとは考えていないが、
  「design.md の箇条書きと一致しているか」という問いには**一致していない
  と答えるのが正確**。design.md の文言を直すか、この程度の補足は
  「サーバは、今の盤面と合わない操作を捨てる」という見出しの下の
  自然な展開として扱ってよいかは、verifier の判断を超える
- **`opening` の条件も、design.md の文字どおり（`turn` が 2 以外なら
  捨てる）とは異なり、実装は `turn < 2` で捨てる**（`turn` が 3 以上の
  ケースを区別しない）。turn の取り得る値が `-1`/`0`/`1`/`2` だけという
  前提が保たれている限り実害は無いはずだが、文言との一致という観点では
  完全ではない
- ブラウザテストは 1 回のみ実行（MEMORY の方針どおり）
