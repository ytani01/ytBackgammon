# モジュール構成とクラス構成の見直し（第 4 弾）

TODO-056 の設計案。2026-09-14 作成。現行仕様ではなく、利用者の確認待ち。
この項目ではソースコードを変更しない。

## 目的と範囲

状態の所有者を明確にし、操作の判断を表示部品から独立させる。
クラスは状態やライフサイクルを持つものに使い、計算は関数にする。
ファイルを分けるだけで相互参照が残る構成は避ける。

共有ボード、free move、クライアントでのルール判定、WebSocket の
メッセージ形式、JSON Lines v2、ES Modules による配布を維持する。
先行実行の競合解決や配信キューの導入は別の挙動変更になるため含めない。
現在の操作条件や例外時の扱いを移行の過程で変更しない。

## 現行コードで確認した問題

| 場所 | 結び付き | 変更後 |
|------|----------|--------|
| `board.js` の `Board extends BgImage` | アプリの状態と表示部品の継承が一体 | Model・Controller と View を分離し、背景画像は View が所有 |
| `checker_order()` / `predict_gameinfo()` | 駒の並びや予測が `Checker` を返す、または読む | IDと盤面データだけで計算 |
| `actions.js` の `decide_dst()` / `move()` | 表示部品から行き先・ヒット・送信内容を決める | 純粋関数から操作と予測盤面を返す |
| `Board.apply()` | 盤面置換、描画、クロック反映、演出を一括処理 | Controller が適用順を管理し、View は描画を担当 |
| `RollButton` | ダイス4個の生成、他のバナー操作、2秒後の自動クリック | View が部品を組み、Controller がタイマーを扱う |
| `PlayerClock` / `ClockLimit` | 残り時間・設定の所有とDOM表示が一体 | Model が時刻の基準を持ち、View が表示 |
| `BgBase.get_xy()` | 基底クラスが `board.settings` や派生クラスの `settings` を参照 | 入力用の座標変換を明示的に渡す |
| `BoardPoint` | DOMがないのに表示基底を継承し、駒を直接動かす | `layout.js` の座標計算 |
| `server.py` | 解析と実行が同居し、`None` が無視と送信済みを兼ねる | 登録・解析と実行を分離、結果を明示 |
| `settings.js` / `log.js` | 相互 import と評価順への注意 | 起動時設定を独立させ、循環を除く |

根拠は現在の `src/ytbg/` と `tests/`。過去の `design-3.md` は経緯として確認した。
TODO-053 で見送った、同時ドラッグのテストが部品の入力経路を通らない点は、
今回その経路を変更するため検証対象にする。0 のダイスが 10 になる既存挙動は
今回修正しない。純粋関数への移動時に、現在の結果を確認して維持する。

## クライアントの構成

```text
main.js ── 組み立て・起動
  ├─ BoardController ── BoardModel ── rules/
  │       ├─ 送信関数（ws.js から注入）
  │       └─ BoardView ── ui/・layout.js・Drag・入力処理
  └─ Settings・起動時設定・音
```

View と ui は Controller や Model を import しない。入力はコールバックで
ID・値・盤面座標を渡す。Model と rules は DOM・WebSocket・音に依存しない。
`rules/` が import できるのは従来どおり `rules/` 内だけとする。

| モジュール | 公開するもの | 所有する状態 |
|------------|--------------|--------------|
| `board_model.js` | `BoardModel.receive(data, now)`、`predict(gameinfo)`、`snapshot(now)` | 現在の gameinfo、履歴表示の番号、クロックの基準値と基準時刻 |
| `board_controller.js` | `BoardController.receive(data)`、操作ごとのメソッド、`dispose()` | オープニングと時計更新のタイマー、注入された Model・View・send・Settings |
| `board_view.js` | `BoardView.render(snapshot, options)`、`render_clock(clock)`、`play_effects(effects)`、`dispose()` | DOM部品、画像寸法、向き、ドラッグ |
| `rules/actions.js` | `can_pick_checker(gi, id, free_move)`、`decide_dst(gi, id, point)`、`plan_move(gi, id, point)` | なし |
| `rules/state.js` | `checker_order(gi)`、`checkers_at(gi, point)`、`active_dice(gi, player)`、盤面の複製 | なし |
| `presentation.js` | `present(snapshot, settings)`、`effects_for(previous, next, last_op)` | なし。バナー・PIP・演出の判定結果を返す |
| `layout.js` | 既存の配置に加え `checker_geometry(point, index, size)` と当たり判定 | なし |
| `input.js` | `bind_input(el, to_board_xy, handlers)`。解除関数を返す | リスナーだけ |
| `config.js` | URLクエリ・bodyのdata属性の読み口 | なし |

