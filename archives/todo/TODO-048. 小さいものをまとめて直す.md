# TODO-048. 小さいものをまとめて直す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier + reviewer |
| 実施 | Opus 5 / effort 既定（high） | reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 17,000 | 29,903 | 77% |
| reviewer | Opus 5 | high | 14,355 | 64,601 | 16% |
| verifier | Sonnet 5 | medium | 6,518 | 57,873 | 6% |
| 合計 |  |  | 37,873 | 152,377 | 概算 $6.2 |

- reviewer は定義の `sonnet` を Opus 5 に上書きした。表から外したところ
  （下の「スコアのクリック」）があり、そこを厳しく見させたかったため
- 順番は reviewer → verifier
- reviewer は起動から報告まで 30 分ほど止まって見えた時間があった
  （ログは進んでいたので待った）。料金には影響していない

## きっかけ

TODO-042 で「触るファイルが他の項目と重なるので最後にやる」とした、
小さい修正の寄せ集め。TODO-043 のレビューで見つかった
`Checker.is_inner()` の未使用を 1 行足して 7 件になった。

## やったこと

| 直したもの | どう直したか |
|------------|--------------|
| `log()` が常に `console.log` へ出る | **`?debug` を付けて開いたときだけ出す。** `settings.js` に `get_debug_query()`（`URLSearchParams.has("debug")`）を足し、`log.js` が読み込み時に 1 度だけ見る |
| `ScoreButton` の `player` 引数が呼び出し 4 か所とも 0 | 引数を消した。`BgBase.get_xy()` は `board` があれば `board.player` を使うので、`ScoreButton.player` はどこからも読まれていなかった |
| `PlayerScore` と `ScoreButton` が両方スコアを操作する | 下の「スコアのクリック」 |
| `Dice.set()` が `this.el.children[0]` を触る | `this.image_el` に揃えた（同じ要素） |
| `RollButton.roll()` の未使用変数 | `let dice` と `const modified =` を消した（`check_disable()` の呼び出しは残す） |
| `Checker.is_inner()` が未使用 | 消した |
| `<html lang="jp">` | `ja` にした |

### スコアのクリック（表から外したところ）

表では「`PlayerScore.on_mouse_down_xy()` 側を消す」としていた。
直す前に `document.elementFromPoint()` で 2px 刻みに測ると、**数字の要素
（`p0score` / `p1score`）が ▲ ボタンの 73%、▼ ボタンの 44% を覆っていた。**
そこへのクリックは数字の要素が受け、`PlayerScore.on_mouse_down_xy()` が
座標でボタンへ振り分けていた。**表のとおりに消すと ▲ の大半が押せなくなる。**

そこで数字の要素に `pointer-events: none` を付けてクリックを下のボタンへ通し、
そのうえで `PlayerScore.on_mouse_down_xy()` を消した。付けたあとは 4 つの
ボタンとも、範囲の 100% をボタン自身が受ける。スコアを操作する経路は
`ScoreButton` の 1 本になった。

reviewer がブラウザで 0.5px 刻みに比べ、押せる範囲が境界線の上以外は
移す前と同じこと、数字がボタンの外にはみ出した部分は移す前も今も
押しても何も起きないこと、`pointer-events: none` で失われる操作が無いことを
確かめた。

### 文書

`CLAUDE.md` と `docs/Developer.md` に `?debug` と `debug.test.mjs` を足した。
TODO-042 で「実装が全部終わったところで `docs/Developer.md` を直す」と
していたので、ここで TODO-043〜047 の分もまとめて反映した
（クライアントが盤面の状態を `gameinfo` しか持たないこと、
`on_mouse_up_xy()` の 3 段、`layout.js` の役割）。

## 確かめたこと

| 対象 | 結果 |
|------|------|
| `node --test tests/browser/` | 61 件すべて成功 |
| `node --test tests/js/` | 99 件すべて成功 |
| `uv run pytest` | 227 passed |
| `uv run ruff check .` | 指摘なし |

テストを 5 件足した。

- `tests/browser/debug.test.mjs`（新規、3 件）— クエリが無ければ
  `console.log` が 0 件、`?debug` と `?board=2&debug=1` なら出る
- `tests/browser/clicks.test.mjs`（2 件）— ▼ を押すと `set_score` を送る、
  ▲ / ▼ の範囲に押せなくする要素が重なっていない（2px 刻みで全部見る）。
  **▼ を押すテストはそれまで無かった**（reviewer の指摘）

verifier が作業ツリーで 3 通り壊した。

| 壊し方 | 落ちたテスト |
|--------|--------------|
| `pointer-events: none` を消す | ▲ を押す、▼ を押す、重なっていない の 3 件 |
| `log()` を常に出す | 「クエリが無ければ何も出さない」 |
| `get_debug_query()` を常に `false` | 「`?debug` で出る」「他のクエリと並んでいても」の 2 件 |

## 残ること

- `ytbg.html` も `<html lang="jp">` のまま。**TODO-042 で `ytbg.html` は
  今回も対象外と決めている**ので直していない（verifier の報告）
- `debug.test.mjs` の「クエリが無ければ 0 件」は、`log()` 以外から
  `console.log` を呼ぶコードが入ると落ちる。今は無く、入れないのが
  決まりなので、そのときに気づけるほうがよい

## 分担の振り返り

- **reviewer が見つけたもの**: ▼ を押すテストが無いこと（▲ だけでは
  ▼ 側の覆いに気づけない）、`debug.test.mjs` と `CLAUDE.md` に書いた
  理由が実際と違うこと（`open_board()` は `goto()` の前に console を
  つないでいて、貯めるのが `error` だけ）。**表から外したスコアの件は
  0.5px 刻みで実測して裏を取った**
- **verifier が見つけたもの**: `ytbg.html` の `lang="jp"`（対象外）。
  3 通りの壊し方はすべて狙いどおり落ちた
- **見込みとの食い違い**: 担当は見込みどおり（順番だけ reviewer → verifier）。
  **表のとおりに直すと壊れる箇所が 1 つあった。** 設計の段（TODO-042）では
  コードを読んだだけで「同じことをしている」と判断していて、要素が
  重なっていることは見ていなかった
- **次に同じ規模でやるなら**: 寄せ集めの項目でも、**消す前に「本当に
  使われていないか」を画面で測る**。今回は main が着手前に測ったので
  防げたが、手順として決めていなかった。表示部品のイベントを消すときは
  `elementFromPoint()` で重なりを見る
