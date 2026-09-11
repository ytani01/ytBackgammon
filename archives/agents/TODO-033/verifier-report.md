# TODO-033 verifier report

対象: `README.md` の更新、`docs/Player.md` / `docs/Admin.md` / `docs/Developer.md` の新規、
`tools/make-shots.mjs` の新規、`docs/design.md` → `archives/docs/design.md` の移動。

## 1. 走らせた検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest -q` | 233 passed, 1 warning（既存の DeprecationWarning のみ） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 59 tests, 全 pass |
| `node --test tests/browser/` | 44 tests, 全 pass（1 回のみ実行） |

いずれも終了コード 0。落ちたものは無い。

## 2. 変更ファイルの一覧と指示範囲との一致

`git status --short`:

```
 M CLAUDE.md
 M README.md
R  docs/design.md -> archives/docs/design.md
 M archives/todo/TODO-020. ...md
 M archives/todo/TODO-021. ...md
 M archives/todo/TODO-024. ...md
 M archives/todo/TODO-025. ...md
 M archives/todo/TODO-026. ...md
?? docs/Admin.md
?? docs/Developer.md
?? docs/Player.md
?? docs/images/
?? tools/
```

指示の範囲（README 更新、Player/Admin/Developer.md 新規、
tools/make-shots.mjs 新規、design.md の移動とリンク修正）と一致している。
`CLAUDE.md` の変更も指示にある「`docs/design.md` への参照を直した」に該当する
内容（「構成」節の書き換え）で、範囲外の変更ではない。
指示に無いファイルの変更は見当たらなかった。

## 3. コマンドの動作確認（実際に打った）

`YTBG_DATA_DIR` を一時ディレクトリへ向け、`server_id=9098`、
ポート `15098` で起動した。

```bash
YTBG_DATA_DIR=<tmp> ./ytbg.sh -d -p 15098 -i images1a 9098
```

- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15098/` → `200`
- ログに `Uvicorn running on http://0.0.0.0:15098` と DEBUG 行の両方が出た
  （`docs/Admin.md` の「ログ」の記述どおり）
- 状態ファイルが `<tmp>/ytbg-9098.jsonl` に作られた（`docs/Admin.md` の
  保存先の説明どおり）。`~/ytbg-1〜4.json` / `~/ytbg-test.json` は
  タイムスタンプ・サイズとも変化なし（壊していない）
- `pgrep -af 'bin/ytbg'` で PID を確かめてから `kill <PID>` で停止。
  `pkill` は使っていない
- `uv run ytbg --help` の出力は `docs/Admin.md` のオプション表
  （`SERVER_ID` / `-p` / `-i` / `-d`）と一致

## 4. `node tools/make-shots.mjs`

実行して `docs/images/overview.png` `header.png` `menu.png` `move.png`
`roll.png` の 5 枚が作り直せることを確認した（終了コード 0、コンソール
エラーの検出は 0 件）。実行後の `git status --short` で、変わったのは
`docs/images/` のみで、`src/` や他のファイルは変化していない。

## 5. 文書と実装の食い違い（重点確認）

### 5.1 メニュー・ヘッダの項目（`docs/Player.md` ↔ `index.html`）

`src/ytbg/webroot/templates/index.html` のメニュー項目
（ボード回転・1つ戻す・連続で戻す・連続で戻す(高速)・1つ進める・
連続で進める・連続で進める(高速)・履歴を削除・New Game）と、
`docs/Player.md` の「戻す・進める」の表・New Game の節は一致していた。
`docs/images/menu.png` を実際に撮り直して目視でも突き合わせ、
文言・順序とも一致を確認した。

ヘッダ（Sound / Free / Pip / Clock / `m +` / `s`）も `index.html` の
`id="sound-switch"` 等と `docs/Player.md` のヘッダ表が一致していた。
`docs/images/header.png` の番号バッジ（`tools/make-shots.mjs` が
`#nav-open` `#sound-switch` `#free-move` `#disp-pip` `#clock_sw`
`#clock_limit0` に 1〜6 を振っている）も、`docs/Player.md` の表の
番号・順序と一致。

### 5.2 `docs/images/overview.png` の番号 8（軽微、要判断）

