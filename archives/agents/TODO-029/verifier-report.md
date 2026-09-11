# TODO-029 verifier の報告

対象: 作業ツリー（未コミット）。変更前は `1830e4c`。

## 1. 検証コマンド

| コマンド | 結果 | 終了コード |
|----------|------|-----------|
| `uv run pytest` | 211 passed | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `node --test tests/browser/` 1 回目 | tests 32 / pass 32 / fail 0 | 0 |
| `node --test tests/browser/` 2 回目 | tests 32 / pass 32 / fail 0 | 0 |
| `node --test tests/browser/` 3 回目 | tests 32 / pass 32 / fail 0 | 0 |

すべて指示どおり通った。落ちたコマンドは無い。

## 2. わざと壊して確かめた結果

壊す→`node --test`→scratchpad の控えから戻す、を1件ずつ行った。
`git checkout` / `restore` / `stash` は使っていない。各回の後、
`diff` で控えと完全一致することを確認してから次へ進んだ。

| # | 壊したところ | 結果 |
|---|--------------|------|
| 1 | `dom.js` の `N_CHECKER` を 15→14 | **落ちる**（全滅。`Board` が組み上がらず `open_board` がタイムアウト。実装担当の報告と一致） |
| 2 | `main.js` のメニュー配列から `["menu-new-game", new_game]` を削除 | **落ちる**（`メニュー「New Game」→ new {} を送る` が失敗。加えてメニューが開いたままになり、後続の 5 件が巻き添えで失敗。実装担当の報告と一致） |
| 3 | 名前の `<input>` を `change` だけにする（`["focusout","change"]`→`["change"]`）を **10 回連続** | **10 回とも** 31 pass / 1 fail。落ちたのは毎回**「名前の入力: 打たずにフォーカスを外す → set_playername を送る (focusout)」（S4）だけ**。揺れなし |
| 4 | 名前の `<input>` を `focusout` だけにする（`["focusout","change"]`→`["focusout"]`）を **10 回連続** | **10 回とも** 31 pass / 1 fail。落ちたのは毎回**「名前の入力: 打って Enter → フォーカスを外す前に set_playername を送る (change) (change)」（S5）だけ**。揺れなし |
| 5 | `settings.js` の `get_image_dir()` を固定値 `WRONGDIR` に変更 | **落ちる**（5 件失敗: 「盤面が描画される」「チェッカーをドラッグできる」「2 枚目のタブに同期する」「コンソールエラーが出ていない」×2。画像が全部 404 になり、コンソールエラー検出テストが確実に捕まえている） |

5 項目とも、狙ったところで落ちることを実測で確認した。特に 3・4 は
implementer/reviewer の報告どおり「片方だけを消しても 1 本は送信される」
ため通常のクリックテストでは捕まらないが、implementer が追加した
S4/S5 の 2 本は、片方を消すと対応する 1 本だけが 10 回とも確実に落ちる
ことを自分でも確認した。

各回の後、`diff` で `dom.js` / `main.js` / `settings.js` が控えと
`IDENTICAL` であることを確認し、`git status` / `git diff --stat` が
壊す前と同じであることも確かめた。

## 3. 実プロセスでのスクリーンショット比較

`git worktree add` で `1830e4c` を別ディレクトリに出し、`uv sync` で
依存関係を入れて起動。作業ツリー側（TODO-029 適用後）と、同じ
`image_dir=images1a`、同じビューポート（1280×900）、同じ手順
（`board.checker[0][0].cur_point` が定義されるまで待ち、+500ms 安定待ち
してから `fullPage` スクリーンショット）で撮影して比較した。

- 旧（`1830e4c`）: md5 `24070c12ba0d9f4983de620fbbf5cdd9`、898255 bytes
- 新（作業ツリー）: md5 `24070c12ba0d9f4983de620fbbf5cdd9`、898255 bytes
- **md5 完全一致**。コンソールエラーもどちらも 0 件

