# TODO-060 確認の報告 2 回目（verifier）

依頼（`verifier-request-2.md`）どおり、コードは直していない。

## 1. 検証の一式（1 回ずつ）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 292 passed |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | tests 156 / pass 156 / fail 0 |
| `node --test tests/browser/`（1 回のみ） | 0 | tests 99 / pass 99 / fail 0（見込みの 99 と一致） |

`tests/browser/` の中で、前回落ちた「掴んでいるキューブも手元の座標と z に残る」
（`drag.test.mjs`）と、今回足された 2 件のバナーのテスト
（「相手に閉め出されている手番では、パスのバナーが出る」
「上がった盤面では、勝った側に勝ちのバナーが出て名前が強調される」、
`rules.test.mjs`）はすべて通った。

依頼の 2 に従い、この 2 件が狙いどおり落ちるかの再確認（壊す実験）は
行っていない（`implementer-report-3.md` に実装担当の確認済み）。

## 2. 変更範囲の確認

`git status --short` は以下のとおり（session 開始時のスナップショットと
ファイル一覧は完全に一致している）。

```
M CLAUDE.md
M TODO.md
R  docs/design-4.md -> archives/docs/design-4.md
M docs/Developer.md
M src/ytbg/server.py
D src/ytbg/webroot/static/js/actions.js
D src/ytbg/webroot/static/js/board.js
M src/ytbg/webroot/static/js/dom.js
D src/ytbg/webroot/static/js/drag.js
M src/ytbg/webroot/static/js/layout.js
M src/ytbg/webroot/static/js/log.js
M src/ytbg/webroot/static/js/main.js
M src/ytbg/webroot/static/js/rules/actions.js
M src/ytbg/webroot/static/js/rules/judge.js
M src/ytbg/webroot/static/js/rules/move.js
M src/ytbg/webroot/static/js/rules/position.js
M src/ytbg/webroot/static/js/settings.js
M src/ytbg/webroot/static/js/sound.js
M src/ytbg/webroot/static/js/ui/base.js
M src/ytbg/webroot/static/js/ui/button.js
M src/ytbg/webroot/static/js/ui/checker.js
M src/ytbg/webroot/static/js/ui/clock.js
M src/ytbg/webroot/static/js/ui/cube.js
M src/ytbg/webroot/static/js/ui/dice.js
M src/ytbg/webroot/static/js/ui/label.js
D src/ytbg/webroot/static/js/ui/point.js
M src/ytbg/webroot/static/js/ws.js
M tests/browser/board.test.mjs
M tests/browser/clicks.test.mjs
M tests/browser/debug.test.mjs
M tests/browser/drag.test.mjs
M tests/browser/helper.mjs
M tests/browser/last_op.test.mjs
M tests/browser/opening.test.mjs
M tests/browser/player_cookie.test.mjs
M tests/browser/predict.test.mjs
M tests/browser/rules.test.mjs
M tests/browser/settings.test.mjs
M tests/js/actions.test.mjs
M tests/test_on_json.py
?? archives/agents/TODO-060/
?? src/ytbg/webroot/static/js/board_controller.js
?? src/ytbg/webroot/static/js/board_view.js
?? tests/browser/clock.test.mjs
?? tests/js/controller.test.mjs
```

`git status` の M/A/D の一覧そのものは、`verifier-report.md`（1 回目）の
時点からファイル単位では増減が無い（これらの多くは 1 回目の verifier が
「壊して戻す」確認で触った結果、内容は同じまま mtime だけ動いている。
1 回目の報告で `cmp` により SAME を確認済み）。

そこで、**ファイル単位の `git status` では増分が分からない**ため、
`stat` でファイルの更新時刻を確認した。

- `tests/browser/drag.test.mjs` / `tests/browser/helper.mjs` /
  `tests/browser/rules.test.mjs` の 3 つは、いずれも同時刻
  （2026-09-15 07:37:37）に更新されており、他のどのファイルとも重ならない
  独立したタイムスタンプを持つ。これは `implementer-report-3.md` に書かれた
  3 巡目の作業（`wait_still()` / `shown_banners()` の追加、`drag.test.mjs` の待ち、
  `rules.test.mjs` のバナーのテスト 2 件）の時刻と符合する
- `CLAUDE.md` は単独でさらに後（07:39:34）に更新されている。中身も
  `git diff CLAUDE.md` で確認したところ、`tests/js/`・`rules.test.mjs`・
  `last_op.test.mjs`・`drag.test.mjs`・`clock.test.mjs` の説明を今回の
  変更点に合わせて書き直した内容と、`design-4.md` の扱いに関する記述の
  更新のみで、コードの説明以外に踏み込んだ変更は無い
- それ以外の `src/ytbg/webroot/static/js/board_controller.js` /
  `ui/dice.js` / `log.js` / `server.py` / `board_view.js` の mtime は
  2026-09-15 07:29〜07:31 に集中しており、これは `verifier-report.md`
  （1 回目）に書かれた「壊して戻す」確認の時刻帯と一致する。1 回目の
  報告で内容が `cmp` により元と同じ（SAME）と確認済みのため、これらは
  内容の変化ではないと判断した

以上から、**前回の報告（1 回目）から増えた内容の変更は
`tests/browser/helper.mjs`・`tests/browser/drag.test.mjs`・
`tests/browser/rules.test.mjs`・`CLAUDE.md` の 4 ファイルに限られると
判断した**。ただし、この判断は mtime と `implementer-report-3.md` の記述の
突き合わせによるもので、1 回目の報告時点のファイル内容そのもの
（diff のスナップショット）を保存して機械的に比較したものではない。

## 判断できないこと・判断が要る点

- 上記のとおり、変更範囲の確認は mtime とレポート記述の突き合わせによる
  ものであり、1 回目の verifier 実行時点の完全な diff スナップショットとの
  機械的な比較ではない。より厳密な確認が要るなら、次回以降は各巡の
  verifier 報告時に `git diff` を保存しておく運用が要る（判断が要る）
- 依頼どおり、足した 2 件のバナーのテストが狙いどおり落ちるかの
  再確認（壊す実験）はここでは行っていない（実装担当が確認済みのため）
