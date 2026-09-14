# モジュール構成とクラス構成の見直し（第 4 弾）

TODO-056 の設計案。2026-09-14 作成。現行仕様ではない。
この項目ではソースコードを変更しない。

2026-09-14 に、Codex（main）が設計し、reviewer が現行コードと照らして確認した。
同日に Claude Code（main）が改めて確認し、利用者と相談して方針を決めた。
さらに過剰な実装の点から見直して、層とファイルを減らした
（末尾の「設計確認で決めたこと」）。本文はその決定を反映してある。

## 目的と範囲

状態の持ち主を明確にし、操作の判断を表示部品から独立させる。
クラスは状態やライフサイクルを持つものに使い、計算は関数にする。
ファイルを分けるだけで相互参照が残る構成は避ける。
ファイルと層は、使う側が 2 つ以上になるまで分けない。

共有ボード、free move、クライアントでのルール判定、WebSocket の
メッセージ形式、JSON Lines v2、ES Modules による配布を維持する。
先行実行の競合解決や配信キューの導入は、別の挙動変更になるため含めない。
操作条件や例外時の扱いは、下の「変える挙動」を除いて変えない。

## 現行コードで確認した問題

| 場所 | いまの問題 | 変更後 |
|------|------------|--------|
| `board.js` の `Board extends BgImage` | アプリの状態と表示部品の継承が一体 | Controller と View を分け、背景画像は View が持つ |
| `checker_order()` / `predict_gameinfo()` | 駒の並びや予測が `Checker` を返す、または読む | ID と盤面データだけで計算 |
| `actions.js` の `decide_dst()` / `move()` | 表示部品から行き先・ヒット・送信内容を決める | 純粋関数が操作と予測の盤面を返す |
| `Board.apply()` | 盤面の置き換え、描画、クロックの反映、演出を一度に行う | Controller が順番を決め、View は描画を受け持つ |
| `RollButton` | ダイス 4 個の生成、他のバナーの操作、2 秒後の自動クリック | View が部品を組み、Controller がタイマーを持つ |
| `PlayerClock` / `ClockLimit` | 残り時間・設定の保持と DOM の表示が一体 | Controller が時刻の基準を持ち、View が表示 |
| `BgBase.get_xy()` | 基底クラスが `board.settings` や派生クラスの `settings` を読む | 入力用の座標変換を引数で渡す |
| `BoardPoint` | DOM が無いのに表示の基底を継承し、駒を直接動かす | `layout.js` の座標計算 |
| `settings.js` / `log.js` | 互いに import していて、評価の順番に注意が要る | `log.js` がクエリを直接読み、循環を無くす |

根拠は現在の `src/ytbg/` と `tests/`。過去の `design-3.md` は経緯として確認した。
TODO-053 で見送った「同時ドラッグのテストが部品の入力経路を通らない」点は、
今回その経路を変えるので検証の対象にする。

**サーバの構成は変えない**（「サーバ」の節を見ること）。

## 変える挙動

構成を移すときに、次の挙動だけを変える。**そのコードを移す段階で入れ、
変える点ごとにテストを足して、変える前のコードで落ちることを確かめる。**

| 挙動 | いま | 変えたあと | 段階 |
|------|------|------------|------|
| 目が 0 のダイス | 使えない目を 11〜16 にするとき、0 が 10 になって送られ、履歴にも残る | 0 のまま | 3 |
| Clock のチェックボックス | 計算は送信前に変わり、表示の ON/OFF は返事を待つ | 送るだけにして、両方とも返事の `clock_state` で変える | 4 |
| 履歴の返事でのクロック | `clock_state` のうち `limit` だけを反映する | 全部反映する（クロックは履歴の対象外なので巻き戻らない） | 4 |
| ドラッグ中の受信 | 駒は手元に残るが、キューブは決まった位置へ飛ぶ | キューブも手元に残す | 4 |
| `history_flag` | サーバが返事に載せ、クライアントはクロックの反映を分けるのに読む | 送らない（上の変更で読む側が無くなる） | 4 |

保存済みの `.jsonl` にある 10 は、表示も判定も 0 と同じに扱われるので、
そのまま読める。

次の 2 つは今のまま残す（返事が届けば直り、直すには先行実行の仕組みを
変える必要があるため）。

- Roll の直後に得点の ▲ や free move のダイスを押すと、予測の描画で
  Roll ボタンがもう一度出る
- 予測を描画すると、他のクライアントが変えた `score` や名前が 1 往復ぶん戻る

## クライアントの構成

