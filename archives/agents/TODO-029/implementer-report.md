# TODO-029 implementer の報告

## いまの作業ツリーの状態

**実装は完了。** `src/` は壊していない（壊して確かめたあとは
scratchpad の控えから戻してある）。コミットはしていない。

済んだもの:

- `src/ytbg/webroot/static/js/dom.js` を新設（`#board` の中身・名前の
  `<input>` 2 つ・`#buttons` を作る／画像の読み込みを待つ）
- `index.html` を header と空の `<div id="board">` だけにした
- `onClick` / `onChange` / `onFocusOut` 属性を全部 `addEventListener` に
  付け替え、`main.js` の `Object.assign(window, {...})` を消した
  （`window.board` は残した）
- `BgImage.get_image_dir()` と `#server-id` の読み取りを消し、
  `<body>` の `data-*` から読む関数を `settings.js` に置いた
- ヘッダの `<label>` 4 つの `for"..."` を `for="..."` に直した
- 検証（pytest / ruff / mypy / `node --test tests/browser/` を 3 回）

残っているもの: なし。

## 変更したファイル

| ファイル | 何をしたか |
|----------|-----------|
| `src/ytbg/webroot/static/js/dom.js` | 新設（219 行） |
| `src/ytbg/webroot/templates/index.html` | 全面的に縮めた（200 行 → 77 行） |
| `src/ytbg/webroot/static/js/main.js` | import と `build_dom()` 呼び出し:1-13、`window.onload` を async にして `wait_images()`:206-212、末尾の橋渡しを `addEventListener` に置き換え:258-298 |
| `src/ytbg/webroot/static/js/settings.js` | `get_image_dir()` / `get_server_id()` を追加:112-133 |
| `src/ytbg/webroot/static/js/ui/base.js` | `import { get_image_dir }`:1、`this.image_dir = get_image_dir()`:406-410、`image_parent_dir` と `get_image_dir()` メソッドを削除、未使用になった `log` の import を削除 |
| `src/ytbg/webroot/static/js/board.js` | `get_server_id` を import:4、`this.svr_id = get_server_id()`:67 |
| `tests/test_ws.py` | `test_index_has_image_dir()`:93-103（後述） |

## 生成した DOM が今の HTML と同じ形であることの確かめ方

**方法**: scratchpad に置いた変更前の `index.html`（`{{image_dir}}` などを
埋めたもの）の `<body>` をブラウザに流し込んで作らせた DOM と、
`dom.js` が作った DOM を、木のまま JSON にして比べた
（`scratchpad/cmp_dom.mjs`）。

- 比べたのは `#board` / `#p0name-input` / `#p1name-input` / `#buttons` の
  4 本の木。`<header>` は HTML のまま残しているので対象外
- 各要素で見た項目: タグ名、`id`、`class`、`style.cssText`、
  `<img>` の `src` と `width` 属性、`<input>` の `type`、
  葉の文字、**子の並び順**
- `style` は属性の文字列ではなく `style.cssText` で比べた
  （`color:#333` と `color: rgb(51, 51, 51)` の差を消すため）

**結果: `SAME`**（差分ゼロ）。

同じ形にするために気をつけた点:

- 旧 HTML の `<image>` はパーサが `<img>` にするので、`dom.js` は
  `<img>` を作る
- `width="120px"` は `setAttribute("width", "120px")` で、HTML に
  書いたときとまったく同じにした（`el.width = 120` にはしない）
- `#board` の最初の子は `board-base.png` の `<img>`。`BgImage` が
  `el.children[0]` を画像として読むので、ここは並び順が効く
- 絶対配置の要素は z-index が同じなら DOM の並び順で重なりが決まるので、
  チェッカー → キューブ → ダイス → Roll → バナー、という**元の並び順**を
  そのまま再現した
- `p0name` / `p0score` の中の `<img>` は、`BgText` が `innerHTML` を
  上書きするので実際にはすぐ消える。それでも形を揃えるために作っている

## イベント登録の一覧

`main.js` の末尾（モジュールの読み込み時に 1 度だけ登録する）。

### メニュー（`click`）

