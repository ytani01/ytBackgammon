# TODO-029 reviewer の報告

対象: 作業ツリーの `git diff`（未コミット）＋ 未追跡の
`src/ytbg/webroot/static/js/dom.js`。変更前は `1830e4c`（＝ `HEAD` の
`index.html` と同一であることを `diff` で確認済み）。

**コードは直していない。** 実測は playwright + 実サーバで行い、`src/` を
書き換えずに済むよう、`page.route()` で `main.js` の応答だけを差し替えた
（作業ツリーは `git status` で無変更のままなのを確認済み）。

結論から言うと **要修正は 0 件**。検討 3 件、好みの範囲 2 件。

---

## 重大なもの（要修正）

なし。

- 生成された DOM は元の HTML と一致（属性の並び順を除く）
- イベントの付け替えは、対象の要素・引数とも元の属性と一致
- 名前の `<input>` は `focusout` と `change` の両方がつながっており、
  旧ページと**同じ回数・同じ順序**で `emit` が呼ばれる（実測、下記 B）
- ラベル 4 つの `for=` 修正で二重発火は起きない（実測）

---

## A. `await wait_images()` を外しても落ちない理由（壊し 8）

**結論: テストが甘いのではなく、今の配置では `wait_images()` が
待つべきものを持っていない。** `build_dom()` がモジュール評価時
（deferred なので `load` イベントより前）に走り、そこで作った `<img>` は
**`load` イベントを遅らせる対象になる**。つまり `window.onload` に入った
時点で 60 枚すべて読み込み済みで、`wait_images()` は即 resolve する。
`wait_images()` は「効いている 2 枚目の壁」ではなく、**今は常に no-op**。

### 実測の手順

`/tmp/.../scratchpad/waitimg.mjs`

1. 実サーバを起動し、`page.route('**/static/images1a/**')` で**画像の応答
   だけを 1.5 秒遅らせる**（JS・HTML は遅らせない）
2. `main.js` を差し替えて `window.onload` の先頭に計測を仕込む
   （`document.images.length` / `complete` でない枚数 / 先頭画像の `width`）
3. 「`await wait_images()` あり」と「外した版」の 2 通りで、
   `board.w` / `board.h` / チェッカーの `w` と座標 / `cube.w` /
   `roll_btn[0].w` / `#board` の `offsetWidth` を比べる

### 結果

| 版 | onload 時点の未読み込み | 先頭画像 width | board w×h | checker w | checker 座標 | rollbtn w |
|----|----------------------|---------------|-----------|-----------|-------------|-----------|
| `wait_images()` あり | **0 / 60** | 830 | 830×560 | 50 | (465, 505) | 120 |
| 外した版 | **0 / 60** | 830 | 830×560 | 50 | (465, 505) | 120 |

画像を 1.5 秒遅らせても、`window.onload` に入った時点で未読み込みは 0 枚。
配置は 1 ピクセルも変わらない。**ネットワークを遅くしても崩れない＝
待ちは（今の呼び出し位置では）不要**、というのが実測の答え。

実装担当の「二重の備え」という説明と結論は一致する。ただし
`build_dom()` を `window.onload` の中へ移すと `window.onload` の保護は
消えるので、`wait_images()` を残すこと自体は妥当（壊し 10・11 がそれを
示している）。

### 検討 1: `CLAUDE.md` の書き方が実測とずれている

`CLAUDE.md`（`dom.js` の節）:

> **`BgImage` は `<img>` の幅・高さを読んで大きさを決めるので、
> `wait_images()` で読み込みを待ってから `Board` を組む。**
> 待たずに組むと幅が 0 になって配置が崩れる

実測では、今のコードで配置を守っているのは **`build_dom()` を
モジュール評価時に呼んでいること（＝ `window.onload` が待つこと）**で、
`wait_images()` は待つ相手がいない。この書き方だと、あとから読んだ人が

- 「`wait_images()` があるから `build_dom()` はどこで呼んでもよい」
  （実際は `load` 後に呼ぶなら `wait_images()` が要る。壊し 10・11）
- 逆に「`window.onload` はもう要らない」

