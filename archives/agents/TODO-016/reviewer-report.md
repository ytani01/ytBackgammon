# TODO-016 レビュー報告

対象: `git diff`（`CLAUDE.md` / `TODO.md` / `ytbg.js` / `yt_backgammon_server.py` /
`tests/test_on_json.py`）と、未追跡の `tests/test_clock.py`。

確認したこと: `uv run pytest`（85 件 passed）、`uv run ruff check .`（0 件）、
`uv run mypy src`（0 件）。加えて、下の「要修正 1」はスクラッチのスクリプトで
サーバを直接動かして実測した。

---

## 要修正

### 1. `back` / `fwd` が走行中クロックの基準を巻き戻す

`yt_backgammon_server.py:218-260`（`backward_hist()` / `forward_hist()`）と
`yt_backgammon_server.py:146-166`（`_cur_clock()`）

`backward_hist()` / `forward_hist()` は
`self._bg._gameinfo = copy.deepcopy(self._history[-1])` で gameinfo を丸ごと
入れ替える。ここには `board.clock`（＝ `_cur_clock()` が使う残り時間の基準）が
含まれるが、`_clock_active` と `_clock_start` は触られない。その結果、
**履歴を戻した瞬間に「昔の残り時間 − いま走っている分の経過秒」という、
どこにも存在しない値**になる。

実測（`time.monotonic()` を差し替えて再現）:

```
hist0 clock: [120, 12]        # 1 手目
hist1 clock: [120, 7.0]       # 2 手目（5 秒使って停止）
走行中の cur_clock: [107.0, 0]   # 再開して 20 秒経過
back 後の cur_clock: [112.0, 0]  # ← 5 秒戻った
新規接続へ届く clock_state: {'sw': True, 'active': [True, False],
                             'clock': [[112.0, 0], [120, 12]]}
さらに 10 秒後: [102.0, 0]     # 戻った基準のまま進み続ける
```

影響が新規接続だけで収まらない点が重い。`on_connect()` は
`emit_gameinfo(0)`（`history_flag=False`）を **全員へ** broadcast するので、
誰かが 1 人つなぎ直しただけで、**すでに正しく動いていた画面のクロックも
`load_gameinfo()` の `stop → set → resume` で 112.0 へ飛ぶ**
（`ytbg.js:3589-3607`）。`back` / `fwd` はよく使う操作なので、
TODO-016 が直したかった「再接続したときに正しく戻る」がここで崩れる。

なお、止まっているクロックが履歴の値へ戻ること自体は変更前からある
（gameinfo に秒数が入っているため）。新しいのは、**動作中フラグが立ったまま
基準だけが別の時点にすり替わる**ことと、それが `clock_state` として
全員に配られること。

判断が要る点: 履歴操作の前後で `_freeze_clock()` 相当（または `_clock_start`
の打ち直し）を入れるのか、クロックの秒数そのものを gameinfo の外へ出すのかは
設計の選択なので、こちらでは決めない。

### 2. `_clock_sw` の初期値 `False` が `index.html` の既定と食い違う

`yt_backgammon_server.py:69`、`webroot/templates/index.html:93`、
`ytbg.js:3003-3015`、`ytbg.js:3599`

`index.html` の Clock のチェックボックスは `checked`（既定 ON）で、`Board` の
コンストラクタは `apply_clock_sw()` でそれを読み `this.clock_sw = true` に
していた（`ytbg.js:2755-2756`。このときの `emit_msg()` は ws 未接続なので
捨てられる ＝ サーバ側は書き換わらない）。

一方サーバは `self._clock_sw = False` で始まり、`on_connect()` の
`clock_state.sw` は `False`。受け取った `load_gameinfo()` は
`this.set_clock_switch(false)` を呼ぶので、**チェックボックスが自分で外れ、
`player_clock[].off()` でクロックの表示が消え、`update()` も
`this.board.clock_sw` が偽なので進まなくなる**。

つまり、サーバを起動し直した直後（`_clock_sw` は保存されないので毎回）、
つないだ全クライアントでクロック機能が OFF になる。変更前は既定 ON だった
ので、既定の挙動が反転する。

サーバ側の値と `on_connect()` の送信内容は実測で確認済み。**ブラウザでの
表示は未確認**（コードを読んだ範囲の判断）。

