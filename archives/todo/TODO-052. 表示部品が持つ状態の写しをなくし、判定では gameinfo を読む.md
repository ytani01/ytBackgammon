# TODO-052. 表示部品が持つ状態の写しをなくし、判定では `gameinfo` を読む

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort medium | implementer + verifier + reviewer（2 巡。2 巡目はレビューなし） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 9,218 | 21,613 | 24% |
| implementer | Opus 5 | medium | 50,787 | 240,825 | 47% |
| reviewer | Opus 5 | high | 28,383 | 121,724 | 21% |
| verifier | Sonnet 5 | medium | 14,721 | 128,923 | 8% |
| 合計 |  |  | 103,109 | 513,085 | 概算 $11.6 |

- implementer と reviewer は定義のモデルが sonnet。判定の読み先を変える実装と、
  変更前との照合が要るので Opus 5 に上書きした。effort は定義の値
- verifier は定義のまま（Sonnet 5 / medium）
- 集計は `--since` で TODO-051 の決着のコミットから切った

## きっかけ

TODO-049 で決めた構成の見直し（第 3 弾）の 3 つ目。盤面の状態が `gameinfo` の
ほかにも表示部品に残っていて、判定がそちらを読んでいた（`docs/design.md` の問題 D）。

## やったこと

- **写しを消した。** `Board.turn` / `resign`、`Cube.value` / `accepted` / `player`、
  `PlayerScore.score`、`Dice.value`、`RollButton.dice_active`。これらを読むだけだった
  `RollButton.get()` / `get_active_dice()` / `another()` も消した
- **判定は `board.gameinfo` を読む。** `actions.js` の `roll()` / `click_dice()` /
  `can_pick_checker()` / `can_hold_cube()` / `double()` / `resign()` / `score_up()` /
  `score_clear()`、`Board.set_turn()` / `winner_is()`、`Cube.on_mouse_up_xy()`、
  `RollButton.update()`。`Board` に `get_active_dice(player)` と `has_dice(player)` を足した
- **`gameinfo` が届く前は、盤面を読む操作（ロール、ダイス、チェッカー、キューブ、
  投了、得点）は何もしない。** 名前・クロック・履歴の操作は `gameinfo` を読まないので送る
- **free move のダイスと得点の ▲▼ も先行実行にした**（TODO-051 のときに利用者が決めた）。
  `gameinfo` を複製して値を変え、`apply()` で表示してから送る。返事の前に 2 回押しても
  2 回ぶん効く
- 表示部品（`Cube.set()`、`Dice.set()`、`PlayerScore.set()`）は引数だけで表示を作る
- `can_hold_cube()` の、手前の判定で必ず弾かれて通らない条件を外した
- テスト: `helper.mjs` に `shown_dice()`（画面に出ているダイスの目を要素から読む）を足し、
  消した属性を読んでいたところを `gameinfo` か `shown_dice()` に置き換えた。
  `clicks.test.mjs` に「▲ を返事の前に 2 回押す」「free move のダイスを返事の前に 2 回押す」
  「ダイスが出ているときにキューブを動かしても何も送らない」「`gameinfo` が届く前に
  キューブ・▲・Roll を押しても何も送らない」（`page.routeWebSocket()` で止める）を足した
- `CLAUDE.md` の説明を直した。予測の土台は、先行実行の `apply()` で置き換わった
  `this.gameinfo`（前の予測）になること、続けて押したときの限界、Roll ボタンが
  もう一度出ることを書いた

### 見送ったこと

- **続けて押す途中で前の返事が届くと、1 回ぶん消える**（レビュー検討 2）。
  `set_score` と `dice` は値そのものを送るため。変更前と同じで、直すには送った操作を
  覚えておく仕組みが要る。`CLAUDE.md` に限界として書いた
- **▲ や free move のダイスの先行実行で、Roll を押した直後に Roll ボタンがもう一度出る**
  （レビュー検討 5）。返事の前に Roll → ▲ → Roll と押すと、目が振り直される。
  他のクライアントの操作でも起きる。`CLAUDE.md` に 1 行書いた
- **切断中に ▲ やダイスを押すと、送っていない値が画面に残る**（レビュー検討 6）。
  つなぎ直すと戻る
- `gameinfo` が届く前のテストで押しているのはキューブ・▲・Roll だけで、
  ダイス・チェッカー・投了・▼ は見ていない。`cancel_double` のクリックのテストも無い（以前から）
- `copy_gameinfo()` と `predict_gameinfo()` の複製の重なりは TODO-053 に回した

## 確かめたこと

- verifier（2 巡目）が一式を 1 回: `uv run pytest`、`ruff`、`mypy src`、`basedpyright`、
  `node --test tests/js/`、`node --test tests/browser/`。すべて通った
- 消した属性の読み書きが `src/`・`tests/`・`CLAUDE.md` に残っていないことを `git grep` で確かめた
- わざと壊して落ちること: 1 巡目の確認で 3 通りのうち 2 通り（`gameinfo` 未到着のガード、
  `can_hold_cube()` のダイスの判定）が落ちず、テストの穴と分かった。2 巡目でテストを
  足し、実装者が 4 通り、確認担当が同じ 2 通りで落ちることを確かめた
- 変更前（`HEAD`）と並べて、ロール・ダイスのクリック・チェッカー・キューブ・投了・
  得点・パスと勝ちのバナー・表示が同じ結果になることを、レビュー担当がコードで照らし合わせた

## 分担の振り返り

- **各担当が見つけたこと**
  - reviewer: `CLAUDE.md` の予測の土台の説明の誤り、続けて押したときの限界、
    「何も操作できない」が実装より広いこと、`page.routeWebSocket()` で届く前のテストが
    書けること、Roll ボタンがもう一度出る場面
  - verifier（1 巡目）: 壊しても落ちないテストの穴 2 つを、実装者の自己申告どおりと確かめた
  - implementer: テストの穴 2 つを自分で報告していた
- **見込みとの食い違い:** 担当は見込みどおり。2 巡目は文書とテストが中心だったので
  レビューを省いた。料金は TODO-050（$27.6）・051（$33.6）より小さく $11.6。
  変える範囲が狭かったことと、一式を verifier だけにしたことによる
- **次に同じ規模の項目をやるなら**
  - implementer に「テストで押さえられていない判定」を報告させると、verifier の
    壊し方をそこへ向けられる。今回はそれで穴 2 つが 1 巡で埋まった。続ける
  - 2 巡目が文書とテストだけなら、レビューを省いて verifier に文書と実装の一致も
    見させる形で足りた
