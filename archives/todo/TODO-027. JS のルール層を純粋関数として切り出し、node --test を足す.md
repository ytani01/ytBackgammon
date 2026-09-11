# TODO-027. JS のルール層を純粋関数として切り出し、node --test を足す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 17,956 | 503,472 | 42% |
| implementer | Opus 5 | medium | 42,515 | 602,289 | 38% |
| reviewer | Opus 5 | high | 25,621 | 131,256 | 14% |
| verifier | Sonnet 5 | medium | 25,423 | 128,270 | 6% |
| 合計 |  |  | 111,515 | 1,365,287 | 概算 $23.7 |

- implementer と reviewer は定義のモデルが sonnet。判定の中身を移す
  項目なので Opus 5 に上書きした。effort は定義の frontmatter の値
- TODO-025 以降と同じく **reviewer を先に、verifier を後に**回した
- implementer は 3 回動いている（指摘を直す回が 2 度）

## きっかけ

**ルール計算が全 UI 部品の基底クラス `BgBase` に入っていた。** テキスト表示も
ボタンもチェッカーも、全部それを継承している。判定は
`this.point[p].checkers`（DOM を持つ `Checker` の配列）を見ているため、
盤面だけを渡して呼べない。**JS のテストが 0 件だったのは、ここが
切り離せていないことが大きい。**

TODO-024 の `gameinfo`、TODO-028 の ES Modules 化、TODO-029 の DOM 生成が
済んでから着手した（非モジュールの `ytbg.js` からは `rules/` を
import できないため）。

### 決めたこと

着手時に main が決めた 7 点（移す関数の表、**副作用を外す**こと、
`Position` の形、`rules/` は DOM も `Board` も見ないこと）と、
implementer・reviewer の「判断が要る点」への答えは
[`archives/agents/TODO-027/README.md`](../agents/TODO-027/README.md) にある。

## やったこと

- `rules/position.js`（`Position`）、`rules/move.js`（行き先の計算）、
  `rules/judge.js`（盤面の判定）を作った
- **`BgBase` からルール計算が全部消えた。**
  `goal_point()` / `bar_point()` / `calc_dst_point()` / `get_pip()` と、
  `Board` の `pip_count()` / `winner_is()` / `calc_gammon()` / `closeout()`
  を `rules/` へ移した
- **副作用を呼び出し側へ移した。** `pip_count()` の
  `this.pip[player].set()` と、`winner_is()` の `this.resign = -1`。
  **どちらも消さず、どこで行うかだけを移した**（消すと投了の判定が
  何度も走る）
- `tests/js/` を足し、`node --test tests/js/` で走らせる（59 件）。
  `tests/browser/` にも `rules.test.mjs` を足した（32 → 39 件）
- `package.json` に `"type": "module"` を足した
  （`MODULE_TYPELESS_PACKAGE_JSON` の警告が毎回出ていた）

### `Position` は積んだ順の配列にした

設計（`docs/design.md`）は `pt[p] = {player, n}` だったが、
**そのポイントのチェッカーの `player` を積んだ順に並べた配列**にした。

- **free move では 1 つのポイントに両プレーヤーのチェッカーが乗る。**
  `{player, n}` では枚数を分けられず、PIP カウントがずれる
- 今の判定は `checkers[0].player`（いちばん下のチェッカー）を見ている

**`docs/design.md` を実態に合わせて直した。**

### `with_move()` は例外を投げる

`from_p` にそのプレーヤーの駒が無いとき、元の実装は `to_p` に 1 枚積んで
いた（合計 15 → 16）。**TODO-030 で先行実行の予測に使うと盤面が静かに
壊れる**ので、例外を投げる形にした。先行実行は掴んでいる駒を動かすので、
駒が無いのは呼び方の間違い。

## 確かめたこと

`uv run pytest`（211 passed）、`uv run ruff check .`、`uv run mypy src` が
終了コード 0。`node --test tests/js/` が 59 件・**警告 0**、
`node --test tests/browser/` は **3 回続けて 39 pass**。