メソッド名はこの設計の推奨名。各シグネチャの引数は以下の意味とし、
実装時には JSDoc で具体的な型を付ける。

- `receive(data)` の data は現在のサーバ応答の data 全体。
- `snapshot(now)` は盤面、履歴番号、表示時点のクロック値をまとめた読取用の値。
  View は保存・書き換えをせず、その場で描画する。
- `checker_order()` は `{id, player, point, idx}` の列。idx の安定ソートと
  同値時の player・駒番号の順を維持する。UIの駒への変換は View だけで行う。
- `plan_move()` は不成立なら `null`、成立なら `{message: {type, data}, predicted}`。
  ヒットの2手、idx、使用済みダイス、勝ちの得点を同じ予測から求める。
  駒の移動元は gameinfo から読む。入力盤面を変更せず、sn を進めない。
- `present()` はバナーの表示、PIP、名前の強調などの値を返す。表示部品から
  ルールを呼んだり、別の表示部品を操作したりしない。

`BoardModel` は既存の純粋関数をすべてラップするクラスにはしない。
予測計算は rules が行い、Model は結果の置換と状態の所有を担当する。
現在の `actions.js` は純粋な判断を rules に、送信・予測適用・タイマーを
Controller に移し、移行完了時に削除する。

操作判断の公開範囲は次の一覧で固定する。plan関数は不成立ならnull、
成立ならmessageと必要な場合だけpredictedを返す。表示の指示は返さない。

| 純粋関数（`rules/actions.js`） | 入力と判断 |
|--------------------------------|------------|
| `can_hold_cube(gi, player)` | turn、cubeのside・accepted、両者のダイス |
| `plan_roll(gi, player, random_values)` | cube・turnと抽選済みの位置・目からダイスを作る。乱数生成はController |
| `plan_dice_click(gi, player, index, free_move)` | free move、先手決め、ダイス消費後のend_turn |
| `plan_end_turn(player)` | 現在と同じplayerの送信内容。新しい手番条件は加えない |
| `plan_double(gi, player, redouble)` / `plan_take(player)` / `plan_cancel_double(player)` | 現在の上限条件と送信内容 |
| `plan_resign(gi, player)` | 未テイク時の扱いと投了点数 |
| `plan_score(gi, player, operation)` | 加点・クリア、上限、予測盤面 |
| `plan_put_checker(gi, id, point)` | free moveのidxと送信内容。予測なし |

駒の通常操作は前述のplan_move、キューブを離す操作は後述のplan_cube_dropを使う。
数値への変換、名前・履歴・時計設定の送信はControllerが行う。
時計のstop/resumeはModelのactiveから選ぶ。ルールに時計や通信を持ち込まない。
roll成功時のボタン非表示と自動操作の予約はControllerが行う。

### 状態の反映と演出

サーバ受信時は Controller が変更前の盤面を取り、Model に応答を適用し、
View を描画してから演出を実行する。`put_checker` の音は変更前の盤面の位置で
判定し、`move` のヒット音は従来どおり last_op.moves のバーへの移動で判定する。
roll は turn が -1 のとき演出しない。opening / end_turn の音は
手番の差分ではなく操作名と新しい turn で判定する。

予測も同じ描画を使うが、クロックの基準と演出には触れない。
通常の move は送信後に予測反映、free move のダイス・得点は予測反映後に
送信する現行の順序を保つ。free move の駒は予測しない。
通信中の予測を再適用するキューは作らず、サーバ応答で現在値を置換する。

`Dice.set(value)` は画像・不透明度・定位置を反映し、`animate_roll()` は
回転だけを担当する。Rollボタンとダイスは View の兄弟部品にし、
Rollボタンがダイスを所有する構成を解消する。

### 入力、ドラッグ、クロック

`BgBase` は DOM の移動・回転・表示だけを持つ。`BgImage` / `BgText` の
薄い継承は残せるが、board・Settings・操作関数への参照は持たせない。
全イベントを基底のコンストラクタで登録せず、必要な部品だけ input.js でつなぐ。
マウスとタッチの既存の座標変換を移し、Pointer Events への変更は同時に行わない。

Drag は View に属し、駒とキューブの掴んだ位置を別々に保持する。
押した駒の操作可否を確認してから、そのポイントの先端の駒へ持ち替える
現在の順番を維持する。Controller との受け渡しは駒IDとポイント番号とする。
離した状態を解除してから Controller を呼び、予測描画でドラッグ座標が
復元されないようにする。不成立なら掴んだときの座標へ戻す。
受信中も掴んだ駒の見た目の座標と z を保持する。キューブの受信時の
位置更新も現行と比較し、駒と同じ保持処理へ勝手に統一しない。