---

## 検討

### 3. `TODO.md` の TODO-015 の記述が実装と食い違う

`TODO.md:110` 付近（TODO-015「気をつけること」）に
「`resign` はサーバだけ、**クロック系の 5 つは JS だけ**に分岐がある」と
あるが、この差分でその 5 つはサーバにも分岐ができた。TODO-015 に着手する
ときに数を数え違える。`CLAUDE.md` は直っているので、TODO.md 側だけ残った。

### 4. `new_game()` は `board.clock` を `clock_limit` に戻していない

`yt_backgammon_server.py:96-101`

`new_game()` は `_clock_active` / `_clock_start` だけ戻す。`board.clock` は
`init_gameinfo()` の固定値 `[120, 12]`（`yt_backgammon.py:44-48`）に戻り、
`clock_limit` は変更前の値が復元される。持ち時間を 2 分以外にしてあると、
新しいゲームのクロックが `clock_limit` と食い違う。**変更前からの挙動**で、
この差分が悪くしたわけではないが、`_reset_clock(0) / (1)` を呼べば揃う場所に
手を入れているので、ついでに直すか、直さないと決めるかを判断したい。

### 5. 履歴に載る `board.clock` の値の意味が変わった

`start_clock` / `stop_clock` / `resume_clock` / `set_clock_switch` が
`_freeze_clock()` 経由で `gameinfo['board']['clock']` を書き換えるようになった
ので、そのあとに積まれる履歴エントリのクロック値が変わる（前は
`set_player_clock` が来たときしか変わらなかった）。**保存の形は変わらないので
`hist_ent2str()` の修正は不要**（`CLAUDE.md` の条件は満たしている）。
ただし `tests/test_clock.py` の `test_clock_state_is_not_in_history` は、
もともと存在しないキー（`clock_sw` / `clock_active`）が無いことしか見て
おらず、この点は確かめていない。

### 6. `clock_state` は全員に配られ、そのたびに走行中の基準が打ち直される

`ytbg.js:3596-3606` は `stop() → set() → resume()` を全クライアントで実行する。
サーバが計算した値は、クライアントが表示している値より片道の遅延ぶんだけ
古い。誰かが再接続を繰り返す（`ws.onclose` の再接続ループ）と、そのたびに
全員のクロックがわずかに巻き戻る。**遅延の実測はしていない**ので、LAN では
無視できる程度と見ているが、根拠は無い。

### 7. `player` の値を検証していない

新しい 5 分岐は `msg['data']['player']` をそのまま添字に使う
（`yt_backgammon_server.py:617-641`）。`-1` が来ると相手側を書き換え、`5` なら
IndexError（受信ループが握ってログに出し、接続は保つ）。他の分岐も同じ作りな
ので既存の流儀どおりだが、クロックだけは表示が静かにずれるので気になる。

---

## 好みの範囲

- `_cur_clock()` の丸めが非対称。動作中は `round(x, 1)` を返し、停止中と
  `clock_sw` が off のときは gameinfo の値をそのまま返す
  （`yt_backgammon_server.py:154-165`）。値としては問題ないが、読むときに
  「どちらが正か」を一瞬考える。

---

## 規約の確認（問題なし）

- 新しいログ呼び出しは無し（`{}` と引数の規約に触れる箇所は無い）。
- コメント・docstring は日本語で、周囲に揃っている。「なぜ」を書いており
  （gameinfo に入れない理由、freeze する理由、ytbg.js のどのメソッドに
  合わせたか）、「何を」の言い換えになっていない。
- `ruff`（line-length 78）と `mypy src` は 0 件。
- `CLAUDE.md` の「### クロック」の節は、1 と 2 を除けば実装と一致している。
  ただし「`gameinfo['board']['clock']` の側は最後に止まった時点の値」は、
  1 のとおり履歴操作で別の時点の値に差し替わることがある。
- 指示に無い変更は、`new_game()` の行末空白の除去だけ（`yt_backgammon_server.py:98`）。

---

# 再レビュー（修正後）

対象: 修正後の `git diff`（`ytbg.js` と `tests/test_on_json.py` の差分は前回から
変わっていない）と `tests/test_clock.py`。