```text
main.js ── 組み立て・起動
  ├─ BoardController ── rules/
  │       ├─ 送信関数（ws.js から渡す）
  │       └─ BoardView ── ui/・layout.js・Drag
  └─ Settings・音
```

View と ui は Controller を import しない。入力はコールバックで
ID・値・盤面の座標を渡す。rules は DOM・WebSocket・音に依存しない。
`rules/` が import できるのは、これまでどおり `rules/` の中だけ。
Controller も View を外から受け取るので、DOM なしで動かせる。

| モジュール | 公開するもの | 持つ状態 |
|------------|--------------|----------|
| `board_controller.js` | `BoardController.receive(data)`、`predict(gameinfo)`、`snapshot(now)`、操作ごとのメソッド | 今の gameinfo、履歴の番号、クロックの基準値と基準時刻、オープニングと時計の更新のタイマー、渡された View・送信関数・Settings |
| `board_view.js` | `BoardView.render(snapshot, options)`、`render_clock(clock)`、`play_effects(effects)` | DOM の部品、画像の寸法、向き、ドラッグ |
| `rules/actions.js` | 操作ごとの判定と送信内容（下の表） | なし |
| `rules/position.js` | 既存のものに加えて `checker_order(gi)`、`checkers_at(gi, point)`、`active_dice(gi, player)` | なし |
| `layout.js` | 既存の配置に加えて `checker_geometry(point, index, size)` と当たり判定 | なし |

設計案の最初の版にあった `BoardModel`、`presentation.js`、`input.js`、
`rules/state.js`、`config.js` は作らない（「設計確認で決めたこと」の 3・6）。

- `effects_for(previous, next, last_op)`（鳴らす音と回すダイスを返す）は、
  変更前の盤面を持つ Controller が求めて `view.play_effects()` に渡すので、
  `board_controller.js` の中の関数にする
- 入力のリスナーは `board_view.js` の中でつなぐ。盤面はページを閉じるまで
  使うので、外す関数や `dispose()` は作らない
- バナーの表示、PIP、名前の強調は、`BoardView.render()` が snapshot から
  直接決める。中間の値は作らない
- 盤面を読む関数は `rules/position.js` に足す。`copy_gameinfo()` は既にある

メソッド名はこの設計で勧める名前。引数の意味は次のとおりで、
実装するときに JSDoc で具体的な型を付ける。

- `receive(data)` の `data` は、サーバの返事の `data` 全体
- `snapshot(now)` は、盤面、履歴の番号、その時点のクロックの値をまとめた、
  読むだけの値。View は保存も書き換えもせず、その場で描画する
- `checker_order()` は `{id, player, point, idx}` の列。`idx` の安定ソートと、
  同じ値のときの player・駒番号の順を保つ。ui の駒に直すのは View だけ
- `plan_move()` は、成り立たなければ `null`、成り立てば
  `{message: {type, data}, predicted}`。ヒットの 2 手、`idx`、使ったダイス、
  勝ちの点数を同じ予測から求める。駒の移動元は gameinfo から読む。
  渡された盤面を書き換えず、`sn` を進めない
- `render()` は、表示部品からルールを呼んだり、別の表示部品を操作したりしない

予測の計算は rules が行い、Controller は結果の置き換えと状態の保持を受け持つ。
今の `actions.js` は、純粋な判定を `rules/actions.js` に、送信・予測の反映・
タイマーを Controller に移し、移し終えたら消す。

操作の判定として公開するものは次の表で決める。plan の関数は、成り立たなければ
`null`、成り立てば `message` と、要るときだけ `predicted` を返す。
表示の指示は返さない。**判定の無い操作（`end_turn`、`take`、`cancel_double`、
名前・履歴・時計の設定）は関数にせず、Controller が直接送る。**

| 純粋関数（`rules/actions.js`） | 入力と判定 |
|--------------------------------|------------|
| `can_pick_checker(gi, id, free_move)` | 駒を掴めるか |
| `decide_dst(gi, id, point)` | 行き先とヒット |
| `plan_move(gi, id, point)` | 上のとおり |
| `can_hold_cube(gi, player)` | `turn`、キューブの `side`・`accepted`、両者のダイス |
| `plan_cube_drop(gi, player, geometry)` | 下の「入力、ドラッグ、クロック」を見ること |
| `plan_roll(gi, player, random_values)` | キューブ・`turn` と、抽選済みの位置・目からダイスを作る。乱数を作るのは Controller |
| `plan_dice_click(gi, player, index, free_move)` | free move、先手決め、ダイスを使い切ったあとの `end_turn` |
| `plan_double(gi, player, redouble)` | 今の上限の条件と送信内容 |
| `plan_resign(gi, player)` | 未テイクのときの扱いと投了の点数 |
| `plan_score(gi, player, operation)` | 加点・クリア、上限、予測の盤面 |
| `plan_put_checker(gi, id, point)` | free move の `idx` と送信内容。予測はしない |

