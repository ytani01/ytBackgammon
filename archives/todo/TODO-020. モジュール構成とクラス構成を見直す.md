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

**この項目では設計を決めるだけで、`src/` は触っていない。**
実装は TODO-021 以降に分ける。

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

## 決めたこと

### 前提（相談して決めた）

- 保存ファイル（`~/ytbg-*.json`）と `gameinfo` の構造は**変えてよい**。
  ただし**旧形式の読み込みは残す**
- JS は **ES Modules** で複数ファイルに分ける。バンドラは入れない
- ルール判定は**クライアントの純粋ロジック層**へ切り出す。サーバは持たない
- 「1 枚のボードを全員で共有して自由に触れる」という目的と、
  free move モードは変えない

### Python のモジュール構成

```
src/ytbg/
  __init__.py    パッケージ定数（WEBROOT, __version__）
  __main__.py    click の main() だけ
  app.py         create_app() — ルーティングと WebSocket の受信ループ
  mylog.py       （変えない）
  gameinfo.py    GameInfo / BoardState / CubeState の dataclass
  message.py     クライアント → サーバのメッセージの型
  clock.py       Clock
  history.py     History
  storage.py     Storage（保存・読み込み、旧形式の変換）
  hub.py         ClientHub（接続中の WebSocket と broadcast）
  replay.py      Replayer（連続再生の Task 管理）
  server.py      BackgammonServer（上をまとめ、メッセージを捌く）
```

1 ファイル 100 行前後になる。クラス名は Python の慣習に合わせ、
`ytBackgammonServer` を `BackgammonServer` にする。`ytBackgammon` は
`GameInfo` に吸収して無くす（今も gameinfo を持つだけで、
更新の処理はサーバ側から直接書かれている）。

### gameinfo の型付けは dataclass

TypedDict なら JSON との変換が要らないが、振る舞いを持てない。
カプセル化が壊れているのが今いちばん困っているところなので、
**dataclass にして更新の操作をそこへ集める**。JSON 化は
`dataclasses.asdict()`、読み込みは `from_dict()` を自前で書き、
旧形式の変換もそこで吸収する。

### クロックを gameinfo から外す

`clock_limit` と `board.clock` を `GameInfo` から出し、`Clock` が
`limit` / `sw` / `active` / 残り時間 / 基準の時刻をまとめて持つ。

外すと 2 箇所の帳尻合わせが消える。

- `_load_hist_ent()` の「クロックの残り時間だけは引き継ぐ」という例外
  （TODO-016 で足したもの。クロックは履歴の対象外と TODO-010 で決めたのに、
  gameinfo に入っているため履歴に載ってしまうのが原因）
- `new_game()` が `score` / `playername` / `clock_limit` を退避して
  `init_gameinfo()` のあとに書き戻している処理

`new_game()` は「`board` を作り直し、`turn` と `resign` を戻す」だけになる。
`score` と `playername` は gameinfo に残す（`init_gameinfo()` が消して
しまうのが問題だっただけで、履歴に載ること自体は自然）。

### GameInfo の構造

```python
@dataclass
class CubeState:
    side: int = -1          # -1: center, 0|1: player
    value: int = 1
    accepted: bool = True

@dataclass
class BoardState:
    playername: list[str]
    cube: CubeState
    dice: list[list[int]]              # [2][4]
    checker: list[list[list[int]]]     # [2][15] = [point, idx]

@dataclass
class GameInfo:
    sn: int
    server_version: str
    game_num: int
    match_score: int
    score: list[int]
    turn: int                # <=-1:操作不可, 0|1:各プレーヤー, >=2:両方可
    resign: int
    board: BoardState
```

チェッカーの ID（`player * 100 + i`）とポイント番号（0〜25 が盤上、
26/27 がバー）は変えない。

### 保存は JSON Lines へ

`~/ytbg-{server_id}.jsonl` に 1 行 1 手で書く。

```
{"v": 2, "clock": {...}}
{"h": {...gameinfo...}}
{"h": {...gameinfo...}}
{"f": {...gameinfo...}}
```

1 行目がメタで、形式のバージョンとクロックの状態。`h` が `_history`、
`f` が `_fwd_hist` で、書かれた順がスタックの順。

`json.dumps()` を 1 行につき 1 回呼ぶだけになるので、**キーを足したときに
`hist_ent2str()` を直し忘れて落ちる、という危険が無くなる**。
`json.dumps(..., indent=2)` でまとめて書くと checker の配列が縦に伸びて
1 手 60 行になり読めないので、行で区切るこの形にした
（「1 手 1 行に近い読みやすい形」という元の狙いは、むしろこちらのほうが揃う）。

旧形式（`~/ytbg-{server_id}.json`）は `.jsonl` が無いときだけ読む。
`clock_limit` と `board.clock` は最後のエントリの値を `Clock` の初期値にする。
書き戻しは常に `.jsonl` で、**旧ファイルは消さない**。

