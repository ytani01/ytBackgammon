# TODO-074 reviewer 報告

`git diff`（develop の未コミット差分。TODO.md の TODO-074 節に挙がった全項目）を、
消された各ガード・早期 return・分岐について「本当に通らないか」検算した。
結論: **要修正は無し**。全項目、呼び出し元をすべて洗った上で削除が正しいことを
確認できた。検討事項が 1 件ある。

## 確認した項目（すべて裏付けが取れた）

### JS

- `move.js` の `dst_points()` 冒頭の `dice_vals.length == 0` 早期 return
  — 削除後のコードを読むと、`dice_vals` が空なら `for` ループが 0 回回り、
  `dst_p` は初期値の `[]` のまま `if (dst_p.length == 0) return [];` に
  掛かるので、ガード無しでも同じ `[]` を返す。呼び出し元（`move.js` の
  `usable_dice()`、`actions.js` の `can_pick_checker()`/`decide_dst()`）を
  見ても、空配列を渡すケース（`usable_dice()` の `active_d` が空になる経路）
  は元々この早期 return に頼らずとも同じ結果になっており、挙動は変わらない。
- `judge.js` の `pip_count()` の `isNaN(count)` と `position.js` の
  `get_pip()` の `point === undefined`
  — `get_pip()` の唯一の呼び出し元は `pip_count()` で、渡す `point` は
  `Position.points_of(player)` が返す配列の要素のみ。`points_of()` の実装
  （`position.js:208`）は `p` を `0..N_POINT-1` の整数で埋めるだけで、
  `undefined` を含む余地が無い。したがって `get_pip()` に `undefined` が
  渡ることは無く、`isNaN(count)` も `get_pip()` が常に数値を返す以上
  発生しない。
- `judge.js` の `closeout()` のプレーヤー番号範囲チェック
  — 唯一の呼び出し元は `board_view.js:677` の `render_turn()` 内の
  `closeout(pos, 1 - turn)`。同関数は手前で `if (turn < 0) {...; return;}`
  と `if (turn >= 2) {...; return;}` を通っており、この行に来る時点で
  `turn` は 0 か 1 に確定している（`1 - turn` も 0 か 1）。範囲チェックは
  本当に通らない分岐だった。
- `position.js` の `Position.from_points()` 削除と `tests/js/helper.mjs` の
  `new Position(pt)` への置き換え
  — `from_points()` は `return new Position(points)` の 1 行だけで、
  `Position` のコンストラクタと完全に同じ。`grep` で他の呼び出し元が
  無いことを確認済み。
- `ui/base.js` の `this.el` ガード（`BgBase` の w/h 判定、`id` getter、
  `BgText` のコンストラクタ・`set()`・`on()`/`off()`）
  — `dom.js` の `build_dom()`（`document.createElement` で組み立てて返す）
  のコメントに「表示部品は id ではなく要素を受け取る（TODO-054）」とあり、
  `board_view.js` の全コンストラクタ呼び出しは `els.xxx`（`build_dom()` の
  戻り値）をそのまま渡している。`el` が undefined になる経路は無い。
- `board_view.js` の投了・勝ちバナーの `on_click`（log だけ）削除
  — `ui/button.js` の `BannerButton` は `on_click=undefined` を許容し、
  `click()` は `if (this.on_click) { this.on_click(this); }` で守られている
  （JSDoc にも「省くと何もしない」と明記）。削除は安全。
  ただしこの削除の副作用で `tests/browser/helper.mjs` の `show_banner()`
  が `orig(btn)` を無条件に呼んでいて壊れた（`orig` が undefined になる）。
  実装者は `if (orig) { orig(btn); }` に直しており、これは src 側の変更で
  壊れたテストヘルパーの追従であり、範囲外のリファクタリングではない。
  妥当な判断。
- `ui/label.js` の `PlayerPipCount.set()` 末尾の `this.move()`/`this.rotate()`
  — `BgText.set()`（`super.set()`）の最後で `this.move(this.x, this.y)` と
  `this.rotate(this.deg)` を呼んでいる（`ui/base.js:182-183`）。JS の
  仮想呼び出しにより、`this` が `PlayerPipCount` インスタンスなら
  `PlayerPipCount.move()`（オーバーライド版）が呼ばれるので、削除しても
  最終的な呼び出し先は変わらない。確認済み。
- `ui/dice.js` の `this.image_el = this.el.firstElementChild` と
  `get_filename()` の `val %= 10`
  — `BgImage` のコンストラクタ（`Dice` の親）が
  `this.image_el = this.el.children[0]` を先に設定済み。`get_filename()`
  の唯一の呼び出し元（`dice.js:102`）はすでに `val % 10` を渡している。
  ともに確認済み。
