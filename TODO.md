# TODO

**残っている項目: TODO-043〜048。** これまでに 42 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-049` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、これで全部終わった。**
手元の 4 つのボードは 2026-09-12 に `.jsonl` へ移行済み
（旧 `.json` も消さずに残してある）。

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果（15 件）は、
TODO-037（削除）・038（集約）・039（標準機能への置き換え）として
すべて片付いた。

---

## TODO-043. JS のルール層に合法手の判定を移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `rules/move.js` に 5 つの純粋関数を足す
- [ ] 呼び出し元を薄い包みにする
- [ ] `tests/js/move.test.mjs` にベアオフ・バーからの復帰・ゾロ目・使えないダイスのテストを足す

**受け取るのは `Position` と数値だけ。** `Board` も DOM も見ない。

| 関数 | 引数 | 返り値 | 今どこにあるか |
|------|------|--------|----------------|
| `all_inner` | `(pos, player)` | `boolean` | `Board.all_inner()` |
| `dst_point` | `(pos, player, src_p, dice_val)` | `number \| undefined` | `Board.get_dst_point1()` |
| `dst_points` | `(pos, player, src_p, dice_vals)` | `number[]` | `Board.get_dst_points()` |
| `usable_dice` | `(pos, player, dice_vals)` | `boolean[]` | `RollButton.check_disable()` の判定部分 |
| `dice_for_move` | `(player, active_dice, from_p, to_p)` | `number[]` | `Checker.dice_check()` |

- `Board.all_inner()` / `get_dst_point1()` / `get_dst_points()` は、
  `this.position()` を渡して呼ぶだけの薄い包みにする（`Board.pip_count()` と
  同じ形）。**消さない。** `tests/browser/rules.test.mjs` が
  `board.get_dst_points()` を呼んでいる
- `RollButton.check_disable()` は `usable_dice()` の結果を見て
  `this.dice[i].disable()` を呼ぶだけにする。**表示を変えるのは今までどおり
  `RollButton` の側**
- `all_inner()` の判定の境目は今と同じ。player 0 は 0〜6（ゴールの 0 を
  含む）、player 1 は 19〜25。バー（26・27）はインナーではない
- `dice_for_move()` だけは `Position` を受け取らない（引き算とダイスの
  突き合わせしかしていない）。ベアオフで「該当する目が無ければ大きい方を
  使う」枝は、移動できるかを呼ぶ側が確かめ済みという前提のまま

**ここが今回の主目的。** ベアオフ、バーからの復帰、ゾロ目、使えない
ダイスの判定に、今はテストが 1 件も無い。

---

## TODO-044. 盤面の状態を `gameinfo` 1 つにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

- [ ] `Board.position()` を `Position.from_gameinfo()` にする
- [ ] `BoardPoint.checkers` を捨てる
- [ ] `Board.checkers_at()` / `top_checker()` を足し、呼び出し元を直す

- `BoardPoint.add()` から `this.checkers.push(ch)` と
  `ch.cur_point = this.idx` を外し、**座標を決めて動かすだけ**にする
- 「そのポイントの駒」を引く口を `Board` に 1 つ作る

  | メソッド | 返り値 |
  |----------|--------|
  | `Board.checkers_at(p)` | `Checker[]`（積んだ順） |
  | `Board.top_checker(p)` | `Checker \| undefined` |

  `this.checker[player][i]` を `cur_point` で絞り、`gameinfo` の `idx` で
  並べる。**「ポイントの先端の駒を掴む」は表示の話**なので、今と同じ駒が
  返るようにする（`Position.with_move()` とは混在ポイントで食い違うが、
  それは TODO-027 で分かっていること）
- 書き換える呼び出し元は `ui/checker.js`（掴む駒の決定、ヒット判定）、
  `ui/dice.js`、`board.js`（`apply()` の配り直し）

**今回いちばん危ない項目。** ヒットの `idx` の数え方が変わるので、
`tests/browser/predict.test.mjs` が効く。**TODO-043 のあとに行う**
（ルール層が `Position` を受け取る形になっていないと `checkers` を消せない）。

---

## TODO-045. `Checker.on_mouse_up_xy()` を分ける

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- [ ] 150 行を 3 つに分け、`on_mouse_up_xy()` は順に呼ぶだけにする

| メソッド | すること | 返り値 |
|----------|----------|--------|
| `decide_dst(ch, drop_p, active_dice)` | 行き先の決定（ワンタッチのときの補完、行けない場所ならキャンセル）とヒット判定 | `{dst_p, hit_ch} \| undefined` |
| `apply_move(ch, dst_p, hit_ch, active_dice)` | 予測（`predict_gameinfo()`）・送信・使ったダイスの消費 | なし |
| `after_move(ch)` | 勝敗・得点・ターンの受け渡し | なし |

**順番の縛りは変えない。**「使ったダイスは `apply()` のあとで
`disable()`」「`dice_check()` は `apply()` より前」は TODO-030 で決まって
いることなので、分けたあとも同じ順で呼ぶ。

**TODO-044 のあとに行う**（ヒット判定と `idx` の数え方が 044 で変わる）。

---

## TODO-046. `Board` のコンストラクタから配置を切り出す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier + reviewer |

- [ ] `layout.js` に座標を返す関数を足し、380 行のコンストラクタから呼ぶ

| 関数 | 返り値 |
|------|--------|
| `point_geometry(bx, by, board_h)` | 28 個ぶんの `{x, y, w, h, direction, max_n}` |
| `score_geometry(bx, by)` | スコアの表示とボタンの `{x, y, w, h}` |
| `label_geometry(bx, by, board_h)` | 名前・クロック・PIP の `{x, y, deg}` |

**移すのは座標の計算だけで、部品を `new` するのは `Board` に残す。**
`layout.js` が `ui/` を import すると、座標の置き場所という今の役割から
外れる。

TODO-043〜045 とは独立なので、途中に割り込ませてよい。

---

## TODO-047. `message.py` の `from_dict` をまとめる

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier |

- [ ] `dataclasses.fields()` を使う mixin を 1 つ置き、13 個のうち 10 個を消す

```python
class _FromDict:
    """data のキーをそのままフィールドに写す from_dict"""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Any:
        return cls(**{f.name: data[f.name] for f in fields(cls)})
