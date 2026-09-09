# TODO-014 確認の依頼

## 目的

TODO-014「バージョンを git tag に連動させる」の実装が、指示どおりで、
実際に動くかを確かめる。**コードは直さない。** 見つけたことは報告する。

## 前提として読むもの

- `TODO.md` の TODO-014 の節
- `archives/agents/TODO-014/implementer-request.md`（実装への依頼文）
- `archives/agents/TODO-014/implementer-report.md`（実装の報告）
- `git diff`（未コミット。`uv.lock` を含む）

## 確かめること

すべてリポジトリのディレクトリの中で実行する。

### 1. 検証コマンド

- `uv sync`
- `uv run pytest`（57 件）
- `uv run ruff check .`
- `uv run mypy src`（`__main__.py` の 7 件だけのはず。増えていないこと）

### 2. バージョンがタグに追従するか

**これが本題。** 一時的なタグを打って確かめ、必ず消すこと。

1. `uv run python -c "import ytbg; print(ytbg.__version__)"` の値を控える
2. `git tag 9.9.9` を打つ
3. `uv sync` を実行し、もう一度 1 のコマンドを叩く。**`9.9.9` になること**
   （ここが `cache-keys` の効きめの確認。古い値のままなら報告する）
4. `git tag -d 9.9.9` で消す
5. `uv sync` を実行し、1 の値に戻ること

`git push` は絶対にしない。タグの削除を忘れないこと（最後に `git tag` を
叩いて `1.0.0` だけになっていることを確かめ、報告に貼る）。

### 3. 画面のバージョン表示

サーバを起動して `/` の HTML を取り、確かめる。

- `./ytbg.sh -p 5099 -i images1a 99` のように**空いているポートと、
  使っていない server_id** で起動する（**既定の 5001〜5004 と
  server_id 1〜4 は使わない**。利用者の `~/ytbg-99.json` が新しくできるが、
  確認が済んだら消してよい）
- `curl -s http://localhost:5099/ | grep -i version` で、
  `ytBackgammon Server v. <バージョン>` が **1 つだけ**出ること。
  `id="version"` の要素が残っていないこと
- `ytbg.js` を `curl` で取り、`VERSION` と `ver_el` が消えていること
- 終わったらプロセスを止める。**`pkill` は使わない**（`pgrep` で PID を
  確かめてから、その PID を kill する）

### 4. 既存の保存ファイルが読めるか

`~/ytbg-1.json` は利用者の実データ。**直接読ませない。**

1. 作業用のディレクトリへ `\cp ~/ytbg-1.json <tmp>/ytbg-1.json` とコピーする
   （`cp` はエイリアスで `-i` が付くので**必ずバックスラッシュを付ける**）
2. `yt_backgammon_server.DATAFILE_DIR` をそのディレクトリに差し替えて
   `ytBackgammonServer` を作り、履歴が読み込めること（例外にならず、
   件数が 0 でないこと）を確かめる。`tests/conftest.py` の `bg_server`
   フィクスチャが同じことをしているので、それに倣う
3. 保存し直したファイルの `server_version` が新しい形式になることも見る

### 5. 指示との突き合わせ

依頼文の「対象範囲」「やらないこと」と差分が一致しているか。
範囲外のファイルが変わっていないか。

## 報告

`archives/agents/TODO-014/verifier-report.md` に書く。確かめた項目ごとに
結果（コマンドの出力を貼る）、食い違いがあればその内容。**直さない。**

返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内にすること。