- `main.js` の `e.key.length === undefined` 判定と `keyCode` ログ
  — `KeyboardEvent.key` は仕様上常に文字列で `undefined` にならない。
  `tests/browser/clicks.test.mjs`・`helper.mjs` が送る合成イベントも
  `key: ' '` のように明示的に文字列を渡している。
- `settings.js` の `CookieBase` の未使用フィールド `this.cookie` と
  `load()` の戻り値
  — `grep` で `CookieBase` 内で `this.cookie` を読む箇所が無いことを確認。
  `Settings.cookie`（`settings.js:105`）は別クラスの別プロパティで無関係。
  `load()` は constructor から呼ばれるのみで戻り値は使われていない。
- `lobby.js` の `board_url()` の `${b.prefix}`
  — `lobby.py` の `BoardConfig.prefix: str = ''`（既定は空文字列）で、
  `normalize_prefix()` も常に `str` を返す。`prefix` が truthy でない分岐に
  来る時点で `b.prefix` は `""` であり `undefined`/`null` にはならないので
  `${b.prefix}` は必ず空文字列になる。実装者の「常に空」という説明は正しい。

### Python

- `server.py` の `_on_roll()` 削除と登録表の `roll` を `_on_dice` に変更
  — `_on_dice()`（`server.py:367`）の中身は `self._gameinfo.dice(data)` /
  `return 0` で、削除前の `_on_roll()` と完全に同一。重複の一本化として妥当。
- `server.py` の `_load_hist_ent()` 削除
  — 1 行の処理で呼び出しも `back()`/`fwd()` の 1 箇所のみ。インライン化で
  問題無い。
- `replay.py` の `except asyncio.CancelledError: raise` 削除
  — Python 3.8 以降 `asyncio.CancelledError` は `BaseException` を継承し、
  `except Exception` では捕まらない（`pyproject.toml` の
  `requires-python = ">=3.14"` なので該当する）。削除前のコメントが
  自認していた通り、この節は本当に無くても同じ動作。
- `__main__.py` の `MY_NAME`/`VERSION` 別名削除
  — 呼び出し箇所（`board()` の `create_app(...)`）を `__prog_name__`/
  `__version__` に直接置き換えており、他に参照は無い。

## 検討事項（1 件）

- **`src/ytbg/__init__.py` の `assert __package__`**（`要修正` ではなく `検討`）
  TODO の狙いは「`__package__` が無いときの分岐は通らないので消す」こと。
  実装者は分岐を消した上で、basedpyright の `str | None` → `str` の
  絞り込みのために `assert __package__` を追加した。この判断自体は
  妥当（`report` にも判断点として明記済み）だが、**削除前は
  `__package__` が falsy のとき `__version__ = '_._._'` に静かに
  フォールバックしていたのに対し、削除後は `AssertionError` で
  クラッシュする**という違いがある。TODO の前提（この分岐は通常運用では
  絶対に通らない）が正しい限り実害は無いが、`python -O`
  （assert が無効化される起動）で万一 `__package__` が falsy な状況が
  起きた場合は `version(None)` の呼び出しへ進み、素の `TypeError` に
  なる可能性がある（未確認。`ytbg` は常にパッケージとして import される
  ため、この経路が実運用で起こるとは考えにくい）。実害は無いと判断するが、
  「分岐を消す」の範囲に「新しい assert を足す」が含まれるかは
  管理者の判断が要る点として報告する。

## 見落としの有無

- 消された全項目について、grep で呼び出し元を洗い直し、テストが偶然
  カバーしていないだけの経路（例: `dst_points()` を空配列で呼ぶ経路、
  `closeout()` を範囲外のプレーヤー番号で呼ぶ経路）が実際に存在しないかを
  個別に確認した。見つからなかった。
- 対応するテストの削除（`tests/js/judge.test.mjs` の範囲チェック、
  `tests/js/position.test.mjs` の undefined ケース）も、削除された分岐の
  ためだけに書かれたテストであることを確認済み。範囲外のテストは
  消されていない。
- 実装者が判断した 2 点（`assert __package__`、`tests/browser/helper.mjs`
  の `show_banner()` 修正）はどちらも妥当と判断した
  （前者は上の検討事項として明記、後者は src の正当な変更への追従）。

## 範囲

TODO-074 に列挙された項目以外への変更は無い（`git diff --stat` で
差分のあるファイルを全て確認）。文書（`CLAUDE.md`・`docs/Developer.md`）への
削除した名前の残存も無い。
