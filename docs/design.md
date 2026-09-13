# 構成の見直し（設計）

**これから実装する構成で、今の実装とは違う。** 今の構成は
[Developer.md](Developer.md) にある。

## 変えないこと

- 1 枚のボードを全員で共有し、誰でも自由に触れる、という目的
- ルールの判定はクライアントが行う。サーバは盤面を預かって配る
- 保存ファイルの形
- JS はバンドラを使わず ES Modules のまま読み込む。eslint も入れない

## いまの問題

| | 問題 | 主な場所 |
|---|------|----------|
| A | 1 つの操作が何通ものメッセージに分かれている。手番を渡すだけで `dice`、`stop_clock`、`set_player_clock`、`start_clock`、`set_turn` の 5 通になり、サーバはそのたびに全員へ盤面を送る。どこまでが 1 手かは「最後の 1 通だけ `history: true`」で表している。さらに `set_player_clock` は、クライアントが数えた残り時間でサーバの値を上書きする | `ui/clock.js`、`ui/dice.js`、`ui/checker.js` |
| B | 表示を更新すると、サーバへの送信が起きる。`apply()` から呼ばれる `set_turn()` が勝敗を見て `stop_clock` を送る。`winner_is()` も判定のついでに `resign` を書き換える | `board.js` |
| C | ゲームの進め方が、部品のクリック処理に散らばっている。オープニングロールは `Dice`、投了の点数は `ResignButton`、ダブルは `Cube` にあり、サーバへ送るモジュールは 8 つある | `ui/` |
| D | 盤面の状態が `gameinfo` のほかにも残っていて、判定がそちらを読む | `Board.turn`、`Cube.value`、`PlayerScore.score`、`Dice.value` など |
| E | `Board`（約 1,000 行）が表示・操作・設定をすべて抱えている。ドラッグの処理は `Checker` にあるのに、扱う状態は `board.moving_checker` にある | `board.js`、`ui/checker.js` |
| F | メッセージの種類（type）を 1 つ足すのに、3 か所を直す必要がある | `message.py`、`server.py` |
| G | 部品が id の文字列で要素を探し直している。チェッカーの番号も id の文字列から取り出している | `dom.js`、`ui/base.js`、`board.js` |

## メッセージ

### 1 つの操作を 1 通で送る

操作ごとに名前を付け、1 通で送る。サーバはそれを受けて盤面を 1 回だけ
書き換え、全員へ 1 回だけ送る。1 通がそのまま履歴の 1 手になる。

クライアントが載せるのは、**ルールを判定した結果だけ**にする。どの駒を
どこへ動かすか、どのダイスを使ったか、勝ちや投了で何点になるか、
オープニングでどちらが勝ったか、がこれに当たる。手番の受け渡し、キューブの
値、得点の足し算、クロックの切り替えは、サーバが自分の持つ盤面をもとに行う。
2 人がほぼ同時に操作しても、古い値で上書きされない。

| type | 載せるもの | サーバが行うこと |
|------|------------|------------------|
| `roll` | `player`, `dice` | `dice` をそのプレーヤーのダイスにする。使えない目はクライアントが 11〜16 にして送るので、そのまま入れる |
| `opening` | `winner`（同じ目なら -1） | 勝った側のダイスを `[勝者の目, 0, 0, 敗者の目]` にし、負けた側のダイスを空（`[0, 0, 0, 0]`）にして、手番を勝った側に渡す。同じ目なら両方を空にし、`turn` を 2 に戻す |
| `move` | `player`, `moves`（`[{ch, p, idx}]`）, `dice`, `score` | `moves` のとおりに駒を置き、`dice` をそのプレーヤーのダイスにする。`score` が 1 以上なら `turn` を -1 にし、`player` の得点に `score` を足す（上限 99） |
| `end_turn` | `player` | 自分のダイスを空にして手番を相手に渡す。自分のクロックを止め、相手のクロックを動かす |
| `double` | `player`（掛ける側） | キューブの値を倍にし（上限 64）、相手側に置いて未テイクにする。クロックを切り替える |
| `take` | `player`（受ける側） | テイク済みにする。クロックを切り替える |
| `cancel_double` | `player`（掛けた側） | キューブの値を半分に戻し、掛けた側に置いてテイク済みにする（1 に戻ったら中央）。クロックを切り替える |
| `resign` | `player`, `score` | `turn` を -1 に、`resign` を `player` にし、相手の得点に `score` を足す（上限 99） |

