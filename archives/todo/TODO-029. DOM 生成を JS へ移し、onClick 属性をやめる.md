# TODO-029. DOM 生成を JS へ移し、onClick 属性をやめる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 19,974 | 113,947 | 44% |
| implementer | Opus 5 | medium | 26,470 | 262,407 | 30% |
| reviewer | Opus 5 | high | 26,021 | 109,801 | 17% |
| verifier | Sonnet 5 | medium | 24,765 | 100,568 | 9% |
| 合計 |  |  | 97,230 | 586,723 | 概算 $17.9 |

- implementer と reviewer は定義のモデルが sonnet。DOM 生成の移し替えと
  そのレビューなので Opus 5 に上書きした。effort は定義の frontmatter の値
- TODO-025 以降と同じく **reviewer を先に、verifier を後に**回した
- implementer は 2 回動いている（テストを足す回）

## きっかけ

**ES Modules ではスコープが閉じてグローバル関数が見えなくなるので、
`onClick="new_game();"` は動かなくなる。** TODO-028 のあとに続けて要る。

TODO-028 では、`main.js` が 15 個の関数を `window` に載せる橋渡しで
しのいでいた。この項目でその橋渡しごと消す。

### 決めたこと

着手時に main が決めた 7 点（テストを 1 行も変えずに通すこと、
生成する DOM を今の HTML と同じ形にすること、画像の読み込みを
待つこと、`data-*` から 1 か所で読むこと）は
[`archives/agents/TODO-029/README.md`](../agents/TODO-029/README.md) にある。
implementer と reviewer の「判断が要る点」への答えも、そこに追記した。

## やったこと

- `src/ytbg/webroot/static/js/dom.js` を作り、`#board` の中身
  （チェッカー 30 個・ダイス 8 個ほか）、名前の `<input>` 2 つ、
  `#buttons` を JS が作るようにした
- `index.html` に残るのは header と `<div id="board"></div>` だけ。
  `<body data-image-dir="..." data-server-id="...">` で値を渡し、
  `<div id="server-id">` は消えた
- `onClick` / `onChange` / `onFocusOut` 属性を全部 `addEventListener` にし、
  **TODO-028 で置いた `window` への橋渡しを消した**（`window.board` は
  デバッグ用に残す）
- `BgImage.get_image_dir()`（`src` の文字列から逆算していた）と、
  `Board` が `#server-id` の `innerHTML` を読む処理を消し、
  `settings.js` の `get_image_dir()` / `get_server_id()` に寄せた
- メニューの `<a>` 9 個に `id` を付けた。並び順で拾うと、項目を足したり
  並べ替えたりしたときに黙って別の関数につながるため
- **ヘッダの `<label>` 4 つの `for"..."` を `for="..."` に直した**
  （`=` が抜けていて、ラベルを押してもチェックボックスが切り替わらなかった）。
  **この項目で変えてよいと決めた唯一の挙動**
- `tests/browser/clicks.test.mjs` に、名前の `<input>` の
  `focusout` / `change` を見るテストを 2 本足した（30 → 32 件）

## 確かめたこと

`uv run pytest`（211 passed）、`uv run ruff check .`、`uv run mypy src` が
終了コード 0。`node --test tests/browser/` は **3 回続けて 32 pass**。

**reviewer が実測で 2 つの疑問に答えた**（報告は
[reviewer-report.md](../agents/TODO-029/reviewer-report.md)）。

- **`await wait_images()` を外してもテストが通る理由。** テストが甘いの
  ではなく、**今の配置では待つ相手がいない**。`build_dom()` が
  モジュールの評価時（`load` より前）に走るので、そこで作った `<img>` は
  `load` イベントを遅らせる対象になり、`window.onload` に入った時点で
  読み込みが済んでいる。**画像の応答を 1.5 秒遅らせても未読み込みは 0 枚で、
  配置は 1 ピクセルも変わらなかった**
- **`focusout` / `change` が片方だけでも通る件。** 旧ページを
  `page.route()` で再現して突き合わせ、**両方つながっていること**を
  確認した。片方だけだと「打たずに外すと送られない」
  「Enter だけでは送られない」が起きる

生成した DOM は、元の HTML と**属性の並び順以外で完全一致**。
イベント登録も、引数付きの 4 つ（`apply_clock_limit(0/1)` /
`emit_playername(0/1)`）を含めて元と一致していた。

**verifier が実際に動かして確かめたもの**（報告は
[verifier-report.md](../agents/TODO-029/verifier-report.md)）:

- **変更前（`1830e4c`）とスクリーンショットが md5 で完全一致**
  （`for=` を直したが、`for` はクリックの対応付けなので描画は変わらない）
- **`<label>` 4 つとも押すとチェックボックスが切り替わり、
  メッセージが二重に送られない**
- **わざと壊す 5 通りが、いずれも狙ったテストを落とす。** 名前の
  `<input>` を片方だけにする 2 通りは、**10 回続けて走らせて 10 回とも、
  対応する 1 本だけが落ちた**（揺れていない）

## 残ること

- **`wait_images()` は今は常に no-op。** `build_dom()` を
  `window.onload` の中へ移すと前者の保護が消えるので、備えとして
  残してある。**この 2 つはどちらもテストでは守られない**ので、
  順序を変えるときは画像の応答を遅らせて配置を実測すること
  （`CLAUDE.md` に書いた）
- **チェッカー 15 枚 / ダイス 4 個の定数が 2 か所にある**
  （`dom.js` と `board.js` / `ui/dice.js`）。片方だけ変えると `Board` が
  組み上がらない。ただし元は「HTML と JS の二重」だったので悪化はして
  いない。1 か所に寄せるなら TODO-030 の範囲

## 分担の振り返り

- **reviewer が「なぜテストが落ちないのか」に実測で答えた。** main が
  「壊しても落ちないのは、待ちが不要なのかテストが甘いのか、
  実測して決めること」と名指しで頼んだところ、`page.route()` で画像だけ
  1.5 秒遅らせる仕掛けを組んで答えを出した。**「たぶん要らない」で
  済ませていたら、`CLAUDE.md` に誤った説明が残っていた**
- **reviewer が旧ページを再現して突き合わせた。** `focusout` / `change` が
  両方つながっているかを、コードを読むだけでなく `page.route()` で
  旧ページを再現して呼び出し回数を比べた。**「読んで同じ」より強い**
- **テストの判別力を「10 回続けて落ちるか」で確かめさせたのが効いた。**
  TODO-028 で reviewer が「壊しても 5 回中 4 回通る」判定を見つけている。
  1 回落ちれば良しとすると、揺れているテストを見逃す
- **見込みと食い違ったのは、main の割合**（44%、$7.8）。TODO-028 の 47% に
  続いて高い。reviewer の報告が厚く、指摘の仕分けと `CLAUDE.md` の
  書き直しが main に集まるため。**文書を直す担当を分けるかどうかは、
  次に同じ規模をやるときに考える**（`wording` は今回使っていない）
- **次に同じ規模（DOM とイベントの移し替え）をやるなら、同じ組み方でよい。**
  「変える前と後で同じテストが通ること」を完了条件にしたのが効いた。
  TODO-028 でクリックのテストを足しておいたおかげで、
  **この項目では新しく足した 2 本以外、テストを 1 行も変えずに済んだ**
