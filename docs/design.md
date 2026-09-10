# ytBackgammon 設計

**これは目指す構成であって、現状の実装ではない。** TODO-020 で決め、
TODO-023 以降で実装する（TODO-020 の計画では TODO-022 以降だったが、
favicon の項目が TODO-022 として先に立ったため 1 つずれた）。
どこまで実装したかは `CLAUDE.md` と git の履歴で確かめること。

## 全体の方針

- 「1 枚のボードを全員で共有して自由に触れる」という目的は変えない。
  対戦相手を組ませるゲームサーバではないので、**ルールチェックは補助**で、
  free move モードで無効化できる
- **ルール判定はクライアントだけが持つ。** サーバは盤面を預かって配るだけ
- **保存形式と `gameinfo` の構造は変えてよい。** ただし旧形式は読めるようにする
- **JS は ES Modules で分ける。バンドラは入れない**（`uv` だけで済んでいる
  運用を変えないため）

## Python

### モジュール構成

```
src/ytbg/
  __init__.py    パッケージ定数（WEBROOT, __version__）
  __main__.py    click の main() だけ
  app.py         create_app() — ルーティングと WebSocket の受信ループ
  mylog.py       ログ（loguru）
  gameinfo.py    GameInfo / BoardState / CubeState
  message.py     クライアント → サーバのメッセージの型
  clock.py       Clock
  history.py     History
  storage.py     Storage（保存・読み込み、旧形式の変換）
  hub.py         ClientHub（接続中の WebSocket と broadcast）
  replay.py      Replayer（連続再生の Task 管理）
  server.py      BackgammonServer（上をまとめ、メッセージを捌く）
```

1 ファイル 100 行前後。クラス名は Python の慣習に合わせ、
`ytBackgammonServer` を `BackgammonServer` にする。`ytBackgammon` は
`GameInfo` に吸収して無くす。

`create_app()` にすることで、モジュールのグローバルだった `svr` と `app` が
無くなり、**WebSocket 経路そのもののテストが書けるようになる**。

### GameInfo

`gameinfo` は生の dict をやめて dataclass にする。TypedDict では振る舞いを
持てず、**カプセル化が壊れている問題（`_bg._gameinfo[...]` への外部からの
直接アクセスが 20 箇所以上）が残る**ため。

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

JSON 化は `dataclasses.asdict()`、読み込みは `from_dict()` を自前で書き、
旧形式の変換もそこで吸収する。

チェッカーの ID（`player * 100 + i`）とポイント番号（0〜25 が盤上、
26/27 がバー）は変えない。

### クロックは gameinfo の外

`clock_limit` と `board.clock` を `GameInfo` から出し、`Clock` が
`limit` / `sw` / `active` / 残り時間 / 基準の時刻をまとめて持つ。

**外すと 2 箇所の帳尻合わせが消える。**

- `_load_hist_ent()` の「クロックの残り時間だけは引き継ぐ」という例外。
  クロックは履歴の対象外と決めた（TODO-010）のに `gameinfo` に入っているため、
  戻すと動いているクロックが昔の値から数え直しになる。TODO-016 はこれを
  例外で塞いだが、そもそも入れなければ要らない
- `new_game()` が `score` / `playername` / `clock_limit` を退避して
  `init_gameinfo()` のあとに書き戻している処理

`new_game()` は「`board` を作り直し、`turn` と `resign` を戻す」だけになる。
`score` と `playername` は `gameinfo` に残す（`init_gameinfo()` が消して
しまうのが問題だっただけで、履歴に載ること自体は自然）。

### 保存は JSON Lines

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
保存側を直し忘れて落ちる、という危険が無くなる**（今は
`save_data()` が文字列連結で組み立てており、`hist_ent2str()` も直さないと
落ちる）。`json.dumps(..., indent=2)` でまとめて書くと checker の配列が
縦に伸びて 1 手 60 行になり読めないので、行で区切る。
「1 手 1 行に近い読みやすい形」という元の狙いは、むしろこちらのほうが揃う。

旧形式（`~/ytbg-{server_id}.json`）は `.jsonl` が無いときだけ読む。
`clock_limit` と `board.clock` は最後のエントリの値を `Clock` の初期値にする。
書き戻しは常に `.jsonl` で、**旧ファイルは消さない**。

### メッセージの型付けとディスパッチ

`message.py` に type ごとの frozen dataclass を置き、`parse(msg)` が
`type` を見て組み立てる。`data` のキーが足りなければそこで例外になるので、
`msg['data']['n']` が奥で `KeyError` を出すことがなくなる。

`on_json()` の 20 個の `if` は登録表に置き換える。今の分岐は
「前半は return し、後半は末尾の `add_history` と `emit_gameinfo` へ落ちる」
という 2 段構造なので、**ハンドラの戻り値でそれを表す**。

