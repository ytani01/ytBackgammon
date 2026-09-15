# verifier への依頼（TODO-065）

## 目的

`README.md` の「ytBackgammon server」の節と `docs/Admin.md` の「用意するもの」〜
「複数のボードを立てる」に書いたインストールと起動の手順が、書いたとおりに動くかを確かめる。
変更の中身は `git diff HEAD` で見られる（`ytbg.sh` の削除と文書だけ）。

## 守ること

- **利用者の環境を変えない。** 利用者はすでに `uv tool install` で `ytbg` を入れている
  （`uv tool list` に出る）。**`uv tool install` / `uninstall` は必ず次の環境変数を付けて実行する:**
  `UV_TOOL_DIR=<作業ディレクトリ>/tools UV_TOOL_BIN_DIR=<作業ディレクトリ>/bin`
  付けずに `uv tool uninstall ytbg` を実行しないこと
- 作業ディレクトリは `/tmp/claude-649/-home-ytani-work-ytBackgammon/2cea1902-8264-47f5-a03d-6fadac373258/scratchpad/todo065`
- ボードのデータは `YTBG_DATA_DIR` を作業ディレクトリの下に向ける（`~/ytbg-*` を触らない）
- **ポート 5000〜5004 は使わない**（利用者のボードが動いていることがある）。
  `ytbg.toml` をそのまま使わず、空いたポート（例 18001〜18002、18000）に書き換えた設定を作業ディレクトリに置く
- プロセスは PID を控えて kill する。`pkill` は使わない
- ファイルは直さない。見つけたことは報告に書く

## 確かめること

1. リポジトリを作業ディレクトリへ clone する（`git clone /home/ytani/work/ytBackgammon`。
   未コミットの変更は clone に入らないので、clone したあと `git diff HEAD` の変更を
   `git -C /home/ytani/work/ytBackgammon diff HEAD | git apply` で当てる。
   タグも入っているか `git tag | tail -3` で見る）
2. clone の中で `uv tool install .`（上の環境変数付き）。`<bin>/ytbg` ができ、
   `uv tool list`（同じ環境変数付き）の版がタグ由来（`0.1.devN` ではない）か
3. `ytbg board --help`・`ytbg lobby --help` が出るか（`<bin>` を PATH の先頭に置いて実行し、
   `command -v ytbg` がそちらを指すことも見る）
4. **clone したディレクトリの外**（例 作業ディレクトリ直下）で `ytbg board -p <port> -i images1a t1` を起動し、
   `curl` でトップページと画像（`/static/images1a/board-base.png` など、HTML から読むもの 1 つ）が 200 で返るか
5. 同じく外で、自分で作った設定で `ytbg lobby -p <port> -c <設定>` を起動し、
   `/api/boards` で子のボードが動作中か、子のボードのプロセスが tool 用の Python
   （`<tools>/ytbg/bin/python`）で動いているか（`pgrep -af` で PID を見て `/proc/<PID>/exe` か cmdline）。
   lobby に SIGTERM を送り、子も止まるか
6. `uv tool install --reinstall .` が通るか
7. `uv tool uninstall ytbg`（環境変数付き）で `<bin>/ytbg` が消えるか。利用者の `uv tool list`（環境変数なし）に ytbg が残っているか
8. リポジトリ（`/home/ytani/work/ytBackgammon`）で `grep -rn "ytbg.sh" --exclude-dir=archives --exclude-dir=node_modules --exclude-dir=.venv .` が 0 件か
   （TODO.md の項目の中は除く）

テスト一式（pytest など）は走らせなくてよい（コードは変えていない）。

## 報告

`archives/agents/TODO-065/verifier-report.md` に、手順ごとの結果（実行したコマンドと出力の要点）を書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
