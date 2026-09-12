# TODO-038 reviewer 報告

対象: 未コミットの `git diff`（8 ファイル、+120 / -226）。
コードは直していない。`git checkout` / `git stash` も使っていない。

## 要修正

### 1. `docs/Developer.md:234` — クラス階層図に `ClockLimit` が残っている

```
    BgText --> ClockLimit
```

`ui/base.js:13` の階層図からは消したのに、対になっている
`docs/Developer.md` の mermaid が古いまま。`ClockLimit` は
`BgText` を継承しなくなったので、この図は事実と違う。

根拠: `docs/Developer.md` の 228-249 行を実際に読んだ。CLAUDE.md は
「人が読む説明は `docs/Developer.md`」としており、`ui/base.js` の図と
同じ内容を二重に持っている。**片方だけ直すと、もう片方が誤った図として
残る**（CLAUDE.md が `tests/js/helper.mjs` と `gameinfo.py` について
書いているのと同じ形）。

### 2. `docs/Developer.md:59-74` — モジュール依存図に `gameinfo --> message` が無い

今回 `gameinfo.py` が `message.py` を import するようになった
（`gameinfo.py:22-28`）。この図は `history --> gameinfo` /
`storage --> gameinfo` / `storage --> clock` まで書いてあるので、
`server` 以外の依存を省く方針ではない。今回の変更でいちばん大きい
設計上の変化なので、図に出ていないと辿れない。

根拠: `docs/Developer.md` の該当 mermaid を読んだ。

## 検討

### 3. `CLAUDE.md:453` — `main.js` の `clear_hist()` は無くなった

> `main.js` の `clear_hist()` が押した人の画面で `confirm()` を出す。

いまは `menu_emit()` の `confirm_msg` に移っている。挙動（押した人の
画面だけで確認を取る）は変わっていないので、直すのは文言だけ。
項目の完了時に管理者が直す範囲だと思うが、**放置すると次に読む人が
`clear_hist()` を探す**。

根拠: `CLAUDE.md:453` と現在の `main.js:172-175`。

### 4. confirm をキャンセルしたときに送らない経路が、どのテストでも通らない

`menu_emit()` の
`if ( confirm_msg !== undefined && ! confirm(confirm_msg) ) return;`
は今回新しく書いた分岐だが、`tests/browser/clicks.test.mjs` は
`confirm()` を自動で OK にしているだけで（同ファイル 12 行目のコメント）、
**確認が出たかどうかも、キャンセルしたときに送らないことも見ていない。**
そのため、この条件を逆にしても（＝ `clear_hist` / `new` で確認を
出さなくしても）ブラウザテストは全件通る。

CLAUDE.md の「テストが通ることだけを見ない」に照らすと、共有ボードで
全員の履歴を消す操作の確認が、壊しても誰も気づかない状態になっている。
1 件足すなら「`confirm` を false にして、`clear_hist` が送られない」。

根拠: `tests/browser/clicks.test.mjs:12` のコメントと 242-257 行の表
（送られた `type` / `data` / `history` しか見ていない）を読んだ。
**「条件を逆にしても通る」は論理からの判断で、実測していない（未確認）。**

### 5. `menu_emit` という名前をキーボード経路からも呼んでいる

`main.js:71,75` の Ctrl-Z / Ctrl-Y はメニューではないが `menu_emit()` を
呼んでいる。挙動は正しい（後述のとおり変更前も `nav.checked=false` を
していた）が、名前がメニュー限定に読める。`emit_op` のような名前なら
両方から呼んでも読める。**好みの範囲に近いが、名前と呼び出し元の
ずれは後から効くので検討に入れた。**

## 好みの範囲

### 6. 新しいテストが合成 `KeyboardEvent` を dispatch している

`tests/browser/clicks.test.mjs:471-482` は `document.body` へ
`new KeyboardEvent('keydown', {...})` を投げている。`page.keyboard.press`
より実際のキー入力から遠い（フォーカスが `<input>` にあるときの挙動などは
見ていない）。ハンドラが `document.body.onkeydown` なので今の実装では
同じ経路を通る。落とし穴になるほどではない。