**reviewer が、新旧の関数に同じ入力を与えて総当たりで突き合わせた**
（報告は [reviewer-report.md](../agents/TODO-027/reviewer-report.md)）。

- **168,618 件を比べて不一致 0。** 移した 8 つの関数すべて
- **`this.resign = -1` は 2 か所とも移せている。** `pip.set()` は
  turn < 0 のとき呼び出しが 4 → 2 回に減るが、値も表示も同じ（実測）
- **`Position` を配列にした判断の裏取り。** free move の混在ポイントを
  ブラウザで作り、配列表現は元と一致、`{player, n}` だと PIP が
  167/206 → 185/149 にずれることを確認
- `rules/` が import しているのは `rules/` の中だけ。`document` /
  `window` / `board` の参照も無い

**verifier が実際に動かして確かめたもの**（報告は
[verifier-report.md](../agents/TODO-027/verifier-report.md)）:

- **変更前（`819a7b2`）を `git worktree` で出して並べ、
  「投了 → 相手の勝ち」の流れとスクリーンショットが完全一致**
- **わざと壊す 5 通りが、いずれも 10 回続けて狙ったテストを落とす**
  （`calc_dst_point()` の向き、`closeout()` の境界、`winner_is()` の
  resign の取り違え、`with_move()` の例外、`pip.set()` へ渡すのをやめる）

## 残ること

- **`this.resign = -1` への復帰を、自然な操作だけでは再現していない。**
  投了の直後は `winner_is()` が呼ばれず `resign >= 0` の分岐に入るので、
  復帰は次に `winner_is()` が呼ばれるとき（チェッカーを動かしたときなど）に
  起きる、と読める。reviewer と verifier はどちらも直接呼び出しで
  確かめており、**変更前と並べた流れの比較では一致している**
- **`tests/js/helper.mjs` の初期配置は `src/ytbg/gameinfo.py` の写し。**
  片方だけ変えても誰も気づかない（`CLAUDE.md` に書いた）
- **`Board.get_dst_points()` / `get_dst_point1()` / `all_inner()` は
  移していない。** これらも行き先の計算で、`Position` があれば移せる。
  TODO-030 か別項目で検討
- **`clicks.test.mjs` の「スコアの ▲ → set_score」はときどき落ちる。**
  この項目とは無関係で、HEAD でも 5 回中 1 回落ちる

## 分担の振り返り

- **reviewer が総当たりで突き合わせた。** main が「可能なら、元の関数と
  新しい関数の両方に同じ入力を与えて突き合わせること」と書いたところ、
  元の実装を `git show` で取り出して 168,618 件を機械的に比べた。
  **「読んで同じ」では、境界の 1 つのずれは見つからない**
- **設計のほうが間違っていた。** `Position` を `{player, n}` にする案は
  TODO-020 で決めたものだが、free move を考えると成り立たない。
  implementer が気づいて報告し、reviewer が実測で裏を取り、
  main が `docs/design.md` を直した。**「設計が正」で押し切らずに
  済んだのは、実装担当に「判断が要る点」を書かせているから**
- **「消すな、移せ」と明示したのが効いた。** `winner_is()` の
  `this.resign = -1` は、純粋関数にするなら消したくなる。だが消すと
  投了の表示が残る。README に「**消してはいけない。どこで行うかを
  移すだけ**」と書いたので、取り違えが起きなかった
- **main の割合が 42% で、TODO-028 の 47%、029 の 44% に続いて高い。**
  指摘の仕分けと文書の書き直しが main に集まる。3 項目続いたので、
  **次に同じ形の項目をやるなら `wording` を入れて文書を分ける**か、
  reviewer に「直し方の案」まで書かせて main は選ぶだけにする
- **次に同じ規模（判定の移し替え）をやるなら、同じ組み方でよい。**
  reviewer への依頼に「**総当たりで突き合わせる**」「**実測で裏を取る**」を
  具体的に書くこと。それが今回の収穫のほぼ全部