のどちらにも読めてしまう。**「`build_dom()` を `load` の前に呼ぶ」と
「`wait_images()` で待つ」の 2 つで守っている**ことと、
**外しても落ちないので `tests/browser/` では守られない**ことを書いておくと、
次にここを触る人が同じ検証をやり直さずに済む（根拠: 上の実測）。

`dom.js:213-218` の `wait_images()` の docstring も同じ書き方だが、
こちらは関数単体の理由として読めるので問題ない。

---

## B. 名前の `<input>` の `focusout` / `change`

**結論: 両方つながっている。旧ページと挙動は完全に一致。**

### コード上の確認

`main.js:308-314` で `["focusout", "change"]` を 2 人ぶんループして登録。
元の `index.html`（`1830e4c` の 179-186 行）の
`onFocusOut="emit_playername(0);"` / `onChange="emit_playername(0);"` と
対応する（player 0/1 の引数もアロー関数で固定されている）。

なお `onfocusout` は HTML の標準の属性ではないが、**この chromium では
実際に発火する**ことを確かめた（`<input onfocusout="...">` を作って
フォーカスを外すと 1 回発火。`'onfocusout' in el` は `false` なのに
属性としては効く）。つまり旧ページも両方効いていた。

### 実測の手順

`/tmp/.../scratchpad/cmp_name.mjs`

- 旧ページは、`HEAD` の `index.html` と `HEAD` の `js/*.js` を
  `page.route()` で返して丸ごと再現した（新ページは作業ツリーそのまま）
- 呼ばれた回数は `board.player_name[p].emit` を包んで数えた
  （WebSocket の有無に左右されないようにするため）
- 入力欄は普段 `zIndex:-2` で盤の裏に隠れているので、名前をクリックした
  ときと同じになるよう `zIndex` を 10 にしてから `focus()` した

### 結果（旧・新とも同じ）

| 操作 | 旧（HEAD） | 新（作業ツリー） |
|------|-----------|-----------------|
| S1 打って、フォーカスを外す | `["0:Alice","0:Alice"]`（**2 回**） | 同じ |
| S4 打たずにフォーカスを外す | `["0:Alice"]` | 同じ |
| S5 打って Enter（フォーカスは残す） | `["1:Bob"]`, zIndex→-2 | 同じ |
| S6 Enter のあとフォーカスを外す | `["1:Bob"]` | 同じ |

### 片方だけにすると何が起きなくなるか（実測）

`main.js` の `["focusout", "change"]` を片方に削った版で、送られた
`set_playername` と入力欄の `zIndex` を見た
（`/tmp/.../scratchpad/nameinput2.mjs`）。

| 版 | S4 打たずに外す | S5 打って Enter |
|----|----------------|----------------|
| both（現状） | 1 本送信、zIndex=-2（隠れる） | 1 本送信、zIndex=-2 |
| `change` のみ | **0 本、zIndex=10 のまま** | 1 本、zIndex=-2 |
| `focusout` のみ | 1 本、zIndex=-2 | **0 本、zIndex=10 のまま** |

- `focusout` を落とすと、**名前の入力欄を開いて何も打たずに外したときに
  入力欄が盤の上に出しっぱなしになる**（`emit_playername()` の末尾の
  `el.style.zIndex = -2` が走らない）
- `change` を落とすと、**打って Enter を押しただけでは送られず、
  入力欄も消えない**

どちらも「送信が 1 本は出る」ので `tests/browser/` の
`fill()` → `blur()` では捕まらない（実装担当の壊し 3・4 と一致）。

### 検討 2: 「両方つながっている」を見るテストを足すか

上の S4（打たずに外す）と S5（打って Enter）は、`focusout` 側・
`change` 側それぞれを単独で殺せる。足すなら

- S4: `zIndex` を 10 にして `focus()` → `blur()` → `set_playername` が
  来ること（`focusout` が死ぬと来ない）
- S5: `focus()` → `keyboard.type()` → `keyboard.press('Enter')` →
  `set_playername` が来ること（`change` が死ぬと来ない）

