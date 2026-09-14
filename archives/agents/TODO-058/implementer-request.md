# TODO-058 実装の依頼（implementer）

## 目的

TODO-060 で `Board` を `BoardController` と `BoardView` に分ける
（`window.board` は `{controller, view}` になる）。そのとき **`tests/browser/*.test.mjs`
の本体を変えず、`tests/browser/helper.mjs` の中だけを直せば済む**ようにする。
いまの `Board` の形はそのままで、テストが `board` を触る箇所を helper の関数に集める。

設計は `docs/design-4.md`（「クライアントの構成」と「実装項目の分け方」の 2）。
TODO の節は `TODO.md` の TODO-058。

## 対象範囲

- 変えてよい: `tests/browser/*.test.mjs`、`tests/browser/helper.mjs`、`docs/Developer.md` のテストの節
- **`src/` は変えない。** CLAUDE.md は main が直すので触らない

## やること

1. `tests/browser/*.test.mjs` の本体（`page.evaluate()` の中を含む）から、
   `board` への参照（`board.gameinfo`・`board.apply`・`board.load_gameinfo`・
   `board.predict_gameinfo`・`board.drag`・`board.checker`・`board.roll_btn`・
   `board.settings`・`board.pip_count()` など、2026-09-14 時点で約 200 か所）を無くし、
   `helper.mjs` の関数を呼ぶ形にする。`grep -n 'board' tests/browser/*.test.mjs` で
   残りを数えられる（コメントや `open_board` のような名前は除いてよい）
2. helper の関数は **`Board` の形に寄せず、テストが見たいことで名前を付ける。**
   大きく分けて次の 3 種類になるはず
   - 盤面を読む（今の gameinfo、PIP、駒の位置、表示部品の状態など）
   - 受信を差し替える（サーバから届いた盤面を反映させる、`apply` / `load_gameinfo` を包んで観測する）
   - 予測を観測する（`predict_gameinfo` を包む・失敗させる、ドラッグ中かを読む）
   TODO-060 では `board.gameinfo` が `controller` 側、駒やダイスの部品が `view` 側へ
   移る。関数 1 つの中で両方を触らなくて済む切り方にしておくと、あとで直しやすい
3. 1 つの `page.evaluate()` の中で続けて行う必要がある操作（同じタスクの中で
   ドラッグの複数メソッドを呼ぶ、受信と読み取りを同時に行う等）は、その順番と
   同期性を保ったまま helper の 1 関数にする。**テストが見ている意味（何を検出するか）を変えない**
4. 使われなくなる関数や、1 か所でしか使わない薄すぎる関数を無理に増やさない。
   ただし「テスト本体に `board` が残らない」ことを優先する
5. `helper.mjs` の既存の関数（`set_turn()`・`shown_dice()`・`open_board()`）の中の
   `board` はそのままでよい（helper の中なので）
6. `docs/Developer.md` の「テスト」の節に、**テストはページの中の `board` を直接触らず
   `tests/browser/helper.mjs` の関数を通す**ことと、その理由（構成を変えるときに
   helper の中だけを直せば済む）を短く足す。TODO の番号は書かない（Developer.md の規約）

どうしても helper に移せない箇所があれば、残してその理由を報告に書く。

## 完了条件

- `tests/browser/*.test.mjs` の本体に `board` への参照が残っていない（残したものは理由付きで報告）
- `node --test tests/browser/` が全件通る（**1 回走らせればよい**。一式の検証は verifier が行う）
- テストの件数が変わっていない（変える前に件数を控えておくこと）

## 報告

`archives/agents/TODO-058/implementer-report.md` に、足した helper の関数の一覧（名前・何を見るか・
TODO-060 でどちら側に寄せる想定か）、移せなかった箇所、テストの件数の前後、走らせた結果を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