確認したこと: `uv run pytest`（89 件 passed）、`uv run ruff check .`（0 件）、
`uv run mypy src`（0 件）。前回の実測スクリプトを流し直したのに加えて、
`clock_limit` を変えてからの `back_all`、保存ファイルの読み直し、再起動を
実測した。

**要修正は 0 件。** 4 つの直しはいずれも妥当で、`save_data()` /
`hist_ent2str()` の修正も要らない。以下は確認の内訳と、残る検討事項。

## 直しの確認

### 要修正 1（`_load_hist_ent()`）→ 解消

前回と同じ手順を流し直した。`back` の前後で値が変わらない。

```
走行中の cur_clock: [107.0, 0]
back 後の cur_clock: [107.0, 0]     # 前回は 112.0 に戻っていた
新規接続へ届く clock_state: {'sw': True, 'active': [True, False],
                             'clock': [[107.0, 0], [120, 12]]}
さらに 10 秒後: [97.0, 0]
```

方針も妥当だと考える。`ytbg.js` は `history_flag` が真のときクロックに
触らない（`ytbg.js:3588`）ので、**サーバが現在のクロックを残すほうが
クライアントの見た目と一致する。** 履歴側の値を採るとサーバだけがずれる。

オブジェクトの持ち方も安全:
`clock = self._bg._gameinfo['board']['clock']` で取った list は、
`copy.deepcopy(hist_ent)` した**新しい** gameinfo に差し込まれる。`_history` の
エントリは deepcopy 済みで、この list を共有しない。したがって
`_freeze_clock()` の要素代入が履歴のエントリを書き換えることはない
（コードを追って確認。実測でも、`back` 後に積んだ履歴の値と `_history` の
古いエントリの値が別々になっていた）。

### 保存・履歴の中身（見てほしいこと 1）→ 問題なし

- `hist_ent2str()` は `board["clock"]` をそのまま埋めるだけで、キーも構造も
  変わっていないので修正は不要。実測で、`back_all` のあとに 1 手積んで保存した
  ファイルを `json.loads()` で読み直せた（`"clock": [[60, 12], [60, 12]]`）。
  `_freeze_clock()` が入れるのは `round(x, 1)` の float なので、`11.8` のような
  値は変更前（`set_player_clock` 経由）から出ていたものと同じ。
- `back` のあとに `add_history()` されたときに積まれるのは、
  **そのときの `gameinfo['board']['clock']` ＝ 最後にクロックが動き方を
  変えた時点の値**で、履歴側の古い値ではない。妥当な値だと考える。

### 要修正 2（`_clock_sw = True`）→ 解消。ただし保存はしない

- 保存ファイルから起動したときを実測した。`_clock_sw` は `True`、
  `_clock_active` は `[False, False]`、`clock` はファイルの値
  （`{'sw': True, 'active': [False, False], 'clock': [[60, 12], [60, 12]]}`）。
  止まった状態で復元されるので、おかしくならない。
- 誰かが off にした直後に別の人がつないだ場合は、サーバの `_clock_sw` が
  `False` になっているので、その人も `set_clock_switch(false)` を受けて off に
  なる。取り違えは無い（コードを追って確認、ブラウザでは未確認）。
- 残る点は下の「検討 8」（`_clock_sw` は保存されないので、サーバを起動し直すと
  必ず on に戻る）。

### 検討 4（`new_game()` の `_reset_clock()`）→ 位置は正しい

`_reset_clock()` は `_gameinfo['clock_limit'][0] / [1]` を読むので、
**復元より後・`add_history()` より前**でなければならない。実装はその位置に
ある（`yt_backgammon_server.py:94-107`）。実測でも、`clock_limit` を
`[60, 6]` にしてから `new` すると `board.clock` が `[[60, 6], [60, 6]]` に
なった。

### 検討 3（TODO.md）→ 直っている

TODO-015 の記述がサーバ側にも分岐がある旨に更新され、5 つの type 名も
挙がっている。`CLAUDE.md` の「### クロック」「### 履歴」も実装と一致する
（`_load_hist_ent()` の説明が履歴の節に入った）。

## 前回の「検討」5〜7 と「好みの範囲」の状況（見てほしいこと 4）