の 2 本。ただし README の 1 番は「`tests/browser/` を 1 行も変えずに
通す」なので、**足すかどうかは main の判断**（この項目でやらず、
TODO を別に立ててもよい）。

なお S1 で `emit` が 2 回呼ばれる（同じ名前を 2 回送る）のは**旧ページでも
同じ**なので、TODO-029 の回帰ではない。

---

## ほかに見たこと（すべて問題なし）

### 1. 生成した DOM と元の HTML の突き合わせ（機械的に比較）

`/tmp/.../scratchpad/cmp2.mjs`。`main.js` を
「`dom.js` の `build_dom()` だけを呼ぶ」ものに差し替えて、`Board` が
`style` を書き換える前の DOM を取り、`1830e4c` の `index.html`
（テンプレート変数を埋めたもの）を `DOMParser` で組んだ木と、
タグ名・**全属性**・`style.cssText`・葉のテキスト・子の並び順を
再帰的に比べた。

| 木 | 結果 |
|----|------|
| `#board`（60 要素以上） | 属性の並び順（`class`/`id` の前後）以外**完全一致**。並び順を正規化して `diff` を取ると差分ゼロ |
| `#p0name-input` / `#p1name-input` | `onfocusout` / `onchange` 属性が無いこと以外一致（`style.cssText` も一致） |
| `#buttons` | 完全一致 |
| `<body>` 直下の並び | `HEADER, DIV#board, INPUT#p0name-input, INPUT#p1name-input, DIV#buttons` で一致 |

`<img>` の `src` / `width`（`"120px"` のような文字列のまま）/
`style.transform` もこの比較に含まれており、一致している。

`ytbg.css` のセレクタは `#nav*` / `.bordertext` / `.checkbox` /
`.headerinput` / `div, span` だけで、`#board` の中を親子関係で
指しているものは無い（`ytbg.css` 全 184 行のセレクタを確認）。
`.bordertext` が付くのは `p0/1clock`・`p0/1pip`・`p0/1name`・
名前の `<input>` で、元の HTML と同じ。

### 2. イベント登録の突き合わせ

元の属性（`1830e4c`）と `main.js:283-314` を 1 対 1 で照合。引数付きの
4 つは、いずれもアロー関数で包んで `Event` が第 1 引数に入らないように
してある。

| 元の属性 | 新 | 判定 |
|----------|----|----|
| `onClick="board_inverse();"` ほかメニュー 9 個 | `#menu-*` に `click` | 一致（`backward_hist` / `forward_hist` は `(n=1)` を持つので `() => ...()` で包む必要があり、実際に包まれている） |
| `onChange="apply_sound_switch();"` / `apply_free_move()` / `apply_disp_pip()` | `change` に関数をそのまま | 一致（いずれも引数を取らないので `Event` は無視される） |
| `onChange="apply_clock_sw();"` | `() => apply_clock_sw()` | 一致（`apply_clock_sw = index => {...}` は `index` を使っていないが、包んであるので旧と同じ `undefined` が渡る） |
| `onChange="apply_clock_limit(0);"` / `(1)` | `() => apply_clock_limit(0)` / `(1)` | 一致 |
| `onFocusOut/onChange="emit_playername(0);"` / `(1)` | 上記 B | 一致 |

### 3. `window` への橋渡し

`Object.assign(window, {...})` は消えている。`static/js/` 全体を
`window\.` で grep した結果は `window.location`（`settings.js:14`）、
`window.onload`、`window.board`（`main.js:255`、デバッグ用で残す指示）の
3 つだけ。素の `board` を参照しているモジュールは無い。

### 4. `data-*` の読み口

`get_image_dir()` / `get_server_id()` は `settings.js:112-128` の
2 関数だけ。`BgImage.get_image_dir()`（`src` の文字列から逆算）は削除済みで、
`image_parent_dir` も残っていない（grep で確認）。
`#server-id` を読む箇所も無く、`index.html` から `<div id="server-id">` も
消えている。旧実装が返していた値は `/static/images1a/`（旧ページの
コンソールログで確認）で、新しい `get_image_dir()` の戻り値と同じ。

### 5. `<label>` の `for=` 修正（実測）