README の 7 番で挙げられている「`<label>` の `for=` 修正」は見た目
（スクリーンショット）には影響しない変更なので、この一致は妥当。
終わったあと `git worktree remove --force` で worktree を消し、
`git status` / `git log --oneline -1` で本体の `starlette` ブランチが
無事なことを確認した。

## 4. `<label>` の `for=` 修正の実測

`page.on('websocket')` を `page.goto()` の前に登録し、送信フレームを
`framesent` イベントで直接記録するスクリプトで、Sound / Free / Pip /
Clock の 4 つのラベルをクリックして確かめた（スクリプトは検証後に削除
済み。`git status` に残っていないことを確認）。

| ラベル | チェックボックス | 切り替わったか | 送信されたメッセージ |
|--------|-----------------|----------------|----------------------|
| Sound | `#sound-switch` | true → false（切り替わった） | 0 本（ローカル設定なので送信なし） |
| Free | `#free-move` | false → true（切り替わった） | 0 本 |
| Pip | `#disp-pip` | false → true（切り替わった） | 0 本 |
| Clock | `#clock_sw` | true → false（切り替わった） | 3 本: `set_clock_switch`×1、`stop_clock`（player 0）×1、`stop_clock`（player 1）×1 |

**4 つとも実際にクリックで切り替わることを確認した。** Clock は
プレーヤー 0・1 それぞれの `stop_clock` が 1 回ずつ、`set_clock_switch`
が 1 回で、合計 3 本の送信はいずれも 1 回ずつ（二重発火ではない）。
Sound/Free/Pip はローカル設定のみでメッセージを送らない仕様どおり。

## 5. 変更ファイルと範囲

`git status` / `git diff --stat`:

```
 M CLAUDE.md
 M src/ytbg/webroot/static/js/board.js
 M src/ytbg/webroot/static/js/main.js
 M src/ytbg/webroot/static/js/settings.js
 M src/ytbg/webroot/static/js/ui/base.js
 M src/ytbg/webroot/templates/index.html
 M tests/browser/clicks.test.mjs
 M tests/test_ws.py
?? .codegraph/
?? archives/agents/TODO-029/
?? src/ytbg/webroot/static/js/dom.js
```

- 実装担当の報告（変更したファイルの表）と一致。README の範囲
  （DOM 生成・イベント登録の付け替え・`<body>` の `data-*` の読み取り・
  `<label>` の `for=` 修正）に収まっている
- `.codegraph/` は `.gitignore` を自前で持つ既存のディレクトリで、
  今回の作業で作られたものではない（TODO-029 とは無関係）
- `archives/agents/TODO-029/` は範囲内
- **`TODO.md` は変更されていない**（`git status` に出てこない）
- `grep -rn "WRONGDIR\|N_CHECKER = 14\|for (const ev of \[\"change\"\]\|for (const ev of \[\"focusout\"\]" src tests` は **0 件**

## 6. 判断が要る点・確かめられなかったこと

- implementer/reviewer の報告にある「判断が要る点」（メニューの `<a>` へ
  の `id` 付与、`tests/test_ws.py` の書き換え、`CLAUDE.md` の更新）は、
  すでに reviewer が確認済みで verifier の担当範囲（README の確かめる
  こと 1〜5）には含まれていないため、ここでは判断していない
- reviewer の報告にある「検討 1」（`CLAUDE.md` の `wait_images()` の
  説明が実測とずれている）と「検討 2」（S4/S5 を `tests/browser/` に
  足すかどうか）は、reviewer 側の判断待ちとして残っている。verifier
  としては、実装担当が追加した S4/S5 が正しく機能することを 3・4 の
  10 回試行で確認した、という事実のみ報告する
- 「同じに見える」の基準はスクリーンショットの md5 一致とコンソール
  エラー 0 件で判断した。ピクセル単位より厳しい基準はないが、完全一致
  なので目視での見比べは行っていない
