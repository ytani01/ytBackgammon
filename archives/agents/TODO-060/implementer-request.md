# TODO-060 実装の依頼（implementer）

## 目的

今の `Board`（`board.js`）と `actions.js` を、**`BoardController`（状態・操作・時計の計算・タイマー）と
`BoardView`（DOM の部品・入力・layout・ドラッグ・演出）に置き換える。** 構成の見直し（第 4 弾）の最後の段階。
あわせて、次の 4 つの挙動だけを変える。

1. Clock のチェックボックスは `set_clock_switch` を送るだけにし、計算も表示も返事の `clock_state` で変える
2. 履歴の返事でも `clock_state` を全部反映する
3. キューブを掴んでいる間に受信しても、手元に残す
4. サーバが返事に `history_flag` を載せるのをやめる

設計は `docs/design-4.md` の「クライアントの構成」（その下の「状態の反映と演出」「入力、ドラッグ、クロック」を含む）、
「変える挙動」、「実装項目の分け方」の 4、「検証と完了条件」。TODO の節は `TODO.md` の TODO-060。
**実装の前に `docs/Developer.md` を読むこと**（順番の縛りなど、テストでは守られない点がある）。

## 対象範囲

- 変えてよい: `src/ytbg/webroot/static/js/` の全体（`board_controller.js` / `board_view.js` を作る。
  `board.js`・`actions.js`・`drag.js` などを消す・移す）、`src/ytbg/server.py`（`history_flag` だけ）、
  `tests/test_on_json.py`（`history_flag` の箇所）、`tests/browser/helper.mjs`、
  `tests/js/`、`docs/Developer.md`、`tools/make-shots.mjs`（`window.board` を触っていれば）
- テストを足す: 新しい `test()` を足すのはよい（既存のファイルに足しても、新しいファイルでもよい）
- **変えない:** 既存の `tests/browser/*.test.mjs` の `test()` の本体（`history_flag` を見ている箇所は除く）、
  サーバの構成（`history_flag` 以外）、`CLAUDE.md`・`TODO.md`・`docs/design-4.md`（main が直す・移す）。
  本体を変えたくなったら、変えずに理由を報告に書く

## やること

1. **変える前に、テストの件数を控える**（`uv run pytest`、`node --test tests/js/`、`node --test tests/browser/` の
   pass の数だけ。一式の lint は要らない）
2. **4 つの挙動のテストを先に足し、今のコードで落ちることを確かめて出力を控える。**
   - Clock のチェックボックス: 返事を止めると（または返事が届く前は）計算も時計の表示も変わらない。
     返事の `sw` でチェックボックスの表示も揃う
   - 履歴の返事（`back1` など）で `clock_state` の `limit` 以外（残り時間・`active`・`sw`）も反映される
   - キューブを掴んだまま `gameinfo` を受信しても、キューブの座標と z が手元に残る
     （`drag.test.mjs` の駒のテストと同じ要領）
   - Python: 返事の `data` に `history_flag` が無い（`tests/test_on_json.py`。546 行目のキーの一覧も直す）
   - ブラウザのテストは helper の関数を通して書く。今の `Board` 向けに helper に足した関数は、
     あとで中身だけ新しい構成に合わせる
3. `board_controller.js` / `board_view.js` を作り、設計のとおりに状態・操作・時計を Controller へ、
   部品・入力・layout・ドラッグ・演出を View へ移す
   - **今の `Board` を Controller と並べて状態の持ち主として残す途中の段階は作らない**
   - **作らないもの:** `BoardModel`、`config.js`、`dispose()` と入力の解除用の関数、`present()` の中間の値、
     判定の無い `plan_*` の関数（`end_turn`・`take`・`cancel_double`・名前・履歴・時計の設定は Controller が直接送る）
   - `effects_for(previous, next, last_op)` は `board_controller.js` の中の関数
   - オープニングの 2 秒後の処理と 200 ms の時計の interval は Controller が持つ。受信のたびに予約し直さない
   - 予測はクロックの基準と演出に触れない。送る順番（move は送ってから予測、free move のダイスと得点は
     予測してから送る）と、free move の駒を予測しないことは今のまま
4. `ui/` の部品から board・Settings・操作の関数への参照を無くす。`BgBase.get_xy()` は座標変換を引数で受ける。
   イベントは要る部品だけ View がつなぐ。`BoardPoint` をやめて `layout.js` の座標計算
   （`checker_geometry(point, index, size)` と当たり判定）にする。Roll ボタンがダイスを持つ形をやめる。
   マウスとタッチの座標変換は今のまま移し、Pointer Events にはしない
5. `log.js` は `new URLSearchParams(location.search).has("debug")` を直接読み、`settings.js` を import しない
6. `actions.js` と今の `Board`、要らなくなった委譲を消す。TODO-059 からの申し送りも片付ける:
   `Board.has_dice()` と `rules/actions.js` の `has_dice` の重複（盤面を読む関数は `rules/position.js` へ）、
   `Board.put_checker()` のためだけに export した `predict_moves()`（使う側が無くなれば export を外す）
7. サーバ（`server.py` の `emit_gameinfo()`）から `history_flag` を消す
8. `tests/browser/helper.mjs` の中を新しい構成に合わせる。`main.js` は `window.board = {controller, view}` を公開する。
   受信の差し替え・予測を外す／失敗させる helper は、`controller` の 1 か所を差し替える形にする
9. `docs/Developer.md` を直す（構成の図・モジュールの表・受信と描画の流れ・ドラッグ・時計の説明など）。
   TODO の番号は書かない

## 注意

- **画像の読み込みを待ってから組み立てる順番（TODO-029、Developer.md にある）は変えない。** テストでは守られない。
  組み立ての順番に触れたら、playwright で画像の応答を遅らせて、駒やボタンの配置（寸法が 0 でない）を実測し、
  その方法と結果を報告に書く
- 変える挙動は上の 4 つだけ。それ以外で挙動が変わりそうなら、変えずに報告に書く
- 移すときに条件式を書き直さない（等号・`>=`・リダブルのプレーヤー番号・`src_y` の比較などをそのまま移す）
- 「掴んでいる状態を外してから Controller を呼ぶ」「押した駒を掴めるか確かめてから先端の駒へ持ち替える」の順番を保つ
- `rules/` が import してよいのは `rules/` の中だけ。Controller は View と送信関数を外から受け取り、DOM なしで動く形にする。
  View と ui は Controller を import しない。import の循環を作らない
- コミットはしない

## 完了条件

- 関係するテストが通る: `node --test tests/js/`、`node --test tests/browser/`（**通して 1 回でよい**。
  途中は関係するファイルだけ）、`uv run pytest tests/test_on_json.py tests/test_ws.py`。
  **検証の一式（pytest 全体・ruff・mypy・basedpyright）は verifier が走らせるので、走らせなくてよい**
- 足した 4 つのテストが、変える前のコードで落ちたことを確かめてある
- テストの件数を、変える前と後で控えてある

## 報告

`archives/agents/TODO-060/implementer-report.md` に、作ったファイルと主なクラス・関数（ファイル:行）、
消したもの、足したテストと変える前に落ちた出力、helper を直した箇所、画像の待ちを確かめた方法と結果（触れた場合）、
テストの件数の前後、走らせた結果、判断が要る点を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
