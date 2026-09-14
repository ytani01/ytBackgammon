# TODO-058. ブラウザテストが `board` を触る箇所を `helper.mjs` に集める

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort medium | implementer + verifier |
| 実施 | Opus 5 / effort medium | implementer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 13,849 | 79,718 | 32% |
| implementer | Opus 5 | medium | 46,757 | 148,292 | 48% |
| verifier | Opus 5 | medium | 15,955 | 92,213 | 21% |
| 合計 |  |  | 76,561 | 320,223 | 概算 $7.3 |

- implementer と verifier は定義のモデルが sonnet。関数の切り方と、テストが
  弱まっていないかの判断が要るので Opus 5 に上書きした。effort は定義の medium
- TODO-057〜061 を 1 つのコミットで立てたので、`--since '2026-09-14 21:25:10'`
  （TODO-057 の決着のコミットの直後）で集計した。main の分には、途中で
  TODO-062 を立てたやり取りが含まれる。集計は決着のコミットの直前まで

## きっかけ

TODO-060 で `Board` を `BoardController` と `BoardView` に分けると、
`window.board` は `{controller, view}` になる。ブラウザテストの本体がページの中の
`board` を直接触っていると、そのときテスト本体を書き換えることになり、
構成の変更とテストの変更が同時に入る。`docs/design-4.md` の「実装項目の分け方」の 2。

## やったこと

- **tests/browser/helper.mjs** — テスト本体から移した操作を関数にした。
  名前は `Board` の形ではなく、テストが見たいことで付けた
  - 盤面を読む: `gameinfo()`・`settings()`・`server_id()`・`checkers()`・
    `stack()`・`dragging()`・`shown_parts()`・`part_el_ids()`・`judge()`・
    `pip_count()`・`dst_points()`
  - 受信を差し替える: `apply_gameinfo()`・`effects_of_apply()`・
    `record_received_src()`・`record_apply()` / `take_applied()`
  - 予測を観測する: `corrupt_prediction()`・`fail_prediction()`・
    `restore_prediction()`
  - 操作: `send_put_checker()`・`put_checker_local()`・`press_part()`・
    `set_free_move()`・`press_pass_banner()`・`press_n()`・`show_banner()` /
    `hide_banner()`・`drop_cube_while_holding_checker()`
  - `open_board()` の待ちを `wait_board()` に切り出した
- **tests/browser/*.test.mjs** — `sound.test.mjs` 以外の 10 本から `board` への
  参照を無くした。残るのはコメント・URL・`gameinfo.board` だけ。
  返事が届く前に読む必要があるもの（`press_n()`・`press_pass_banner()`）と、
  同じタスクで続けて呼ぶ必要があるもの（`drop_cube_while_holding_checker()`）は
  1 つの関数の中にまとめた
- テスト名を 6 件変えた（名前の中の `board.settings.xxx` と `board.position()` から
  `board.` を外した）。利用者の判断で、元に戻さない
- **docs/Developer.md** — テスト本体は `board` を直接触らず helper を通すことと、
  その理由を足した
- **CLAUDE.md** — テストの説明の `board.position()` などを helper の関数に直し、
  helper を通す決まりを足した

`src/` は変えていない。

## 確かめたこと

verifier が一式を 1 回ずつ走らせ、すべて終了コード 0 だった（pytest 292、
tests/js 103、tests/browser 92。ruff・mypy・basedpyright は指摘 0）。
ブラウザテストの件数は変える前と同じ 92。

差分を読み、assert が消えた・条件が緩んだ箇所は無かった。evaluate を分けた箇所は、
間に返事が届かない、または届いても結果が変わらない、あるいは元より厳しくなる、の
いずれかだった。

helper の関数を 12 通り壊し、狙ったテストが落ちることを見た（`gameinfo()`・`stack()`・
`apply_gameinfo()`・`effects_of_apply()`・`judge()` の後始末・`record_apply()`・
`corrupt_prediction()`・`fail_prediction()`・`dragging()`・
`drop_cube_while_holding_checker()`）。落ちなかった 2 通りは壊し方が
テストの経路に届いていなかったもので、壊し方を直すと落ちた。

`opening.test.mjs` は、Roll を押すことと目の置き換えを別の evaluate に分けたので、
その間に往復 1 回ぶんの遅れが入る。自動クリックまでの 2 秒に比べて小さいので、
そのままにした。

## 残ること

- `press_n()` は押した直後に gameinfo と表示の両方を読むので、TODO-060 でも
  1 つの関数の中で controller と view の両方を触る
- `opening.test.mjs` は helper の `set_free_move` を `apply_free_move` という別名で
  import している（ファイルの中に同じ名前の関数があるため）

## 分担の振り返り

- **implementer** は約 200 か所を移し、1 つの evaluate にまとめる必要がある箇所と、
  分けてよい箇所を報告で分けて書いた。TODO-060 でどちら側に寄せるかの想定も付けた
- **verifier** は、evaluate を分けた箇所をそれぞれ読み、弱まった箇所が無いことと、
  `opening.test.mjs` の遅れの懸念を見つけた。自分の壊し方が甘くて落ちなかったものを、
  テストの弱さと取り違えずに壊し方を直して確かめた
- 見込みと食い違いは無い。料金の半分が implementer で、テストファイル 11 本を読んで
  書き換える量に見合っていた
- 次に同じ規模（テスト本体を helper へ移すだけ）の項目では、implementer と verifier を
  どちらも Opus 5 に上書きして組む。verifier の依頼には「落ちなかったら、まず壊し方が
  テストの経路に届いているかを疑う」と最初から書き、壊し直しの往復を減らす
