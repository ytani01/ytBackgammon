# TODO-030 verifier の報告

対象: 作業ツリーの未コミットの変更（`CLAUDE.md` / `board.js` /
`rules/position.js` / `ui/checker.js` / 新規 `tests/browser/predict.test.mjs`）。
変更前は `43193fc`。コミットはしていない。

## 1. 検証コマンド（1 回ずつ）

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 終了コード 0。211 passed, 1 warning（starlette 側の非推奨警告のみ） |
| `uv run ruff check .` | 終了コード 0。All checks passed! |
| `uv run mypy src` | 終了コード 0。Success: no issues found in 12 source files |
| `node --test tests/js/` | 59 件、pass 59 / fail 0。警告 0 |
| `node --test tests/browser/`（timeout 600000） | 44 件、pass 44 / fail 0 |

`clicks.test.mjs`「スコアの ▲ → set_score」は今回落ちなかった
（既知の揺れは発生せず）。全経路で一度も落ちなかったので、走らせ直しは不要だった。

作業の途中で `src/` をわざと壊して何度も browser テストを走らせたため、
上記はすべて**壊した版を元に戻したあと**に取り直した最終確認の結果。

## 2. わざと壊して確かめる（指定の 4 つ、それぞれ 10 回）

`predict.test.mjs` だけを対象に、`checker.js` / `board.js` を直接書き換えて
壊し、10 回連続で走らせた。壊し方と戻し方は `/tmp/vwork/*.orig` に控えを
取ってから行い、`git checkout` / `restore` / `stash` は使っていない。
毎回 md5sum で元に戻ったことを確認した。

| # | 壊し方 | 10 回の結果 | 落ちたテスト（毎回同じ） |
|---|--------|--------------|--------------------------|
| 1 | `predict_gameinfo()` を呼ばない（`predicted` が常に `undefined`） | **10/10 落ちる** | 「サーバの応答が無くても、離した瞬間に表示が変わる」「ヒットのときは 2 手ぶん動かし、2 本送る」「予測が外れても、サーバの gameinfo で表示が戻る」の 3 件（他 2 件は通る） |
| 2 | 予測を `apply()` に渡さない（`if (predicted !== undefined) { ch.board.apply(...) }` の呼び出しを削除） | **10/10 落ちる** | 上と同じ 3 件 |
| 3 | ヒットのときの 2 手ぶんのうち 1 手を落とす（`moves` に `hit_ch` を積まない） | **10/10 落ちる** | 「ヒットのときは 2 手ぶん動かし、2 本送る」「予測が外れても、サーバの gameinfo で表示が戻る」の 2 件 |
| 4 | `apply()` に足した `predict` を無視して、予測でも `set_turn()` が `emit_stop()` を送るようにする（`if (emit && ...)` から `emit &&` を外す） | **10/10 落ちる** | 「予測はサーバへ何も送らない（turn が -1 に変わっていても）」の 1 件だけ |

いずれも、狙った以外のテスト（`board.test.mjs` / `clicks.test.mjs` /
`rules.test.mjs`）は壊していないので走らせていない（`predict.test.mjs` だけを
対象にした。実装担当・reviewer の報告にある壊し方の番号と対応関係はあるが、
文言は自分で書き直したので厳密には同一の diff ではない）。

壊した版を戻したあとの状態:

```
$ md5sum src/ytbg/webroot/static/js/board.js
2a96f9d295399abb71043450e02609c3  (壊す前・戻した後で一致)
$ md5sum src/ytbg/webroot/static/js/ui/checker.js
cd625686ca0c9d6d30d5f8daca97efdd  (同上)
$ grep -rn "BROKEN" src tests
(0 件)
```

## 3. 2 枚のタブでの実測（見たまま）

`/tmp/vwork/two_tabs.mjs` で、実サーバ + chromium 2 ページを起動して確かめた。

**A: 片方でドラッグ → もう片方に同じ配置が届く**

page1 で turn=0・dice=[3,0,0,0] にして point 6 の先端をワンタッチでムーブ。
page2 側で該当チェッカーが point 3 へ動くのを確認し、両ページの
`{counts, pip, cur_points}` を JSON 化して比較した。

```
A page1 {"counts":[0,2,0,1,0,0,4,0,3,...],"pip":[164,167],"total":30,...}
A page2 {"counts":[0,2,0,1,0,0,4,0,3,...],"pip":[164,167],"total":30,...}
A match: true
```