- パスのバナーを押したときも `end_turn` を送る
- オープニングで先手が決まっても、クロックは動かさない（今と同じ）
- クロックの切り替えでは、止める側のクロックを止めてから、もう片方を
  猶予を戻して動かす。止める側は、`double` では `player`、`take` と
  `cancel_double` では手番でない側（`1 - turn`）になる。テイクのあとに
  ダイスを振るのは手番のプレーヤーなので、バックギャモンのルールに合わせて
  手番のクロックを動かす（リダブルのあとに受けるのも手番のプレーヤー）。
  `cancel_double` はルールに無い取り消しなので、ダブルの前に戻す扱いにする

### 勝負がついたときのクロック

**`turn` が -1 に変わったら、サーバが両方のクロックを止める。** 処理の前から
-1 だったときは止めない（勝負がついたあとでも、クロックを押せば再開できる）。
勝敗の判定はこれまでどおりクライアントが行い、その結果を `move` や `resign` に載せる。
表示の更新（`apply()`）からは何も送らない。

止めるときは、そこまでに経った時間を残り時間に反映する。今の
`Clock.stop_all()` はこれをしないので使わない。

### 残す type と消す type

free move での操作や、名前・得点を直接書き換える操作には、上の名前付きの
操作が当てはまらない。そのための type は残す。

| | type |
|---|------|
| 残す | `put_checker`（free move での移動）、`dice`（free move での目の変更）、`set_playername`、`set_score`（得点の ▲▼）、`stop_clock` と `resume_clock`（クロックを押して止める・再開する）、`set_clock_limit` と `set_clock_switch`、履歴の操作（`back`、`back2`、`back_all`、`fwd`、`fwd2`、`fwd_all`、`clear_hist`、`new`） |
| 消す | `cube`、`set_turn`、`set_player_clock`、`start_clock`、`set_gameinfo` |
| 中身を変える | `resign`（`{player}` を `{player, score}` にする） |

- `set_clock_limit` と `set_clock_switch` を受けたら、サーバが両方の
  クロックを止める。`set_clock_limit` では今もサーバが止めているが、どちらの
  ときもクライアントが別に `stop_clock` を 2 通送っている
- `set_gameinfo` はどこからも送っていないので消す。テストでは
  サーバの盤面を直接書き換える

### 履歴に積むかどうか

メッセージから `history` をなくし、**サーバが type ごとに決める。**

| 履歴に積む | 積まない | 関係しない（ハンドラが自分で盤面を送る） |
|------------|----------|--------------------------|
| 名前付きの 8 つの操作、`put_checker`、`dice`、`set_playername`、`set_score` | `stop_clock`、`resume_clock`、`set_clock_limit`、`set_clock_switch` | 履歴の操作 8 つ |

### 登録表

type ごとに「`data` の型」「処理する関数」「履歴に積むか」を、
`server.py` の 1 つの表にまとめる。type を足すときに直すのはこの表だけになる。
`message.py` に残るのは `data` の型（dataclass）と例外だけで、
`DATA_TYPES` と `NO_HISTORY_TYPES` はなくなる。

## クライアント

### 送信は `actions.js` にまとめる

- ゲームを進める処理を `actions.js` に関数として並べる。どれも
  `roll(board, player)` のように `board` を受け取り、`board.gameinfo` と
  ルール層を見て判定してから送る
- **`emit_msg` を import するのは `actions.js` だけ。** ボタン、メニュー、
  名前の入力、得点の ▲▼、クロック、設定の変更も、ここを通して送る
- 「いま押してよいか」の判定（手番か、ダイスが残っているか、キューブに
  触れるか）もここに置く。`ui/` の部品は、マウスの処理と表示だけを受け持つ
- `emit_msg(type, data)` は `history` を受け取らず、`{src, type, data}` を送る

### 表示の更新は何も送らない

- `Board.set_turn()` はサーバへ送らない。送るかどうかを決めていた引数
  （`set_turn()` の `emit`、`apply()` の `predict`）も消す
