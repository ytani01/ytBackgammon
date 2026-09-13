# TODO-050 reviewer 報告（2 回目: レビュー後の修正）

対象: 未コミットの `git diff` と `tests/test_named_ops.py`、実装者の報告の
「レビュー後の修正」。テストの一式は走らせていない（verifier の担当）。
挙動は、scratchpad の使い捨てスクリプトで `BackgammonServer.on_json()` を
直接呼んで確かめた（保存先は scratchpad の一時ディレクトリ。サーバごとに
`server_id` を変えて、前の状態を読み込まないようにした）。

## まとめ

- **要修正: 0 件**
- 今のクライアントが TODO-051 で送るはずの正しい操作は、どれも捨てられない
  （下の「確かめたこと」）。リダブルのあとの take / cancel_double、
  ビーバーの場面も受け付ける
- 前回の検討 1〜3・5 と好みの範囲 3 件は、指摘どおりに片付いている
- 足したテストは、条件を壊すと落ちる形になっている
- 判断が要るのは検討 1（`docs/design.md` と実装の条件のずれ）と
  検討 2（`player` が文字列で届いたとき。TODO-051 への申し送り）

## 検討

### 1. 捨てる条件が `docs/design.md` と実装・`CLAUDE.md` でずれている

- 場所: `docs/design.md:57`、`:60` ／ `src/ytbg/gameinfo.py:261`、`:325`、`:338`
  ／ `CLAUDE.md:433`、`:434`、`:437`
- 問題
  - `take` と `cancel_double`: 設計は「テイク済みなら捨てる」だけ。実装は
    それに加えて、キューブの側も見る（`take` は `side == p`、
    `cancel_double` は `side == 1 - p` でなければ捨てる）。`CLAUDE.md` の
    表は実装のほうを書いている
  - `opening`: 設計は「`turn` が 2 以外なら捨てる」。実装と `CLAUDE.md` は
    「2 以上なら受け付ける」（`turn` が 3 でも通る）
- 実装のほうが良い面がある（実測）。A が掛け、B がビーバーした（4 で A の側、
  未テイク）あとに、古い画面の A から `cancel_double {player: A}` が届くと、
  実装では捨てる（送信 0 通、キューブはそのまま）。設計の条件だけだと
  テイク済みでないので受け付け、ビーバーを A が取り消した形になる
- 正しい操作を捨てないことは下の「確かめたこと」で見た。`opening` の差は、
  3 以上の `turn` をクライアントが作らないので実害は無い
- 直し方の案: a. `docs/design.md` を実装に合わせる（TODO-051 は設計を
  読んで進めるので、ずれたままだと読み違える） b. 実装を設計に合わせる

### 2. `player` が文字列で届くと、正しい操作を黙って捨てる（TODO-051 への申し送り）

- 場所: `src/ytbg/gameinfo.py:306`〜`:350`（比較）、`:232`〜`:234`
  （`resign_game()`）、`src/ytbg/message.py` の `_FromDict.from_dict()`
  （型を変えずに写す）
- 問題: `PlayerData.player` は `int` と書いてあるが、届いた値をそのまま
  入れる。今回の条件は `cube.side == p` のように比べるので、`"1"` が届くと
  条件に合わず、警告を出して捨てる
- 実測（`turn = 0`）
  - `take {player: "1"}`（キューブは 1 の側で未テイク）→ 捨てた。送信 0 通
  - `double {player: "0"}`（キューブは 0 の側でテイク済み）→ 捨てた
  - `resign {player: "0", score: 1}` → `TypeError`。その前に `turn = -1` と
    `resign = "0"` を書いてしまい、得点は足されず、送信も無い。
    `turn` が -1 になったので、送り直しても今度は捨てられる
- クライアントで起きうるか（コードを読んだだけで、ブラウザでは未実測）:
  `Board.player` は `CookieBase.get()` の戻り値（文字列）をそのまま入れる
  （`board.js:392`）。クッキーが `"1"` なら `inverse()` で数に直るが、
  `"0"` なら文字列のまま残る。今のクライアントは `==` で比べるので困らず、
  `ResignButton` は既に `set_turn` の `resign` に `this.board.player` を
  載せている。TODO-051 で `take` / `double` / `resign` の `player` に
  `this.board.player` を載せると、2 回目以降に開いた画面で
  この問題が起きる
- 修正前は `take` が `player` を使っていなかったので、文字列でも通っていた。
  今回の条件で、黙って捨てる形に変わった
- 直し方の案: a. TODO-051 の注意に「`player` は数で送る」と書く
  b. サーバの入口（`parse()` か dataclass）で `int` か確かめる
  c. `resign_game()` は得点を足してから `turn` を書き換える
  （例外で半端に残らない。前回の検討 4 と同じ種類）

### 3. `opening` の引き分けは、2 回届くと 2 回とも効く

- 場所: `src/ytbg/gameinfo.py:261`
- 問題: 引き分けのあとも `turn` は 2 のままなので、2 回目も受け付ける
- 実測: `opening {winner: -1}` → `roll {player: 0, dice: [0,4,0,0]}` →
  `opening {winner: -1}` で、振ったダイスが消える（送信 3 通）
