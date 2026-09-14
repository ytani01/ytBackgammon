# TODO-058 確認の報告（verifier）

## 結論

検証の一式はすべて通った（終了コード 0）。範囲は指示どおり。helper を壊した 12 通りのうち
10 通りで狙ったテストが落ちた。落ちなかった 2 通りは、自分の壊し方がテストの見ている経路に
届いていなかったもので、壊し方を直すと落ちた（下の表）。テストが弱まったと言える箇所は
見つからなかった。

## 1. 検証の一式

| コマンド | 終了コード | 結果 |
|----------|-----------|------|
| `uv run pytest` | 0 | 292 passed, 1 warning |
| `node --test tests/js/` | 0 | tests 103 / pass 103 / fail 0 |
| `node --test tests/browser/` | 0 | tests 92 / suites 11 / pass 92 / fail 0（1 回、約 59 秒） |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |

ブラウザテストの件数 92 は、実装の報告にある変更前の件数と同じ。

## 2. 範囲

`git status` で変わっているのは次だけ（ほかに未追跡の `archives/agents/TODO-058/`）。

- `docs/Developer.md`
- `tests/browser/` の helper.mjs と board / clicks / debug / drag / last_op / opening /
  player_cookie / predict / rules / settings の各 test.mjs

`git diff --stat src/` と `git status --short src/` は空。`CLAUDE.md` も変わっていない。

## 3. テスト本体に残る board

`grep -nE '(^|[^.\w])board(\.|\[|\))' tests/browser/*.test.mjs` の結果はコメント 4 行だけ。

```
tests/browser/player_cookie.test.mjs:9:// プレーヤー 0 の画面を開き直したときに board.settings.player が "0" のまま残り、
tests/browser/rules.test.mjs:11:// 既存の board.test.mjs / clicks.test.mjs はドラッグを free move で
tests/browser/predict.test.mjs:33:// 既存の board.test.mjs / clicks.test.mjs のドラッグは free move
tests/browser/predict.test.mjs:38:// 見ていることになる。board.checkers_at(p).length は gameinfo を
```

`grep -nw board` まで広げても、残るのは `gameinfo.board`、`?board=2`、cookie 名
`board${id}_player`、画像名 `board-base`、`part_el_ids()` の戻り値のキー `ids.board`、
コメントだけ。

## 4. テストが弱まっていないか（差分を読んだ結果）

assert の削除や条件の緩和は見つからなかった。変わった箇所の見立て:

- `board.test.mjs` の部品の id の照合（74-116 行）: 読み取りを `part_el_ids()` に移し、照合をテスト側で行う。
  組み立てる組は 68 件のままで、`pair_el()` で包んでいた要素 2 種も `el_input?.id` /
  `el_bg?.id` で同じものを見ている
- `board.test.mjs` の積み順（147-170 行）: 読む → apply → `stack()` → apply（戻す）の 3 回に分けた。
  apply はサーバへ送らないので、間に返事は届かない。壊して落ちることも確かめた（下の表）
- `predict.test.mjs` の予測の直後（217-233 行）: 4 回に分けて読む。直前の `record_sent(page, true)`
  で送信を止めているので、返事は届かない。`active_dice` は `judge()` から取るが、
  `judge()` がほかに呼ぶ `position()` / `winner_is()` / `closeout()` / `has_dice()` は、
  `board.js` を読んだかぎり gameinfo を書き換えない
- `predict.test.mjs` の hit の待ち（298-304 行）: 外した `sn` は条件にも assert にも使われていなかった
- `rules.test.mjs` の PIP（88-92 行）: `put_checker` と PIP の読み取りを別の evaluate に分けた。
  サーバへは送らないので、間に返事は届かない。`pip_count()` が表示も更新してから innerHTML を
  読むという順番は元のまま
- `rules.test.mjs` の投了の判定（112 行）: `resign` を読むのが `winner_is()` の直後から
  `judge()` の全部の判定のあとに変わった。どれかの判定が resign を書き換えても落ちるので、
  元より厳しくなっている
- `opening.test.mjs:113-114` と `141-142`: Roll を押すこととダイスの置き換えを別の evaluate に分けた。
  送る順は変わらない。間に往復 1 回ぶんの遅れが入るので、2 秒後の自動クリックに間に合わない
  可能性はゼロではない。ただし何を見ているかは変わらず、今回 1 回走らせた範囲では落ちていない
  （遅れで不安定になるかは、1 回の実行では判断できない）
- `player_cookie.test.mjs:51-68`: 送信を記録する期間が 3 回の evaluate にまたがる。間に余計なメッセージが
  送られたら `deepEqual` で落ちるので、見逃す側ではなく厳しくなる側
