# TODO-050. サーバに名前付きの操作を足し、type の登録表を 1 つにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer（3 巡） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 24,915 | 260,990 | 27% |
| implementer | Opus 5 | medium | 82,034 | 722,913 | 44% |
| reviewer | Opus 5 | high | 75,606 | 329,207 | 23% |
| verifier | Sonnet 5 | medium | 31,968 | 216,143 | 7% |
| 合計 |  |  | 214,523 | 1,529,253 | 概算 $27.6 |

- implementer と reviewer は定義のモデルが sonnet。実装はクロックと履歴の
  条件が込み入り、レビューはルールと今のクライアントに照らす判断が要るので
  Opus 5 に上書きした。effort は定義の値（implementer medium、reviewer high）
- verifier は定義のまま（Sonnet 5 / medium）
- TODO-050〜055 を 1 つのコミットで立てたので、集計は `--since` で
  直前のコミット（2026-09-13 19:19:16）から切った

## きっかけ

TODO-049 で決めた構成の見直し（第 3 弾）の 1 つ目。設計は `docs/design.md` の
「メッセージ」の節。1 つの操作が何通ものメッセージに分かれ（手番を渡すだけで
5 通）、type を 1 つ足すのに `message.py` と `server.py` の 3 か所を直す
必要があった。まずサーバ側だけを変え、今のクライアントのまま動く状態を保つ。

## やったこと

- **名前付きの 8 つの操作**（`roll` / `opening` / `move` / `end_turn` /
  `double` / `take` / `cancel_double` / `resign`）のハンドラと dataclass
  （`OpeningData` / `MoveData` / `ResignData`）を足した。盤面の書き換えは
  `GameInfo` のメソッド（`opening()` / `move()` / `end_turn()` / `double()` /
  `take()` / `cancel_double()`）で、得点の上限 99 とキューブの上限 64 は
  `SCORE_MAX` / `CUBE_MAX`。`resign` の `data` は `{player, score}` にした
- **登録表を `server.py` の `MESSAGE_TYPES` 1 つにした。** 1 行が
  `MessageType(make_data, handler, history)`。`DATA_TYPES` と
  `NO_HISTORY_TYPES` と `self._handlers` を消し、`parse()` を `server.py` へ
  移した。`message.py` に残るのは dataclass と例外と `Message`
- **履歴に積む条件:** 古い type は「表で積む」かつ「msg の `history`」、
  新しい 8 つは表だけ（見分けるのは一時的な `NAMED_TYPES`。TODO-051 で消す）。
  古い type の結果は今の `NO_HISTORY_TYPES` と同じ
- **`turn` が -1 に変わったら両方のクロックを `Clock.stop()` で止める**
  （処理の前が -1 のときは止めない）。古い `set_turn` にも効く。
  `set_clock_switch` でも両方を止める
- **クロックの切り替え:** `double` は `player` を止め、`take` と
  `cancel_double` は `1 - turn` を止める（`turn` が 0 / 1 のときだけ。
  負の添字で別のプレーヤーを指さないため）
- **盤面と合わない名前付きの操作を捨てる**（レビューで決めた）。
  同じ操作が 2 回届くと 2 回ぶん効く（キューブが 4 になる、得点が 2 回足される）
  ため。条件は `docs/design.md` の「1 つの操作を 1 通で送る」。リダブルと
  ビーバーの場面は捨てない。捨てたときは履歴にも積まず、盤面も送らない
- **入口で `data` の値の型を確かめる**（レビューで決めた）。`_type_ok()` が
  dataclass のフィールドの注釈と照らし、`list[X]` は中身まで見る。bool と
  int を区別する。合わなければ盤面を書き換える前に `TypeError`。
  `from_dict()` で list を `list()` に写すのをやめ（写すと文字列も list に
  なって弾けない）、写すのは受け取る側（`GameInfo` / `Clock`）にした。
  `clock_limit` は float として受ける
- **`Board.load_player()` で cookie の値を数に直した。** プレーヤー 0 の画面を
  開き直すと `board.player` が `"0"` のまま残り、投了ボタンが `set_turn` の
  `resign` に文字列を送って、型の確かめで弾かれるため
- `tests/test_named_ops.py` を足し、`test_message.py` / `test_on_json.py` /
  `test_clock.py` / `test_save_load.py` を直した。`tests/browser/` に
  `player_cookie.test.mjs` を足し、`predict.test.mjs` の「予測はサーバへ何も
  送らない (turn が -1 に変わっていても)」を消した（勝った側のクロックが
  動いたまま `turn` が -1 になる状態を、もう作れないため）
