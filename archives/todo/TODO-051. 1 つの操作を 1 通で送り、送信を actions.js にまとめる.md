# TODO-051. 1 つの操作を 1 通で送り、送信を `actions.js` にまとめる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high → medium | implementer + verifier + reviewer（2 巡） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high → medium | 17,481 | 297,068 | 17% |
| implementer | Opus 5 | medium | 128,994 | 476,869 | 56% |
| reviewer | Opus 5 | high | 64,021 | 357,760 | 21% |
| verifier | Sonnet 5 | medium | 26,480 | 218,909 | 6% |
| 合計 |  |  | 236,976 | 1,350,606 | 概算 $33.6 |

- implementer と reviewer は定義のモデルが sonnet。クライアント全体の
  書き直しと、変更前との操作ごとの照合が要るので Opus 5 に上書きした。
  effort は定義の値（implementer medium、reviewer high）
- verifier は定義のまま（Sonnet 5 / medium）
- main は途中で利用者が effort を medium に下げた
- 集計は `--since` で TODO-050 の決着のコミット（2026-09-13 22:07:08）から切った。
  1 巡目の verifier と reviewer は利用上限で報告を書く前に止まったので、
  その分も入っている

## きっかけ

TODO-049 で決めた構成の見直し（第 3 弾）の 2 つ目。TODO-050 でサーバに
名前付きの操作を足したので、クライアントをそれに乗せ換える。1 つの操作が
何通ものメッセージに分かれ、表示の更新（`apply()`）がサーバへの送信を
起こし、ゲームの進め方が 8 つのモジュールの送信に散らばっていた
（`docs/design.md` の問題 A・B・C）。

## やったこと

- **`actions.js` を作った。** ゲームを進める処理（`roll()` / `click_dice()` /
  `end_turn()` / `drop_checker()` / `move()` / `double()` / `take()` /
  `cancel_double()` / `resign()`）、「押してよいか」の判定
  （`can_pick_checker()` / `can_hold_cube()`）、名前・得点・クロック・設定・
  履歴の操作の送信を並べた。**`emit_msg` を import するのはここだけ。**
  送る値は数に直す。`ui/` の表示部品はマウスの処理と表示だけになった
- **`emit_msg(type, data)` から `history` をなくした。**
- **`Board.set_turn()` と `apply()` から送信をなくした**（勝負がついた
  盤面での `stop_clock`、`emit` / `predict` 引数）。`winner_is()` は
  `resign` を書き換えない。クロックの ON/OFF・持ち時間・投了で別に送っていた
  `stop_clock` 2 通もやめた（サーバが止める）
- **先行実行の `move`:** 予測した盤面に、使った目と使えなくなった目
  （11〜16）も書き込み、そこから `idx`・ダイス・勝ちの点数を求めて 1 通で
  送る。`apply()` のあとで `disable()` する順番の縛りが無くなった。
  予測に失敗したら何も送らない
- **音とダイスの回転を新しい type の `last_op` から決める。** 回転と振る音は
  `roll`、ヒットは `move` の `moves` にバーへの移動があるか、`move` の音は
  `turn` を見ない、手番の音は `opening` / `end_turn`
- **サーバから古い type を消した**（`cube` / `set_turn` / `set_player_clock` /
  `start_clock` / `set_gameinfo`）。`history` を読む処理、`NAMED_TYPES`、
  `Clock.stop_all()` / `set_clock()`、`GameInfo.cube()` / `set_turn()`、
  `CubeData` / `TurnData` / `GameInfoData` / `PlayerClockData` も消した
- **`from_dict()` から `strict` をなくし、キーの欠落は常に `KeyError`。**
  レビューのあとで、渡されたものが dict でないとき（`"board": null` など）も
  入口の `_require_dict()` で `KeyError` にした。これが無いと、壊れた
  保存ファイルで `TypeError` になりサーバが起動しなかった（前は壊れた
  ファイルとして初期配置で始めていた）
- テスト: Python は消えた type の分を削り、サーバのクロックは直接動かす形に
  した。`tests/browser/` はテスト専用の type を使わず、残る type で盤面を
  用意する（`helper.mjs` の `send_msg()` / `set_turn()`）。`clicks.test.mjs` は
  送ったのがその 1 通だけかと `history` が無いことを見る。`last_op.test.mjs` を
  足し、`predict.test.mjs` に使えなくなった目と勝ちの点数を足した。レビューの
  あとで、テイク・リダブル・ダイスを押して手番を渡す操作の送信のテストを足した
- `CLAUDE.md` の「状態と通信」「クロック」「構成」とブラウザのテストの説明を
  直し、消した名前が残っていたコメント（`app.py`、`history.py`、
  `rules/judge.js`、`rules/position.js`）を直した

### 決めたこと