`<a href="#">` なので `preventDefault()` は呼ばない（押すと URL に `#` が
付くのは前と同じ）。

| 要素 | イベント | つないだもの |
|------|----------|--------------|
| `#menu-inverse` | click | `board_inverse` |
| `#menu-back` | click | `() => backward_hist()` |
| `#menu-back2` | click | `back2` |
| `#menu-back-all` | click | `back_all` |
| `#menu-fwd` | click | `() => forward_hist()` |
| `#menu-fwd2` | click | `fwd2` |
| `#menu-fwd-all` | click | `fwd_all` |
| `#menu-clear-hist` | click | `clear_hist` |
| `#menu-new-game` | click | `new_game` |

`backward_hist` / `forward_hist` は `(n=1)` を取るので、`Event` が
第 1 引数に入らないようにアロー関数で包んである
（属性のときは `backward_hist();` = 引数なしだった）。

### ヘッダ（`change`）

| 要素 | イベント | つないだもの |
|------|----------|--------------|
| `#sound-switch` | change | `apply_sound_switch` |
| `#free-move` | change | `apply_free_move` |
| `#disp-pip` | change | `apply_disp_pip` |
| `#clock_sw` | change | `() => apply_clock_sw()` |
| `#clock_limit0` | change | `() => apply_clock_limit(0)` |
| `#clock_limit1` | change | `() => apply_clock_limit(1)` |

`apply_clock_limit` は `index` を取るので、属性のときと同じ 0 / 1 を
渡している。

### 名前の `<input>`（`focusout` と `change` の両方）

| 要素 | イベント | つないだもの |
|------|----------|--------------|
| `#p0name-input` | focusout | `() => emit_playername(0)` |
| `#p0name-input` | change | `() => emit_playername(0)` |
| `#p1name-input` | focusout | `() => emit_playername(1)` |
| `#p1name-input` | change | `() => emit_playername(1)` |

### 触っていないもの

- `BgBase` が `el.onmousedown` などを代入している分（HTML の属性では
  ないので、この項目の範囲外）
- `main.js` の `document.body.onkeydown`（同上）
- `window.onload`

## 画像の読み込みを待つ作り

1. `main.js` は import のすぐあとで `build_dom()` を呼ぶ。ES Modules は
   defer と同じ扱いなので、この時点で `<body>` はできている
2. `window.onload` の中で `await wait_images()` してから `new Board(...)`

```js
export function wait_images() {
    const imgs = Array.from(document.querySelectorAll("img"));
    return Promise.allSettled(imgs.map(el => el.decode()));
}
```

- `decode()` は読み込みに失敗すると reject するので、`allSettled` にして
  **1 枚読めなくても止まらない**ようにした
- 二重の備えになっている。`build_dom()` が `load` イベントより前に走るので、
  `window.onload` 自体も作った `<img>` の読み込みを待つ。それでも
  `wait_images()` を残したのは、`build_dom()` を呼ぶ場所が変わっても
  壊れないようにするため

## 検証の結果

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 211 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed（0） |
| `uv run mypy src` | Success: no issues found in 12 source files（0） |
| `node --test tests/browser/` 1 回目 | tests 30 / pass 30 / fail 0（0） |
| `node --test tests/browser/` 2 回目 | tests 30 / pass 30 / fail 0（0） |
| `node --test tests/browser/` 3 回目 | tests 30 / pass 30 / fail 0（0） |

`tests/browser/clicks.test.mjs` と `tests/browser/board.test.mjs` は
**1 行も変えていない**（`git diff` で HEAD と一致することを確かめた）。

## わざと壊して確かめた結果

毎回 `node --test tests/browser/`（30 件）を走らせ、終わったら
scratchpad の控えから戻した。`git checkout` / `restore` / `stash` は
使っていない。

