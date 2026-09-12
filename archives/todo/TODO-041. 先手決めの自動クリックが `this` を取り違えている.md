# TODO-041. 先手決めの自動クリックが `this` を取り違えている

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 22,044 | 107,960 | 83% |
| reviewer | Sonnet 5 | high | 7,830 | 59,650 | 9% |
| verifier | Sonnet 5 | medium | 4,628 | 46,286 | 8% |
| 合計 |  |  | 34,502 | 213,896 | 概算 $3.3 |

- reviewer も verifier も `~/.claude/agents/` の定義のまま（どちらも
  `model: sonnet`）。verifier だけ Agent ツールで `sonnet` を指定したが、
  定義と同じなので実質は上書きしていない
- `~/.claude/CLAUDE.md` は「挙動が変わる項目のレビューには Opus」と
  しているが、今回は 2 行の差分だったので上書きしなかった

## きっかけ

`ui/dice.js` の `RollButton.on_mouse_down_xy()` に、先手決めの自動
クリックがある。相手が先に振っていたとき、自分が Roll を押した 2 秒後に
`Dice.on_mouse_down_xy()` を呼ぶ。

```js
const click_dice = this.dice[0].on_mouse_down_xy.bind(this);
```

`Dice` のメソッドを `RollButton` の `this` で呼んでいた。

`Dice.on_mouse_down_xy()` が `this.player` しか読まない枝
（free move でないとき）では、`RollButton.player` と
`Dice.player` が同じ値なので、たまたま正しく動いていた。
free move の枝は `this.value` を読むが、`RollButton` に `value` は
無いので `undefined` になり、`undefined + 1` の `NaN` が
`RollButton.set()` へ渡る。ダイスの値が `NaN` になり、
画像の URL も `dice0NaN.png` になって 404 が出る。

## やったこと

- `src/ytbg/webroot/static/js/ui/dice.js` — `bind(this)` を
  `bind(this.dice[0])` に直した（2 行の置き換え）
- `tests/browser/opening.test.mjs` を新しく作った（3 件）。
  先手決めで両者が振る経路は、これまでブラウザのテストに 1 件も
  無かった

テストの作り方でつまずいた点:

- **ダイスの目は `RollButton.roll()` が乱数で決める。** しかも
  先手決め（`turn >= 2`）では 4 つのうち 1 つだけが、無作為な
  位置に置かれる。`dice[0]` が 0 のままになることがあるので、
  そのままでは判定が揺れる
- 目を決め打ちにするとき、**ローカルに `set()` するだけでは足りない。**
  `roll()` が送ったメッセージへの返事が 2 秒のあいだに届き、
  `Board.apply()` が `gameinfo` の値で上書きしてしまう。
  `emit_dice()` でサーバ経由に置き換え、反映されるまで待ってから
  2 秒を数える

## 確かめたこと

verifier が各 1 回ずつ実行し、すべて通った。

| 対象 | 結果 |
|------|------|
| `node --test tests/browser/` | 54 件すべて成功 |
| `uv run pytest` | 227 passed |
| `node --test tests/js/` | 57 件すべて成功 |
| `uv run ruff check .` | 指摘なし |
| `uv run mypy src` | 指摘なし |
| `uv run basedpyright` | 指摘なし |

**わざと壊して、狙ったテストが落ちることも確かめた。**

- `bind(this.dice[0])` を `bind(this)` に戻す → 「free move でも、
  自動クリックが dice[0] を進める」が落ちた（`[0,0,0,0]` になる）。
  `dice0NaN.png` の 404 で「コンソールエラーが出ていない」も一緒に落ちた。
  free move を通らない 1 件目は落ちない（この不具合の影響を受けないため）
- `setTimeout(click_dice, 2000)` をコメントアウト → 自動クリックに
  依存する 2 件が両方タイムアウトで落ちた

報告は `archives/agents/TODO-041/` にある。

## 分担の振り返り

- **verifier が見つけたもの**: 無し（全件通り、わざと壊したときも
  狙いどおりに落ちた）。壊し方 (a) で「コンソールエラーが出ていない」も
  道連れで落ちることを報告してきたのは、判別力の確認として役に立った
- **reviewer が見つけたもの**: 要修正 0 件。ただし
  「`predict.test.mjs` にある『順序を変えないこと』の注記が
  `opening.test.mjs` に無い」という指摘があり、各 `it` が
  `set_opening()` で状態を置き直すので順序に依存しないことを
  ヘッダのコメントに書き足した。**差分そのものではなく、
  同じ場所の他のファイルとの揃い方を見たので出た指摘**で、
  verifier の観点では出ない
- **見込みとの食い違い**: 担当は見込みどおり。main のモデルだけ
  Sonnet ではなく Opus で走った（切り替えるのは利用者なので、
  見込みの行はそのまま残してある）。料金の 83% を main が占めた。
  main が `dice.js` / `checker.js` / `board.js` / `rules/` を
  読んでテストを書いた分で、ここは分けても総量は減らない
- **次に同じ規模でやるなら**: 2 行の差分にサブエージェント 2 つは
  重い（$3.3 のうち $0.6 が担当分）。ただし verifier の「わざと壊す」
  確認は main では省きがちで、今回も判別力が実際に確かめられた。
  **確認は残し、レビューは差分が数行で済む項目では main が
  `git grep` で同種の取り違えを探すだけにしてよい**（今回の
  reviewer の指摘はテストの書式の揃えで、実害は無かった）
