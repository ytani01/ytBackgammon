# TODO-016. 再接続するとクロックの動作中／停止中が復元されない

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 54,242 | 123,801 | 55% |
| reviewer | Opus 5 | high | 15,163 | 197,552 | 32% |
| verifier | Sonnet 5 | medium | 17,937 | 144,872 | 12% |
| 合計 |  |  | 87,342 | 466,225 | 概算 $7.9 |

- reviewer は定義（`~/.claude/agents/reviewer.md`）のモデルが sonnet。挙動が
  変わる項目なので Opus 5 に上書きした
- verifier は定義のまま（sonnet / effort medium）

## きっかけ

TODO-010 の調査で見つかった。クロックが動いている最中に再接続すると、
**必ず停止した表示になる。**

`gameinfo` にはクロックの残り秒数（`board.clock`）しか無く、動いているか
どうかのフラグが無い。`Board.load_gameinfo()` は `history_flag` が偽のとき、
秒数を入れる前に必ず `player_clock[p].stop()` を呼ぶ。動作中かどうかは
`start_clock` / `stop_clock` / `resume_clock` というその場限りのメッセージで
しか伝わらず、サーバはこれらを解釈せずに転送するだけなので、あとから
入ったクライアントには届かない。`clock_sw`（クロック機能そのものの ON/OFF）も
同じで、`set_clock_switch` でしか伝わらない。

## 決めたこと

- **`gameinfo` には足さず、サーバが別に持つ**（TODO-010 で相談した）。
  `gameinfo` に足すと履歴にも載り、`back` / `fwd` で巻き戻したときに
  クロックの発着まで巻き戻ってしまう
- **`free_move` は各自の設定のままにする**（TODO-010 で相談した）。盤面の
  状態ではなく「自分がルールチェックを外す」操作設定なので、この項目では
  触らない
- **残り秒数まで正しく戻す**（着手時に相談した）。動作中フラグだけを戻すと、
  猶予時間が古い値（多くは 0）から始まり、持ち時間が余分に減って見える。
  `start_clock` を受け取ったクライアントは猶予を `clock_limit[1]` に戻して
  走り出すのに、サーバの `gameinfo['board']['clock']` はそのとき更新されない
  ため（`set_player_clock` はプレーヤーが止まるときにしか飛ばない）。
  そのためサーバは動作の開始時刻も持ち、送るときに経過分を差し引く

## やったこと

`src/ytbg/yt_backgammon_server.py`

- `_clock_sw` / `_clock_active` / `_clock_start` を `gameinfo` とは別に持つ。
  `_clock_sw` の初期値は `True`（`index.html` の Clock のチェックボックスが
  既定で checked なのに合わせる）
- `on_json()` に `set_clock_switch` / `start_clock` / `stop_clock` /
  `resume_clock` / `reset_clock` の 5 分岐を足した。いずれも return せず、
  末尾の `add_history` と broadcast へ落ちる（**転送は今までどおり**なので、
  すでに開いている画面の動きは変わらない）。TODO-012 でいったん消した分岐を
  戻したことになる
- `_cur_clock()` — `_clock_start` からの経過分を差し引いた残り時間を返す。
  計算は `ytbg.js` の `PlayerClock.update()` と同じ
- `_freeze_clock()` — 動き方が変わる直前に、そこまでの分を `gameinfo` へ
  書き戻して時刻を打ち直す
- `_reset_clock()` — 残り時間を `clock_limit` に戻して止める
- `_load_hist_ent()` — 履歴のエントリで `gameinfo` を置き換えるときに、
  **クロックの残り時間だけは引き継ぐ**（`backward_hist()` /
  `forward_hist()` の 2 か所）
- `emit_gameinfo()` が `clock_state`（`sw` / `active` / `clock`）を添える
- `new_game()` が `_reset_clock()` でクロックを `clock_limit` に戻す

`src/ytbg/webroot/static/ytbg.js`

- `Board.load_gameinfo()` に `clock_state` を渡し、`history_flag` が偽のとき
  「停止 → 残り時間 → 動作中なら `resume()`」の順で復元する。
  `clock_state` が `undefined`（ファイルからの読み込み）のときは今までどおり
  止めた状態にする

テストと文書

- `tests/test_clock.py` を新しく作り、21 件。`time.monotonic()` を差し替えて
  時間を進めるので、実時間は待たない
- `tests/test_on_json.py` の `test_emit_gameinfo_message_shape` に
  `clock_state` を足した
- `CLAUDE.md` に「### クロック」の節を足し、「クロックの進行はクライアント
  側だけで動いている」という記述を直した

### レビューで見つかって直したもの

- **`back` / `fwd` が走行中クロックの基準を巻き戻していた。** 履歴で
  `gameinfo` を丸ごと置き換えると `board.clock` が昔の値になるのに、
  `_clock_active` と `_clock_start` は残る。その結果「昔の残り時間 −
  いま走っている分の経過秒」というどこにも無い値になり、しかも
  `on_connect()` の `emit_gameinfo()` は全員へ飛ぶので、**誰か 1 人が
  つなぎ直しただけで全画面のクロックが飛ぶ**。`_load_hist_ent()` で直した
