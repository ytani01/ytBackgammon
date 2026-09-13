# TODO-049. モジュール構成とクラス構成を見直す（第 3 弾）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ |
| 実施 | Opus 5 / effort high | main のみ |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 32,106 | 255,530 | 100% |
| 合計 |  |  | 32,106 | 255,530 | 概算 $4.0 |

- TODO-020・TODO-042 と同じ**決めるだけの項目**。確かめるものが無いので `main のみ`
- 集計の始点は項目を立てたコミット（59e8180）。「決まったこと」を書き足した
  セッション（fc30f88）のぶんも入っている

## きっかけ

TODO-042 で決めた構成の実装（TODO-043〜048）が終わったので、2026-09-13 に
`src/` 全体を読み直した。見つけたのは次の 7 つ。

| | 見つけたもの | 場所 |
|---|--------------|------|
| A | 1 つの操作が複数のメッセージに分かれる。手番を渡すと 5 通（`dice` → `stop_clock` → `set_player_clock` → `start_clock` → `set_turn`）、サーバは 1 通ごとに全員へ `gameinfo` を送る。1 手の区切りは「最後の 1 通だけ `history: true`」で表している（TODO-032）。`set_player_clock` はクライアントが数えた残り時間でサーバの値を上書きする | `ui/clock.js` の `change_turn()`、`ui/dice.js`、`ui/checker.js` |
| B | 表示の更新がサーバへの送信を起こす。`apply()` → `set_turn()` が勝敗を見て `stop_clock` を送る（`predict` / `emit` 引数はそのため）。`Board.winner_is()` が判定のついでに `this.resign` を書き換える | `board.js` |
| C | ゲームの進行が UI 部品のクリック処理に散らばっている。`emit_msg` を呼ぶモジュールが 8 つ | `ui/dice.js`（オープニングロール）、`ui/button.js`（投了の点数）、`ui/cube.js`（ダブル） |
| D | `gameinfo` 以外にも状態が残っている。判定がそちらを読む | `Board.turn` / `resign`、`Cube.value` / `accepted`、`PlayerScore.score`、`Dice.value`、`RollButton.dice_active` |
| E | `Board`（1,034 行）が表示・操作・設定を兼ねる。ドラッグの処理は `Checker` にあるが、扱っているのは `board.moving_checker` | `board.js`、`ui/checker.js` |
| F | `type` を足すと 3 か所を直す | `message.py` の `DATA_TYPES` / `NO_HISTORY_TYPES`、`server.py` の `_handlers` |
| G | 部品が id の文字列で要素を拾い直す。チェッカー ID を `parseInt(ch.id.slice(1))` で 4 か所変換している | `dom.js`、`ui/base.js`、`board.js`、`ui/checker.js` |

**TODO-020 の決定（ルール判定はクライアントに置く、バンドラと eslint は
入れない）は変えない。**

## 相談して決めたこと

| 論点 | 決めたこと |
|------|-----------|
| 送る形（A） | 1 つの操作を、**操作の名前で 1 通**だけ送る。クロックの切り替えはサーバの中で行う（クライアントが数えた残り時間でサーバの値を上書きしない） |
| 1 通に載せる値 | **ルールの結果だけ**。動かす駒・使ったダイス・勝ちや投了の点数・オープニングの勝者はクライアントが載せる。手番を渡す、キューブを倍にする、得点を足す、クロックはサーバが `gameinfo` から行う（2 人が同時に押しても古い値で上書きしない） |
| 勝ったときのクロック（B） | **ターンが -1 になったら、サーバが両方のクロックを止める。** 勝敗の判定はクライアントのまま。`apply()` は何も送らない |
| ゲームの進行（C） | **`actions.js` に関数を並べる。** `emit_msg` を使うのはこのモジュールだけ。「押してよいか」の判定もここへ移し、`ui/` の部品はマウスの処理と表示だけにする |
| 使用済みのダイス（D） | **今の 11〜16 のまま** `gameinfo` に入れる（保存ファイルの形は変えない）。移動を送る 1 通に含める |
| 履歴に積むか（F） | **サーバが type ごとの表で決める。** メッセージの `history` はなくす。登録表は **`server.py` の 1 つ**にまとめ、`DATA_TYPES` と `NO_HISTORY_TYPES` は消す |
| 今の type | free move での移動やダイスの目の変更、名前・得点の直接の編集に使うものだけ残す。どこからも送らなくなったものは消す |
| `Board` から切り出すもの（E） | **ドラッグと設定の両方** |
| 部品と要素（G） | **`build_dom()` が作った要素を返し、部品は id ではなく要素を受け取る。** id 属性はブラウザのテストが使うので残す。画像の読み込みを待つ順番（TODO-029）は変えない |
| 細かい修正 | **Python の 4 つを全部。** `Board.search_checker()` は G で消えるので含めない |
| 実装の順番 | メッセージの送り方 → JS のクラス構成 → 部品と DOM の結びつき → 細かい修正 |
| 項目の分け方 | **6 項目**（TODO-050〜055）。サーバを先に直して古い type も残し、クライアントを切り替える項目で消す |

