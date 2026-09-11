# TODO-020. モジュール構成とクラス構成を見直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | main のみ |
| 実施 | Opus 5 / effort high | main のみ |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 27,724 | 48,458 | 100% |
| 合計 |  |  | 27,724 | 48,458 | 概算 $1.7 |

- 決めるだけの項目なので、確認の担当は立てていない（`CLAUDE.md` の例外）
- **この表は書式どおり「立てたコミットから」の範囲。** 立てる前の調査
  （TODO-019 のコミット以降）も含めると output 44,789 / cache_creation
  147,032 / 概算 $3.7 で、**2 倍以上になる**。設計を決める項目では、
  立てる前に読む量が多い

## きっかけ

全体的な見直しをしたいという相談から。細かいリファクタリングではなく、
モジュール構成・クラス構成といった基本設計から見直す。動作に問題が
出ないなら大きく変えてよい。質の良いコードを優先する。

## やったこと

**設計を決めただけで、`src/` は触っていない。** 決めた構成は
[`docs/design.md`](../docs/design.md) にある。実装は TODO-022 以降に分けた。

設計文書を `archives/` ではなく `docs/` に置いたのは、**これが
これから参照し続ける現行の指針だから**。`archives/` は決着した項目の記録で、
実装の根拠として参照しない場所なので、設計本体を置くと辿れなくなる。

## 現状で分かったこと

`ytBackgammonServer`（722 行）が 7 つの責務を抱えている。

| 責務 | 該当 |
|------|------|
| 接続管理 | `_clients`, `on_connect`, `on_disconnect`, `client_name` |
| 配信 | `broadcast`, `emit_gameinfo` |
| 履歴 | `_history`, `_fwd_hist`, `backward_hist`, `forward_hist`, `_replay*` |
| 永続化 | `save_data`, `load_data`, `hist_ent2str` |
| クロック | `_clock_sw`, `_clock_active`, `_clock_start`, `_cur_clock`, `_freeze_clock` |
| メッセージ分岐 | `on_json`（150 行、`if msg['type'] ==` が 20 個） |
| HTTP 応答 | `app_index` |

そのほか Python 側:

- `ytBackgammon` のカプセル化が壊れている。`self._bg._gameinfo[...]` への
  外部からの直接アクセスが 20 箇所以上あり、`new_game()` はサーバ側で
  gameinfo の中身を組み立てている。2 クラスに分かれている意味がほぼ無い
- `gameinfo` もメッセージも型が無い。生の dict の入れ子で、`msg['data']['n']`
  のようなアクセスが全域。mypy が中身を見ていない
- `save_data()` が JSON を文字列連結で組み立てており、キーを足すと
  `hist_ent2str()` も直さないと落ちる
- クロックの状態が 4 箇所に分散している
- `svr` と `app` がモジュールのグローバルで、WebSocket 経路そのものの
  テストが書けていない

JavaScript 側（`ytbg.js` 4,351 行が 1 ファイル）:

- `Board` が 1,200 行超、コンストラクタだけで 280 行
- **ルール計算が全 UI 部品の基底クラスに入っている。** `BgBase` に
  `goal_point()` / `bar_point()` / `calc_dst_point()` / `get_pip()` がある。
  テキスト表示もボタンもチェッカーも、全部これを継承している
- ルール判定が UI クラスに埋まっている（`Checker.dice_check()`,
  `RollButton.check_disable()`, `Board.get_dst_points()` / `winner_is()` /
  `all_inner()` / `closeout()` / `calc_gammon()`）。いずれも
  `this.point[p].checkers`（DOM を持つ `Checker` の配列）を見ているため、
  盤面だけを渡して呼ぶことができない。**JS のテストが 0 件なのは、
  ここが切り離せていないことが大きい**
- `winner_is()` は判定の名前で `this.resign = -1` を書き換え、内部で
  呼ぶ `pip_count()` は `this.pip[player].set(count)` で表示まで変える
- モジュール分割が無く全部グローバルスコープ。`board` がグローバル変数で、
  `this.board` と `board` の参照が混在している
- DOM が `index.html` に手書き。チェッカー 30 個 + ダイス 8 個の `<div>` を
  並べ、JS が `getElementById("p000")` で拾う。`BgImage.get_image_dir()` は
  HTML に書かれた `src` を文字列として切り出して画像ディレクトリを逆算している
- `Checker.on_mouse_up_xy()` がサーバの応答を待たずに先行して
  `put_checker()` を呼んでおり、`load_gameinfo()` の配置と別経路になっている

## 相談して決めたこと

| 論点 | 決めたこと |
|------|-----------|
| 進め方 | 設計を決める項目を先に立て、実装は分割して後から立てる |
| 保存ファイルと `gameinfo` の構造 | 変えてよい。**旧形式の読み込みは残す**（手元の対局記録が生き残るように） |
| JS の分割方式 | **ES Modules**。バンドラは入れない |
| ルール判定の置き場所 | **クライアントの純粋ロジック層**。サーバは持たない |
| `window.open(...)` | 消す |
| 盤面のファイル保存・読み込み | 消す |
| `ytbg.html` | 対象外 |

理由は [`docs/design.md`](../docs/design.md) の「採らなかった案」にある。

## やらないと決めたこと

- **`ytbg.html` は見直さない。** サーバを通らない静的ページで、本体と
  独立している。URL が `ytbg1〜4.ytani.net` でベタ書きされているのは
  分かっているが、今回の範囲に入れない
