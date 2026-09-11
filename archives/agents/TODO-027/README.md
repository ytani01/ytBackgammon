# TODO-027 の分担

JS のルール層を純粋関数として切り出し、`node --test` を足す項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— ルール層の切り出しと、新しいテスト
- **reviewer**（Opus 5 に上書き）— **判定の中身を移す。** 表示の副作用を
  外すときに、判定そのものの意味を変えていないか
- **verifier**（定義のまま Sonnet 5）— `node --test tests/js/` と
  `tests/browser/`、`src/` を壊して落ちること

**reviewer を先に、verifier を後に**回す（TODO-025〜029 と同じ）。

## main が決めたこと（実装の前提）

`docs/design.md` の「Position とルール層」に加えて、着手時に main が
決めた分。**迷ったらここに従う。**

### 1. 移すもの

| 今の場所 | 関数 | 移す先 |
|----------|------|--------|
| `ui/base.js`（`BgBase`） | `goal_point()` / `bar_point()` | `rules/position.js` |
| `ui/base.js`（`BgBase`） | `calc_dst_point()` | `rules/move.js` |
| `ui/base.js`（`BgBase`） | `get_pip()` | `rules/position.js` |
| `board.js` | `pip_count()` | `rules/judge.js` |
| `board.js` | `winner_is()` / `calc_gammon()` | `rules/judge.js` |
| `board.js` | `closeout()` | `rules/judge.js` |

**`BgBase` からルール計算が全部消えること**がこの項目の眼目。
`ui/checker.js` の `Checker.get_pip()` は `super.get_pip()` を呼んで
いるので、そこも直す。

### 2. 副作用を外す（**いちばん気をつけるところ**）

いまの 2 つは、判定の名前で表示や状態を変えている。
**ルール層は値を返すだけにし、表示と状態の変更は呼んだ側が行う。**

- **`pip_count(player)`** — 末尾の `this.pip[player].set(count)` を外す。
  呼んだ側（`Board`）が、返った値を `this.pip[player].set()` に渡す
- **`winner_is(player)`** — `this.resign == 1 - player` のときに
  **`this.resign = -1` と書き換えている。** ルール層は書き換えず、
  「resign による勝ちかどうか」が呼んだ側に分かる形で返す
  （戻り値の形は任せる。`{score, by_resign}` でも、別の関数に分けても
  よい）。**呼んだ側が `this.resign = -1` を行う**

**`this.resign = -1` を消してはいけない。** 消すと、投了の判定が
何度も走って表示が変わる可能性がある。**どこで行うかを移すだけ。**
呼び出しは `board.js:576`（`set_turn()` の中）と
`ui/checker.js:373` の 2 か所。

### 3. `Position` の作り方

```js
export class Position {
    // pt[p] = { player: 0|1|null, n: 枚数 }   p = 0..27
    static from_gameinfo(gameinfo) { ... }
    owner(p) / count(p)
    with_move(from_p, to_p, player)   // 動かした後の Position を返す
}
```

- **`with_move()` はこの項目で作るが、使うのは TODO-030。**
  テストは書くこと
- **`Position` は変更しない**（`with_move()` は新しい `Position` を返す）

### 4. `rules/` は DOM も `Board` も見ない

`rules/` の関数が受け取ってよいのは `Position` と `player` と出目、
それに `cube` の値のような単純な値だけ。**`import` してよいのは
`rules/` の中と `log.js` だけ**（`log.js` も使わなくて済むなら使わない）。

### 5. テストは `tests/js/`

`node --test tests/js/` で走らせる。`tests/js/*.test.mjs`
（`tests/browser/` と揃える）。**npm パッケージは要らない**
（`node --test` は Node の標準機能）。

`package.json` に走らせ方を足すかどうかは任せる。
**`CLAUDE.md` には、Python / ルール層 / ブラウザの 3 つの走らせ方を書く。**

### 6. 挙動は変えない

**盤面の見え方・操作感・送るメッセージを変えない。**
`tests/browser/` の 32 件を **1 行も変えずに通すこと。**
テストを直したくなったら、それは挙動が変わった印なので、直さずに報告する。

### 7. `Board` の側は最小限だけ直す

ルール層を呼ぶように書き換えるだけ。**表示更新の経路の統合は
TODO-030 なので、`load_gameinfo()` と `put_checker()` の二重実装は
この項目では触らない。**

## 報告

- [implementer-report.md](implementer-report.md)
- [reviewer-report.md](reviewer-report.md)
- [verifier-report.md](verifier-report.md)

## main の判断（あとから追記）

### implementer の判断が要る点

| # | 内容 | main の判断 |
|---|------|-------------|
| 1 | `Position` の内部を設計の `{player, n}` ではなく積んだ順の配列にした | **受け入れる。** free move では 1 ポイントに両プレーヤーの駒が乗るので `{player, n}` では表せない。reviewer が実測で裏を取った（配列は元と一致、`{player, n}` は PIP が 167/206 → 185/149 にずれる）。**`docs/design.md` を実態に合わせて直した** |
| 2 | `BgBase.get_pip()` が引数ではなく `this.player` を見ていた | **受け入れる。** 呼び出しは 1 か所で結果は同じ。移した先では引数を使う |
| 3 | ルール層から `log()` を消した | **受け入れる。** 判定のたびに出ていた |
| 4 | `Board.get_dst_points()` などは移していない | **受け入れる。** README の表に無い。TODO-030 で検討 |
| 5 | `tests/browser/rules.test.mjs` を新しく足した | **受け入れる。** 既存 32 件は free move でルール判定を通らない |
| 6 | `clicks.test.mjs` の「スコアの ▲」がときどき落ちる | **この項目とは無関係**（HEAD でも 5 回中 1 回落ちることを実装担当が確認）。TODO-030 のあとで別項目にするか決める |

### reviewer の指摘

要修正 0 件。検討 7 件のうち 6 件に対応した。

| # | 内容 | main の判断 |
|---|------|-------------|
| 1 | テスト名が中身と逆 | **直した** |
| 2 | `node --test tests/js/` が毎回警告を出す | **直した**（`package.json` に `"type": "module"`。`tests/browser/` / `npm install` / `npm test` / `uv` への影響が無いことを実測） |
| 3 | `tests/browser/rules.test.mjs` が状態を共有し順序に依存 | **直した**（it ごとに前提を作る形に） |
| 4 | `tests/js/helper.mjs` の初期配置が `gameinfo.py` の写し | **`CLAUDE.md` に注意として書いた**（片方だけ変えても気づかない） |
| 5 | `with_move()` の docstring が UI の実態と違う | **直した**（`with_move()` は自分の駒、UI は player を問わず先端。食い違うことも書いた） |
| 6 | `with_move()` が無いはずの駒を生やす（15 → 16） | **例外を投げる形にした。** 先行実行は掴んでいる駒を動かすので、駒が無いのは呼び方の間違い。静かに壊れるより落ちたほうがよい。枚数が 15 のままであることを見るテストも足した |
| 7 | 78 文字超が 1 行 | **直した** |

「好みの範囲」の 2 件は直していない。