- `clicks.test.mjs` の `settle()` / `record_sent()`: 名前を読むことと送ること、送信の包みと
  `record_received_src()` をそれぞれ別の evaluate に分けた。settle は毎回別の src で送って待つので、
  間に届いた返事を記録し損ねても結果は変わらない
- `clicks.test.mjs:759` の `wait_board(p, { received: false })` は元の `board.cube !== undefined`
  の待ちと同じ条件
- `stack()` は `top_checker(point)?.id` なので、先端が無ければ例外ではなく undefined を返す。
  `board.test.mjs` は `tip === 'p000'` を assert するので落ちる。`predict.test.mjs` の
  `tip_of_point6()` では `undefined.slice` が例外になって落ちる。どちらも見逃さない

## 5. 壊して落ちるかの確認

壊すたびに helper.mjs（または drag.js）を控えから戻した。最後に `sha256sum -c` で
2 ファイルが控えと一致することと、`git diff --stat src/` が空であることを確かめた。

| 壊した内容 | 走らせたファイル | 結果 |
|-----------|-----------------|------|
| `gameinfo()` が最初に呼ばれたときの値を返し続ける | drag.test.mjs | 1 件落ちた（キューブの件。`Error: double: timeout. last value={"side":-1,"value":1,"accepted":true}`）。掴んでいる駒の件は落ちなかった。最初に読むのが名前が届く待ちの中なので、届いたあとの値が控えられていた。テストの弱さではなく、壊し方が甘かった |
| `gameinfo()` が `wait_board()` のときの値を返し続ける | opening.test.mjs | 2 件落ちた（先手が決まる件、free move の件） |
| `stack()` の ids を `checker[0][0..4]` の並びにする | board.test.mjs | 「積み順は gameinfo の idx で決まる」が落ちた |
| `apply_gameinfo()` が何もしない | board.test.mjs | 「積み順は gameinfo の idx で決まる」が落ちた（`idx の順に積まれていない`） |
| `effects_of_apply()` が音の名前を貯めない | last_op.test.mjs | 7 件落ちた |
| `judge()` が patch を戻さない | rules.test.mjs | 次の it の beforeEach で 2 件落ちた（`前の it が盤面を戻していない`、`+ resign: 1 - resign: -1`） |
| `record_apply()` が何も貯めない | predict.test.mjs | 5 件落ちた |
| `corrupt_prediction()` が駒を書き換えない | predict.test.mjs | 「予測が外れても、サーバの gameinfo で表示が戻る」だけが落ちた |
| `fail_prediction()` が例外を投げず、本来の予測を返す | predict.test.mjs | 「予測に失敗したら何も送らず、元の位置へ戻す」だけが落ちた |
| `dragging()` の src を今の位置 `[ch.x, ch.y]` にする | drag.test.mjs | 「掴んでいる駒は手元の座標に残る」が落ちた |
| `drop_cube_while_holding_checker()` で `drop_cube` の y を `y0 - dy` にする | drag.test.mjs | **落ちなかった。** `Drag.drop_cube()` は引数ではなくキューブの今の y を使う（drag.js 148 行付近）ので、この引数は結果に効かない。壊し方の問題 |
| 同じ関数で `move_cube` の y を `y0 - dy` にする | drag.test.mjs | キューブの件が落ちた |
| src 側: `Drag.pick_checker()` で `cube_src_y` を上書きする（掴んだ位置をチェッカーとキューブで共有していた頃の不具合を再現） | drag.test.mjs | キューブの件が落ちた |

## 6. Developer.md

`docs/Developer.md` の 440-444 行に足した項目は、今の helper の冒頭のコメントと合っている。
「盤面を読む、届いた盤面を反映させる、予測を差し替える」は helper の区切り
（盤面を読む / 受信を差し替える / 予測を観測する）に対応する。
「返事が届く前に読む必要があるものは、helper の 1 つの関数の中で押して読む」は
`press_n()` / `press_pass_banner()` の実装どおり。TODO の番号は書かれていない。

## 確かめられなかったこと・判断が要る点

- `opening.test.mjs` で evaluate を分けたことで入る往復の遅れが、2 秒の自動クリックに対して
  不安定さを生むかは、1 回の実行では判断できない（依頼どおり 10 回連続は走らせていない）
- テスト名を 6 件変えたこと（`board.settings.xxx` → `settings.xxx` など）の是非は管理者の判断
- `opening.test.mjs` が helper の `set_free_move` を `apply_free_move` という別名で import している。
  `Settings.apply_free_move()` と同じ名前なので紛らわしいが、動作には関係しない
- `record_received_src()` と `record_apply()` は呼ぶたびに包みを重ねる／重ねない、が元の実装を
  そのまま引き継いでいる（`record_received_src()` は重ねる）。今回の変更で変わった点ではない
