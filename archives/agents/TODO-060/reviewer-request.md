# TODO-060 レビューの依頼（reviewer）

## 目的

`Board`・`actions.js` を `BoardController` / `BoardView` に置き換えた差分が、設計どおりで、
**変えると決めた 4 つ以外の挙動を変えていないか**を見る。コードは直さない。

## 読むもの

- 依頼: `archives/agents/TODO-060/implementer-request.md`
- 実装の報告: `archives/agents/TODO-060/implementer-report.md`
- 設計: `docs/design-4.md`（「クライアントの構成」以下と「変える挙動」「検証と完了条件」）
- 差分: `git diff` と未追跡の `board_controller.js` / `board_view.js` / `tests/browser/clock.test.mjs`。
  消したファイル（`board.js`・`actions.js`・`drag.js`・`ui/point.js`）の変更前は `git show HEAD:<path>` で読む

## 見る観点

1. **設計で決めた 4 つ**
   - rules と Controller が DOM なしで動く（`board_controller.js` が DOM・`document`・`window` を直接触らない。View と送信関数は外から受け取る）
   - ui がゲームの状態や操作の関数を参照しない（`ui/` が gameinfo・Controller・Settings・`rules/` を読まない）
   - import の循環が無い（`log.js` と `settings.js` を含めて、import の関係を実際に辿る）
   - 状態とタイマーの持ち主が 1 つずつ（gameinfo・履歴の番号・クロックの基準は Controller だけ。オープニングと 200 ms のタイマーは Controller だけ。ドラッグの状態は View だけ）
2. **変える前と条件が同じか**。旧 `Board` / `actions.js` / `drag.js` / `ui/*.js` と突き合わせる
   - ドラッグ: 掴めるか確かめてから先端の駒へ持ち替える順、掴んでいる状態を外してから Controller を呼ぶ順、成り立たないときに掴んだ座標へ戻す、駒とキューブの同時ドラッグ
   - キューブを離す条件（`src_y` の比較、最後に描画した位置、境界の等号、リダブルのプレーヤー番号）
   - 送る順番と予測の順番（move は送ってから予測、free move のダイスと得点は予測してから送る、free move の駒は予測しない）、予測がクロックと演出に触れない
   - 演出（音の判定、`roll` で `turn` が -1 のとき演出しない、ダイスの回転）。同じ盤面を描画し直しても音が増えない
   - オープニングの 2 秒後の処理（始める条件、実行時に最新の状態で判断、受信のたびに予約し直さない）
   - キーボードの Roll / Pass が有効なときだけ、の条件
   - マウスとタッチの座標変換、盤面の反転
   - 画像の読み込みを待ってから組み立てる順番（TODO-029）。`Settings` を作る場所が変わった点に問題が無いか
3. **4 つの挙動の変更**が設計どおりか（Clock のチェックボックス、履歴の返事の `clock_state`、掴んでいるキューブ、`history_flag`）。
   足したテストが、その挙動を壊したときに落ちる形になっているか
4. **helper**（`tests/browser/helper.mjs`）: 旧 `Board` 向けと同じ意味を保っているか。特に `pip_count()` が表示を更新しなくなった点、
   `put_checker_local()` が last_op を付けなくなった点、予測を外す／失敗させる helper
5. **作らないと決めたもの**（`BoardModel`、`config.js`、`dispose()` と入力の解除用の関数、`present()` の中間の値、判定の無い `plan_*`）が無いか。
   逆に、使う側が 1 つしか無い層やファイル、呼ばれていない関数・export が残っていないか
6. 実装の報告の「判断した点・判断が要る点」1〜8 のそれぞれに、問題があるか。
   特に 1（`predict_moves()` の export を残した。本体で使わない枝のテストが残る）、3（ダイスを最後に置く）、4（リスナーを付ける部品を絞った）、6（最初の返事の前の時計）
7. `docs/Developer.md` が新しい構成と合っているか（TODO の番号を書かない規約も）。
   CLAUDE.md の「テスト」の節で古くなった記述があれば挙げる（main が直す）

## 注意

- **コードを直さない。作業ツリーを変えない**（テストを走らせるのはよいが、`src/` を壊して試さない。それは verifier が行う）
- 見つけたことは、重さ（直すべき／直した方がよい／好みの範囲）で分けて、ファイル:行と、変える前のどのコードとどう違うかを書く

## 報告

`archives/agents/TODO-060/reviewer-report.md` に、指摘（重さごと）と、問題が無かった観点を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