### メッセージの型付けとディスパッチ

`message.py` に type ごとの frozen dataclass を置き、`parse(msg)` が
`type` を見て組み立てる。`data` のキーが足りなければそこで例外になるので、
今のように `msg['data']['n']` が奥で `KeyError` を出すことがなくなる。

`on_json()` の 20 個の `if` は登録表に置き換える。今の分岐は
「前半は return し、後半は末尾の `add_history` と `emit_gameinfo` へ落ちる」
という 2 段構造になっているので、**ハンドラの戻り値でそれを表す**。

- `None` を返す … 自分で送信済み。共通の後処理をしない
  （`back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` /
  `clear_hist` / `new` / `set_gameinfo` の 9 つ）
- `float` を返す … アニメーションの秒数。共通の後処理
  （`history` フラグを見て履歴へ積み、`emit_gameinfo`）を行う
  （盤面とクロックを変える 14 個）

### JavaScript のファイル構成

```
static/js/
  main.js       エントリ。DOM を作り、Board を組み立て、WebSocket をつなぐ
  ws.js         接続・再接続・送信
  log.js        レベル付きのログ（?debug=1 で有効）
  layout.js     盤面の座標
  dom.js        要素の生成
  settings.js   Cookie / QueryString / ヘッダのチェックボックス
  sound.js      効果音
  board.js      Board。gameinfo を受けて表示要素を更新する
  rules/
    position.js  Position — 盤面を単純なデータで表す
    move.js      行き先の計算
    judge.js     盤面の判定
  ui/
    base.js      BgBase / BgText / BgImage
    point.js     BoardPoint
    checker.js   Checker
    cube.js      Cube
    dice.js      Dice / RollButton
    clock.js     PlayerClock / ClockLimit
    label.js     PlayerName / PlayerScore / PlayerPipCount
    button.js    ボタン各種
```

### ルール層の要は Position

今のルール判定が切り出せないのは、`this.point[p].checkers`（DOM を持つ
`Checker` の配列）を見ているため。**盤面を単純なデータで表す `Position` を
作り、ルール層はそれだけを受け取る。**

```js
export class Position {
    // pt[p] = { player: 0|1|null, n: 枚数 }   p = 0..27
    static from_gameinfo(gameinfo) { ... }
    owner(p) / count(p)
    with_move(from_p, to_p, player)   // 動かした後の Position を返す
}
```

`rules/` の関数はすべて `Position` と `player` と出目だけを受け取り、
DOM も `Board` も見ない。`BgBase` にある `goal_point()` / `bar_point()` /
`calc_dst_point()` / `get_pip()` もここへ移す。

`winner_is()` の `this.resign = -1` という書き換えと、`pip_count()` の
表示更新は切り離す。判定は値を返すだけにし、表示は呼んだ側が行う。

### 継承階層の組み直し

- 属性を足すだけの中間クラス（`BoardText` / `PlayerText` / `PlayerItem` /
  `OnBoardImage` / `OnBoardButton`）をやめ、コンストラクタのオプション引数で
  `board` と `player` を渡す。段数が 5 から 2 になる
- `EmitButton` の 6 つのサブクラス（`BackButton` … `FwdAllButton`）は
  引数が違うだけなので、`EmitButton` 1 つにして生成時に type と data を渡す
- `BannerButton` の 3 つのサブクラス（`Pass` / `ResignBanner` / `Win`）は
  押したときの動作をコールバックで渡す
- クラス数は 35 前後から 20 前後になる

### DOM 生成を JS へ移す

`index.html` に残すのは header と `<div id="board">` だけにし、
`<body data-image-dir="{{image_dir}}" data-server-id="{{server_id}}">` で
値を渡す。要素は `dom.js` が作る。

`BgImage.get_image_dir()` が `src` の文字列を切り出して画像ディレクトリを
逆算している処理は、JS が最初からディレクトリを知ることになるので消える。

`onClick` / `onChange` 属性は全部やめて `addEventListener` にする。
**ES Modules ではスコープが閉じてグローバル関数が見えなくなるので、
これは避けられない**（`onClick="new_game();"` は動かなくなる）。

### 表示更新の経路を 1 本にする

`Board.apply(gameinfo, {sec, history_flag, clock_state, last_op})` を
表示を変える唯一の経路にする。

`Checker.on_mouse_up_xy()` の**先行実行は残す**。共有ボードなので、
ドラッグを離した瞬間に反応が無いと操作感が悪い。ただし今のように
`put_checker()` を直接呼ぶのではなく、**`Position.with_move()` で
予測した gameinfo を作って `apply()` に渡す**形にする。これで
`put_checker()` と `load_gameinfo()` の二重実装が消える。