`/tmp/.../scratchpad/labels.mjs`。ラベルをクリックしたときの、
チェックボックスの状態・ハンドラの呼ばれた回数・送信されたメッセージ。

| ラベル | 状態 | ハンドラ | 送信 |
|--------|------|---------|------|
| Sound (`sound-switch`) | true→false | `apply_sound_switch()` **1 回** | なし（ローカル） |
| Free (`free-move`) | false→true | `apply_free_move()` 1 回 | なし |
| Pip (`disp-pip`) | false→true | `apply_disp_pip()` 1 回 | なし |
| Clock (`clock_sw`) | true→false | `apply_clock_sw()` 1 回 | `set_clock_switch`, `stop_clock`×2 |
| m + (`clock_limit0`) | 2→2 | なし | なし（数値入力にフォーカスが移るだけ） |
| s (`clock_limit1`) | 12→12 | なし | なし |

チェックボックス本体を直接クリックした場合（`#disp-pip` / `#clock_sw`）と
**回数もメッセージも同じ**で、二重発火は無い。

### 6. `window.onload` を `async` にした副作用

`onload` の中で例外が起きたときの見え方が変わらないかを確かめた
（`/tmp/.../scratchpad/onerr.mjs`）。同期版・async 版のどちらでも
playwright の `pageerror` として `REVIEW_TEST` が上がる。
`tests/browser/` のエラー検出力は落ちていない。

### 7. そのほか

- `tests/browser/board.test.mjs` と `clicks.test.mjs` は無変更
  （`git status` に出てこない）
- `uv run pytest` = 211 passed（こちらでも実行）
- 変更したファイルに 78 桁を超える行は無い（`index.html:10` の viewport の
  `<meta>` だけが 95 桁だが、これは TODO-029 以前からある行）
- `ui/base.js` から消した `log` の import は、残りが全部コメントアウトで
  使われていないことを確認
- `docs/design.md` の「DOM 生成」の節は実装済みの内容になったが、
  TODO-026 でも design.md は「これから作る構成」のまま数字を直しただけ
  だったので、この項目で直す必要は無いと判断した

---

## 直したほうがよいもの（検討）

1. **検討 1**（上記 A）— `CLAUDE.md` の `dom.js` の説明。配置を守って
   いるのは「`build_dom()` を `load` の前に呼ぶこと」で、`wait_images()`
   は今は待つ相手がいない。実測（画像を 1.5 秒遅らせても onload 時点で
   未読み込み 0 枚）を根拠に、2 つで守っていること・テストでは守られない
   ことを書き足すと、次に触る人が同じ検証をやり直さずに済む
2. **検討 2**（上記 B）— 「両方つながっている」を見るテストを足すか。
   足すなら S4 と S5 の 2 本。README の「`tests/browser/` を 1 行も
   変えずに通す」との兼ね合いがあるので main の判断
3. **枚数の二重管理**（`dom.js:19-22` の `N_CHECKER = 15` / `N_DICE = 4`
   と、`board.js:201,203,514,716,965` の `15`、`ui/dice.js:241,331,410` の
   `4`）。片方だけ変えると、実装担当の壊し 6 のように `Board` が
   組み上がらない。もっとも、**元は「HTML と JS の二重」だったので
   悪化はしていない**（むしろ同じ言語に寄った）。定数を 1 か所に
   寄せるなら TODO-030 の範囲で

---

## 好みの範囲

1. `ui/base.js:432` — `BgImage` のコンストラクタごとに `get_image_dir()`
   を呼ぶので、`<body>` の `dataset` を 60 回読む。実害は測れる範囲に
   無い（配置の計測値は A の表のとおり一致）ので、そのままでよいと思う。
   気になるならモジュールの定数に 1 度だけ入れる
2. `main.js:283-314` の 3 つのループは、要素が 1 つでも欠けると
   `document.getElementById(id)` が `null` になってモジュール全体が
   落ちる（旧の `Object.assign(window, ...)` は、欠けてもそのボタンが
   効かないだけだった）。**黙って効かなくなるより落ちるほうがよい**ので
   今のままを推すが、挙動の違いとして記録しておく
