# TODO-039. 手書きを標準機能に置き換える

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 13,286 | 34,392 | 49% |
| reviewer | Opus 5 | high | 25,580 | 81,868 | 35% |
| implementer | Sonnet 5 | medium | 9,224 | 63,076 | 9% |
| verifier | Sonnet 5 | medium | 8,804 | 56,160 | 7% |
| 合計 |  |  | 56,894 | 235,496 | 概算 $5.7 |

- main のモデルは利用者が Opus 5 のまま着手したので、見込みの Sonnet 5 とは違う
- reviewer は定義のモデルが sonnet。置き換え前後で値が同じかを種類ごとに
  出し切る担当なので Opus 5 に上書きした

## きっかけ

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果のうち、
**標準の機能で置き換えられる手書きのコード**を集めた項目。

## やったこと

### `QueryStringBase` → `URLSearchParams`

`settings.js` の手書きのクエリパーサ（約 40 行）を消し、
`get_sound_query()` の 3 行にした。実際に読んでいたのは `sound` 1 個だけ。

**`?sound=`（`=` はあるが値が空）の扱いだけ変わった。**
旧: 鳴らない → 新: 鳴る。`URLSearchParams.get()` は `?sound` にも
`?sound=` にも空文字を返し、**両者を区別できない**。区別するには
`location.search` を生で見ることになり、標準機能に寄せる目的と相反する。
実運用で組み立てられる URL（`ytbg.html` の `?sound=off` と
`?board=N&sound=off`）はどちらも新旧同値なので、そのまま受け入れた。
`settings.js` のコメントと `CLAUDE.md` にその旨を書いてある。

なお、旧実装は `?sound=%` のような壊れたエンコードで `decodeURIComponent()`
が `URIError` を投げ、`window.onload` がそこで止まっていた。新しい方は止まらない。

### `get_dst_points()` の重複削除

手書きのループ（隣り合った重複しか削らない）を `[...new Set(dst_p)]` に。
離れた重複も消えるようになった。

### `ws_url()`

`document.domain`（非推奨）とポートの手組みをやめ、
`new URL("/ws", location.href)` の protocol を差し替える形にした。

### `index.html` の `<meta http-equiv>`

Pragma / Cache-Control / Expires の 3 行を消し、かわりに `app.py` の
`index()` の応答に `Cache-Control: no-cache` を付けた。
`/static` は前から `NoCacheStaticFiles` が付けている。

## 確かめたこと

- `uv run pytest`（227 passed）/ `uv run ruff check .` / `uv run mypy src` /
  `uv run basedpyright` / `node --test tests/js/`（57）/
  `node --test tests/browser/`（48）がすべて終了コード 0
- **`?sound` を守るテストを足した**（`tests/browser/sound.test.mjs`、4 件）。
  クエリ無し / `?sound=off` / `?board=2&sound=off` / 値の無い `?sound` の
  4 通りで `GlobalSoundSwitch` を見る。
  **`get_sound_query()` をわざと壊して落ちることを確かめた**
  （キーを `Sound` にすると 2 件、さらに `|| ""` にすると 4 件落ちる）
- **`get_sound_query()` の新旧を、入力の種類ごとに突き合わせた**（reviewer）。
  13 通りを実測し、音の鳴り方が変わるのは値が空文字になる書き方だけと確かめた
- **`ws_url()` の新旧を 8 通りで突き合わせた**（reviewer）。http / https、
  ポートあり / なし、IPv6 まで同値。違うのは URL に userinfo があるときだけで、
  ブラウザの `location.href` には現れない
- **`index.html` の `Cache-Control` を、テストと実サーバの両方で確かめた**
  （`tests/test_ws.py::test_index_no_cache` と、verifier が起動して curl）

## 残ること

- `ytbg.html`（サーバを経由しない静的ページ）にも同じ `<meta http-equiv>`
  3 行が残っている。こちらは置き換え先のヘッダが無いので、そのままにした
- `settings.js` の `CookieBase.load()` に、コメントアウトされた `log()` が
  2 行残る。`log` の import を消したので、復活させると ReferenceError になる。
  1 行のコメントアウトは TODO-037 でも範囲外にしたので、ここでも残した

## 分担の振り返り

- **reviewer が 2 つとも見つけた。** `?sound=` で挙動が変わること
  （項目が「今の扱いを保つ」と明記していた点に抵触する）と、
  `ui/base.js` のクラス階層図に消したクラス名が残っていたこと。
  どちらも「置き換え前後で同じか」を種類ごとに出し切る作業で、
  実装担当も verifier も 1 つずつしか試していなかった
- verifier には「実装担当が試していない `?sound=` を見ること」を
  名指しで頼んだので、こちらも同じ食い違いに届いた。
  **名指しすれば verifier でも届く**が、名指しできたのは main が
  差分を読んで気づいたからで、**気づかない食い違いを拾うのは reviewer の役**
- `?sound` を守るテストが無いという指摘（reviewer の「検討 4」）を受けて
  `tests/browser/sound.test.mjs` を足した。**実装担当が手で確かめて
  スクリプトを消してしまっていた**ので、次に触ったときに落ちるものが
  何も無い状態だった。依頼文に「確かめ方は自分で組み立ててよい」と
  書いたのが原因で、**残すテストとして書かせるべきだった**
- 次に同じ規模（置き換え数か所、挙動が変わりうる）の項目をやるなら、
  implementer への依頼に「手で確かめるのではなく、テストとして残す」と
  書く。それだけで reviewer の指摘 1 件と main の手戻りが減る