クロックの基準値・active・sw・limit は Model が所有し、時計表示は
`snapshot(now)` で計算する。予測では基準時刻を更新しない。
Controllerが現在と同じ200msのintervalを持ち、毎回時刻を渡して
`view.render_clock(model.snapshot(now).clock)` を呼ぶ。盤面全体の再描画や
演出は行わない。Controller.disposeがintervalと自動操作のtimeoutを解除する。
履歴応答では limit のみ反映し、active・残り時間・sw は現在の表示の
基準を保持する（現行の history_flag の扱い）。クロックのクリックは
Model の active を見て stop / resume を決める。
初回受信前のクロック設定と表示は、現在のHTML初期値から初期化する。
Clockチェックボックスは現在、送信前にローカルのswを変えているため、
ControllerからModelのswを先に更新して送る。単に応答待ちには変えない。
その場では盤面全体を再描画せず、時計計算のみ新しいswを使う。
時計要素の表示・非表示は通常のサーバ応答で反映し、render_clockは変更しない。
チェックボックスの表示は入力時の値を保つ。swが無効な間の各tickでは
現在のPlayerClockと同様に基準値と基準時刻を更新し、無効期間を後で差し引かない。
持ち時間の入力は秒へ換算して送り、基準値は応答で反映する。

キューブを離す操作は、Viewが `src_y`・最後の描画位置・中央と両側の
基準座標を値で渡す。純粋関数 `plan_cube_drop(gi, player, geometry)` が
take / double / cancel_doubleを選ぶ。境界の等号、最後の描画位置を使う点、
リダブル時のプレーヤー番号も既存条件を保ち、DOM要素は渡さない。

オープニングの2秒後の処理は Controller がダイスのクリックと同じ操作を
呼ぶ。タイマー開始時の「相手のダイスが出ている」条件と、実行時に最新の
状態で判断する挙動を維持する。受信ごとに再予約しない。dispose 時に解除する。
Roll直後にボタンを隠す処理は一時的な表示操作として View に委譲し、
次の描画で状態から表示が決まる現在の挙動を維持する。

`main.js` は DOM生成、画像待機、依存の組み立て、イベント接続を担当する。
ヘッダの要素もまとめて View へ渡す。画像を作る時期と待機を保ち、
画像寸法が0のまま組み立てない。キーボードも部品のマウスメソッドではなく
Controller の操作を呼ぶが、Roll / Pass が有効なときだけという条件を保つ。

`config.js` にクエリと data属性の読み口を移し、log.js はそこだけを参照する。
Settings は画面ごとの設定とcookieを担当する。音スイッチ変更時の
クエリ再読込と、`?sound=` の現行の扱いも維持する。

## サーバの構成

| モジュール | 責務 |
|------------|------|
| `app.py` | Starlette、JSON受信、接続を継続するかの例外処理、依存の組み立て |
| `server.py` / `BackgammonServer` | 接続管理への委譲、解析、Sessionへの実行依頼、応答のWebSocket配信 |
| `session.py` / `BoardSession` | GameInfo・Clock・History・Storage・Replayerの所有、操作実行、保存、履歴再生 |
| `protocol.py` | 単一の登録表、parse、型検査、応答のJSON組み立て |
| `message.py` | 既存の入力dataclassと例外 |
| `gameinfo.py` ほか | 現在の盤面更新、時計、履歴、保存形式、Task管理 |

Session は WebSocket と raw JSON を知らず、`publish(update)` という
非同期コールバックを受ける。Server がその値を protocol の関数でJSONにして
ClientHubへ送る。Session は server.py / protocol.py を import しない。
保存先パスの環境変数解決は app.py の組み立て時に行い、Storage を渡す。

`protocol.py` の登録行は `MessageType(make_data, handler, history)` を維持し、
handler は BoardSession のメソッドを参照する。型を追加する登録箇所は増やさない。
parse は解決した登録行と型付きデータを返し、Server が handler と history を
Session の実行メソッドへ渡す。既存の data の型・必須キーの検査を維持する。
GameInfo が入力dataclassを受ける現在の形は残し、同型の内部クラスを増やさない。

操作結果は `Applied(sec)`、`Ignored(reason)`、`Handled` の3種類とする。
Applied では Session が勝負終了時の時計停止、履歴登録・保存、publish の順に
処理する。Ignored はログを出し、履歴登録も配信もしない。Handled は履歴再生や
new のように専用経路で処理したことを表し、共通後処理を行わない。
Clock設定の保存とNew Gameの必須保存も現行どおり実行する。