数への変換は Controller が行う。時計の `stop` / `resume` は Controller が持つ
`active` から選ぶ。ルールに時計や通信を持ち込まない。Roll が成り立ったときの
ボタンの非表示と、自動操作の予約は Controller が行う。

### 状態の反映と演出

サーバから受け取ったら、Controller が変更前の盤面を取り、返事を反映し、
View を描画してから演出を行う。`put_checker` の音は変更前の盤面の
位置で判定し、`move` のヒット音はこれまでどおり `last_op.moves` のバーへの
移動で判定する。`roll` は `turn` が -1 のとき演出しない。`opening` /
`end_turn` の音は、手番の差ではなく操作名と新しい `turn` で判定する。

予測も同じ描画を使うが、クロックの基準と演出には触れない。
通常の `move` は送信してから予測を反映し、free move のダイス・得点は
予測を反映してから送る。今の順番を保つ。free move の駒は予測しない。
送信中の予測を返事に重ね直す仕組みは作らず、返事で今の値を置き換える。

`Dice.set(value)` は画像・不透明度・定位置を反映し、`animate_roll()` は
回転だけを受け持つ。Roll ボタンとダイスは View の中で並べて持ち、
Roll ボタンがダイスを持つ形をやめる。

### 入力、ドラッグ、クロック

`BgBase` は DOM の移動・回転・表示だけを持つ。`BgImage` / `BgText` の
薄い継承は残してよいが、board・Settings・操作の関数への参照は持たせない。
すべてのイベントを基底のコンストラクタで登録せず、要る部品だけを View がつなぐ。
マウスとタッチの今の座標変換を移し、Pointer Events への切り替えは同時に行わない。

Drag は View に置き、駒とキューブの掴んだ位置を別々に持つ。
押した駒を掴めるか確かめてから、そのポイントの先端の駒へ持ち替える
今の順番を保つ。Controller との受け渡しは、駒の ID とポイント番号で行う。
掴んでいる状態を外してから Controller を呼び、予測の描画でドラッグの座標が
戻されないようにする。成り立たなければ、掴んだときの座標へ戻す。
**受信しても、掴んでいる駒とキューブの見た目の座標と z を保つ**
（キューブは今は決まった位置へ飛ぶ。「変える挙動」を見ること）。

クロックの基準値・`active`・`sw`・`limit` は Controller が持ち、サーバから届いた
`clock_state` だけから作る。時計の表示は `snapshot(now)` で計算する。
予測では基準時刻を変えない。**履歴の返事でも `clock_state` をすべて反映する。**
Controller が今と同じ 200 ms の interval を持ち、毎回時刻を渡して
`view.render_clock(snapshot(now).clock)` を呼ぶ。盤面全体の描画や演出は行わない。
クロックのクリックは、Controller の `active` を見て `stop` / `resume` を決める。
最初の返事が届く前のクロックの設定と表示は、今の HTML の初期値から作る。

**Clock のチェックボックスは `set_clock_switch` を送るだけにする。**
`sw` による計算も、時計の要素の表示・非表示も、返事の `clock_state` で変える。
チェックボックスの表示も返事の `sw` に合わせる。`sw` が無効な間の各 tick では、
今の `PlayerClock` と同じく基準値と基準時刻を更新し、無効だった時間を
あとから差し引かない。持ち時間の入力は秒に直して送り、基準値は返事で反映する。

キューブを離す操作では、View が `src_y`・最後に描画した位置・中央と両側の
基準座標を値で渡す。純粋関数 `plan_cube_drop(gi, player, geometry)` が
`take` / `double` / `cancel_double` を選ぶ。境界の等号、最後に描画した位置を
使う点、リダブルのときのプレーヤー番号も今の条件を保ち、DOM の要素は渡さない。

オープニングの 2 秒後の処理は、Controller がダイスのクリックと同じ操作を
呼ぶ。タイマーを始めるときの「相手のダイスが出ている」条件と、実行するときに
最新の状態で判断する挙動を保つ。受信のたびに予約し直さない。
Roll の直後にボタンを隠す処理は、一時的な表示の操作として View に任せ、
次の描画で状態から表示が決まる今の挙動を保つ。

`main.js` は、DOM の生成、画像の待機、依存するものの組み立て、イベントの
接続を受け持つ。ヘッダの要素もまとめて View へ渡す。画像を作る時期と待機を
保ち、画像の寸法が 0 のまま組み立てない。キーボードも部品のマウスのメソッド
ではなく Controller の操作を呼ぶが、Roll / Pass が有効なときだけという条件は保つ。

