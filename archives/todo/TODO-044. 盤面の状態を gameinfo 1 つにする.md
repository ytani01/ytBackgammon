# TODO-044. 盤面の状態を `gameinfo` 1 つにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 15,276 | 234,653 | 55% |
| reviewer | Opus 5 | high | 38,019 | 104,372 | 26% |
| implementer | Opus 5 | medium | 13,807 | 87,484 | 14% |
| verifier | Sonnet 5 | medium | 6,135 | 57,678 | 5% |
| 合計 |  |  | 73,237 | 484,187 | 概算 $9.5 |

- implementer と reviewer は、定義のモデル（`sonnet`）を Opus 5 に上書きした。
  TODO-042 で「今回いちばん危ない項目」としていたため
- **1 回目の implementer はセッション上限（rate limit）で落ちた。**
  何も変更しないまま終わったので、同じ依頼で出し直した。集計には
  その分も入っている
- 集計の始点は `--since` で渡した（TODO-043〜048 を 1 つのコミットで
  立てたので、番号で範囲を切れない）

## きっかけ

盤面の状態が 2 つあった。

| どちら | 持ち主 |
|--------|--------|
| 真の状態 | `gameinfo.board.checker[player][i] = [point, idx]` |
| 表示側 | `BoardPoint.checkers`（`Checker` の配列） |

`apply()` が毎回 `checkers` を空にして配り直すので食い違いはしないが、
**同じことを 2 か所で覚えている**ので、片方だけ見て書いたコードが
静かにずれる。

## やったこと

- `BoardPoint` から `checkers` を外した。`add(ch, n, sec)` の `n` が
  積む位置で、`ch.cur_point` の設定も呼び出し側へ移した。
  **`BoardPoint` が持つのは座標の計算だけ**になった
- `Board.checker_order()` を足した。`gameinfo.board.checker` を
  `(player, i)` の順に並べて `idx` で安定ソートする。
  **積み順を決めているのはここだけ**で、`apply()` の配り直しと
  `checkers_at()` の両方がこれを使う
- `Board.checkers_at(p)` / `top_checker(p)` を足した
- `Board.position()` を `Position.from_gameinfo(this.gameinfo)` にした
  （`this.gameinfo` がまだ無いときは空の盤面）
- 呼び出し元（`ui/checker.js` の 3 か所、`emit_put_checker()` の `idx`）を直した

**「今と同じ駒が返る」ことは reviewer がブラウザで実測して確かめた。**
混在ポイント（free move）、同じ `idx` が複数、ドラッグ中、予測した
`gameinfo` を渡した直後の 4 通りで、並びが画面の重なり順（z）と
毎回一致した。

`CLAUDE.md` と `docs/Developer.md` の「`position()` は `this.point[]` から
作る」を直した（TODO-043 でのルール層の関数の追加も一緒に反映した）。

## 確かめたこと

| 対象 | 結果 |
|------|------|
| `node --test tests/browser/` | 55 件すべて成功 |
| `node --test tests/js/` | 99 件すべて成功 |
| `uv run pytest` | 227 passed |
| `uv run ruff check .` / `mypy src` / `basedpyright` | 指摘なし |

**積み順を見るテストが 1 件も無かった。** implementer・verifier・reviewer の
3 者が別々に「`checker_order()` のソートを外しても全件通る」ことを
見つけたので、`tests/browser/board.test.mjs` に 1 件足した
（初期配置では `idx` の順と `(player, i)` の順がたまたま一致するので、
いちばん下といちばん上の `idx` を入れ替えて確かめる）。

足したあとの判別力:

| 壊し方 | 結果 |
|--------|------|
| `checker_order()` のソートを外す | 落ちる |
| `apply()` が積む位置を数えず常に 0 を渡す | 落ちる |
| `top_checker()` が底の駒を返す | 落ちる（3 件） |

## reviewer の指摘への対応

| 指摘 | 対応 |
|------|------|
| 作業ツリーが壊れたまま（verifier の破壊試験中だった） | コミット前に `git diff` で突き合わせ、元に戻っていることを確かめた |
| `CLAUDE.md` と `docs/Developer.md` が `this.point[]` のまま | 直した |
| `predict.test.mjs` の枚数が `gameinfo` から数えた値になり、「配り直しが行われたか」を見なくなった | `cur_point` から数える形に直した（`cur_point` を設定するのは `apply()` だけ）。理由をファイルの冒頭にも書いた |
| 積み順を見るテストが無い | 足した（上記） |
| `checker_order()` が `ch_point[p].length` で回っていて、壊れた `gameinfo` で挙動が変わる | `c < 15` に戻した（変更前と同じ） |
| `rules/position.js` の `from_points()` の docstring が古い | 直した |
| `position()` の空盤面を `new Position()` で作ってもよい（好み） | 変えていない |

## 残ること

- `Board.position()` の「`gameinfo` が `undefined`」のガードは、
  **落としてもテストが落ちない**（そこを通る経路が今は無い）。
  reviewer が呼び出し元を辿って確かめており、ガードは備えとして残した
- `Position.from_gameinfo()` と `Board.checker_order()` は同じ並べ方を
  別々に書いている。`rules/` は DOM も `Board` も見ない決まりなので
  まとめていない
- 空の盤面で `winner_is(0)` が 2（ギャモン勝ち）を返すのは以前からの挙動。
  そこを通る経路は今は無い

## 分担の振り返り

- **implementer が見つけたもの**: 依頼の調査表に無かった呼び出し元
  （`tests/browser/` の 2 ファイルが `point[].checkers` を読んでいた）。
  自分で 2 通り壊して、ソートを外しても落ちないことも報告してきた
- **verifier が見つけたもの**: 指定した 3 通りのうち 2 通りが
  「壊しても落ちない」こと（積む位置を数えない、`position()` のガード）。
  **TODO-043 の振り返りで「壊し方を管理者が決め打ちするのはやめる」と
  書いたが、今回は決め打ちのまま出した。** それでも当たったのは、
  reviewer の報告と突き合わせる材料になったから
- **reviewer が見つけたもの**: いちばん重いのは
  「**作業ツリーが今壊れている**」という指摘。verifier と reviewer を
  並行で走らせたために起きたもので、実害は出なかったが、
  気づかなければバグ 2 つをコミットしていた。ほかに、文書の食い違い、
  テストが見るものが変わった件、`ch_point[p].length` の件。
  **「今と同じ駒が返る」をブラウザで実測して裏を取った**のも
  reviewer だけ
- **見込みとの食い違い**: 担当は見込みどおり。料金は $9.5 で、
  TODO-043（$7.9）より増えた。セッション上限で 1 回やり直したぶんと、
  main が指摘 7 件を直したぶん
- **次に同じ規模でやるなら**: **verifier と reviewer を並行で走らせない。**
  片方がファイルを壊している最中にもう片方が読むので、レビューの対象が
  揺れる。今回は reviewer が気づいて報告したから助かったが、
  **先に reviewer（読むだけ）、そのあと verifier（壊す）**の順にすれば
  起きない。TODO-045 以降はそうする