| 戻り値 | 意味 | 対象 |
|--------|------|------|
| `None` | 自分で送信済み。共通の後処理をしない | `back` / `back2` / `back_all` / `fwd` / `fwd2` / `fwd_all` / `clear_hist` / `new` / `set_gameinfo` |
| `float` | アニメーションの秒数。`history` フラグを見て履歴へ積み、`emit_gameinfo` | 盤面とクロックを変える 14 個 |

## JavaScript

### ファイル構成

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

### Position とルール層

**ルール層の要は `Position`。** 今のルール判定が切り出せないのは、
`this.point[p].checkers`（DOM を持つ `Checker` の配列）を見ているため。
盤面を単純なデータで表す型を作り、ルール層はそれだけを受け取る。

```js
export class Position {
    // pt[p] = { player: 0|1|null, n: 枚数 }   p = 0..27
    static from_gameinfo(gameinfo) { ... }
    owner(p) / count(p)
    with_move(from_p, to_p, player)   // 動かした後の Position を返す
}
```

`rules/` の関数はすべて `Position` と `player` と出目だけを受け取り、
DOM も `Board` も見ない。**`BgBase` にある `goal_point()` / `bar_point()` /
`calc_dst_point()` / `get_pip()` もここへ移す**（今は全 UI 部品の基底クラスに
ルール計算が入っており、テキスト表示もボタンもそれを継承している）。

判定は値を返すだけにする。今の `winner_is()` は判定の名前で
`this.resign = -1` を書き換え、内部で呼ぶ `pip_count()` は
`this.pip[player].set(count)` で表示まで変えている。表示は呼んだ側が行う。

### 継承階層

- 属性を足すだけの中間クラス（`BoardText` / `PlayerText` / `PlayerItem` /
  `OnBoardImage` / `OnBoardButton`）をやめ、コンストラクタのオプション引数で
  `board` と `player` を渡す。**段数が 5 から 2 になる**
- `EmitButton` の 6 つのサブクラス（`BackButton` … `FwdAllButton`）は
  引数が違うだけなので、`EmitButton` 1 つにして生成時に type と data を渡す
- `BannerButton` の 3 つのサブクラス（`Pass` / `ResignBanner` / `Win`）は
  押したときの動作をコールバックで渡す
- クラス数は 35 前後から 20 前後になる

### DOM 生成

`index.html` に残すのは header と `<div id="board">` だけにし、
`<body data-image-dir="..." data-server-id="...">` で値を渡す。
要素は `dom.js` が作る（今はチェッカー 30 個 + ダイス 8 個の `<div>` が
ベタ書きされ、JS が `getElementById("p000")` で拾っている）。

`BgImage.get_image_dir()` が `src` の文字列を切り出して画像ディレクトリを
逆算している処理は、JS が最初からディレクトリを知ることになるので消える。

**`onClick` / `onChange` 属性は全部やめて `addEventListener` にする。**
ES Modules ではスコープが閉じてグローバル関数が見えなくなるので、
これは避けられない（`onClick="new_game();"` は動かなくなる）。

### 表示更新の経路

`Board.apply(gameinfo, {sec, history_flag, clock_state, last_op})` を
表示を変える唯一の経路にする。

`Checker.on_mouse_up_xy()` の**先行実行は残す**。共有ボードなので、
ドラッグを離した瞬間に反応が無いと操作感が悪い。ただし今のように
`put_checker()` を直接呼ぶのではなく、**`Position.with_move()` で
予測した gameinfo を作って `apply()` に渡す**。これで `put_checker()` と
`load_gameinfo()` の二重実装が消える。

## テスト

| 対象 | 手段 |
|------|------|
| Python | `uv run pytest` |
| JS のルール層 | `node --test tests/js/` |
| ブラウザでの動作 | `tests/browser/`（playwright） |

**`node --test` は Node の標準機能なので、ルール層のテストに npm パッケージは
要らない。** DOM を触るクラスは単体テストせず、ブラウザの確認で見る。

ブラウザの確認では、システムの chromium を `executablePath` で使う
（`~/.cache/ms-playwright/` にあるリビジョンは playwright が要求するものと
合わないことがあり、そのままでは起動しない）。2 枚のタブを開けば、
**共有ボードの本体である「複数クライアントの同期」まで確かめられる**。

## 採らなかった案

- **ルール判定をサーバへ移す。** ドラッグ中の反応にサーバ往復が要る設計になり、
  free move の扱いも作り直しになる
- **ルール判定を Python と JS の両方に持つ。** 同じルールを 2 言語で
  保守することになる
- **`gameinfo` を TypedDict にする。** JSON との変換は要らなくなるが、
  振る舞いを持てず、いちばん困っているカプセル化の問題が残る
- **バンドラ（Vite など）と eslint を入れる。** `npm` と `node_modules` を
  持ち込むと、`uv` だけで済んでいる運用が変わる。書き方の慣習は
  `CLAUDE.md` に書く
- **座標のレスポンシブ化。** `bx` / `by` の絶対座標は `layout.js` に
  集約するが、画面幅に追随させるのは別の話
- **盤面のファイル保存・読み込みの復活。** 履歴はサーバ側に保存されており、
  盤面が失われることはない