`log.js` は `new URLSearchParams(location.search).has("debug")` を直接読み、
`settings.js` を import しない。これで循環が無くなる。Settings は画面ごとの
設定と cookie を受け持つ。音のスイッチを変えたときにクエリを読み直す処理と、
`?sound=` の今の扱いも保つ。

## サーバ

**構成は変えない。** 変えるのは、返事に `history_flag` を載せるのをやめること
だけ（クライアントが第 4 段階で読まなくなる）。

設計案の最初の版は、`session.py`（`BoardSession`）と `protocol.py` に分け、
ハンドラの戻り値を `Applied(sec)` / `Ignored(reason)` / `Handled` にし、
`last_op` を要求ごとの `publish(update)` に添える形だった。次の理由でやめた。

- `Ignored` と `Handled` は、どちらも共通の後処理をしない点で同じ。捨てたときの
  ログは、ハンドラが `_ignore()` で既に出している。`float | None` で足りる
- `last_op` は、今も要求ごとのローカルな値（`m.raw`）として渡していて、
  共有のフィールドには置いていない
- Session と protocol に分けると、`BackgammonServer` は呼ぶ側が 1 つずつしか
  無い、渡すだけの層になる

## 実装項目の分け方

段階的に移す。一括で置き換えると仮の委譲メソッドは要らないが、入力・時計・
通信の変更が一度に入り、違いが出たときに原因を絞りにくい。
各段階でテストを全件通し、一時的な委譲はその段階の中で消す。

1. **CLAUDE.md の実装の説明を整理する。** コードを読めば分かる、関数ごとの
   説明は移さずに消す。コードから見えない落とし穴（順番の縛り、テストでは
   守られない点、型チェックの食い違いなど）だけを `docs/Developer.md` に移す。
   CLAUDE.md と AGENTS.md には、それぞれのツール向けの注意だけを残し、
   Developer.md を参照させる。今の構成のまま行う。CLAUDE.md を編集するので
   Claude Code で行う。文書だけの項目
2. **ブラウザテストが `board` を直接触る箇所を `tests/browser/helper.mjs` の関数に
   集める。** 盤面を読む、受信を差し替える、予測を観測する関数にする。
   テストだけを変え、今の `Board` のまま全件が通ることを確かめる
3. **盤面の参照と操作の予測を純粋関数へ移す。** 今の `Board` と `actions.js` から
   委譲して、挙動を保つ。**目が 0 のダイスを 0 のままにする**のもここ
4. **BoardController と BoardView を入れる。**
   状態・操作・時計の計算、入力・layout・演出を移し、部品の board への参照を
   無くす。`actions.js` と今の `Board`、要らなくなった委譲を消す。
   `log.js` と `settings.js` の循環の解消もここで行う。今の `Board` を
   Controller と並べて状態の持ち主として残す途中の段階は作らない。
   **Clock のチェックボックス、履歴の返事でのクロック、ドラッグ中のキューブを
   変え、サーバが `history_flag` を送るのをやめるのもここ。**
   最後にこの設計案を `archives/docs/` へ移す

第 4 段階は変更が大きいが、状態の持ち主と、それを読む側を同時に替える必要がある。

第 3 段階までは `window.board` は今の `Board`。第 4 段階からは `main.js` が
`window.board = {controller, view}` をデバッグ用に公開する。
受信や予測を差し替えるテストは第 2 段階で helper に集めてあるので、
第 4 段階では helper の中だけを Controller の入口に合わせ、テスト本体は変えない。
古い API を保つためだけの Facade は残さない。

`docs/Developer.md` は、第 1 段階のあと、コードを変える各段階で直す。
構成を最後に見直すだけの段階は設けない。

## 検証と完了条件

この設計の項目での確認は、別の担当による現行コードとの照合と Markdown の差分の確認。
実装したあとの動作確認に通ったという意味ではない。

