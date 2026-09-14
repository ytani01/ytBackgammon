# TODO-052 verifier 報告（2 回目・レビュー後の修正の確認）

対象: 未コミットの差分（`git diff`）。implementer-report.md 末尾「レビュー後の修正」を確認した。

## 1. 検証を一式（1 回ずつ）

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 291 passed, 1 warning（starlette testclient の DeprecationWarning。Python 側は無関係） | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | 99 pass, 0 fail | 0 |
| `node --test tests/browser/` | 85 pass, 0 fail | 0 |

全て通った。implementer は一式を走らせていなかったが、今回まとめて確認し、
問題は無かった。

## 2. 前回落ちなかった 2 通りの壊し方 → レビュー後に足されたテストで落ちるか

いずれも `src/ytbg/webroot/static/js/actions.js` を `/tmp/actions.js.orig` に控え、
壊したあと `node --test tests/browser/clicks.test.mjs` を走らせ、
`\cp /tmp/actions.js.orig src/ytbg/webroot/static/js/actions.js` で戻した。
戻したことは `diff /tmp/actions.js.orig src/ytbg/webroot/static/js/actions.js`
（差分なし）と `git diff --stat`（元と同じ `135 +++...-------`、
84 insertions / 51 deletions）の両方で確認した。

### 壊し方 1: `can_hold_cube()` の「ダイスが出ていたら触れない」ループを削除

```
    for (let p=0; p < 2; p++) {
        // ダイスが出ているときは、キューブに触れない
        if ( board.has_dice(p) ) {
            return false;
        }
    }
    return true;
```
を `return true;` だけに変更。

`node --test tests/browser/clicks.test.mjs` → **43 中 1 件だけ失敗**
（狙ったテストだけが落ちた）。

```
✖ ダイスが出ているときにキューブを動かす → 何も送らない (921.787211ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + [
  +   {
  +     data: {
  +       player: 0
  +     },
  +     src: 'client',
  +     type: 'double'
  +   }
  + ]
  - []
```

### 壊し方 2: `can_hold_cube()` の `gi === undefined` のガードを削除

```
export const can_hold_cube = (board) => {
    const gi = board.gameinfo;
    if ( gi === undefined ) {
        return false;
    }
    const cube = gi.board.cube;
```
から `if ( gi === undefined ) { return false; }` を削除。

`node --test tests/browser/clicks.test.mjs` → **43 中 1 件だけ失敗**
（狙ったテストだけが落ちた）。

```
✖ gameinfo が届く前にキューブ・▲・Roll を押す → 何も送らず、エラーも出ない (1309.169652ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + [
  +   "Cannot read properties of undefined (reading 'board')"
  + ]
  - []
```

どちらも、レビュー後に足したテストが狙いどおり機能していることを確認した。
壊した箇所を戻したことは diff で確かめた（差分なし）。

## 3. `CLAUDE.md` の書き直しと実装の突き合わせ

`git diff CLAUDE.md` で該当箇所を読み、実装（`actions.js` / `board.js` /
`ui/dice.js`）と照らした。

- **要修正 1（予測の土台）**: `CLAUDE.md:453-458` 付近が
  「予測は `this.gameinfo` を土台にし、変えたもの（動かした駒と dice、
  得点の ▲▼ ならその得点）以外はそのまま使う。`apply()` は `this.gameinfo` を
  渡された `gameinfo` に置き換えるので、予測を `apply()` したあとの
  `this.gameinfo` は予測そのもので、次の予測はそれを土台にする」に
  書き直されている。`board.js` の `apply()` が先頭で `this.gameinfo = gameinfo`
  としている実装と一致する
- **検討 2（続けて押したときの限界）**: 「返事が 1 通も届かない間に続けて
  押した分は消えない。途中で返事が届くと消えることがある」の 1 文が
  足されている。`actions.js` の `set_score()` / free move の `dice` が
  値そのものを送り、`apply()` が届いた `gameinfo` で `this.gameinfo` を
  丸ごと置き換える実装と合っている
- **検討 3（「何も操作できない」の範囲）**: 「盤面を読む操作（ロール、
  ダイス、チェッカー、キューブ、投了、得点）は何もしない」に絞られ、
  「名前・クロック・履歴の操作は送る」と足されている。`actions.js` を
  読むと、`gi === undefined` のガードがあるのは `roll` / `click_dice` /
  `can_pick_checker` / `can_hold_cube` / `double` / `resign` /
  `score_up` / `score_clear` の 8 つだけで、`set_playername` や
  クロック系・履歴系にはガードが無く、指示どおり一致する
- **検討 5（Roll ボタンがもう一度出る）**: 「Roll を押した直後に ▲ や
  free move のダイスを押すと、予測の `apply()` で Roll ボタンがもう一度
  出ることがある（ダイスはまだ 0 のため）」の 1 文が足されている。
  `actions.js` の `set_score()` / free move の `click_dice()` が
  `board.apply(predicted, {sec: 0})` を呼び、`apply()` が `set_turn()` を
  経由して `RollButton.update()` を呼ぶ実装と合っている（`ui/dice.js`
  の `update()` は `has_dice(this.player)` が false ならボタンを on にする）
- **好み 9（挿入位置）**: `CLAUDE.md:125-128` で、`set_turn()` の注意
  （「0 / 1 / -1 から 2 へは戻せず…」）のあとに
  `board.gameinfo` / `shown_dice()` の説明が続く形になっており、
  読みにくさは解消されている

いずれも実装・テストの内容と食い違いは見つからなかった。

## 変更ファイルと指示の対応

`git status` の変更ファイルは implementer-report.md のリスト（レビュー後の
修正を含む）と一致（`CLAUDE.md`、`actions.js`、`board.js`、`ui/cube.js`、
`ui/dice.js`、`ui/label.js`、`tests/browser/*` 6 ファイル、
`tests/js/move.test.mjs`）。指示に無いファイルの変更は見当たらなかった。
`archives/agents/TODO-052/` は報告置き場として想定どおり。

## 確かめられなかったこと・判断できないこと

- ブラウザテストは指示に無かったが、通常の運用（MEMORY.md）に合わせて
  1 回のみ実行した
- 検討 4 で reviewer が挙げていた `cancel_double` のクリックのテスト、
  ダイスのクリック・チェッカー・投了・▼ の「届く前」のガードは、今回の
  修正の対象外（implementer 報告の「判断が要る点」のとおり）なので、
  今回はそれらを確かめていない。追加するかどうかは管理者の判断
- 検討 6（切断中に ▲ / ダイスを押すと表示が送っていない値のまま残る）は
  「そのままでよい」という reviewer の案のとおり直されておらず、今回も
  未確認（対応不要という判断が既にされている前提で確認は省いた）
