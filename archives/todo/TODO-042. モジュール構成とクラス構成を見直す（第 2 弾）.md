# TODO-042. モジュール構成とクラス構成を見直す（第 2 弾）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ |
| 実施 | Opus 5 / effort 既定（high） | main のみ |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 11,609 | 19,812 | 100% |
| 合計 |  |  | 11,609 | 19,812 | 概算 $0.9 |

- TODO-020 と同じ**決めるだけの項目**。確かめるものが無いので `main のみ`
- TODO-041 と同じセッションで進めたので、集計の始点は TODO-041 の
  決着コミットにしてある。**それより前に読んだぶんは TODO-041 に入っている**

## きっかけ

TODO-020 で決めた構成の実装（TODO-023〜030）と、過剰実装の洗い直し
（TODO-037〜039）が終わったので、残りを見直した。

Python 側は整理が進んでいて、新しく立てる項目は `message.py` の 1 つだけ。
**残っているのは JS 側**で、TODO-027（ルール層の切り出し）の積み残しが
固まっている。

| 見つけたもの | 場所 |
|--------------|------|
| 合法手の判定がルール層に入っていない | `Board.get_dst_points()` / `get_dst_point1()` / `all_inner()`、`RollButton.check_disable()`、`Checker.dice_check()` |
| 盤面の状態が 2 つある | `BoardPoint.checkers`（表示）と `gameinfo.board.checker`（真の状態） |
| `Checker.on_mouse_up_xy()` が 150 行 | 行き先の決定・ヒット判定・予測・送信・ダイス消費・勝敗・得点 |
| `Board` が 1,154 行、コンストラクタが 380 行 | 座標が `dom.js` / `Board` / `layout.js` の 3 か所に分かれている |

`rules/move.js` は 33 行で `calc_dst_point()`（引き算するだけ）しか無い。
**ベアオフ、バーからの復帰、ゾロ目、使えないダイスの判定にテストが
1 件も無い**のは、これらが `Board` と `RollButton` から切り離せていないため。

## 相談して決めたこと

| 論点 | 決めたこと |
|------|-----------|
| 範囲 | JS と Python の両方 |
| 盤面の状態 | **表示側の `BoardPoint.checkers` を捨て、`gameinfo` を唯一の状態にする** |
| `Board` のコンストラクタ | 座標計算と部品生成を切り出す |
| `log()` | `?debug` のクエリで切り替える（既定では出さない） |
| 小さい修正 | まとめて 1 項目にする |
| `ytbg.html` | 今回も対象外（TODO-020 と同じ） |
| 座標のレスポンシブ化 | 今回もやらない（TODO-020 と同じ） |
| eslint とバンドラ | 今回も入れない（playwright だけ例外。TODO-020 と同じ） |
| `layout.js` に移すもの | **座標の計算だけ**。部品を `new` するのは `Board` に残す（設計を詰める段で決めた。下の TODO-046 を見ること） |

## 決めた設計

### TODO-043. JS のルール層に合法手の判定を移す

`rules/move.js` に足す。**すべて純粋関数で、受け取るのは `Position` と
数値だけ。** `Board` も DOM も見ない。

| 関数 | 引数 | 返り値 | 今どこにあるか |
|------|------|--------|----------------|
| `all_inner` | `(pos, player)` | `boolean` | `Board.all_inner()` |
| `dst_point` | `(pos, player, src_p, dice_val)` | `number \| undefined` | `Board.get_dst_point1()` |
| `dst_points` | `(pos, player, src_p, dice_vals)` | `number[]` | `Board.get_dst_points()` |
| `usable_dice` | `(pos, player, dice_vals)` | `boolean[]` | `RollButton.check_disable()` の判定部分 |
| `dice_for_move` | `(player, active_dice, from_p, to_p)` | `number[]` | `Checker.dice_check()` |

呼ぶ側:

- `Board.all_inner()` / `get_dst_point1()` / `get_dst_points()` は、
  `this.position()` を渡して呼ぶだけの薄い包みにする（`Board.pip_count()` と
  同じ形）。**消さない。** `tests/browser/rules.test.mjs` が
  `board.get_dst_points()` を呼んでいる
- `RollButton.check_disable()` は `usable_dice()` の結果を見て
  `this.dice[i].disable()` を呼ぶだけにする。**表示を変えるのは今までどおり
  `RollButton` の側**
- `Checker.dice_check()` は `dice_for_move()` を呼ぶだけにする

`all_inner()` は、今は `this.checker[player][i].is_inner()` を 15 個見て
いる。`Position` 版は `pos.points_of(player)` の返すポイントを見る。
判定の境目は今と同じで、player 0 は 0〜6（ゴールの 0 を含む）、
player 1 は 19〜25。バー（26・27）はインナーではない。

`dice_for_move()` だけは `Position` を受け取らない（引き算とダイスの
突き合わせしかしていない）。**ベアオフのときに「該当する目が無ければ
大きい方を使う」という枝があるが、移動できるかどうかは呼ぶ側が
`dst_points()` で確かめ済みという前提は変えない**（今と同じ）。

**`tests/js/move.test.mjs` に足すテスト**（ここが今回の主目的）:

