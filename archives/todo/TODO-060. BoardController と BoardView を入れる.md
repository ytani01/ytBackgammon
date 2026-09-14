# TODO-060. BoardController と BoardView を入れる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort 確認していない | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 確認していない | 27,819 | 246,966 | 15% |
| implementer | Opus 5 | medium | 147,043 | 1,252,762 | 67% |
| reviewer | Opus 5 | high | 40,078 | 216,101 | 13% |
| verifier | Sonnet 5 | medium | 33,287 | 176,212 | 4% |
| 合計 |  |  | 248,227 | 1,892,041 | 概算 $35.0 |

- implementer は定義のモデルが sonnet。状態の持ち主を替えつつ、ドラッグ・時計・演出の順番を保つ必要があるので Opus 5 に上書きした
- reviewer も定義は sonnet。変更前のコードと突き合わせる量が多いので Opus 5 に上書きした
- verifier は定義どおり Sonnet 5。壊す箇所を依頼で指定した
- main の effort は、着手前に利用者が設定した値を確かめていない
- TODO-057〜061 を 1 つのコミットで立てたので始点が見つからず、集計は `--since '2026-09-15 01:51:00'`（TODO-059 の決着の直後）で切った
- verifier は 1 回目が API の利用上限で止まった。その分も verifier の行に入っている

## きっかけ

TODO-056 で決めた構成の見直し（第 4 弾）の最後の段階。今の `Board` がアプリの状態と表示部品を
一体で持っていたのを、状態・操作・時計の計算を持つ `BoardController` と、DOM の部品・入力・
ドラッグ・演出を持つ `BoardView` に分ける。設計は `archives/docs/design-4.md`
（この項目で `docs/` から移した）。

## やったこと

- `board_controller.js`（`BoardController` と `effects_for()`）と `board_view.js`（`BoardView` と `Drag`）を作り、
  `board.js`・`actions.js`・`drag.js`・`ui/point.js` を消した。`BoardPoint` は `layout.js` の
  `checker_geometry()` / `point_at()` にした
- `ui/` の部品から board・Settings・操作の関数への参照を消した。`BgBase.get_xy()` は座標変換を引数で受け、
  リスナーは押す処理のある部品にだけ View がつなぐ。Roll ボタンはダイスを持たなくなった。
  `ClockLimit` と時計の計算は Controller へ移し、`PlayerClock` は表示だけにした
- `log.js` がクエリを直接読むようにして、`settings.js` との循環を無くした。
  DOM の無い Node で読めるよう `globalThis.location?.search` にした
- `main.js` は `window.board = {controller, view}` を公開する
- `rules/actions.js` の `predict_moves()` の export を外し、使われなくなった `player` を渡さない枝を消した
- 挙動を 4 つ変えた（設計の「変える挙動」）
  - Clock のチェックボックスは `set_clock_switch` を送るだけで、計算も表示も返事の `clock_state` で変わる
  - 履歴の返事でも `clock_state` を全部反映する
  - キューブを掴んでいる間に受信しても、座標と z を手元に残す
  - サーバ（`server.py` の `emit_gameinfo()`）が返事に `history_flag` を載せない
- テストを足した: `tests/browser/clock.test.mjs`（2 件とコンソールエラー）、`drag.test.mjs` の掴んでいるキューブ、
  `last_op.test.mjs` の振ったダイスの傾き、`rules.test.mjs` のパスと勝ちのバナー（2 件）、
  `tests/js/controller.test.mjs`（偽の View を渡した Controller、3 件）。
  `tests/test_on_json.py` は `history_flag` が無いことを見る形にした
- `tests/browser/helper.mjs` の中を新しい構成に合わせ、`shown_clock()`・`hold_received()`・`holding_cube()`・
  `dice_transforms()`・`wait_still()`・`shown_banners()` を足した。既存の `test()` の本体は、古くなったコメントだけを直した
- `docs/Developer.md` と `CLAUDE.md`（テストの節、構成の節、座標の持ち主）を直した

### レビューで見つかって直したもの

- **振ったダイスの傾きが、次の描画で戻らなくなっていた**（変えると決めた 4 つ以外の挙動の変更）。
  変更前は `RollButton.set()` が毎回 `clear()` で角度を 0 に戻していた。分けたときに `clear()` が無くなり、
  プレーヤー 1 のダイスは描画のたびに 180° ずつ回っていた。reviewer が変更前の JS を `page.route()` で
  差し替えて角度を実測して見つけた
