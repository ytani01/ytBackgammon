# TODO-041 verifier report

## 対象
- `src/ytbg/webroot/static/js/ui/dice.js`（`RollButton.on_mouse_down_xy()` の bind 先修正）
- `tests/browser/opening.test.mjs`（新規、3 件）

## 1. `node --test tests/browser/`（1 回）

54 件すべて成功。

```
▶ 先手決め (opening roll)
  ✔ 相手が振ったあとに Roll を押すと、2 秒後に先手が決まる (2847.456428ms)
  ✔ free move でも、自動クリックが dice[0] を進める (2644.037958ms)
  ✔ コンソールエラーが出ていない (15.975643ms)
✔ 先手決め (opening roll) (10984.506034ms)
...
ℹ tests 54
ℹ suites 6
ℹ pass 54
ℹ fail 0
```

他のスイート（基本の動作確認・クリック操作・ドラッグの先行実行・ルール層・
`?sound`）も全件成功。

## 2. その他の検証（各 1 回）

| コマンド | 結果 |
|---|---|
| `uv run pytest -q` | `227 passed, 1 warning`（警告は starlette の `anyio.abc.BlockingPortal` 非推奨、既存のもので今回の変更と無関係） |
| `node --test tests/js/` | `tests 57` `pass 57` `fail 0` |
| `uv run ruff check .` | `All checks passed!` |
| `uv run mypy src` | `Success: no issues found in 12 source files` |
| `uv run basedpyright` | `0 errors, 0 warnings, 0 notes` |

## 3. わざと壊す

作業は `command cp` で `dice.js` を退避してから行い、都度 `command cp` で
復元した（`git checkout` は未追跡の `opening.test.mjs` を消さないために避けた）。

### (a) `bind(this.dice[0])` → `bind(this)` に戻す

`tests/browser/opening.test.mjs` のみ実行。狙いどおり
「free move でも、自動クリックが dice[0] を進める」が落ちた。
加えて「コンソールエラーが出ていない」も落ちた（`dice0NaN.png` の 404）。
これはテストのコメントに書かれている想定どおりの副作用で、狙った 1 件が
確実に落ちることを確認できた。

```
✖ free move でも、自動クリックが dice[0] を進める (2125.961321ms)
  AssertionError [ERR_ASSERTION]: dice[0] 以外が書き換わっている
    actual: [ 0, 0, 0, 0 ]
    expected: [ 6, 0, 0, 0 ]

✖ コンソールエラーが出ていない (1.702041ms)
  AssertionError [ERR_ASSERTION]: [
    {
      "url": ".../images1a/dice0NaN.png",
      "text": "Failed to load resource: the server responded with a status of 404 (Not Found)"
    }
  ]
```

「相手が振ったあとに Roll を押すと、2 秒後に先手が決まる」は落ちなかった
（このテストは free move ではないため、`this.value` を読む枝を通らず、
this のずれの影響を受けない。テストのコメントに書かれている説明と一致する）。

### (b) `setTimeout(click_dice, 2000);` をコメントアウト

狙いどおり、自動クリックに依存する 2 件が両方タイムアウトで落ちた。

```
✖ 相手が振ったあとに Roll を押すと、2 秒後に先手が決まる (8260.387143ms)
  Error: opening roll: timeout. last value={"turn":2,"d0":[5,0,0,0],"d1":[0,0,2,0]}

✖ free move でも、自動クリックが dice[0] を進める (8209.066931ms)
  Error: free move click: timeout. last value=[5,0,0,0]

✔ コンソールエラーが出ていない
ℹ tests 3
ℹ pass 1
ℹ fail 2
```

いずれも復元後、`git diff` は指示どおりの 2 行の置き換えのみに戻っている
ことを確認済み。

## 4. 復元後の `git diff`

```diff
--- a/src/ytbg/webroot/static/js/ui/dice.js
+++ b/src/ytbg/webroot/static/js/ui/dice.js
@@ -539,7 +539,8 @@ export class RollButton extends BannerButton {
 
         if ( this.another().dice_active ) {
             log(`settimeout`);
-            const click_dice = this.dice[0].on_mouse_down_xy.bind(this);
+            const click_dice =
+                  this.dice[0].on_mouse_down_xy.bind(this.dice[0]);
             setTimeout(click_dice, 2000);
         }
     } // RollButton.on_mouse_down_xy()
```

指示どおり 2 行の置き換えのみ。`tests/browser/opening.test.mjs` は未追跡の
新規ファイルとして残っている。

## 変更ファイルの一覧と範囲の確認

`git status` の差分は次の 2 つのみ:

- `M  src/ytbg/webroot/static/js/ui/dice.js`
- `?? tests/browser/opening.test.mjs`

指示された対象範囲（この 2 ファイルのみ）と一致している。他のファイルは
変更していない。

## 気づいた懸念・判断できないこと

- (a) の壊し方では、狙った 1 件に加えて「コンソールエラーが出ていない」も
  一緒に落ちる。これはテストファイル内のコメントで想定済みと明記されて
  いるので、テストの設計として意図されたものと判断した。念のため報告する。
- それ以外に判断が必要な点は見当たらなかった。