| # | 壊したところ | 結果 | 落ちたテスト |
|---|--------------|------|--------------|
| 1 | `menu-new-game` の click 登録を消す | **落ちる** 24/30 | 「New Game」ほか 5 件（メニューが開いたままになり後続も巻き添え） |
| 2 | `clock_limit1` の change 登録を消す | **落ちる** 29/30 | 「ヘッダ 持ち時間 (秒)」 |
| 3 | 名前の `<input>` を `change` だけにする | **落ちない** 30/30 | — |
| 4 | 名前の `<input>` を `focusout` だけにする | **落ちない** 30/30 | — |
| 5 | 名前の `<input>` の登録を両方消す | **落ちる** 28/30 | 「名前の入力」「2 枚目のタブに同期する」 |
| 6 | チェッカーを 14 枚しか作らない | **落ちる** 0/30 | 全滅（`board.checker[0][14].el` が無く、Board が組み上がらない） |
| 7 | `board-base.png` の `<img>` を `#board` の最後に付ける | **落ちる** 25/30 | 「チェッカーをドラッグできる」ほか 4 件（`children[0]` が別物になり盤の大きさが狂う） |
| 8 | `await wait_images()` を外す | **落ちない** 30/30 | — |
| 9 | `build_dom()` を `window.onload` の中へ移し、待たない | **落ちる** 15/30 | 「盤面が描画される」ほか 14 件 |
| 10 | `window.onload` を使わず即座に組み、待たない | **落ちる** 18/30 | 「盤面が描画される」ほか 11 件 |
| 11 | `window.onload` を使わず即座に組むが、`wait_images()` はする | **落ちない** 30/30 | — |

分かったこと:

- **3 と 4**（`addEventListener` の付け替え漏れを狙った 2 つ）は
  **テストでは捕まらない**。`clicks.test.mjs` 自身が
  「onChange と onFocusOut の両方から送られるので、有無だけを見る」と
  書いているとおりで、片方だけになっても `fill()` → `blur()` では
  やはり 1 本送られる。**両方つないだことは目視で確かめるしかない**
  （5 のように両方消せば落ちる）
- **8 と 10、11 の組み合わせ**が、画像を待つ作りの効き目を示している。
  `build_dom()` をモジュールの読み込み時に呼んでいる今の形では、
  `window.onload` 自体が作った `<img>` の読み込みを待つので、
  `wait_images()` を外しても落ちない（8）。だが `window.onload` を
  当てにしないと途端に崩れ（10）、`wait_images()` だけでも直る（11）。
  つまり **`wait_images()` は単独で用を成す**。二重になっているのは
  無駄ではなく、`build_dom()` を呼ぶ場所が変わったときの備え

## 判断が要る点

1. **メニューの `<a>` に `id` を付けた**（`menu-inverse` /
   `menu-back` / `menu-back2` / `menu-back-all` / `menu-fwd` /
   `menu-fwd2` / `menu-fwd-all` / `menu-clear-hist` / `menu-new-game`）。
   README の 2 番は「マークアップは残し、属性だけを消す」なので、
   `id` を足したのは指示より一歩多い。`<a>` には元々 `id` が無く、
   `id` を足さないと `querySelectorAll("#nav-content a")` の
   **並び順**で拾うしかない。並び順で結び付けると、メニューの項目を
   足したり並べ替えたりしたときに黙って別の関数につながる。
   `id` は挙動を変えず、どの要素に何をつないだかが読めば分かるので、
   こちらにした。**戻すべきなら指示してほしい。**
   テストは `getByText()` で拾っているので、どちらでも通る
2. **`tests/test_ws.py` の `test_index_has_image_dir()` を直した。**
   `/static/images1a/board-base.png` が index.html に出てこなくなった
   ため。`data-image-dir="images1a"` と背景画像 `/static/images1a/bg.png`
   の 2 つを見る形にした。**「1 行も変えずに通す」と言われたのは
   `tests/browser/` の 2 本**なので、こちらは直した
3. **`CLAUDE.md` の「構成」を直した**（`main.js` の説明、`dom.js` の
   追加、`settings.js` の説明、`index.html` の説明）。範囲に入っていたので
   直したが、文書は管理者の担当でもあるので、言い回しは見てほしい

## 範囲外だが気づいたこと

