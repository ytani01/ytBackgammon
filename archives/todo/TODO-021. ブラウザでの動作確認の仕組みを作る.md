# TODO-021. ブラウザでの動作確認の仕組みを作る

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 24,421 | 107,550 | 35% |
| implementer | Opus 5 | medium | 27,549 | 203,947 | 51% |
| reviewer | Sonnet 5 | high | 24,701 | 69,298 | 8% |
| verifier | Sonnet 5 | medium | 9,663 | 92,272 | 6% |
| 合計 |  |  | 86,334 | 473,067 | 概算 $8.5 |

- implementer は定義のモデルが sonnet。playwright のヘルパーが初物で、
  サーバプロセスの起動と後始末、2 枚目のタブへの同期待ち、ドラッグの
  座標計算がまとまって要るため Opus 5 に上書きした
- verifier と reviewer は定義のまま（どちらも sonnet。effort は
  verifier が medium、reviewer が high）
- 分担の理由と各担当の報告は
  [`archives/agents/TODO-021/`](../agents/TODO-021/) にある

## きっかけ

TODO-020 で決めた見直し（[`docs/design.md`](../../docs/design.md)）を
実装していくにあたり、**クライアントの JS を大きく変える項目が 4 つある**
（TODO-026〜029）。ブラウザ側の確認を手で行っていたため、確認の担当を
分けても JS の変更を確かめられなかった。

できるのではという指摘を受けて試したところ、playwright で盤面の描画・
Roll・ドラッグ・2 枚目のタブへの同期・コンソールエラーまで確かめられた。
仕組みとして残した。

## やったこと

### `tests/browser/`

`node --test tests/browser/` で走る。`tests/` の pytest とは別系統で、
**Python のテストは pytest、JS のテストは node** と分かれた。

- `helper.mjs` — 共通のヘルパー。空きポートを OS に選ばせ、
  `YTBG_DATA_DIR` に `mkdtemp` の一時ディレクトリを渡してサーバを
  `detached` で起動し、ページを開いて最初の `gameinfo` が届くまで待つ。
  後始末はプロセスグループごと `SIGTERM` →（5 秒待って）`SIGKILL`
  （`uv run` の下に python がぶら下がるため）。`pkill` は使わない
- `board.test.mjs` — 基本の確認 5 件。サーバ 1 つにページ 2 枚を開き、
  page1 で操作して page2 で読む
  1. 盤面が描画される（チェッカー 30 枚、`board-base.png`、スクリーンショット）
  2. Roll ボタンでダイスが出る（`board.roll_btn[0].get()`）
  3. チェッカーをドラッグできる（free move にしてから掴んで落とす）
  4. 2 枚目のタブに同期する（page1 → page2 と page2 → page1 の両方向）
  5. コンソールエラーが出ていない

**ブラウザはシステムの `/usr/bin/chromium` を `executablePath` で指定する。**
`~/.cache/ms-playwright/` にあるリビジョン（1234）が playwright 1.63.0 の
要求（1243）と合わず、そのままでは起動しないため。理由をコードのコメントに
残した（残さないと、次に触る人が `npx playwright install` で数百 MB を
落としに行く）。

### 利用者のデータに触れないようにした

`ytBackgammonServer.DATAFILE_DIR` を
`os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')` にした。
**本体側の変更はこの 1 行だけ**で、TODO-024（サーバ分割）で `Storage` へ移る。
`tests/test_datafile_dir.py`（4 件）でこの式を確かめている。

`tests/conftest.py` は `DATAFILE_DIR` をクラス属性ごと monkeypatch して
いるので、この変更の影響を受けない。

### `package.json` / `.gitignore` / `CLAUDE.md`

- `package.json` に `playwright: ^1.63.0`、`package-lock.json` をコミットした
  （`pyproject.toml` が `>=` で `uv.lock` をコミットしているのと同じ流儀）
- `.gitignore` の 1 行目 `*.json` は残し、`!package.json` と
  `!package-lock.json` の例外を足した。`node_modules/` も足した。
  `*.json` はこのリポジトリで 1 つも無視していなかった（保存先が `$HOME`
  だったため実害が出ていなかっただけ）ので、このままだと
  `package.json` を作ってもコミットされなかった