publish に渡す Update は盤面のスナップショット、時計状態、履歴番号、秒数、
history_flag とする。通常応答の raw last_op は Server のその要求のローカル値で
添える。Session の処理に渡す publish を要求単位で束縛し、共有フィールドへ
「最後の操作」を置かない。再生・接続・new・clear_hist は現在どおり last_op なし。

Replayer のロックとcancelの範囲、n手の操作がその場で終わること、再生中の
別操作との割込みを維持する。操作全体に新しいロックは導入しない。
再生がcancelされてもfinallyで保存する経路を残す。New Gameを新たに
再生停止対象にはしない。配信は現在と同じく全クライアントの完了を待つ。

## 移行順と実装項目の分割案

段階的な移行を推奨する。一括置換なら仮の委譲メソッドは不要だが、
入力・時計・通信の変更が同時に入り、違いの原因を絞りにくい。
段階移行では各段階でテストを通し、最後に一時的な委譲を削除する。
以下は後続TODOの候補であり、まだ登録・着手していない。

1. 盤面参照と操作予測を純粋関数へ移す。旧Boardから委譲して動作を維持する。
2. BoardModel・Controller・BoardViewを同じ項目で導入する。
   状態・操作・時計計算、入力・layout・演出を移し、部品のboard参照を除く。
   actions.js と旧Board、不要な委譲を削除。configの循環解消もここで行う。
   旧BoardをModelと並べて状態の所有者として残す中間段階は作らない。
3. サーバをSession・protocolへ分け、結果型を導入する。
4. Developer.md とテストの補助関数を最終構成へ揃え、全体確認する。

第3段階はクライアント変更と独立して先行できるが、既定は上記の順。
第2段階は変更量が大きいが、状態の所有者と参照側を同時に替える必要がある。
第1段階ではwindow.boardは既存Board、第2段階からはmainが
`window.board = {model, controller, view}` をデバッグ用に公開する。
受信や予測を差し替えるテストも第2段階でcontrollerの入口に移し、
その段階でブラウザテストを通す。旧APIを保つだけのFacadeは残さない。

## 検証と完了条件

この設計項目の確認は、別担当による現行コードとの照合とMarkdownの差分確認。
実装後の動作確認に合格したという意味ではない。

| 対象 | 既存の確認 | 追加・強化する確認 |
|------|------------|----------------------|
| 純粋な操作判断 | `tests/js/`、`predict.test.mjs` | IDでのヒット・積み順・ダイス消費・勝ちの点数・入力不変・sn不変 |
| 先行実行 | `predict.test.mjs`、`clicks.test.mjs` | 応答を止めて連続操作、応答での復元、free moveの予測有無 |
| 入力とドラッグ | `board.test.mjs`、`drag.test.mjs` | 部品の実入力から同時ドラッグ、反転、離す直前の受信、解除前描画で失敗すること |
| 演出 | `last_op.test.mjs`、`sound.test.mjs` | 同じ盤面の再描画だけでは音が増えない、予測と応答で二重にならない |
| オープニング | `opening.test.mjs` | 自動操作の2秒待機中に応答、同目、タイマーが受信で増えない |
| 時計 | Python時計テスト、ブラウザのクリックテスト | 時刻注入による猶予消費・負の持ち時間、予測と履歴受信で基準が戻らない |
| 初期化 | `settings.test.mjs`、`player_cookie.test.mjs` | 画像応答を遅らせた寸法・配置、初回受信前の各操作 |
| サーバ | `test_ws.py`、`test_named_ops.py`、`test_message.py` | 3種の結果と配信回数、未知type・不正dataで接続継続 |
| 保存と再生 | `test_save_load.py`、`test_history.py`、`test_replay.py` | 分離後もcancel時保存、同時のbackが2手、履歴と時計の独立 |
| 同期 | ブラウザ複数タブ、`test_broadcast.py` | 接続・再接続と操作応答のlast_opが混ざらない |

操作判断にはキューブの上限・accepted・side・turn・ダイス表示中の条件を含める。
Clockスイッチは応答を止めて、計算だけが先に変わり表示のON/OFFは待つことを確認する。

各実装項目で関係するテストを実行し、完了時に `uv run pytest`、
`node --test tests/js/`、`node --test tests/browser/`、`uv run ruff check .`、
`uv run mypy src`、`uv run basedpyright` を確認する。
ブラウザは既存helperのシステムChromiumと一時データディレクトリを使う。
重要な追加テストは対象処理を意図的に壊して失敗を確認し、その変更を戻して確認する。

最終的に rules・Model がDOMなしで動き、uiがゲーム状態や操作関数を参照せず、
importの循環がなく、状態とタイマーの所有者が一つずつ決まっていることを
コードレビューで確認する。CLAUDE.mdは編集せず、必要なCodex向け補足はAGENTS.mdへ書く。
