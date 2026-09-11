# TODO-028 の分担

`ytbg.js`（4,351 行）を ES Modules に分割し、継承階層を組み直す項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— ファイル分割と継承階層の組み直し。
  この一連で最も大きい
- **reviewer**（Opus 5 に上書き）— クラスの統合で引数の渡し方が変わる
- **verifier**（定義のまま Sonnet 5）— ES Modules 化で読み込みが壊れやすい。
  **ブラウザでの確認が要**

**reviewer を先に、verifier を後に**回す（TODO-025 / 026 と同じ）。

## main が決めたこと（実装の前提）

`docs/design.md` の「ファイル構成」「継承階層」に加えて、
着手時に main が決めた分。**迷ったらここに従う。**

### 1. `onClick` / `onChange` は、この項目ではまだ外さない

**外すのは TODO-029。** だが ES Modules にするとスコープが閉じ、
`index.html` の属性から呼ばれている**次の 13 個が見えなくなる**。

```
apply_clock_limit, apply_clock_sw, apply_disp_pip, apply_free_move,
apply_sound_switch, emit_playername, back2, back_all, backward_hist,
board_inverse, clear_hist, forward_hist, fwd2, fwd_all, new_game
```

**`main.js` が、この 13 個を `window` に載せる。** そこに
**「TODO-029 で `addEventListener` に移したら、この橋渡しごと消す」**と
コメントを書くこと。**この項目の終わりでも、ボタンとチェックボックスは
全部効く状態でなければならない。**

`window.board` も残す（デバッグ用。`docs/design.md` で決めた）。
`tests/browser/helper.mjs` が `typeof board !== 'undefined'` を
待っているので、これが無いとブラウザの確認が動かない。

### 2. 作るファイル

`docs/design.md` の「ファイル構成」のうち、**中身があるものだけ作る。**

```
static/js/
  main.js       エントリ。Board を組み立て、WebSocket をつなぐ
  ws.js         接続・再接続・送信
  log.js        レベル付きのログ
  layout.js     盤面の座標（bx / by）
  settings.js   Cookie / QueryString / ヘッダのチェックボックス
  sound.js      効果音
  board.js      Board
  ui/base.js    BgBase / BgText / BgImage
  ui/point.js   BoardPoint
  ui/checker.js Checker
  ui/cube.js    Cube
  ui/dice.js    Dice / RollButton
  ui/clock.js   PlayerClock / ClockLimit
  ui/label.js   PlayerName / PlayerScore / PlayerPipCount
  ui/button.js  ボタン各種
```

**`dom.js` は作らない**（TODO-029）。**`rules/` も作らない**（TODO-027）。
ルール判定は `BgBase` に置いたまま動かさない。

古い `static/ytbg.js` は**消す**。

### 3. 継承階層

- 属性を足すだけの中間クラス（`BoardText` / `PlayerText` / `PlayerItem` /
  `OnBoardImage` / `OnBoardButton`）をやめ、**`board` と `player` は
  コンストラクタのオプション引数で渡す**（段数が 5 から 2 になる）
- `EmitButton` の 6 つのサブクラス（`BackButton` … `FwdAllButton`）を
  **1 つにまとめ、生成時に type と data を渡す**
- `BannerButton` の 3 つのサブクラス（`Pass` / `ResignBanner` / `Win`）を
  **押したときの動作をコールバックで渡す形**にする

### 4. キャッシュ避けはサーバ側へ

`index.html` の `?ts=` 付き URL と動的な `<script>` 生成をやめ、
**`<script type="module" src="/static/js/main.js">` と普通の
`<link rel="stylesheet">` の 2 行**にする。

かわりに **`/static` に `Cache-Control: no-cache` を返す**
（`src/ytbg/app.py`。`StaticFiles` を継承するか、レスポンスに
ヘッダを足す）。**Python 側も変わるので、`tests/test_ws.py` などに
ヘッダを見るテストを 1 件足すこと。**

### 5. 進め方（2 段に分ける）

**一度に全部やらないこと。** 段ごとに
`node --test tests/browser/` を通してから次へ進む。

1. **分割だけ。** クラスの中身と継承階層は変えず、ファイルへ切り出して
   `import` / `export` を付ける。`index.html` と `/static` の
   キャッシュも、この段で直す
2. **継承階層の組み直し。** 3 番の 3 つ

段 1 が通ってから段 2 に入る。**段 1 の時点でブラウザの確認が通らなければ、
段 2 に進まずに報告すること。**

### 6. 挙動は変えない

**見た目・操作感・送るメッセージを変えない。** クラス数は 35 前後から
20 前後になる見込みだが、**減らすこと自体が目的ではない**。
無理に統合して分かりにくくなるくらいなら残す。

## 報告

- [implementer-report.md](implementer-report.md)
- [reviewer-report.md](reviewer-report.md)
- [verifier-report.md](verifier-report.md)

## main の判断（あとから追記）

implementer と reviewer が挙げた「判断が要る点」に、main がどう答えたか。
verifier から「記録が見当たらない」と指摘されたので残す。

### implementer の判断が要る点（段 2 の報告）

| # | 内容 | main の判断 |
|---|------|-------------|
| 1 | `CLAUDE.md` を直していない（実装担当の定義で触れない） | **main が直した。** 実装担当の案をほぼそのまま使い、「クロック」「履歴」の関数の置き場所（`ui/clock.js` / `board.js` / `main.js`）と「書き方の慣習」の座標の行も直した |
| 2 | `BoardArea` も消した（README の一覧に無い） | **受け入れる。** `board` を足すだけの同じ種類の中間クラス |
| 3 | 部品の側のコンストラクタは位置引数のまま | **受け入れる。** options にしたのは基底の 3 クラスだけでよい |
| 4 | クリックでの確認を `tests/` に足すか | **足す。** M4（バナーのコールバック）と M6（戻すボタンの data）はこれでしか捕まらなかった。TODO-029 で `onClick` を付け替えるときに、変える前と後で同じテストが通ることを確かめる土台にもなる |

### reviewer の指摘

要修正 0 件。「直したほうがよいもの」5 件のうち 4 件を直した。

| # | 内容 | main の判断 |
|---|------|-------------|
| R1 | パスのバナーの「消える」が効いていない（壊しても 5 回中 4 回通る） | **直す。** サーバの返事より前に判定し、`change_turn()` が呼ばれたことも見る |
| R2 | 送ったメッセージの `history` を比べていない | **直す。** 期待値は分割前の `ytbg.js`（`390e397`）から取る |
| R3 | 素の `board` は `window.board` を消しても DIV を掴む | **罠として残す。** `main.js` のコメントと `CLAUDE.md` の両方に書いた |
| R4 | Python のコメントに `ytbg.js` の名前が残る | **直す**（今のファイルを指しているもののみ。昔の経緯は残す）。実装担当が止まったので main が直した |
| R5 | `CLAUDE.md` にクリックのテストの記述が無い | **main が書いた**（`clicks.test.mjs` の説明と、プレーヤー 1 の名前を変えない前提） |

「好みの問題」の 3 件（`no-cache` で 304 の問い合わせが増える、段数の数え方、
`onFocusOut` も属性にある）は直していない。段数は下の「やったこと」に
実際の数を書いた。