- `board_controller.js` が、`log.js` のせいで DOM の無い環境では import できなかった
- `rules.test.mjs` が helper からルール層を直接呼ぶ形になり、`BoardView` がルールを呼ぶ経路を見なくなっていた。
  verifier が `closeout()` と `winner_is()` を壊しても 97 件が 1 件も落ちないことを実測した。
  バナーを画面から読むテストを足した
- 足したキューブのテストは z を戻す行を消しても落ちなかったので、z が決まっていない新しいページで掴む形にした
- そのキューブのテストが、通しの実行で 1 回だけ落ちた。開いた直後はキューブが 0.3 秒かけて定位置へ
  動いていて、途中の座標を読むと掴み損ねる（直後の座標で 3 回とも掴めないことを実測）。動きが終わるのを待つようにした

### 直さなかったもの

- 勝ちの点数は画面に出ないので、バナーのテストでは点数を読んでいない
- `clicks.test.mjs` の `drag_cube()` はキューブの動きを `sleep(500)` で待っている。`wait_still()` に置き換えられるが、変えていない

## 確かめたこと

- verifier が一式を 1 回走らせ、すべて終了コード 0: `uv run pytest`（292）、`uv run ruff check .`、`uv run mypy src`、
  `uv run basedpyright`、`node --test tests/js/`（154 → 156）、`node --test tests/browser/`（92 → 99）
- 足した 4 つの挙動のテストは、変える前のコードで落ちる（implementer）
- verifier が壊して落ちることを見たもの: 送る前に `sw` を書き換える、履歴の返事で `limit` だけ反映する、
  掴んでいるキューブの座標と z を戻す行を消す、ダイスを前回の角度のまま置く、`log.js` を `location.search` に戻す、
  返事に `history_flag` を足す
- バナーのテストは、`closeout()` を常に false、`winner_is()` の点数を 0 にすると、それぞれ落ちる（implementer）
- reviewer が、import の循環が無いこと、`ui/` が gameinfo・Controller・Settings・`rules/` を読まないこと、
  gameinfo・履歴の番号・クロックの基準とタイマーの持ち主が Controller だけ、ドラッグの状態が View だけであることを確かめた
- 画像の読み込みを待ってから組み立てる順番には触れていない（`Settings` を作る場所だけが `wait_images()` のあとの
  `main.js` へ移った）ので、画像の応答を遅らせる実測はしていない

## 分担の振り返り

- **implementer** は、設計どおりに分け、4 つの挙動のテストを先に足して変える前に落ちることを確かめた。
  ダイスを最後に置く理由（回転の transition が消える）やリスナーを絞ったことを自分から報告した。
  ただし `clear()` を無くしたことでダイスの角度が戻らなくなった点には気づかず、足したキューブのテストも z を見られていなかった
- **reviewer** は、変更前の JS をブラウザで差し替えて角度を実測し、テストでは捕まらない挙動の変更を 1 つ見つけた。
  DOM なしで Controller を import できないこと、ルール層とのつながりをテストが見なくなったこと、z のテストの抜けも見つけた。
  料金の 13% で、この項目の品質を決めたのはこの担当
- **verifier** は、壊し方をすべて確かめ、reviewer の「つながりを見なくなった」を実測で裏付けた。
  通しの 1 回目だけ落ちるテストを見つけ、単体で再現しないことまで調べた。1 回目は利用上限で止まり、
  壊した 1 行を戻さないまま終わった（main が戻した）
- 見込みとの食い違いは、実装の往復が 3 巡になったこと。2 巡目はレビューの指摘、3 巡目は verifier が見つけた
  揺らぐテストとテストの抜けで、料金の 67% が implementer に集まった
- 次に同じ規模（状態の持ち主を替え、表示の部品を組み直す）の項目では、同じく implementer と reviewer を Opus 5、
  verifier を Sonnet 5 にする。implementer の依頼には最初から「消したメソッドが毎回していた後始末（角度や z を戻すなど）を
  書き出し、移した先で同じことをしているか確かめる」と「足したテストは、見たい行だけを消して落ちることを確かめる」を書く。
  verifier の依頼には、壊す前に控えを取って `cmp` で戻す手順を最初から書く
- 担当の分け方と報告のファイルは `archives/agents/TODO-060/README.md` にある