- `Board.winner_is()` は判定するだけで、状態を書き換えない
- 音とダイスの回転は、今と同じく `last_op`（直前の操作）から決める。
  回転と振る音は `roll`、駒を置く音とヒットの音は `move` と `put_checker`、
  手番が変わる音は `opening` と `end_turn` から出す

### 先行実行

サーバの返事を待たずに表示を変える先行実行は、今と同じく `move` だけで行う。
予測した盤面には、**使ったダイス（11〜16）も書き込む。** これで
「使ったダイスを暗くするのは `apply()` のあと」という順番を守る必要がなくなる。

### 判定は `gameinfo` だけを読む

部品が `gameinfo` とは別に持っている同じ値（写し）をなくし、判定は
`board.gameinfo` を読む。

| なくすもの | 代わりに読むもの |
|------------|------------------|
| `Board.turn`、`Board.resign` | `gameinfo.turn`、`gameinfo.resign` |
| `Cube.value`、`Cube.accepted`、`Cube.player` | `gameinfo.board.cube` |
| `PlayerScore.score` | `gameinfo.score` |
| `Dice.value` | `gameinfo.board.dice[player][i]` |
| `RollButton.dice_active` | `gameinfo.board.dice[player]` から求める |

サーバから盤面がまだ届いていないときは、何も操作できないものとして扱う。

### `Board` を分ける

- **ドラッグ:** チェッカーとキューブを「掴む・動かす・離す」処理を
  `drag.js` に移す。掴んでいるものの状態もそこで持つ。行き先の判定と送信は
  `actions.js` に任せる
- **設定:** 音、free move、PIP の表示、cookie に保存するプレーヤー番号を、
  `settings.js` のクラスに移す。クロックの ON/OFF と持ち時間はサーバから
  届く値を表示するものなので、`Board` に残す
- `Board` に残るのは、部品を作ること、`apply()`、盤面の反転、ルール層の関数を
  呼ぶだけのメソッド（`get_dst_points()` など）

### 部品には要素を渡す

- `build_dom()` は作った要素を
  `{checker: [[15 個], [15 個]], dice: [[4 個], [4 個]], cube, ...}` の形で返す。
  部品は id ではなく、この要素を受け取る
- チェッカーはプレーヤーと通し番号を数値で持つ。id の文字列から番号を
  取り出す処理と、`Board.search_checker()` はなくなる
- id 属性そのものは、ブラウザのテストが要素を探すのに使うので残す
- 画像の読み込みを待ってから `Board` を作る順番は変えない

## サーバの細かい修正

- 保存先のディレクトリ（`DATAFILE_DIR`）を、import したときではなく
  `BackgammonServer` を作るときに環境変数から読む
- `add_history()` と `History.add()` の、`None` を受けたときの分岐を消す
  （呼ぶ側は必ず盤面を渡している）。`History._cur_sn` はローカル変数にする
- `load_data()` は件数の組ではなく、読めたかどうかを返す
  （呼ぶ側は 1 件未満かどうかしか見ていない）
- `backward_hist()` と `forward_hist()` の docstring を、実装に合わせて
  「`n <= 0` で最後まで」に直す

## 実装の順番

1. **サーバに名前付きの操作を足し、type の登録表を 1 つにする。** 古い type は
   まだ残し、履歴に積むかどうかもメッセージの `history` を見たままにする。
   今のクライアントのまま動き、テストも通る状態を保つ
2. **1 つの操作を 1 通で送り、送信を `actions.js` にまとめる。**
   使わなくなった type と、メッセージの `history` をここで消す
3. **部品が持つ状態の写しをなくし、判定では `gameinfo` を読む**
4. **`Board` からドラッグと設定を切り出す**
5. **部品に id ではなく要素を渡す**
6. **サーバの細かい修正をまとめて行う**（1 と同じく `server.py` を変えるので、
   差分が混ざらないよう最後にする）

2 と 3 では `tests/browser/` を大きく書き直すことになる。
`board.emit_turn()` や `board.turn`、`board.moving_checker` を直接触っている
テストが多く、`clicks.test.mjs` は送られた type と `data` を確かめているため。

すべて終わったら、[Developer.md](Developer.md) を今の構成に合わせて直し、
この文書は `archives/docs/design-3.md` へ移す。
