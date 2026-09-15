# TODO-074 verifier 報告

## 1. 検証コマンド（すべて自分で実行）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 349 passed, 1 warning（starlette の DeprecationWarning のみ） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 13 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 154 pass / 0 fail |
| `node --test tests/browser/` | 106 pass / 0 fail |

すべて終了コード 0（`node --test` はサマリで fail 0 を確認、いずれも
出力に失敗テストなし）。実装者の報告値と一致した。

## 2. `git diff` と TODO.md TODO-074 節の突き合わせ

TODO.md の対象一覧（JS 12 項目、Python 5 項目、計 17 項目）を 1 つずつ diff
と照合した。過不足なし。

- JS: `dst_points()` の早期 return、`pip_count()`/`get_pip()` の
  `isNaN`/`undefined` チェック、`closeout()` の範囲チェック（対応するテストも
  削除）、`Position.from_points()`（`tests/js/helper.mjs` を `new Position()`
  へ変更）、`BgText.get()`/`PlayerScore.get()`、`ui/base.js` の `this.el`
  ガード一式、投了・勝ちバナーの `on_click`、`PlayerPipCount.set()` の
  `move()`/`rotate()`、`Dice` の `image_el` 代入と `val %= 10`、`main.js` の
  `keyCode` ログと `e.key.length === undefined`、`CookieBase` の
  `this.cookie`/`load()` の戻り値、`lobby.js` の `board_url()` の
  `${b.prefix}` — すべて diff 上で確認した。TODO に書かれていない箇所の
  変更は見当たらない
- Python: `_on_roll()`（`roll` の登録表を `_on_dice` へ、`_on_dice` は
  変更なしで既存）、`_load_hist_ent()`、`replay.py` の
  `except asyncio.CancelledError: raise`、`__main__.py` の
  `MY_NAME`/`VERSION`、`__init__.py` の `__package__` 分岐 — すべて確認した

**気になった点（判断に迷う）**: `__init__.py` は分岐を消す代わりに
`assert __package__` を追加している。実装者自身が「判断に迷った点」として
報告済み。挙動としては分岐を無くして型を絞るためのアサートで、TODO の
「通らない分岐を消す」という趣旨には沿っているが、新しい行が 1 行増えている
点をどう見るかは管理者判断。basedpyright は通っている

## 3. TODO.md・docs/Developer.md に消した名前が残っていないか

`from_points` / `BgText.get` / `PlayerScore.get` / `_on_roll` /
`_load_hist_ent` / `MY_NAME` / `VERSION` を CLAUDE.md と docs/Developer.md で
grep — 該当なし。`docs/Developer.md` に残る `PlayerPipCount` / `PlayerScore` /
`BgText` はクラス図の矢印（クラス名そのもの）で、消したのはメソッドなので
問題ない

## 4. TODO.md のチェックボックス

TODO-074 節は `[x]` が 19（対象 17 ＋ 確かめること 2）、未チェック `[ ]` は
0。実際に確認できた内容とすべて一致している

## 5. 確かめられなかったこと

- `assert __package__` を「分岐ではない」と判断してよいかは、コード品質の
  好みの問題に近く、verifier としては判断できない（管理者判断が必要）
- ガードや分岐を消したことで挙動が変わらないかの妥当性そのもの
  （「本当に通らない分岐か」の設計判断）は TODO.md に「reviewer に見させる」と
  明記されている通り、reviewer の担当であり本報告の範囲外