- **`_clock_sw` の初期値 `False` が `index.html` の既定 ON と食い違っていた。**
  つないだ画面が `clock_state` を受けてチェックを自分で外し、既定が反転する。
  初期値を `True` にした
- `new_game()` が `board.clock` を `clock_limit` に戻していなかった件は、
  変更前からある別のずれだが、同じ場所に手を入れているので利用者と相談して
  ここで直した

## 確かめたこと

- `uv run pytest` 89 件、`uv run ruff check .` と `uv run mypy src` の指摘 0 件
- **テストが実効性を持つことを、`src/` をわざと壊して確かめた**（TODO-013 と
  同じやり方）。7 種類を別々に試し、いずれも狙ったテストが落ちた
  - `_cur_clock()` の経過分の差し引きを消す
  - `emit_gameinfo()` の `clock_state` を消す
  - `start_clock` の分岐で猶予を `clock_limit[1]` に戻す処理を消す
  - `stop_clock` の分岐の `_freeze_clock()` を消す
  - `_load_hist_ent()` の `board.clock` の引き継ぎを消す
  - `_clock_sw` の初期値を `False` に戻す
  - `new_game()` の `_reset_clock()` を消す
- reviewer が `back` の巻き戻しをスクラッチのスクリプトで実測し、直したあとに
  解消していることも実測で確かめた。保存ファイルを読み直せることも確認した
  （`save_data()` / `hist_ent2str()` の修正は要らない）

## 残ること

- **ブラウザでの実機確認は利用者が行う**（クライアントの JS はテストしていない）。
  試すのは 2 つ。クロックを動かしたまま別のタブでつなぎ直して、動作中の表示と
  残り時間が引き継がれるか。サーバを起動し直したあとに Clock のチェックが
  外れていないか
- **`clock_state` は全員に配られ、そのたびに走行中の基準が打ち直される。**
  サーバが計算した値は片道の遅延ぶんだけ古いので、誰かが再接続を繰り返すと
  全員のクロックがわずかに巻き戻る。**遅延は実測していない。** LAN では
  無視できると見ているが、根拠は無い
- **`msg['data']['player']` を検証していない。** `-1` が来ると相手側を
  書き換え、`5` なら IndexError（受信ループが握って接続は保つ）。他の分岐も
  同じ作りなので既存の流儀どおりだが、クロックだけは表示が静かにずれる
- **`_clock_sw` は保存しないので、サーバを起動し直すと必ず on に戻る。**
  既定と一致するので、そのままにした
- **`clock` は引き継ぐが `clock_limit` は履歴の値に戻る**（`back` / `fwd`）。
  サーバとクライアントは一致するので実害は小さい

## 分担の振り返り

- **reviewer が「動くか」では出ない不具合を 2 件見つけた。** 1 件目
  （`back` / `fwd` の巻き戻し）は、テストが 85 件通り、ruff も mypy も
  通った状態で残っていたもので、しかも影響は再接続した画面だけでなく
  **全画面に及ぶ**。reviewer は指摘するだけでなく、`time.monotonic()` を
  差し替えたスクリプトでサーバを動かし、`107.0 → 112.0` と巻き戻る実測値を
  出してきた。2 件目（`_clock_sw` の初期値）は、サーバ側だけを見ていては
  出ず、`index.html` の `checked` まで追って初めて分かる
- **verifier は「壊して落ちるか」を担い、テストの穴は出なかった。**
  7 種類すべてで狙ったテストが落ちた。差分を壊したまま終わらせない指示
  （1 つ試すごとに `git checkout`）は毎回書く必要がある
- **見込みと食い違ったのは巡回の数。** 「変更は小さい」と見て
  verifier + reviewer の 1 巡で終わる想定だったが、レビューの指摘で
  2 巡になった。それでも実装を分けなかった判断は変えなくてよい。
  食い違いの原因は規模の読み違えではなく、**クロックがサーバと
  クライアントに二重にある**という構造で、これは着手して初めて見えた
- **次に同じ規模（1 ファイル中心・挙動が変わる）をやるなら、同じ組み方で
  よい。** ただし 2 巡目は SendMessage で同じ担当を続けたので、依頼の
  前提を書き直さずに済み安く上がった（reviewer の 2 巡目は 1 巡目より
  やり取りが 11 回で済んだ）。**確認とレビューは最初から 2 巡を見込んで
  同じ担当を使い回す**のがよい
- main が 55%（$4.4）を占めた。実装を自分で持った項目なので順当だが、
  待つ間に何も叩かなかったことが効いている

## 関連

- 分担の理由と各担当の報告は `archives/agents/TODO-016/`
- 受信の一方向化は TODO-015（この項目を先に済ませた）