- 起きる状況: 2 枚のタブがほぼ同時に引き分けを送り、その間にもう片方が
  振り終わっていたときだけ。人の操作の速さでは、まず起きない。
  間に何も挟まらなければ、2 回目は盤面を変えない（履歴は `History.add()` が
  積まない。送信は 1 通増える）
- 設計の条件どおりなので、実装の不備ではない。受け入れるなら何もしなくてよい

## 好みの範囲

- `CLAUDE.md:409`: 表示幅 114 の 1 行になっている（周りは 78 前後で折っている）。
  文も「`None` は〜の 9 つ。表の `history` は見ないので `False`）か
  「盤面と合わないので捨てた」」と括弧をまたいでいて読みにくい

## 確かめたこと

### 今のクライアントの操作と捨てる条件（実測）

`turn = 0`（A = 0 の手番）で、TODO-051 で送るはずの操作を並べた。
どれも送信 1 通で、キューブ・クロックは設計どおり。

| 場面 | 送った順 | 結果 |
|------|----------|------|
| ビーバーのあと手番がテイク | `double A` → `double B` → `take A` | 4、A の側、テイク済み。動くのは A |
| ビーバーを取り消す | `double A` → `double B` → `cancel_double B` | 2、B の側、テイク済み（今の `Cube.cancel_double()` と同じ） |
| さらに倍 | `double A` → `double B` → `double A` → `take B` | 8、B の側、テイク済み。動くのは A |
| 持っているキューブで掛ける | A 側 2 テイク済みから `double A` → `cancel_double A` ／ `take B` | 2 で A 側 ／ 4 で B 側 |
| パス・手番の受け渡し | `turn = 1` で `end_turn 1` を 2 回 | 1 回目は効き、2 回目は捨てた |
| 掛けられて投了 | `double A` → `resign B` を 2 回 | 得点は 1 回だけ |

クライアントの側（コードを読んで確認）:

- `ui/cube.js`: テイク（`accept_double()`）はキューブが自分の側
  （`this.player == this.board.player`）のときだけ、リダブルも同じ。
  取り消しの枝はそれ以外で、掛けた側が送る。サーバの条件と一致する
- `ui/dice.js`: オープニングは `turn >= 2` のときだけ、手番の受け渡しは
  そのダイスの持ち主（手番の人）が送る
- パスのバナー: `Board.set_turn()` が `pass_btn[turn]` だけを出すので、
  押した `btn.player` は `turn` と同じ
- `ResignButton` / `after_move`: `resign` は `turn` が -1 のときだけ捨て、
  `move` は捨てない

同じ側の 2 枚のタブで、片方がテイクし、もう片方がほぼ同時にリダブルした
場合は両方効く（テイク済みの自分のキューブで掛けたことになる）。重複ではなく
別の操作の競合で、`double` が手番を見ない方針のとおり。

### 前回の指摘

| 前回 | 今回 |
|------|------|
| 検討 1（2 回ぶん効く） | 片付いた。6 つの操作で 2 回目を捨てることを実測（上の表と `test_named_op_twice`） |
| 検討 2（戻る・進むでクロック） | 止めないと決まり、`docs/design.md`、`CLAUDE.md`、`TODO.md` の TODO-051 に書かれた |
| 検討 3（テストの取り違え） | 片付いた（下） |
| 検討 4（途中の例外） | 見送り（実装者の報告のとおり）。検討 2 の `resign` も同じ種類 |
| 検討 5（`CLAUDE.md` の `gameinfo.py`） | 片付いた。書かれた内容はコードと合う |
| 好みの範囲 3 件 | どれも片付いた（`server.py の NAMED_TYPES`、`test_save_load.py` の折り返し、`CUBE_MAX` / `SCORE_MAX` の位置） |

### テストが条件を壊すと落ちるか（読んで確認）

- `CUBE_CASES`: 止める側の書き違えを全部捕まえる
  - `take`: normal（`player` 1）で `1 - player`、beaver（`player` 0）で
    `player` を捕まえる
  - `cancel_double`: normal（`player` 0）で `player`、beaver（`player` 1）で
    `1 - player` を捕まえる
  - `double`: normal で `1 - player`、beaver（`turn` 0、`player` 1）で `turn` を捕まえる
- `test_named_op_not_matching_board_is_ignored`: `double` の 3 条件
  （テイク済みで相手側、未テイクで相手側、未テイクで中央）、`take` と
  `cancel_double` のテイク済み・側違いを 1 つずつ持つ。捨てる前に
  クロックを切り替える書き違えも、`active` を見ているので落ちる
- `test_named_op_twice`: 捨てたときに `0` を返す書き違えは、
  送信が 0 通であることを見ているので落ちる
- 捕まらないのは `opening` の `turn < 2` を `turn != 2` にする書き違えだけ
  （検討 1 のとおり、どちらにするかは決まっていない）

### `CLAUDE.md` の書き足し

- 数（自分で送る 9 つ、`float` の 20 個、秒数を返すのは `put_checker` と `move`）、
  後処理の順、捨てる条件の表、`move` と `roll` の扱い、クロックの切り替え、
  `set_clock_switch` はコードと合う
- 表の `take` / `cancel_double` / `opening` は実装に合っているが、
  `docs/design.md` とはずれる（検討 1）
