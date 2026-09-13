# TODO-045 検証報告（verifier）

コードは変更していない。

## 1. 変更範囲

`git status` / `git diff --stat` で確認。

```
M CLAUDE.md
M src/ytbg/webroot/static/js/rules/position.js
M src/ytbg/webroot/static/js/ui/checker.js
M tests/browser/predict.test.mjs
?? archives/agents/TODO-045/
```

指示にある 4 ファイル＋ `archives/agents/TODO-045/` のみ。範囲外の変更なし。

## 2. 検証（各 1 回）

| コマンド | 結果 |
|----------|------|
| `node --test tests/browser/` | 通過（56 tests, 56 pass, 0 fail） |
| `node --test tests/js/` | 通過（99 tests, 99 pass, 0 fail） |
| `uv run pytest` | 通過（227 passed, 1 warning） |
| `uv run ruff check .` | 通過（All checks passed!） |

いずれも終了コード 0（正常終了）。

## 3. 足したテストが効くか

`tests/browser/predict.test.mjs` に足された
「行けない場所で離すと、元に戻って何も送らない」が、reviewer が
「壊しても落ちない」と報告した M2・M5 を実際に捕まえるかを確認した。

作業ツリーの `src/ytbg/webroot/static/js/ui/checker.js` を退避
（`\cp` でスクラッチへコピー）してから 1 か所ずつ壊し、
`node --test tests/browser/predict.test.mjs` を実行。終わるたびに
`\cp` で元に戻した。

### M2: `decide_dst()` のキャンセル 2 か所で `return { dst_p: dst_p, hit_ch: undefined };` を返す

- **足したテストが落ちた。**
  ```
  ✖ 行けない場所で離すと、元に戻って何も送らない (228.078616ms)
    AssertionError [ERR_ASSERTION]: 元のポイントに戻っていない
    19 !== 6
  ```
- 他のテストは通過（6 件中 5 件 pass、1 件 fail）。

### M5: `decide_dst()` の 2 つ目のキャンセル（`available_p.indexOf(dst_p) < 0`）で `cancel_move(ch)` を呼ばない

- **足したテストが落ちた。**
  ```
  ✖ 行けない場所で離すと、元に戻って何も送らない (208.337149ms)
    AssertionError [ERR_ASSERTION]: 掴んだままになっている
    true !== false
  ```
- 副作用として、次のテスト「予測はサーバへ何も送らない (turn が -1 に
  変わっていても)」も連鎖して落ちた（`moving_checker` が外れないまま
  次のテストに入ったため）。狙ったテスト自体が落ちることは確認できた。

いずれも reviewer が「テストが捕まえられない」とした壊し方を、
足された 1 件のテストが捕まえることを確認した。

## 4. 復元後の確認

壊す前後で `git diff --stat` を比較し、一致することを確認した
（`checker.js 109 +++++++++++++++++++--------` のまま、他ファイルも
変化なし）。

## 確かめられなかったこと・判断できないこと

- reviewer report にある検討 1（`CLAUDE.md:340` と `position.js:199` の
  参照先の古さ）、検討 3（TODO.md の表の文言）は、指示された確認範囲
  （4 ファイルの変更内容とテストの実効性）の外なので、今回は確認して
  いない。直すかどうかは管理者の判断。
- M1・M3・M4・M6（reviewer が「落ちる」「捕まえられないが分ける前から
  通っていない経路」と報告したもの）は、今回の指示に含まれていないため
  再実施していない。