| 対象 | 既存の確認 | 足す・強める確認 |
|------|------------|------------------|
| 純粋な操作の判定 | `tests/js/`、`predict.test.mjs` | ID でのヒット・積み順・ダイスの消費・勝ちの点数・渡した盤面が変わらない・`sn` が変わらない。**目が 0 のダイスが 0 のまま** |
| 先行実行 | `predict.test.mjs`、`clicks.test.mjs` | 返事を止めて続けて操作、返事での復元、free move で予測するかどうか |
| 入力とドラッグ | `board.test.mjs`、`drag.test.mjs` | 部品の実際の入力から同時ドラッグ、盤面の反転、離す直前の受信、掴んでいる状態を外す前に描画すると落ちること。**掴んでいるキューブが受信で飛ばない** |
| 演出 | `last_op.test.mjs`、`sound.test.mjs` | 同じ盤面を描画し直すだけでは音が増えない、予測と返事で二重にならない |
| オープニング | `opening.test.mjs` | 自動操作の 2 秒の待ちの間に返事、同じ目、受信でタイマーが増えない |
| 時計 | Python の時計のテスト、`clicks.test.mjs` | 時刻を渡しての猶予の消費・マイナスの持ち時間、予測で基準が戻らない。**履歴の返事で `clock_state` が反映される。Clock のチェックボックスは、返事を止めると計算も表示も変わらない** |
| 初期化 | `settings.test.mjs`、`player_cookie.test.mjs` | 画像の応答を遅らせたときの寸法・配置、最初の返事の前の各操作 |
| サーバ | `test_ws.py`、`test_broadcast.py` | **返事に `history_flag` が無い** |

操作の判定には、キューブの上限・`accepted`・`side`・`turn`・ダイスが出ているかの
条件を含める。

各実装項目で関係するテストを走らせ、終わるときに `uv run pytest`、
`node --test tests/js/`、`node --test tests/browser/`、`uv run ruff check .`、
`uv run mypy src`、`uv run basedpyright` を確かめる。
ブラウザは既存の helper のシステムの Chromium と一時データディレクトリを使う。
大事な追加テストは、対象の処理をわざと壊して落ちることを確かめ、戻して確かめる。

rules と Controller が DOM なしで動く、ui がゲームの状態や操作の関数を参照しない、
import の循環が無い、状態とタイマーの持ち主が 1 つずつに決まっている、の 4 つは
第 4 段階のコードレビューで確かめる。

## 設計確認で決めたこと

2026-09-14 に、Claude Code（main）が設計案を現行コードと照らして確認した。
問題の表のうち `BgBase.get_xy()`、`BoardPoint`、`RollButton` のタイマー、
`settings.js` と `log.js` の循環、`checker_order()` の 5 点は、コードと合っていた。
次の点を利用者と相談して決め、本文に反映した。

1. **CLAUDE.md の実装の説明は `docs/Developer.md` を中心にする。** 最初の版は
   「CLAUDE.md は編集しない」としていたが、CLAUDE.md は `Board.apply()` や
   `actions.js` の注意を細かく持っていて、第 4 段階で大部分が外れる。
   Developer.md に集めれば、Claude Code と Codex のどちらが実装しても直すのは
   1 か所になる。実装の前に、別の項目で行う
2. **ブラウザテストを先に helper 経由へ移す。** `tests/browser/` は
   `board.apply` / `board.gameinfo` / `board.load_gameinfo` を 64 か所で直接
   触っている。最初の版のままでは第 4 段階で実装とテストが同時に変わり、
   テストが通っても挙動が保たれた根拠にならない。純粋関数へ移す項目とは
   別の項目にして先に行う
3. **ファイルは、使う側が 2 つ以上になるまで分けない。** `presentation.js`、
   `input.js`、`rules/state.js` をやめた
4. **残す挙動と変える挙動を分けた。** 「変える挙動」の節を見ること。
   変えるものは、そのコードを移す段階で入れる
5. **段階的に移し、最初の版の第 4 段階（文書とテストの補助関数を揃えて全体を
   確かめる）は無くした。** 文書は各段階で直し、テストの補助関数は第 2 段階で
   揃うので、残る中身が無い
6. **過剰な実装の点から見直し、次をやめた。**
   - `BoardModel`: 使うのは Controller だけで、持つのは gameinfo とクロックの
     基準だけ。Controller のフィールドにする
   - `config.js`: 循環を切るためだけのファイル。`log.js` がクエリを 1 行で読む
   - `dispose()` と、入力の解除用の関数: 盤面はページを閉じるまで使い、
     途中で片付ける箇所が無い
   - `present()` の中間の値: 使うのは `BoardView.render()` だけ
   - `plan_end_turn()` / `plan_take()` / `plan_cancel_double()`: 判定をせず、
     送る内容を組み立てるだけ
   - サーバの Session・protocol への分割と結果の型: 「サーバ」の節を見ること。
     残った `history_flag` の廃止は第 4 段階に含め、サーバの段階は無くした
   - CLAUDE.md の説明をそのまま移すこと: Developer.md の「細かい処理は
     コードを読めば分かるので、ここには書かない」とぶつかる。コードから
     見えない落とし穴だけを移す