完全一致。

**B: 2 枚で同時に同じチェッカーを動かす → 最後に両方が同じ盤面に落ち着く**

同じ turn・dice のまま、両ページで point 13 の先端（同じ id `p012`。
`tip.id` が両ページとも `p012` で一致することを確認済み）を
`Promise.all` でほぼ同時にワンタッチ操作した。

```
B tip same id? p012 p012 true
B page1 {"counts":[0,2,0,1,0,0,4,0,3,0,0,1,5,4,...],"pip":[162,167],"total":30,...}
B page2 {"counts":[0,2,0,1,0,0,4,0,3,0,0,1,5,4,...],"pip":[162,167],"total":30,...}
B match: true
```

チェッカーの総数は 30 のまま、両ページの盤面（駒の位置・pip）は完全一致。
2 回同時に押しても、実際に動いたのは 1 手ぶん（`point 13` が 5→4、
`point 11` に 1 枚増える）で、二重に動いた形跡は無かった。

## 4. 予測が外れたときに表示が戻るか（reviewer が挙げた「テストが見ていない外れ方」）

`predict.test.mjs` の冒頭コメントにある通り、既存のテストが作れているのは
「行き先が違う」1 種類だけ。次の 2 つを自分で作って確かめた
（`board.predict_gameinfo` を monkeypatch し、`board.apply` を包んで
予測時とサーバ応答時それぞれの表示を記録する方式。手順は implementer の
3 番目のテストと同じ考え方）。

### 4-1. ヒットの扱いが違う（作れた。2 パターンとも確認）

**パターン A: 予測はヒットと判定したが、実際はヒットでない**

`predict_gameinfo` を包んで、返ってきた予測に「相手の checker[1][0] が
バー(27) へ行った」を無理やり書き足す一方、実際の盤面には相手の駒は無い
（＝本当のヒットではない）状態でドラッグした。

```
apply() calls (in order): [
  {"predict":true,"p1_ch0":27,"bar1":1,"p3":1},
  {"predict":false,"p1_ch0":19,"bar1":0,"p3":1}
]
sent (from real hit_ch, no real hit): [
  {"type":"put_checker","data":{"ch":4,"p":3,"idx":0}},
  {"type":"dice",...}
]
```

予測の直後は表示が「相手がバーにいる」という誤った状態（`bar1:1`）になったが、
サーバから届いた本物の `gameinfo` で `bar1:0`・`p1_ch0:19`（元の位置）に
戻った。送ったメッセージは実際の `hit_ch`（ヒット無し）から作られているので、
最初から間違った内容を送ってはいない。

**パターン B: 予測はヒットでないと判定したが、実際はヒット**

実際に盤面へ相手のブロットを point 3 へ置いたうえで、`predict_gameinfo` を
包んで「ヒットの 1 手を除いた `moves`」を渡すように仕向けた
（＝予測だけがヒットを見落とす）。

```
apply() calls (in order): [
  {"predict":true,"p1_ch1":3,"bar1":0,"p3":2},
  {"predict":false,"p1_ch1":27,"bar1":1,"p3":0}
]
sent (real hit_ch, should include hit): [
  {"type":"put_checker","data":{"ch":101,"p":27,"idx":0}},
  {"type":"put_checker","data":{"ch":4,"p":3,"idx":1}},
  {"type":"dice",...}
]
```

予測の直後は「相手がまだ point 3 に残っている」という誤った表示
（`bar1:0, p3:2`）になったが、サーバから届いた本物の `gameinfo` で
`bar1:1, p3:0`（正しくバーへ移動）に戻った。**送ったメッセージ自体は
`on_mouse_up_xy()` の実際の `hit_ch` 判定（`predict_gameinfo` の中身とは
無関係）から作られているので、ここでも最初から正しい内容が送られている。**

両パターンとも、**表示の一時的な食い違いはサーバの応答で必ず修正される**
ことを実測で確認できた。

### 4-2. `turn` が変わっていた（作れた。収束を確認）

reviewer の B-3 は「予測が `turn` を古い値へ戻す」ことまでは確認していたが、
「収束するか」は未確認としていたので、そこを実測した。

point 6 の先端を掴んだ状態（mousedown 後、mouseup 前）で、別クライアントが
`set_turn {turn: 1}` を送ったことにし、`board.turn` が 1 に変わったのを
確認してから mouseup した。