- `main.js` の `emit_playername()` が `player_name.default_text` を
  読んでいるが、`PlayerName` にあるのは `def_name` で、
  `default_text` は `undefined`。使い道は `const def_name = ...` に
  入れているだけで、そのあと使われていないので害は無い。TODO-029 の
  前からある（触っていない）
- `main.js` の `document.body.onkeydown` と、`BgBase` の
  `el.onmousedown` などは、HTML の属性ではなく JS の代入なので
  そのままにした。`addEventListener` に揃えるなら別の項目
- `ui/dice.js:508` の `getElementById("dice-histogram")` は
  コメントアウトの中。`dice-histogram` という要素は元の index.html にも
  無かったので、`dom.js` でも作っていない

---

# 追記: 名前の入力のテストを足した（reviewer の検討 2）

## 足したもの

`tests/browser/clicks.test.mjs:333-380`（**純粋な追加**。
既にある 30 件は 1 行も変えていない。`git diff` は `332a333,380` の
1 ブロックだけ）。置いた場所は「名前の入力 → set_playername を送る」の
直後、「--- 盤面のボタン ---」の前。

| # | テスト | 何を見ているか |
|---|--------|----------------|
| S4 | 名前の入力: 打たずにフォーカスを外す → `set_playername` を送る (focusout) | `fill('Bob')` → `blur()` → `settle()` で値を決めてから、**打たずに** `focus()` → `blur()`。値が変わらないので `change` は起きず、`focusout` だけが残る |
| S5 | 名前の入力: 打って Enter → フォーカスを外す前に `set_playername` を送る (change) | `focus()` → `Control+a` → `type('Carol')` → `Enter`。**`blur()` しない**ので `focusout` は起きず、`change` だけが残る。送られたことに加えて `document.activeElement.id` が `p0name-input` のままであることも見る |

守ったこと:

- **プレーヤー 1 の名前は触っていない**（`settle()` の目印を壊さない）。
  使うのはプレーヤー 0 だけ
- S5 は最後に `blur()` と `settle()` をして、フォーカスと返事を
  片付けてから次の項目へ渡す。以降の項目（盤面のボタン・スコア・
  バナー）はプレーヤー名にもフォーカスにも依らない

## 狙ったところを見ていることの確かめ

`main.js:311` の `["focusout", "change"]` を片方ずつに削った版で、
**10 回ずつ**走らせた。戻すのは scratchpad の控えから
（`git checkout` / `restore` / `stash` は使っていない）。

| 版 | 10 回の結果 | 落ちたテスト |
|----|------------|--------------|
| `focusout` だけ | **10 回とも** 31 pass / 1 fail | 毎回 **S5 だけ**（「打って Enter」） |
| `change` だけ | **10 回とも** 31 pass / 1 fail | 毎回 **S4 だけ**（「打たずにフォーカスを外す」） |

揺れは無く、片方を殺すと対応する 1 本だけが必ず落ちる。
S4 と S5 以外の 31 件は、どちらの版でも落ちなかった。

## 検証の結果（追記ぶん）

| コマンド | 結果 |
|----------|------|
| `node --test tests/browser/` 1 回目 | tests 32 / pass 32 / fail 0（rc 0） |
| `node --test tests/browser/` 2 回目 | tests 32 / pass 32 / fail 0（rc 0） |
| `node --test tests/browser/` 3 回目 | tests 32 / pass 32 / fail 0（rc 0） |
| `uv run pytest` | 211 passed |
| `uv run ruff check .` | 0 |
| `uv run mypy src` | 0 |

終わる前に `git status` と、壊した版の痕跡を探す `grep -rn`
（`ev of ["focusout"]` / `ev of ["change"]` / `N_CHECKER = 14` ほか）を
確かめた。`src/` と `tests/` に痕跡は無く、`main.js:311` は
`["focusout", "change"]` に戻っている。

## 気づいたこと（触っていない）

`CLAUDE.md` の `dom.js` の節に
「`wait_images()` を外しても `tests/browser/` は **30 件**とも通る」と
あるが、この追記でテストは **32 件**になった（`wait_images()` の話とは
別のテストなので、外したときに通る件数も 32 になる）。
数字だけ古くなっている。`CLAUDE.md` は main の担当なので触っていない。