- **盤面のファイル保存・読み込みは復活させない。** `gen_gameinfo()` /
  `write_gameinfo()` / `read_gameinfo()` は消す。メニューは `index.html` で
  コメントアウトされており、`gen_gameinfo()` は古い `point` 形式を返し
  `board.player_name`（実際は `playername`）を読む壊れた状態。
  履歴はサーバ側に保存されているので、盤面が失われることはない
- **座標のレスポンシブ化はしない。** `bx` / `by` の絶対座標は `layout.js` に
  集約するところまでで、画面幅に追随させるのは別の話
- **eslint とバンドラは入れない。** `npm` と `node_modules` を持ち込むと、
  `uv` だけで済んでいる運用が変わる。ただし**ブラウザでの動作確認に使う
  playwright は例外**として入れる（TODO-021 で決めた。確認の質が上がる
  ほうを採った）

## 実装項目の分割

| 番号 | 見出し |
|------|--------|
| TODO-021 | ブラウザでの動作確認の仕組みを作る |
| TODO-022 | デッドコードを消す |
| TODO-023 | gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す |
| TODO-024 | サーバを分割する（hub / history / storage / replay / app） |
| TODO-025 | メッセージを型付けし、`on_json` をディスパッチ表にする |
| TODO-026 | JS のルール層を純粋関数として切り出し、`node --test` を足す |
| TODO-027 | JS を ES Modules に分割し、継承階層を組み直す |
| TODO-028 | DOM 生成を JS へ移し、`onClick` 属性をやめる |
| TODO-029 | 表示更新の経路を 1 本にする |

**実際に立てた番号は 1 つずれた。** この表を書いたあと、favicon の項目が
TODO-022 として先に立ったので、実装項目は TODO-023〜030 になった
（TODO-021 だけは表のとおり）。**表は当時の記録なので直していない。**
現行の並びは `TODO.md` と [`docs/design.md`](../docs/design.md) を見ること。

順番の理由:

- **TODO-021 が先頭。** 以降の項目の確認担当が使う。決めた時点では
  デッドコード削除を先頭にしていたが、ブラウザでの確認ができると
  分かった（後述）ので入れ替えた
- **TODO-022 は早いうちに。** 消すものを後の項目が運ばずに済む
- **TODO-023 で gameinfo の構造が変わる。** JS 側は追随の最小限だけ直す
- TODO-024 と TODO-025 は Python の内部の整理で、挙動は変えない
- **TODO-026 は TODO-023 のあと。** `Position` が gameinfo から作られる
- **TODO-027 は TODO-026 のあと。** ルール層が先に出ていれば残りの分割が素直になる
- **TODO-028 は TODO-027 のあと。** ES Modules になっていないと
  `onClick` をやめられない
- **TODO-029 が最後。** `Position` とルール層が揃ってからでないと予測が作れない

TODO-023 が終われば、Python 側（024、025）と JS 側（026〜029）は
独立に進められる。

TODO-022 で消すものは、この項目の調査で場所と未使用であることを確かめてある。

## サブエージェントの定義

`~/.claude/agents/` に implementer / verifier / reviewer / wording が
常設されており、**このプロジェクト用に足すものは無い**。定義は工程で
切られていて言語に依存しないので、JS の項目でもそのまま使える。

**いったん「`.claude/agents/` がまだ無いので作る」と書いてしまい、あとで
訂正した**（コミット `49ce0cc`）。プロジェクトの `.claude/agents/` だけを見て、
グローバルの定義を見ていなかった。

## ブラウザでの動作確認ができると分かった

「ブラウザでの確認は利用者にお願いすることになる」と書いたところ、
できるのではと指摘を受けて試したら、**できた**。

| やったこと | 結果 |
|------------|------|
| 盤面を開いてスクリーンショット | chromium の headless 単体（追加インストール不要） |
| Roll ボタンを押す | `dice = [4,0,0,0]`（turn=2 なので 1 個 = 先手決め） |
| チェッカーをドラッグ | `cur_point` が 6 → 26 に変わった |
| 2 枚目のタブへの同期 | 同じ `cur_point` が読めた |
| JS の内部状態 | `board.turn` / `board.free_move` / `board.moving_checker.id` |

仕組みを整えるのが TODO-021。実測で分かったこと:

- **システムの `/usr/bin/chromium` を `executablePath` で指定する。**
  `~/.cache/ms-playwright/` にあるリビジョン（1234）は playwright 1.63.0 が
  要求するもの（1243）と合わず、そのままでは起動しない。指定しないと
  `npx playwright install` で数百 MB を落としに行くことになる
- **`#p000` を掴むと `moving_checker` は `p002` になる。** 「クリックされた
  ポイントの先端のチェッカーに持ち換える」という `Checker.on_mouse_down_xy()`
  の意図どおりで、正しい挙動。テストを書くときはここで取り違えやすい
- 初回ロード時にコンソールエラーが 2 件（404）出る。2 回目以降は出ない。
  **正体は未特定**
- `pgrep -f 'ytbg.*cctest'` で**自分のシェルを巻き込んだ**。パターンが、
  それを実行しているシェルのコマンドラインにもマッチする。
  `CLAUDE.md` には「`pkill` はパターンで自分のシェルを巻き込むので
  `pgrep` で PID を確かめてから」とあるが、`pgrep` 自体も同じ穴を持つ

## テスト

この項目ではコードを変えていないので、テストは走らせていない。
実装の各項目で `uv run pytest` / `uv run ruff check .` / `uv run mypy src` を
確かめる。TODO-021 以降は `tests/browser/`、TODO-026 以降は
`node --test tests/js/` も足す。