- ベアオフ — ちょうどの目、大きい目での持ち出し、後ろのポイントに
  自分の駒が残っているとき（持ち出せない）
- バーからの復帰 — 相手が 2 枚以上いるポイントには入れない、
  バーに駒がある間は他の駒を動かせない
- ゾロ目 — 2 個・3 個・4 個の足し合わせ
- 使えないダイス — `usable_dice()` が `false` を返す並び

### TODO-044. 盤面の状態を `gameinfo` 1 つにする

- `Board.position()` を `Position.from_gameinfo(this.gameinfo)` にする
- `BoardPoint.checkers` を捨てる。`BoardPoint.add()` から
  `this.checkers.push(ch)` と `ch.cur_point = this.idx` を外し、
  **座標を決めて動かすだけ**にする
- 「そのポイントの駒」を引く口を `Board` に 1 つ作る

  | メソッド | 返り値 |
  |----------|--------|
  | `Board.checkers_at(p)` | `Checker[]`（積んだ順） |
  | `Board.top_checker(p)` | `Checker \| undefined` |

  `this.checker[player][i]` を `cur_point` で絞り、`gameinfo` の `idx` で
  並べる。**「ポイントの先端の駒を掴む」は表示の話**なので、
  今と同じ駒が返るようにする（`Position.with_move()` とは混在ポイントで
  食い違うが、それは TODO-027 で分かっていること）
- 書き換える呼び出し元は `ui/checker.js`（掴む駒の決定、ヒット判定）、
  `ui/dice.js`、`board.js`（`apply()` の配り直し）

**今回いちばん危ない項目。** ヒットの `idx` の数え方が変わるので、
`tests/browser/predict.test.mjs` が効く。

### TODO-045. `Checker.on_mouse_up_xy()` を分ける

150 行を 3 つに分け、`on_mouse_up_xy()` は順に呼ぶだけにする。

| メソッド | すること | 返り値 |
|----------|----------|--------|
| `decide_dst(ch, drop_p, active_dice)` | 行き先の決定（ワンタッチのときの補完、行けない場所ならキャンセル）とヒット判定 | `{dst_p, hit_ch} \| undefined` |
| `apply_move(ch, dst_p, hit_ch, active_dice)` | 予測（`predict_gameinfo()`）・送信・使ったダイスの消費 | なし |
| `after_move(ch)` | 勝敗・得点・ターンの受け渡し | なし |

**順番の縛りは変えない。** 「使ったダイスは `apply()` のあとで
`disable()`」「`dice_check()` は `apply()` より前」は TODO-030 で
決まっていることなので、分けたあとも同じ順で呼ぶ。

### TODO-046. `Board` のコンストラクタから配置を切り出す

`layout.js` に**座標を返す関数だけ**を足す。`BoardPoint` などを
`new` するのは `Board` に残す。

| 関数 | 返り値 |
|------|--------|
| `point_geometry(bx, by, board_h)` | 28 個ぶんの `{x, y, w, h, direction, max_n}` |
| `score_geometry(bx, by)` | スコアの表示とボタンの `{x, y, w, h}` |
| `label_geometry(bx, by, board_h)` | 名前・クロック・PIP の `{x, y, deg}` |

`layout.js` が `ui/` を import すると「座標の置き場所」という役割から
外れるので、**部品の生成は移さない**（TODO-042 に書いた案から変えた）。

### TODO-047. `message.py` の `from_dict` をまとめる

`dataclasses.fields()` を使う mixin を 1 つ置き、13 個ある
`from_dict()` のうち 10 個を消す。

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

`NoData` はフィールドが無いので mixin のままで `cls()` になる。
約 60 行減る。

### TODO-048. 小さいものをまとめて直す

| 直すもの | 場所 |
|----------|------|
| `?debug` のときだけ `log()` を出す（既定では出さない） | `log.js`、`settings.js` に `get_debug_query()` を足す |
| `ScoreButton` の `player` 引数が呼び出し 4 か所とも 0 で、使っていない | `ui/button.js`、`board.js` |
| `PlayerScore.on_mouse_down_xy()` と `ScoreButton.on_mouse_down_xy()` が同じことをしている | `ui/label.js` 側を消す |
| `Dice.set()` が `this.image_el` を持っているのに `this.el.children[0]` を触っている | `ui/dice.js` |
| `RollButton.roll()` の `let dice = [0,0,0,0]` と `const modified = ...` が未使用 | `ui/dice.js` |
| `<html lang="jp">` | `index.html`（`ja` が正しい） |

**最後にやる。** 触るファイルが他の項目と重なるので、差分に無関係な
修正が混ざらないようにする。

### 順番の理由

- **TODO-043 が先頭。** ルール層が `Position` を受け取る形になっていないと、
  TODO-044 で `checkers` を消せない
- **TODO-044 は 043 のあと、045 は 044 のあと。** ヒット判定と `idx` の
  数え方が 044 で変わるので、先に `on_mouse_up_xy()` を分けると二度手間になる
- **TODO-046 と 047 は独立。** 043〜045 の途中に割り込ませてよい
- **TODO-048 が最後**

## 残ること

- 実装は TODO-043〜048。**全部終わったところで `docs/Developer.md` を直す**
  （`docs/design.md` は TODO-033 で archives へ移したので、新しく作らない）