```

**mixin は dataclass にしない。** `fields(cls)` はサブクラスに対して
呼べばよく、基底を dataclass にすると継承の規則を気にすることになる。

残すのは 3 つ。

| 残す `from_dict` | 理由 |
|------------------|------|
| `GameInfoData` | `data` 全体を 1 つのフィールドに入れる（キー名で写せない） |
| `DiceData` | `list(data['dice'])` でコピーする |
| `PlayerClockData` | `list(data['clock'])` でコピーする |

`NoData` はフィールドが無いので mixin のままで `cls()` になる。約 60 行減る。
分岐は変わらないので、レビューの担当は入れない。

---

## TODO-048. 小さいものをまとめて直す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier + reviewer |

- [ ] 下の 6 つを直す

| 直すもの | 場所 |
|----------|------|
| `?debug` のときだけ `log()` を出す（既定では出さない） | `log.js`、`settings.js` に `get_debug_query()` を足す |
| `ScoreButton` の `player` 引数が呼び出し 4 か所とも 0 で、使っていない | `ui/button.js`、`board.js` |
| `PlayerScore.on_mouse_down_xy()` と `ScoreButton.on_mouse_down_xy()` が同じことをしている | `ui/label.js` 側を消す |
| `Dice.set()` が `this.image_el` を持っているのに `this.el.children[0]` を触っている | `ui/dice.js` |
| `RollButton.roll()` の `let dice = [0,0,0,0]` と `const modified = ...` が未使用 | `ui/dice.js` |
| `<html lang="jp">` | `index.html`（`ja` が正しい） |

**最後にやる。** 触るファイルが他の項目と重なるので、差分に無関係な修正が
混ざらないようにする。

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-042.** モジュール構成とクラス構成を見直す（第 2 弾）](archives/todo/TODO-042.%20モジュール構成とクラス構成を見直す（第%202%20弾）.md)
- [**TODO-041.** 先手決めの自動クリックが `this` を取り違えている](archives/todo/TODO-041.%20先手決めの自動クリックが%20%60this%60%20を取り違えている.md)
- [**TODO-038.** 同じ形の繰り返しをまとめる](archives/todo/TODO-038.%20同じ形の繰り返しをまとめる.md)
- [**TODO-039.** 手書きを標準機能に置き換える](archives/todo/TODO-039.%20手書きを標準機能に置き換える.md)
- [**TODO-037.** 呼ばれていないコードを消す](archives/todo/TODO-037.%20呼ばれていないコードを消す.md)
- [**TODO-040.** `-i` の既定値に対応するディレクトリが無い](archives/todo/TODO-040.%20%60-i%60%20の既定値に対応するディレクトリが無い.md)
- [**TODO-036.** README と docs/ の日本語を見直す](archives/todo/TODO-036.%20README%20と%20docs_%20の日本語を見直す.md)
- [**TODO-031.** 旧形式（~/ytbg-{server_id}.json）の読み込みを消す](archives/todo/TODO-031.%20旧形式（~_ytbg-{server_id}.json）の読み込みを消す.md)
- [**TODO-033.** README.md,とドキュメント類を整備](archives/todo/TODO-033.%20README.md,とドキュメント類を整備.md)
- [**TODO-032.** history フラグの付け方を見直す](archives/todo/TODO-032.%20history%20フラグの付け方を見直す.md)
- [**TODO-035.** LICENSE を置き、ファイル先頭の表記を揃える](archives/todo/TODO-035.%20LICENSE%20を置き、ファイル先頭の表記を揃える.md)
- [**TODO-034.** basedpyright の型チェックの水準を揃える](archives/todo/TODO-034.%20basedpyright%20の型チェックの水準を揃える.md)
- [**TODO-030.** 表示更新の経路を 1 本にする](archives/todo/TODO-030.%20表示更新の経路を%201%20本にする.md)
- [**TODO-027.** JS のルール層を純粋関数として切り出し、node --test を足す](archives/todo/TODO-027.%20JS%20のルール層を純粋関数として切り出し、node%20--test%20を足す.md)
- [**TODO-029.** DOM 生成を JS へ移し、onClick 属性をやめる](archives/todo/TODO-029.%20DOM%20生成を%20JS%20へ移し、onClick%20属性をやめる.md)
- [**TODO-028.** JS を ES Modules に分割し、継承階層を組み直す](archives/todo/TODO-028.%20JS%20を%20ES%20Modules%20に分割し、継承階層を組み直す.md)
- [**TODO-026.** メッセージを型付けし、on_json をディスパッチ表にする](archives/todo/TODO-026.%20メッセージを型付けし、on_json%20をディスパッチ表にする.md)
- [**TODO-025.** サーバを分割する（hub / history / storage / replay / app）](archives/todo/TODO-025.%20サーバを分割する（hub%20_%20history%20_%20storage%20_%20replay%20_%20app）.md)
- [**TODO-024.** gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す](archives/todo/TODO-024.%20gameinfo%20を%20dataclass%20にし、クロックを外し、保存を%20JSON%20Lines%20へ移す.md)
- [**TODO-022.** favicon が無く、初回ロードで 404 になる](archives/todo/TODO-022.%20favicon%20が無く、初回ロードで%20404%20になる.md)
- [**TODO-023.** デッドコードを消す](archives/todo/TODO-023.%20デッドコードを消す.md)
- [**TODO-021.** ブラウザでの動作確認の仕組みを作る](archives/todo/TODO-021.%20ブラウザでの動作確認の仕組みを作る.md)
- [**TODO-020.** モジュール構成とクラス構成を見直す](archives/todo/TODO-020.%20モジュール構成とクラス構成を見直す.md)
- [**TODO-019.** 履歴を削除する機能をメニューから使えるようにする](archives/todo/TODO-019.%20履歴を削除する機能をメニューから使えるようにする.md)
- [**TODO-018.** _history が上限なく伸び続ける（対応しない）](archives/todo/TODO-018.%20_history%20が上限なく伸び続ける.md)
- [**TODO-015.** サーバからの受信を gameinfo 1 本にまとめる](archives/todo/TODO-015.%20サーバからの受信を%20gameinfo%201%20本にまとめる.md)
- [**TODO-004.** save_data() のファイル I/O がイベントループを止める（対応しない）](archives/todo/TODO-004.%20save_data()%20のファイル%20I_O%20がイベントループを止める.md)
- [**TODO-017.** load_gameinfo() が毎回チェッカーを全部置き直す](archives/todo/TODO-017.%20load_gameinfo()%20が毎回チェッカーを全部置き直す.md)
- [**TODO-016.** 再接続するとクロックの動作中／停止中が復元されない](archives/todo/TODO-016.%20再接続するとクロックの動作中／停止中が復元されない.md)
- [**TODO-010.** プロトコルを一方向にするか決める](archives/todo/TODO-010.%20プロトコルを一方向にするか決める.md)
- [**TODO-009.** Flask + gevent から Starlette + uvicorn へ移す](archives/todo/TODO-009.%20Flask%20+%20gevent%20から%20Starlette%20+%20uvicorn%20へ移す.md)
- [**TODO-014.** バージョンを git tag に連動させる](archives/todo/TODO-014.%20バージョンを%20git%20tag%20に連動させる.md)
- [**TODO-013.** on_json の分岐ごとのテストを足す](archives/todo/TODO-013.%20on_json%20の分岐ごとのテストを足す.md)
- [**TODO-012.** on_json のクロック系の分岐を消す](archives/todo/TODO-012.%20on_json%20のクロック系の分岐を消す.md)
- [**TODO-007.** board.roll が使われていない](archives/todo/TODO-007.%20board.roll%20が使われていない.md)
- [**TODO-011.** ruff の指摘を解消する](archives/todo/TODO-011.%20ruff%20の指摘を解消する.md)
- [**TODO-008.** app_top() と top.html を消す](archives/todo/TODO-008.%20app_top()%20と%20top.html%20を消す.md)
- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
