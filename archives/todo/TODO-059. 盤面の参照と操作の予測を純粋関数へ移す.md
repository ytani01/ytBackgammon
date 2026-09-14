# TODO-059. 盤面の参照と操作の予測を純粋関数へ移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort 確認していない | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 確認していない | 18,191 | 229,384 | 24% |
| implementer | Opus 5 | medium | 65,721 | 563,061 | 52% |
| reviewer | Opus 5 | high | 31,505 | 161,579 | 20% |
| verifier | Sonnet 5 | medium | 10,239 | 68,708 | 4% |
| 合計 |  |  | 125,656 | 1,022,732 | 概算 $16.2 |

- implementer は定義のモデルが sonnet。判定を条件式ごと移し、予測の入口と helper の差し替え先を決める必要があるので Opus 5 に上書きした
- reviewer も定義は sonnet。変更前後の条件を突き合わせる量が多いので Opus 5 に上書きした
- verifier は定義どおり Sonnet 5。壊す箇所を依頼で指定し、判断の要らない確認にした
- main の effort は、着手前に利用者が設定した値を確かめていない
- 立ててから着手まで別の項目が挟まったので、集計は `--since '2026-09-14 22:08:00'` で切った。
  reviewer は途中で API の利用上限に当たって止まり、再開している

## きっかけ

TODO-056 で決めた構成の見直し（第 4 弾）の第 3 段階。TODO-060 で `Board` を
`BoardController` と `BoardView` に分ける前に、盤面の参照と操作の判定・予測を、
ID と盤面データだけで計算する純粋関数にしておく。設計は `docs/design-4.md`。

## やったこと

- `rules/position.js` に `checker_order()` / `checkers_at()` / `active_dice()` / `has_dice()` を足した。
  `Position.from_gameinfo()` も `checker_order()` を使うので、積み順を決めるのは 1 か所になった
- `rules/actions.js` を作り、設計の表の関数（`can_pick_checker`、`decide_dst`、`plan_move`、
  `plan_put_checker`、`plan_roll`、`plan_dice_click`、`can_hold_cube`、`plan_double`、
  `plan_cube_drop`、`plan_resign`、`plan_score`）を置いた。設計の表に無い `predict_moves()` も
  公開した（`Board.put_checker()` が使う。TODO-060 で `Board` が無くなれば外せる）
- `actions.js` は、rules の関数に `board.gameinfo` と ID を渡し、返った message を送り、予測を
  `apply()` するだけにした。送る順番と `parseInt` の位置は変えていない。使われていなかった
  `decide_dst()` / `move()` / `double()` / `take()` / `cancel_double()` の関数は消した
- `Board.predict_gameinfo()` を消し、予測の入口を `Board.plan_move(id, point)` の 1 か所にした。
  `tests/browser/helper.mjs` の `corrupt_prediction()` / `fail_prediction()` / `restore_prediction()` は
  そこを差し替える
- **目が 0 のダイスを 0 のままにした。** `rules/move.js` の `usable_dice()` のバーの分岐が、
  復帰できないときに 1〜6 以外の目も `false` にしていて、`disable_unusable()` が 0 を 10 にしていた。
  1〜6 以外は `true`（関数の説明どおり）にした。roll と move の予測の両方がここを通る
- `tests/js/actions.test.mjs` を足し、`position.test.mjs` / `move.test.mjs` にテストを足した
  （`tests/js/` 103 件 → 154 件）
- `docs/Developer.md` の積み順の持ち主、先行実行、モジュールの表、ルール層の表を直した
- テスト本体（`predict.test.mjs`、`board.test.mjs`）は、古くなったコメントだけを直した

### 直さなかったもの

reviewer が、gameinfo の `checker[p]` が 16 枚以上ある壊れた盤面では、`put_checker` の idx と
ヒットの判定が変わることを実測で見つけた（変更前は `Board.checkers_at()` が 15 枚までしか数えず、
変更後は全部数える）。**直さない。** 変更前から `Position.from_gameinfo()`（全部数える）と
`Board.checkers_at()`（15 枚まで）で数え方が食い違っていて、サーバはそういう盤面を作らない
（壊れた `.jsonl` を読んだときだけ）。15 枚より少ない盤面では、変更前は `TypeError` で止まっていたのが、
止まらずに足りない駒を配り直さない形になった。

## 確かめたこと

- verifier が一式を 1 回走らせ、すべて終了コード 0: `uv run pytest`（292）、`node --test tests/js/`（154）、
  `node --test tests/browser/`（92。件数は変わらない）、`uv run ruff check .`、`uv run mypy src`、
  `uv run basedpyright`
- 0 のダイスのテストは、`usable_dice()` のバーの分岐を変更前に戻すと落ちる（implementer と verifier の両方で確認）
- verifier が壊して落ちることを見たもの: `checker_order()` のソートの向き、予測で渡した gameinfo を
  書き換える、`can_hold_cube()` のダイスの判定、`plan_score()` の上限、helper の `fail_prediction()`
- reviewer が、変更前の判定を純粋関数に書き直して、ランダムな盤面で約 360 万通り突き合わせた。
  違いは目が 0 のダイスだけだった。`rules/actions.js` を 35 通り壊し、落ちなかったうちテストの
  足りなさだった 4 つ（手番の判定、ヒットは相手の駒だけ、`side: 0`、リダブルのプレーヤー番号）は、
  2 巡目でテストを足して落ちるようにした

## 分担の振り返り

- **implementer** は、判定を移すだけでなく、`Board` の 15 枚固定と `Position` の数え方の違い、
  ログが減ること、到達しない経路での挙動の違いを自分から報告に挙げた。ただし「16 枚以上では同じ」は誤りで、
  テストも手番の判定を消しても通るものが混じっていた
- **reviewer** は、変更前後を大量の盤面で突き合わせ、壊し方 35 通りでテストの抜けを 4 つ見つけた。
  implementer の報告の誤り（16 枚以上）も実測で正した。料金の 20% だが、見つけたものの中身が最も大きかった
- **verifier** は一式と、指定した壊し方をすべて確かめた。新しい問題は見つけていない。
  2 巡目のあとに 1 回だけ走らせたので、往復は無かった
- 見込みとの食い違いは、担当の並びを reviewer → verifier にしたこと。verifier が壊して戻す作業と、
  reviewer が作業ツリーを読む作業が重ならないように分けた。料金の半分が implementer で、
  ブラウザテストをバックグラウンドで走らせて止まり、再開の指示が 1 回要った
- 次に同じ規模（判定を条件式ごと別の場所へ移す）の項目では、同じく implementer と reviewer を Opus 5、
  verifier を Sonnet 5 にする。implementer の依頼には最初から「ブラウザテストはフォアグラウンドで
  timeout を伸ばして走らせる」と、「足したテストは、見たい条件だけを壊して落ちることを確かめる」を書く。
  後者があれば、reviewer が見つけたテストの抜けの一部は 1 巡目で埋まり、2 巡目が軽くなる