## 決めた設計

### 操作の type

どれも 1 通で 1 手として履歴に積む。

| type | data | サーバがすること |
|------|------|------------------|
| `roll` | `player`, `dice` | `dice[player]` を入れる（使えない目は 11〜16 のまま） |
| `opening` | `winner`（同じ目なら -1） | 勝者の dice に `[勝者の目, 0, 0, 敗者の目]`、敗者の dice を空にし、`turn` を勝者にする。同じ目なら両方を空にして `turn = 2` |
| `move` | `player`, `moves`（`[{ch, p, idx}]`）, `dice`, `score` | 駒を置き、`dice[player]` を入れる。`score > 0` なら `turn = -1` にして `score[player]` に足す（上限 99） |
| `end_turn` | `player` | `dice[player]` を空に、`turn = 1 - player`。自分のクロックを止めて、相手を開始 |
| `double` | `player`（掛ける側） | `value` を倍（上限 64）、`side = 1 - player`、`accepted = false`。クロックを切り替える |
| `take` | `player`（受ける側） | `accepted = true`。クロックを切り替える |
| `cancel_double` | `player`（掛けた側） | `value` を半分、`side` を掛けた側に戻す（1 に戻れば -1）。クロックを切り替える |
| `resign` | `player`, `score` | `turn = -1`、`resign = player`、`score[1 - player]` に足す（上限 99） |

- パスのバナーは `end_turn` を送る
- オープニングで先手が決まっても、クロックは動かさない（今と同じ）
- 敗者の目の並べ方は今と少し変わる。今は「押した側の目, 0, 0, もう片方の目」
- 「クロックを切り替える」は `Clock.stop(自分)` → `Clock.start(相手)`。
  **`double` と `take` では `player` が止まる側、`cancel_double` では
  `1 - player`（掛けられた側）が止まる側**になる（今の `change_turn()` の
  呼び方と同じ）
- **ターンが -1 になったら両方を止めるのは、ハンドラの共通の後処理**
  （`float` を返したとき）で行う。**`Clock.stop_all()` は経過分を捨てる**
  （`freeze()` しない）ので使わず、`stop()` を 2 回呼ぶ

### 残す type と消す type

| | type |
|---|------|
| 残す | `put_checker`（free move での移動）、`dice`（free move での目の変更。`roll` は外す）、`set_playername`、`set_score`（▲▼）、`stop_clock` / `resume_clock`（クロックを押して止める・再開する）、`set_clock_limit` / `set_clock_switch`（**サーバが両方を止める**。今はクライアントが別に `stop_clock` を 2 通送っている）、`back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` / `clear_hist` / `new` |
| 消す | `cube`（→ `double` / `take` / `cancel_double`）、`set_turn`（→ `opening` / `end_turn` / `move` / `resign`）、`set_player_clock`、`start_clock`、`set_gameinfo`（どこからも送っていない。テストは `bg_server._gameinfo` を直接入れる） |
| 中身を変える | `resign`（`{player}` → `{player, score}`） |

`set_gameinfo` が消えると `Clock.stop_all()` を使う場所が無くなるので、
一緒に消す。

### 登録表（F）

`server.py` に type → （`data` の dataclass、ハンドラ、履歴に積むか）の表を
1 つ置く。`message.py` は dataclass と `UnknownMessageType` だけになる。
`tests/test_message.py` の「2 つの表のキーが一致する」テストは要らなくなる。

| 履歴に積むか | type |
|--------------|------|
| 積む | 操作の 8 つ、`put_checker`、`dice`、`set_playername`、`set_score` |
| 積まない | `stop_clock`、`resume_clock`、`set_clock_limit`、`set_clock_switch` |
| 関係ない（自分で送信する） | `back` など履歴の 8 つ |

### クライアント（B・C）

- `ws.js` の `emit_msg(type, data)` は `history` を取らない。送るのは
  `{src, type, data}`
- `actions.js` は `roll(board, player)` のように `board` を受け取る関数を
  並べる。`board.gameinfo` とルール層を見て判定し、送る。**`emit_msg` を
  import するのはここだけ**なので、`EmitButton`、`main.js` の `menu_emit()`、
  名前の入力、▲▼、クロック、設定の送信もここを通す