- **検討 5（履歴に載るクロック値の意味）** — 実害の部分は解消。
  `test_back_does_not_rewind_running_clock` /
  `test_fwd_does_not_rewind_running_clock` が本来の危険（履歴でクロックが
  戻ること）を見るようになった。`test_clock_state_is_not_in_history` が
  存在しないキーを見ているだけなのは変わらないが、こちらは残しておいて
  害は無い。
- **検討 6（`clock_state` は全員に配られ、そのたび基準を打ち直す）** — 変化なし。
  遅延ぶん巻き戻る点は未計測のまま。
- **検討 7（`player` の値を検証していない）** — 変化なし。
- **好みの範囲（`_cur_clock()` の丸めが非対称）** — 変化なし。

## 新しい検討

### 検討 8. `_clock_sw` は保存されないので、再起動で必ず on に戻る

`_clock_sw` は `gameinfo` にも保存ファイルにも入らない。クロックを off に
して使っていても、サーバを起動し直すと `True` に戻り、つないだ画面の
チェックが入る。要修正 2 の直しの裏返しで、既定を `index.html` に合わせた
結果としては筋が通っている。**わざと保存しないなら、それでよい**と考える
（保存すると `save_data()` の形を変えることになり、TODO-010 の
「gameinfo に入れない」とも噛み合わない）。判断が要るのはここだけ。

### 検討 9. `clock` は引き継ぐが `clock_limit` は履歴のまま戻る

`_load_hist_ent()` が引き継ぐのは `board.clock` だけで、`clock_limit` は
履歴のエントリの値に戻る。`clock_limit` を変えた手より前まで戻すと、
実測のとおり食い違う。

```
back_all 後: clock_limit= [120, 12]  clock= [60, 12]  cur= [60, 8.7]
```

`ytbg.js` も `history_flag` に関係なく `gameinfo.clock_limit` を入れ直す
（`ytbg.js:3584-3586`）ので、**サーバとクライアントの間にずれは出ない**。
影響は、クロックの残量バー（`set_bg()` は `clock / limit` の比で幅を出す）が
実態と合わなくなることと、戻した状態から `start_clock` すると古い猶予時間で
走り出すことの 2 つ。変更前は `clock` と `clock_limit` が一緒に戻っていたので、
組み合わせがずれるのは今回からになる。**実害は小さい**と見ているが、
`clock_limit` も引き継ぐかどうかは決めておいてよい。

### 検討 10. 保存されるクロック値は「最後にクロックが動き方を変えた時点」

`add_history()` は `_freeze_clock()` を呼ばないので、走っている最中に指した
手の履歴には、実際の残り時間ではなく最後の start / stop / resume 時点の値が
入る（実測: 猶予が 8.7 秒まで減っている状態で積んだ履歴が `[60, 12]`）。
効いてくるのはサーバを再起動したときだけで、そのときクロックは止まった
状態で復元されるので、失われるのは「いま走っている区間の経過分」に限られる。
気になるなら `add_history()` の前に `_freeze_clock()` を呼ぶ手がある。
**変更前からある性質**なので、今回直さなくてもよい。

## 足したテスト 4 件（見てほしいこと 5）

いずれも直した内容を捕まえている。`_load_hist_ent()` を元の
`copy.deepcopy()` に戻すと、`test_back_does_not_rewind_running_clock` は
`[50, 7]` になって落ち、`test_fwd_does_not_rewind_running_clock` も同様に
落ちる（履歴側に `[50, 12]` を仕込んであるので、引き継ぎが消えれば必ず
値が変わる）。`test_clock_sw_starts_on` は初期値を、
`test_new_resets_clock_to_limit` は `clock_limit` を変えたあとの `new` を
見ており、`_reset_clock()` の呼び出しを外せば `[120, 12]` になって落ちる。
いずれも「落ちること」は実際に流してはいない（**未確認**。`src/` を壊して
確かめるのは verifier の担当）。

気になるとすれば、`back` / `fwd` のテストが n=1 だけで、`back_all` を通って
いないこと。`back_all` は Task で走るぶん経路が違うが、`_load_hist_ent()` を
呼ぶのは同じ関数の中なので、通らなくても穴は小さい。