- `CLAUDE.md` の「実行」の節に `npm install` と `node --test tests/browser/`
  を足し、テストの節に `tests/browser/` の注意点を書いた

### 初回ロードのコンソールエラー

立てたときは「404 が 2 件」と書いていたが、**実測では `/favicon.ico` の
1 件だけ**だった。2 件に見えたのはタブを 2 枚開いていたためと思われる
（1 ページにつき 1 件）。`static/` にも favicon が無く、
`__main__.py` のルーティングにも `/favicon.ico` が無い。

この項目では直さず、**TODO-022 として立てた**。テストの判定からは
理由付きで除外している。

## 確かめたこと

| コマンド | 結果 |
|---|---|
| `node --test tests/browser/` | pass 5 / fail 0 |
| `uv run pytest` | 105 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 5 source files |

いずれも終了コード 0。verifier が別に走らせて同じ結果を得ている。

**`~/ytbg-*.json` が増えないこと**を、走らせる前後のファイル名と
タイムスタンプで確かめた。テストのあとにサーバプロセスも一時ディレクトリも
残っていない。

### わざと壊して落ちることを確かめた

`CLAUDE.md` の「テストが通ることだけを見ない」に従い、5 通り試した。

| 壊した場所 | 落ちたテスト |
|---|---|
| `ytbg.js` `Checker.on_mouse_down_xy()` の `moving_checker` への代入を消す | ドラッグ、同期 |
| `ytbg.js` `RollButton.roll()` をダイスを決める前に return | Roll |
| `yt_backgammon_server.py` `broadcast()` の宛先を 1 つ目だけに | 5 件全部 |
| `ytbg.js` `Checker.on_mouse_move_xy()` に `console.error()` を足す | コンソールエラー |
| `DATAFILE_DIR` を `os.getenv('HOME')` に戻す | `test_datafile_dir.py` の 2 件 |

最後の 1 つは verifier が自分で確かめている（implementer の報告を
鵜呑みにしていない）。

### レビュー

reviewer の指摘は**要修正 0 件**。「直したほうがよい」が 1 件
（`DATAFILE_DIR` の新しい分岐に自動テストが無い）で、これは
`tests/test_datafile_dir.py` を足して解消した。

reviewer は implementer 報告の「`npm install` は playwright のブラウザを
落としに行く」を疑って自分で実測し、**1.63.0 では起きない**ことを
確かめている（`node_modules/playwright/package.json` に `scripts` が無い。
通常の env と `env -i` の両方で `~/.cache/ms-playwright` に変化なし）。
報告側を実測に合わせて直した。

## 分担の振り返り

- **implementer（Opus 5）** — 立てたときに書いた実測値の誤りを 2 つ見つけた。
  `#p000` を掴んだときの `moving_checker` は `p002` ではなく `p004`
  （初期配置では point 6 に 5 枚あり、先端は `p004`）。404 は 2 件ではなく
  1 件。どちらも「書いてあるとおり」に作らず、実際に動かして直している
- **verifier（Sonnet 5）** — 検証を通しただけでなく、追加した pytest を
  自分で壊して落ちることを確かめた。`~/ytbg-*.json` の増減とプロセスの
  残留も、前後を比べる形で見ている
- **reviewer（Sonnet 5 / effort high）** — implementer 報告の未確認の記述を
  疑って自分で実測したのが効いた。放っておくと、あとから
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` を `CLAUDE.md` に足す提案の
  根拠に使われていた
- **見込みとの食い違いは無し。** 担当の構成は立てたときのまま。
  implementer だけモデルを上げたが、これは着手時に決める前提のもの
- **料金は $8.5 で、implementer が 51%。** ブラウザを実際に起動して
  試行錯誤する担当なので、ここが重くなるのは避けにくい。
  **次に同じ規模で組むなら、reviewer を先に走らせない今回の順（実装 →
  確認とレビューを並行 → 追加 → 追加分だけ再確認）でよい。**
  確認とレビューを並行にしたことで、main の待ち時間中の余計な
  やり取りが無かった。追加の 3 点を implementer にまとめて渡し、
  verifier には追加分だけを見せたのも効いている（全部を再検証させると
  verifier の分が倍になる）