- `CLAUDE.md` の「状態と通信」「構成」と、ブラウザのテストの一覧を直した。
  `docs/design.md` に、捨てる条件・型の確かめ・「戻る」「進む」では
  クロックを止めないことを書き足した

### 決めたこと（利用者と相談した）

- `opening` のダイスの並びは `[勝者の目, 0, 0, 敗者の目]`（今の
  「後から振った側が左」から変わる）。目は `dice[player]` の 4 つから
  0 でない値を拾い、無ければ 0
- `cancel_double` のあとのキューブはテイク済み
- 盤面と合わない操作は捨てる（ほかに「受け入れて CLAUDE.md に書く」
  「TODO-051 で決める」があった）
- 「戻る」「進む」で勝負のついた盤面に来ても、クロックは止めない
- 型の食い違いは、クライアントとサーバの両方で防ぐ

### 見送ったこと

- **`move` の途中で例外になると、盤面が半分だけ書き換わる**（レビュー 1 の
  検討 4）。壊れた `ch` が届いたときだけで、今の `put_checker` 1 通でも
  同じ扱い。入口の型の確かめで、型の違いによる例外は起きなくなった
- **cookie の値が `""` だと `board.player` が `NaN` になる**（レビュー 3 の
  検討 1）。このコードが `""` を書くことは無い
- **WebSocket 経路で型の合わない値を送るテスト**（確認 3）。`app.py` の
  受信ループの `except Exception` を通るだけで、同じ分岐は
  `test_error_in_on_json_keeps_connection` が見ている
- 値の範囲（`player` が 0 / 1 か、`p` が 0〜27 か）は確かめない。依頼は型だけ

## 確かめたこと

- `uv run pytest` 316 件、`ruff` / `mypy src` / `basedpyright` の指摘 0、
  `node --test tests/js/` 99 件、`node --test tests/browser/` 62 件
  （いずれも 3 巡目の実装者と確認担当が 1 回ずつ走らせた）
- わざと壊して落ちること: 1 巡目 20 通り、2 巡目は捨てる条件と
  止める側の書き違えを 1 つずつ（初めは 1 つ落ちなかったのでテストを足した）、
  3 巡目は型の確かめと `load_player()`。確認担当も別の壊し方を
  1 巡目 5 通り、2 巡目 3 通り、3 巡目 2 通り試した
- 今のクライアントの正しい操作（リダブルのあとの take / cancel_double、
  ビーバー）が捨てられないこと、今のクライアントが送る値が型の確かめで
  弾かれないことを、レビュー担当が実測した

## 残ること

- `docs/Developer.md` に `message.py` の `parse()` / `DATA_TYPES` などの
  古い説明が残っている。TODO-055 で直す
- `NAMED_TYPES` と、`parse()` が `history` を必須にしているところは
  TODO-051 で消す

## 分担の振り返り

- **各担当が見つけたこと**
  - reviewer（1 巡目）: 同じ操作が 2 回届くと重ねて効くこと、「戻る」
    「進む」でクロックが止まらなくなること、止める側のテストが取り違えの
    片方しか捕まえないこと。どれも実際に送って確かめていた。
    2 巡目は文字列の `player` で take が黙って捨てられ resign が途中で
    例外になること、3 巡目は cookie の `""` の場面
  - verifier: 3 巡とも検証は通り、実装の食い違いは見つけていない。
    見つけたのは `docs/design.md` の文言と実装の差、`CLAUDE.md` の一覧の
    漏れ、TODO.md のチェックが残っていること。壊し方はどれも狙いどおり落ちた
  - implementer: 型の確かめを頼んだ時点で、今のクライアントに弾かれる値が
    2 か所あることを実装前に報告し、止まった（頼んだとおりの動き）
- **見込みとの食い違い:** 担当の組み合わせは見込みどおりだが、レビューで
  設計に無かった判断（重複、型）が 2 回出て、3 巡になった。料金の 44% が
  implementer で、同じ会話を再開して直させたので cache_read が積み上がった
- **次に同じ規模の項目をやるなら**
  - サーバが「何をするか」を受ける形に変える項目では、**立てる前に
    「同じ操作が 2 回届いたら」「型の違う値が届いたら」を決めておく。**
    今回はどちらもレビューで初めて出て、1 巡ずつ増えた
  - 2 巡目以降の確認とレビューは、直した部分だけに絞って依頼する
    （今回そうした）。verifier は 3 巡とも実装の不備を見つけていないので、
    2 巡目以降は検証コマンドと壊し方だけの短い依頼にしてよい
  - implementer の会話を 3 回再開すると cache_read が膨らむ。直す量が
    小さい巡は、新しい implementer に報告ファイルを読ませて頼む方が安い
    見込みがある
