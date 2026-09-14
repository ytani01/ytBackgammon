# TODO-053. `Board` からドラッグと設定を切り出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort medium | implementer + verifier + reviewer（2 巡。implementer は 4 回起動） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 10,911 | 362,628 | 34% |
| implementer | Opus 5 | medium | 62,176 | 351,345 | 41% |
| reviewer | Opus 5 | high | 36,561 | 195,137 | 19% |
| verifier | Sonnet 5 | medium | 15,094 | 162,159 | 6% |
| 合計 |  |  | 124,742 | 1,071,269 | 概算 $17.8 |

- implementer と reviewer は定義のモデルが sonnet。複数のモジュールにまたがる
  リファクタリングと、変更前との動きの照合が要るので Opus 5 に上書きした。effort は定義の値
- verifier は定義のまま（Sonnet 5 / medium）
- 集計は `--since` で TODO-052 の決着のコミットから切った。2 巡目の implementer が
  利用上限で止まった分も入っている。main の cache_creation が大きいのは、上限の
  解除を待つあいだに会話の cache が切れて作り直したため

## きっかけ

TODO-049 で決めた構成の見直し（第 3 弾）の 4 つ目。`Board`（約 1,000 行）が表示・
操作・設定をすべて抱え、ドラッグの処理は `Checker` にあるのに状態は
`board.moving_checker` にあった（`docs/design.md` の問題 E）。

## やったこと

- **`drag.js` の `Drag` を作った。** チェッカーとキューブの「掴む・動かす・離す」と、
  掴んでいるもの（`checker` / `cube`）と掴んだ位置を持つ。掴んだ位置は
  チェッカー用とキューブ用で分けて持つ（レビューで、1 組にまとめると free move で
  両方を同時に掴んだときに take / redouble が送られなくなると分かったため）。
  `Checker` と `Cube` のマウスの処理は `board.drag` を呼ぶだけになった
- **行き先の判定と送信は `actions.js`。** キューブを離したときに take / double /
  cancel_double を選ぶ判定も `actions.js` に置いた（設計の「行き先の判定と送信は
  `actions.js` に任せる」に合わせた。最初は `drag.js` にあった）。判定には、以前の
  `Cube` と同じく最後に動かしたキューブの位置（`board.cube.y`）を渡す
- **`settings.js` の `Settings` を作った。** 音の ON/OFF と cookie、free move、PIP を
  表示するか、cookie に保存するプレーヤー番号を持つ。`board.player` は残さず
  `board.settings.player` にした。`PlayerPipCount` もここから読む。クロックの
  ON/OFF と持ち時間の表示は `Board` に残した
- **`?sound` のクエリを読む `set_global_sound_switch(get_sound_query())` は `main.js` で呼ぶ。**
  `settings.js` から `sound.js` の import を外し、`log.js` との循環は
  「トップレベルで `log()` を呼ばない」と注意を書いて残した
- **`disable_unusable()` を `rules/move.js` へ移し、新しい配列を返す形にした。**
  `copy_gameinfo()` は `rules/position.js` に置き、`predict_gameinfo()` の複製とまとめた。
  `board.js` から `actions.js` への import が無くなった
- テスト: `tests/js/` に `disable_unusable()` 3 件と `copy_gameinfo()` 1 件。
  `tests/browser/drag.test.mjs`（ドラッグ中に `gameinfo` が届いても駒が手元に残る、
  キューブとチェッカーを同時に掴む）と `settings.test.mjs`（音の cookie、PIP の
  最初の表示など）を足し、ほかのテストは移した先に合わせた
- `ui/base.js` のクラス階層図と `CLAUDE.md` の構成・テストの説明を直した

### 見送ったこと

- **バーから出られない盤面で、空きの 0 の目が 10 になる**（レビュー検討 4）。
  変更前からの挙動で、表示やサーバで問題になるかは確かめていない
- **同時に掴むテストは `Drag` を直接呼んでいて、`Checker` / `Cube` から `Drag` への
  つなぎは通していない**（2 回目のレビュー検討）。呼び先を `on_mouse_down_xy()` に
  変えれば見られる
- `sound-switch` を押したときに `?sound` を読み直す処理のテストは無い（今は何も変えない）
- `drag.test.mjs` の `sleep(500)` は要らない（2 回目のレビューの好みの範囲）

## 確かめたこと

- verifier（2 巡目）が一式を 1 回: `uv run pytest`、`ruff`、`mypy src`、`basedpyright`、
  `node --test tests/js/`、`node --test tests/browser/`。すべて通った
- 実装者が壊した変更を 1 度戻し損ねたと報告したので、verifier が `src/` の差分に
  壊した跡が残っていないことを読んで確かめた
- わざと壊して落ちること: 1 巡目の確認で 3 通りのうち 2 通り（音の cookie、PIP の最初の
  表示）が落ちずテストの穴と分かり、2 巡目でテストを足して落ちることを確かめた。
  掴んだ位置を 1 組にまとめる壊し方も、足したテストで落ちた
- 変更前（`HEAD`）と並べて、ドラッグ・キューブの判定・設定・プレーヤー番号の cookie・
  盤面の反転が同じ動きになることを、レビュー担当がコードで照らし合わせた

## 分担の振り返り

- **各担当が見つけたこと**
  - reviewer（1 巡目）: 掴んだ位置を 1 組にまとめたことで、free move で同時に掴むと
    take / redouble が送られなくなること（実際に試して確かめた）。import の循環が
    2 つ増えたこと。管理者が書き直した `CLAUDE.md` の誤り
  - verifier（1 巡目）: 壊しても落ちないテストの穴 2 つ
  - implementer: キューブの判定の置き場所と、ドラッグ中の `gameinfo` のテストが無いことを
    自分で「判断が要る点」に挙げた
- **見込みとの食い違い:** 担当は見込みどおり。implementer を 4 回起動した。1 巡目の
  「残りの修正」は、定義で `CLAUDE.md` を触らないことになっていて最初の依頼に
  許可を書かなかったため、2 巡目の 1 回は利用上限で止まったため
- **次に同じ規模の項目をやるなら**
  - **`CLAUDE.md` を直す項目では、最初の依頼に「`CLAUDE.md` のこの節を直してよい」と
    書く。** implementer の定義で触らないことになっているので、書かないと 1 往復増える
  - 設計に「判定は `actions.js`」のような置き場所の決まりがあるときは、依頼にその
    一文を写す。今回はキューブの判定の置き場所で 1 往復した
  - **管理者が `CLAUDE.md` を書き直すときも、コードで確かめてから書く。**
    「ほかの 2 つ」を直したときに `clicks.test.mjs` を free move だと思い込み、
    レビューで誤りと指摘された