`docs/Player.md` の表の 8 は「投了・ボード回転・進める・戻すのボタン」
（盤面の外の 4 つのボタンをまとめて指している）。だが
`tools/make-shots.mjs` は `#button-resign` の 1 か所にしかバッジを
置いておらず、実際の画像でも「8」は右側の投了（旗アイコン）の
すぐ上にしか付いていない。回転・進める・戻すの 3 つのボタン
（旗の下に縦に並ぶ）は画像上で名指しされていない。

誤りとまでは言えない（4 つのボタンは同じ縦の並びに固まっており、
1 か所指せば場所は伝わる）が、表の文言（4 つの動作を列挙）と
画像の指し方（1 か所だけ）に差があるので報告する。**直すかどうかは
判断が要る**（このままでも実用上困らない、という見方もできる）。

### 5.3 `docs/Developer.md` のモジュール一覧（`src/ytbg/` との突き合わせ）

`ls src/ytbg/*.py` で存在確認したところ、`Developer.md` の表に挙がる
`__main__.py` `app.py` `server.py` `message.py` `gameinfo.py` `clock.py`
`history.py` `hub.py` `replay.py` `storage.py` `mylog.py` はすべて実在し、
`__init__.py` を除いて過不足は無かった（`__init__.py` は表に無いが、
`CLAUDE.md` 側にも役割の説明が薄く、パッケージの定数だけを持つ
モジュールなので省いても大きな問題ではないと考える。ただし判断は
管理者に委ねる）。

### 5.4 mermaid 図の構文

`Developer.md` にある 4 つの mermaid コードブロック
（全体の形の `graph LR`、サーバ側の `graph TD`、通信の `sequenceDiagram`、
`ui/` の継承 `graph TD`）を抜き出し、`@mermaid-js/mermaid-cli`
（`npx -y @mermaid-js/mermaid-cli`、システムの `/usr/bin/chromium` を
`executablePath` に指定）で実際に SVG へレンダリングし、4 つとも
エラー無く生成できることを確認した。GitHub の mermaid レンダラと
完全に同じ実装ではないが、構文エラーは無いと判断してよい。

### 5.5 `（TODO-NNN）` の混入

`grep -n "TODO-" docs/*.md README.md tools/*.mjs` は 0 件。利用者向け
文書に番号参照は無い。

### 5.6 リンク切れ

- `README.md` → `docs/Player.md` / `docs/Admin.md` / `docs/Developer.md` /
  `docs/images0.zip` / `LICENSE` — すべて実在
- `docs/Player.md` ↔ `docs/Admin.md` ↔ `docs/Developer.md` の相互リンク —
  すべて実在
- `docs/Player.md` の `images/overview.png` 等 5 枚 — すべて実在
  （`make-shots.mjs` で作り直したものと同じパス）
- `archives/todo/TODO-020, 021, 024, 025, 026` の
  `[docs/design.md](../docs/design.md)` — 相対パスは `archives/todo/` から
  見て `archives/docs/design.md` に解決するため、パス文字列を変えずに
  正しく繋がっている（`../../docs/design.md` から `../docs/design.md` への
  変更で対応済み。実際に `realpath -m` で解決先が
  `archives/docs/design.md` になることを確認した）
- `CLAUDE.md` の `archives/docs/design.md`（バッククォートのみで
  markdown リンクではない）— ファイルは実在
- `archives/todo/TODO-023, 027, 028` などにも `docs/design.md` という
  文字列が残っているが、いずれも markdown リンクではない地の文
  （「設計は `docs/design.md` にあった」という過去形の記述）で、
  リンク切れには当たらない

## 6. 確かめられなかったこと・判断が要ること

- `docs/Player.md` の「画面の見方」の表と `overview.png` の対応は、
  8 番だけ 1 か所指しで 4 つの動作をまとめている点が気になった
  （5.2 参照）。誤りとは断定できないので、直すかどうかは管理者判断
- mermaid の描画は `mermaid-cli`（内部で mermaid.js を使う）で確認した
  もので、GitHub の実際のレンダラでの見え方までは確認していない
  （構文エラーが無いことまでの確認）
- `README.md` の「A. References」節や旧来の Usage 節（`ytBackgammon-opening.png`
  等の外部動画リンク）は今回の変更範囲外と判断し、確認していない