---

## 突き合わせた結果（問題なし）

依頼の 1〜5 について、確かめた内容を残す。

### ラッパー 14 個（依頼 1）

`git show 3c4aac5:src/ytbg/webroot/static/js/main.js` と現在の
`main.js:162-190` を 1 つずつ突き合わせた。`emit_msg(type, data,
history)` の第 3 引数は変更前も全て `false`（`ws.js:27`）。

| 変更前 | 送っていたもの | いま | 判定 |
|---|---|---|---|
| `new_game()` | `new` / `{}` / false + confirm | `menu_emit("new", {}, "New Game を始めます。\n全員の盤面が初期配置に戻ります。")` | 一致（confirm の文言も連結後の文字列が同一） |
| `backward_hist(n=1)` | `back` / `{n:1}` / false | `menu_emit("back", {n: 1})` | 一致 |
| `back2()` | `back2` / `{}` / false | `menu_emit("back2")`（既定 `data={}`） | 一致 |
| `back_all()` | `back_all` / `{}` / false | 同上 | 一致 |
| `forward_hist(n=1)` | `fwd` / `{n:1}` / false | `menu_emit("fwd", {n: 1})` | 一致 |
| `fwd2()` / `fwd_all()` | `fwd2` / `fwd_all` / `{}` / false | 同上 | 一致 |
| `clear_hist()` | `clear_hist` / `{}` / false + confirm | `menu_emit("clear_hist", {}, "履歴を削除します。\n全員の履歴が消え、元に戻せません。")` | 一致 |
| `board_inverse()` | emit 無し。`nav.checked=false` → `board.inverse(0.5)` | 登録表に直接 | 一致（元も log 無し） |
| `apply_sound_switch` ほか 5 個 | `board.apply_xxx()` | `() => board.apply_xxx()` | 一致（`apply_clock_limit` の 0 / 1 も同じ） |

- **順序**: 変更前も変更後も「メニューを閉じる → log → confirm →
  emit」。confirm をキャンセルしてもメニューは閉じたまま、という
  挙動まで同じ。
- **Ctrl-Z / Ctrl-Y**: 変更前は `backward_hist()` を呼んでいて、
  その中で `nav.checked=false` していた。いま `menu_emit()` が同じ
  ことをするので、**メニューを閉じる副作用も含めて変わっていない**。
  既定引数 `n=1` も `{n: 1}` に展開されていて同じ。
- **違うのはログの文字列だけ**（`back_all()` → `menu_emit(back_all)`）。
  ログを見ているテストは無い。
- 変更前は `["menu-back2", back2]` のようにハンドラへクリックイベントが
  第 1 引数で渡っていたが、どの関数も読んでいなかった。いまは
  アロー関数で受けないので、こちらも差は出ない。
- 消した関数名を他から参照している箇所は無い（`*.js` / `*.mjs` /
  `*.html` / `tools/` を grep）。`index.html` に inline の
  `onclick` 等は残っていない。

### `GameInfo` の dataclass 受け取り（依頼 2）

- **循環 import にならない。** `message.py` の import は
  `collections.abc` / `dataclasses` / `typing` だけ（ast で抽出して確認）。
  `uv run python -c "import ytbg.gameinfo, ytbg.message"` も通る。
- **`CubeState.from_dict()` の既定値補完は落ちていない。**
  `cube()` に届く `CubeData` は `parse()` が
  `side` / `value` / `accepted` の 3 つを必須で組み立てたもの
  （`message.py:89-92`。欠けていれば `KeyError`）なので、
  `CubeState(side=..., value=..., accepted=...)` と
  `from_dict(..., strict=False)` の結果は同じ。