- free move のダイスと得点の ▲▼ は、送る前に手元の値を変える形を残した
  （変えないと、続けて押したとき 1 回ぶん消える）。TODO-052 で写しを消すときは、
  予測した盤面を先に表示してから送る（利用者が決めた。TODO-052 に書いた）
- 壊れた保存ファイル: `LOAD_ERRORS` に `TypeError` を足すのはやめ、
  `from_dict()` の入口で `KeyError` にする（`TypeError` を拾うと、コードの
  書き間違いで読み込みに失敗したときに、起動時の保存で利用者の `.jsonl` を
  上書きしてしまう）
- `opening.test.mjs` で `turn` を 2 に戻すには `new` を使う（`opening` は
  `turn` が 2 以上のときしか受け付けない）

### 見送ったこと

- **`disable_unusable()` を `rules/move.js` へ移す**（レビュー検討 4）。
  `Board` を分ける TODO-053 に書き足した
- **サーバを更新したとき、開いたままのタブは古い type を送り続ける**
  （レビュー検討 5）。コードの不具合ではない。更新したら開いているタブを
  読み込み直すこと
- **`"score": 5` のように list であるべき所が list でないファイルは、
  起動に失敗する。** 変更前から同じで、起動に失敗する方がファイルは
  上書きされずに残る（2 回目のレビューで放っておいてよいとされた）
- `rules/judge.js` の `winner_is()` が返す `by_resign` は、使っているのが
  テストだけになった。コメントにそう書き、戻り値は残した
- **プレーヤー 1 の画面からのテイク・リダブルと、`drag_cube()` が固定の
  0.5 秒で待つこと**（2 回目のレビューの検討）。テストの穴として残す

## 確かめたこと

- `uv run pytest` 291 件、`ruff` / `mypy src` / `basedpyright` の指摘 0、
  `node --test tests/js/` 99 件、`node --test tests/browser/` 81 件
  （2 巡目の実装者と確認担当が 1 回ずつ走らせた）
- わざと壊して落ちること: 実装者が 1 巡目 22 通り、2 巡目 5 通り。
  確認担当も別の壊し方を 1 巡目 3 通り、2 巡目 2 通り試した
- 手元の保存ファイル 5 つ（`~/ytbg-*.jsonl`）を、コピーで読めることを確かめた
- 変更前（`git show HEAD`）と新しい操作で、オープニング・振る・動かす・パス・
  手番を渡す・キューブ・投了・free move・名前・得点・クロック・メニューの
  進み方が変わっていないことを、レビュー担当がコードで照らし合わせた

## 残ること

- **取り消し（`cancel_double`）に、画面からたどり着けないように見える**
  （レビュー検討 7）。未テイクのキューブは受けた側に置かれ、掛けた側は
  掴めない。変更前から同じ判定で、ブラウザでは確かめていない
- `docs/Developer.md` に古い `emit_msg` / `set_turn` などの説明が残っている
  （TODO-055 で直す）

## 分担の振り返り

- **各担当が見つけたこと**
  - implementer（1 巡目）: 壊れたファイルで起動に失敗することと、free move の
    続けて押す場面を、自分で「迷って決めたこと」「残る懸念」に挙げた
  - reviewer（1 巡目）: 管理者が足した `TypeError` がコメントと逆で、書き間違いを
    握りつぶして保存ファイルを上書きする危険、テイク・リダブル・手番を渡す操作の
    送信にテストが無いこと、消した名前が残るコメント 4 か所、`disable_unusable()` の
    置き場所、`cancel_double` にたどり着けないこと
  - reviewer（2 巡目）: 入口の確かめで起動失敗から「空で始まる」に変わった
    ケースを HEAD と並べて実測。要修正は無し
  - verifier: 2 巡とも検証は通り、実装の不備は見つけていない
- **見込みとの食い違い:** 担当は見込みどおり。1 巡目の確認とレビューが
  利用上限で止まり、走らせ直した分が余計にかかった。料金の 56% が implementer で、
  クライアント全体の書き直しとブラウザのテスト（1 回で数分）を何度も
  走らせたことによる
- **次に同じ規模の項目をやるなら**
  - **管理者が「1 行だけ」と自分で直さない。** 今回 `TypeError` を足した 1 行が、
    要修正の 1 件目になった。直すなら implementer に頼み、レビューを通す
  - 2 巡目の implementer を新しく起動して報告ファイルを読ませる形は、
    TODO-050 の再開より安く済んだ（2 巡目は output 約 8 万）。続ける
  - verifier は 4 項目続けて実装の不備を見つけていない。2 巡目以降は
    検証コマンドと壊し方だけに絞る依頼を続けてよい
  - 利用上限に近いときは、確認とレビューを同時に走らせず 1 つずつにする
    （同時に止まると両方やり直しになる）