```
apply() calls (in order): [
  {"predict":true,"turn":1,"p3":1,"p6":4},
  {"predict":false,"turn":1,"p3":1,"p6":4},
  {"predict":false,"turn":1,"p3":1,"p6":4}
]
final (client): {"turn":1,"p3":1,"p6":4}
server (fresh reload): {"turn":1,"p3":1,"p6":4}
converged: true
```

**別ページで同じサーバへ新規に接続し直した状態と完全一致した**
（サーバの側が真の状態を持っていることの裏取り）。turn が変わっても、
表示とサーバの記録は収束する。

なお、このケースでは「掴んでいる間に turn が変わっても、離したときの
移動そのものは通った」（サーバが turn を理由に put_checker を拒否しては
いない）ことも分かった。これは今回の確認対象（表示が戻るか）の範囲外の
発見だが、念のため書いておく。**挙動としてよいかどうかの判断はしていない。**

### 4-3. 見ていない外れ方

`score` / `playername` / `cube` が飛んでいる間の予測は、reviewer が
B-1 で「巻き戻る」ことまで確認しているが、**収束するかどうかは
自分では確かめていない**（時間の都合で対象を README・reviewer 指摘の
最重要 2 点に絞った）。判断が必要なら追加で確認する。

## 5. 変更前 (`43193fc`) と見た目が同じか

`git worktree add /tmp/vwork/wt-43193fc 43193fc` で `43193fc` を別ディレクトリに
出し、`uv sync` してから、同じ画像ディレクトリ（`images1a`）・同じ
ビューポート（1000x900）・同じ初期配置（サーバ起動直後）でスクリーンショットを
撮って比較した。

```
$ md5sum /tmp/vwork/new.png /tmp/vwork/old.png
8dd964268b2670fcd8288a125e54ed56  /tmp/vwork/new.png   (今の作業ツリー)
8dd964268b2670fcd8288a125e54ed56  /tmp/vwork/old.png   (43193fc)
```

**md5 が完全に一致した。** worktree は確認後に
`git worktree remove /tmp/vwork/wt-43193fc --force` で消し、
`git worktree list` が作業ディレクトリ 1 つだけに戻ったことを確認した。

## 6. 変更範囲の確認

```
$ git status --short
 M CLAUDE.md
 M src/ytbg/webroot/static/js/board.js
 M src/ytbg/webroot/static/js/rules/position.js
 M src/ytbg/webroot/static/js/ui/checker.js
?? .codegraph/
?? archives/agents/TODO-030/
?? tests/browser/predict.test.mjs

$ git diff --stat
 CLAUDE.md                                    |  35 ++++-
 src/ytbg/webroot/static/js/board.js          | 204 ++++++++++++++++++---------
 src/ytbg/webroot/static/js/rules/position.js |   6 +-
 src/ytbg/webroot/static/js/ui/checker.js     |  80 +++++++----
 4 files changed, 226 insertions(+), 99 deletions(-)
```

README の指定範囲（`board.js` / `ui/checker.js` / `rules/position.js` の
コメント / `CLAUDE.md` / 新規 `tests/browser/predict.test.mjs`）に収まって
いる。`TODO.md` の差分は無い（`git diff --stat -- TODO.md` は空）。
`grep -rn "壊した版\|BROKEN" src tests` は 0 件（自分が壊した分もすべて
元に戻し済み）。`.codegraph/` は未追跡のまま触っていない。

## 確かめられなかったこと・判断できないこと

- 4-3 に書いた通り、`score` / `playername` / `cube` が飛んでいる間の
  予測について、収束するかどうかまでは自分では確かめていない
  （reviewer が「巻き戻る」ことは確認済み）
- reviewer が挙げた「検討」6 件・「好みの範囲」2 件（B-1 の巻き戻り、
  B-2 の対応可否、B-4 の例外時の振る舞い、C-1 の dice の写し方、
  在庫コメント、ID 変換の散らばりなど）は、直すかどうかの判断であり、
  自分は確認担当としてコードを直していない。**この判断は main が行うもの**
- 4-2 で見つけた「掴んでいる間に turn が変わっても、その手の送信・
  適用自体は止まらない」点は、良し悪しの判断はしていない
  （今回の確認対象の外なので報告のみ）