- **ファイルから読む経路は触っていない。** `BoardState.from_dict()` →
  `CubeState.from_dict(..., strict)` と `_get()` はそのまま
  （`gameinfo.py:68-112`）。「ファイルから読むときだけ必須キーの欠落を
  例外にする」は保たれている。
- **フィールド名は 6 つとも一致**（`CubeData.side/value/accepted`、
  `DiceData.player/dice`、`TurnData.turn/resign`、
  `PlayerNameData.player/name`、`ScoreData.player/score`、
  `PlayerData.player`）。
- **frozen への書き換えは無い。** `GameInfo` 側は `data.xxx` を読むだけ。
  `dice()` は `list(data.dice)` で写しているので、`m.raw`（`last_op`）と
  リストを共有することもない。

### `_replay_hist()`（依頼 3）

変更前の 2 つの本体を取り出し、`_hist.back()` / `_hist.forward()` を
同じ文字列に置換して `diff` したところ **完全に一致**（差分 0 行）。
新しい `_replay_hist()` の本体も、pop の呼び方以外は同じ。
つまりログの文言・`sec` の決め方（`n == 0` のとき 0.1）・
`n > 0 and count >= n` の打ち切り・`finally` での `save_data()`・
戻り値（どちらも `None`）に違いは無い。
`self.__log.debug('n={}, sleep_sec={}', ...)` は呼び出し側に残っているので、
**出るログの内容と順序も変わらない**（`__log` はクラス単位なので
logger 名も同じ）。名前は 2 つとも残っており、
`tests/` と `Replayer.run()/start()` からの呼び出しはそのまま。
docstring の `pop : Callable[[], GameInfo | None]` は
`History.back()` / `forward()` の実際の型と合っている（`history.py:113,128`）。

### `ClockLimit`（依頼 4）

- 外から使われているのは `limit` / `set()` / `emit_set()` だけ
  （`board.js:170,442-456,926-934`、`ui/clock.js:103,182`、
  `tests/browser/clicks.test.mjs:308,320`。`clock_limit` の全 grep で確認）。
  いずれも `ClockLimit` 自身が持つもので、`BgText` / `BgBase` 由来の
  ものは 1 つも無い。
- 変更前は `super(undefined, undefined, undefined, undefined, {board: board})`
  で、`board` は第 2 引数（`new ClockLimit(this.board)` は第 1 引数に
  渡していたので常に `undefined`）。`id` も `undefined` なので
  `this.el` も `undefined`。**継承した機能は実際に全部死んでいた**
  （`ui/base.js:52-83` を読んで確認）。削除は妥当。
- `ui/clock.js` の `BgText` の import は `PlayerClock` が使うので残す必要がある（残っている）。

### 規約との整合（依頼 5）

- **素の `board` は書いていない。** `main.js:16` の `let board`
  （モジュール変数）を参照している。`window.board` ではないので、
  `<div id="board">` を掴む事故は起きない。登録表のアロー関数は
  モジュール評価時に作られるが、発火は `window.onload` 後なので
  束縛は解決済み（変更前の `board_inverse()` などと同じ）。
- `ui/base.js` のクラス階層図は更新済み。**`docs/Developer.md` 側が
  未更新**（要修正 1）。
- ログは `{}` と引数で渡す形のまま。コメントは「なぜ」を書いている
  （`ui/clock.js:5-10` の「継承した機能は全部使えていなかった」、
  `server.py:204-207` の「違うのはどちらのスタックから取り出すかだけ」）。
- 範囲外の変更は見当たらない。`tests/browser/clicks.test.mjs` への
  Ctrl-Z / Ctrl-Y の追加は、今回書き換えた経路を覆うもので妥当。

### 自分で走らせた確認

| コマンド | 結果 |
|---|---|
| `uv run pytest -q` | 227 passed（警告 1 件は starlette の DeprecationWarning で無関係） |
| `uv run ruff check .` | All checks passed! |
| `uv run python -c "import ytbg.gameinfo, ytbg.message"` | import ok |

ブラウザテストと mypy / basedpyright は verifier の担当なので走らせていない。