### JS のテスト

`tests/js/` に置き、`node --test tests/js/` で走らせる。
**`node --test` は Node の標準機能なので npm パッケージは要らない**。
対象は `rules/` と `Position`。DOM を触るクラスはテストせず、
今までどおり実際に触って確かめる。

## やらないと決めたこと

- **eslint とバンドラは入れない。** npm と `node_modules` を持ち込むと、
  `uv` だけで済んでいる運用が変わる。書き方の慣習は `CLAUDE.md` に書く
- **ルール判定をサーバへ移さない。** ドラッグ中の反応にサーバ往復が要る
  設計になり、free move の扱いも作り直しになる
- **座標のレスポンシブ化はしない。** `bx` / `by` の絶対座標は `layout.js` に
  集約するところまでで、画面幅に追随させるのは今回の範囲外
- **`ytbg.html` は対象外。** サーバを通らない静的ページで、本体と独立している
- **盤面のファイル保存・読み込みは復活させない。** `gen_gameinfo()` /
  `write_gameinfo()` / `read_gameinfo()` は消す（メニューは `index.html` で
  コメントアウトされており、`gen_gameinfo()` は古い `point` 形式を返し
  `board.player_name`（実際は `playername`）を読む壊れた状態）。
  履歴はサーバ側に保存されているので、盤面が失われることはない

## 実装項目の案

| 番号 | 見出し |
|------|--------|
| TODO-021 | デッドコードを消す |
| TODO-022 | gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す |
| TODO-023 | サーバを分割する（hub / history / storage / replay / app） |
| TODO-024 | メッセージを型付けし、`on_json` をディスパッチ表にする |
| TODO-025 | JS のルール層を純粋関数として切り出し、`node --test` を足す |
| TODO-026 | JS を ES Modules に分割し、継承階層を組み直す |
| TODO-027 | DOM 生成を JS へ移し、`onClick` 属性をやめる |
| TODO-028 | 表示更新の経路を 1 本にする |

順番の理由:

- **TODO-021 が先頭。** 消すものを後の項目が運ばずに済む
- **TODO-022 で gameinfo の構造が変わる。** JS 側は追随の最小限だけ直す
- TODO-023 と TODO-024 は Python の内部の整理で、挙動は変えない
- **TODO-025 は TODO-022 のあと。** `Position` が gameinfo から作られる
- **TODO-026 は TODO-025 のあと。** ルール層が先に出ていれば残りの分割が素直になる
- **TODO-027 は TODO-026 のあと。** ES Modules になっていないと `onClick` をやめられない
- **TODO-028 が最後。** `Position` とルール層が揃ってからでないと予測が作れない

TODO-022 が終われば、Python 側（023、024）と JS 側（025〜028）は
独立に進められる。

TODO-021 で消すもの:

- `gen_gameinfo()` / `write_gameinfo()` / `read_gameinfo()` と、
  グローバルの `write_gameinfo` / `read_gameinfo` / `clear_filename`、
  定数 `GAMEINFO_FILE`、`index.html` のコメントアウトされたメニュー
- `Checker.get_available_points()`（`return []` の T.B.D.）
- `Board.clock_on()` / `Board.clock_off()`（呼ばれていない）
- `apply_sound_switch()` の
  `window.open("http://www.ytani.net:8080/ytbackgammon/", '_parent')`
  （Sound のチェックボックスを切り替えるたびに、親フレームごと外部サイトへ
  移動する）と、その手前の使われていない `GlobalSoundSwitch` / `board_num` の
  取り直し
- `CookieBase.save()`（`if (Object.keys(this.data)) return;` は配列が
  常に真なので必ず戻る。呼び出しも無い）
- `RollButton.roll()` の使われていない `modified`
- dice histogram のコメントアウトの塊
- `index.html` の `for"disp-pip"` / `for"clock_limit0"` / `for"clock_limit1"` /
  `for "clock_sw"` というタイプミス（`for` が効いておらず、ラベルを
  押しても切り替わらない）

## サブエージェントの定義

`~/.claude/agents/` に implementer / verifier / reviewer / wording が
常設されており、**このプロジェクト用に足すものは無い**。定義は工程で
切られていて言語に依存しないので、JS の項目でもそのまま使える。
`verifier` が走らせる検証は `CLAUDE.md` の「実行」の節にある
`uv run pytest` / `uv run ruff check .` / `uv run mypy src`。

TODO-025 以降で `node --test tests/js/` が加わるので、そのときに
`CLAUDE.md` の「実行」の節へ足す（定義側は直さなくてよい）。

## テスト

この項目ではコードを変えていないので、テストは走らせていない。
実装の各項目で `uv run pytest` / `uv run ruff check .` / `uv run mypy src` を
確かめる。TODO-025 以降は `node --test tests/js/` も足す。