- 先行実行は今と同じく `move` だけ。予測した `gameinfo` には**使った
  ダイス（11〜16）も書き込む**。今の「`disable()` は `apply()` のあと」
  「dice だけは `roll_btn` から写す」という順番の縛りは無くなる
- `Board.set_turn()` は何も送らない。`emit` 引数と、`apply()` の
  `predict` 引数は消す。`Board.winner_is()` は `this.resign` を書き換えない
- `apply()` の演出は `last_op` の新しい type から出す。回転と音は `roll`、
  put / hit の音は `move`（`moves` に 26 以上へ動くものがあれば hit）と
  `put_checker`、手番の音は `opening` と `end_turn`

### 判定の読み先（D）

判定が読むのは `board.gameinfo` だけにする。

| 消すもの | 読み先 |
|----------|--------|
| `Board.turn` / `resign` | `gameinfo.turn` / `resign` |
| `Cube.value` / `accepted` / `player` | `gameinfo.board.cube` |
| `PlayerScore.score` | `gameinfo.score` |
| `Dice.value` | `gameinfo.board.dice[player][i]` |
| `RollButton.dice_active` | `gameinfo.board.dice[player]` から求める |

`gameinfo` がまだ届いていないときは、操作できない（`turn = -1`）ものとして扱う。

### `Board` の切り出し（E）

- **ドラッグ**：チェッカーとキューブの「掴む・動かす・離す」を `drag.js` へ。
  `moving_checker` と `Cube.moving` はそこで持つ。行き先の判定と送信は
  `actions.js` を呼ぶ
- **設定**：音・free move・PIP の表示・cookie のプレーヤー番号を、
  `settings.js` のクラスへ移す。クロックの ON/OFF と持ち時間の表示は、
  `clock_state` から作る表示なので `Board` に残す
- `Board` に残るのは部品の生成、`apply()`、`inverse()` と、ルール層の
  薄い包み（`tests/browser/rules.test.mjs` が呼んでいる）

### 部品と要素（G）

`build_dom()` が `{checker: [[15 個], [15 個]], dice: [[4 個], [4 個]], cube, ...}`
の形で要素を返し、`main.js` が `Board` に渡す。`BgBase` は id の代わりに
要素を受け取る。チェッカーは `player` と通し番号を数値で持ち、
`parseInt(ch.id.slice(1))` と `Board.search_checker()` は消える。

### 細かい修正

| 直すもの | 場所 |
|----------|------|
| `DATAFILE_DIR` を import の時点ではなく、コンストラクタで環境変数から読む | `server.py`、`tests/conftest.py` |
| `add_history()` の `gameinfo=None` と `History.add()` の `None` 分岐を消す。`History._cur_sn` をローカル変数にする | `server.py`、`history.py` |
| `load_data()` は件数のタプルではなく真偽を返す | `server.py` |
| `backward_hist()` / `forward_hist()` の docstring を `n <= 0` に揃える | `server.py` |

## 実装の項目

| 項目 | 中身 |
|------|------|
| TODO-050. サーバに操作の type を足し、登録表を 1 つにする | A・B・F のサーバ側。**古い type はまだ消さず、履歴の扱いも今のまま（メッセージの `history` を見る）**。ターンが -1 で両方のクロックを止める。`set_clock_limit` / `set_clock_switch` で両方を止める |
| TODO-051. 操作を `actions.js` から 1 通で送る | A・B・C のクライアント側。使わなくなった type と、メッセージの `history` を消す（サーバの表の値だけで決める） |
| TODO-052. 判定が `gameinfo` を読むようにする | D |
| TODO-053. `Board` からドラッグと設定を切り出す | E |
| TODO-054. 部品に id ではなく要素を渡す | G |
| TODO-055. サーバの小さいものをまとめて直す | 細かい修正の 4 つ |

- **TODO-050 のあとも、今のクライアントのままテストが通る**ようにする。
  各項目のあとで壊れていない状態を保つため
- **`tests/browser/` は 051・052 で大きく書き換わる。** `board.emit_turn()` /
  `emit_put_checker()` / `board.turn` / `resign` / `moving_checker` を
  直接呼んでいるテストが多い。`clicks.test.mjs` は送られた `type` と
  `data` を見ているので、期待値を新しい type に合わせる
- **TODO-055 が最後。** `server.py` を 050 と取り合うので、差分が混ざらないようにする

## 残ること

- 実装は TODO-050〜055。**全部終わったところで `docs/Developer.md` と
  `CLAUDE.md` の「状態と通信」を直す**
