# verifier 報告（TODO-065）

作業ディレクトリ:
`/tmp/claude-649/-home-ytani-work-ytBackgammon/2cea1902-8264-47f5-a03d-6fadac373258/scratchpad/todo065`

## 1. clone と diff の適用

- `git clone /home/ytani/work/ytBackgammon repo` → 成功
- `git -C /home/ytani/work/ytBackgammon diff HEAD | git apply`（clone 側で）→ 成功
  （`git status --short` で `M CLAUDE.md` `M README.md` `M docs/Admin.md` `D ytbg.sh` の 4 件、
  依頼の「`ytbg.sh` の削除と文書だけ」と一致）
- `git tag | tail -3` → `1.1.4` `1.1.5` `1.1.6`（タグは入っている）

## 2. `uv tool install .`

`UV_TOOL_DIR=<work>/tools UV_TOOL_BIN_DIR=<work>/bin` を付けて実行。

```
Installed 1 executable: ytbg
```

`uv tool list`（同じ環境変数付き）→ `ytbg v1.1.7.dev4`。`0.1.devN` ではなく
タグ（1.1.6）由来のバージョンになっていた。

## 3. `--help` と `command -v`

`<bin>` を PATH の先頭に置いて実行。

- `command -v ytbg` → `<work>/bin/ytbg`（想定どおり）
- `ytbg board --help` → オプション一覧（`-p` `-i` `--prefix` `-d` `-h`）が出た
- `ytbg lobby --help` → オプション一覧（`-c` `-p` `--prefix` `-d` `-h`）が出た

## 4. clone の外で board 起動

作業ディレクトリ直下（clone の外）で
`YTBG_DATA_DIR=<work>/data-board ytbg board -p 18000 -i images1a t1` を起動。

- `curl -s -o /dev/null -w "%{http_code}" http://localhost:18000/` → `200`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:18000/static/images1a/board-base.png` → `200`

トップページの HTML には `images1a` を直接参照する `<img src>` は無く
（画像は JS 側で組み立てて読む）、`docs/Admin.md`／`README.md` に書かれている
`/static/images1a/board-base.png` のパスへ直接アクセスして 200 を確認した。

起動後は PID を `pgrep -af "ytbg board"` で控えて `kill` し、停止を確認した。

## 5. lobby

作業ディレクトリに `ytbg-test.toml` を作成（ポート 18001 / 18002、`ytbg.toml` は未使用）。
clone の外で `YTBG_DATA_DIR=<work>/data-lobby ytbg lobby -p 18000 -c ytbg-test.toml` を起動。

- `curl http://localhost:18000/api/boards` →
  `[{"server_id":"1","port":18001,...,"running":true,"listening":true,"pid":...},
    {"server_id":"2","port":18002,...,"running":true,"listening":true,"pid":...}]`
  （両方 `running: true` / `listening: true`）
- 子プロセスの `cmdline`（`/proc/<pid>/cmdline`）は
  `<work>/tools/ytbg/bin/python -m ytbg board -p 18001 -i images2 -- 1` のように
  tool 用の python を指していた。
  （`/proc/<pid>/exe` は venv の `python` シンボリックリンクの先の
  実体（mise の `python3.14`）を指すため、`cmdline` の方で確認した。
  シンボリックリンク自体は `<work>/tools/ytbg/bin/python` を指しており、
  依頼にある「tool 用の Python で動いているか」は満たしている）
- lobby の PID に `SIGTERM` を送ると、ログに
  `stop: server_id=1, pid=...` / `stop: server_id=2, pid=...` に続き
  `exited (pid=..., returncode=-15)` が両方の子について出て、
  `pgrep -af ytbg` が空になった（子も止まった）

## 6. `--reinstall`

`uv tool install --reinstall .`（環境変数付き）→
`Installed 1 executable: ytbg` で成功。

## 7. `uninstall`

`uv tool uninstall ytbg`（環境変数付き）→ `Uninstalled 1 executable: ytbg`。
`<bin>` は空になった。

環境変数を外して（利用者の実際の設定で） `uv tool list` を実行すると、
`ytbg v1.1.7.dev3` を含む利用者の一覧がそのまま残っていた（他のツールも
含めて変化なし）。利用者の環境は壊していない。

## 8. `ytbg.sh` の参照

`grep -rn "ytbg.sh" --exclude-dir=archives --exclude-dir=node_modules --exclude-dir=.venv .`
（`/home/ytani/work/ytBackgammon` で実行、未コミットの変更を含む状態）の結果:

```
CLAUDE.md:24:そのまま実行する（TODO-065。`ytbg.sh` は削除した）。インストールした `ytbg` は
TODO.md:25:## TODO-065. インストールを `uv tool install .` に変え、`ytbg.sh` を削除する
TODO.md:31:- [ ] `ytbg.sh` を `git rm` する
TODO.md:36:- [ ] `CLAUDE.md`: `ytbg.sh` を使った例を `uv run ytbg ...` に直す
TODO.md:44:- `tests/` と `docs/Developer.md` は `ytbg.sh` を使っていない
TODO.md:48:- `ytbg.sh` は削除する（インストール後は `ytbg` が PATH にあるため）
```

`TODO.md` 内は依頼どおり除外対象（項目の記述そのもの）。`CLAUDE.md:24` は
「`ytbg.sh` は削除した」という TODO-065 の経緯を書いた 1 行で、`ytbg.sh` を
使う手順の記述ではない。使用例としての `ytbg.sh` の記述は無い。

## まとめ

依頼の 1〜8 すべて手順どおり実行し、想定どおりの結果になった。異常や
指示との食い違いは見つからなかった。テスト一式（pytest 等）は依頼どおり
走らせていない。

## 確かめられなかったこと・判断が要る点

- `/proc/<pid>/exe` は venv のシンボリックリンクをたどった先の実体
  （mise の python3.14）を指すため、依頼の「tool 用の Python
  （`<tools>/ytbg/bin/python`）で動いているか」は `cmdline` で確認した。
  `exe` を使う想定だったなら、この代替で足りているかは判断できない
- README.md / docs/Admin.md の文面と実際の出力の突き合わせは、
  `board-base.png` の 200 のみピンポイントで確認した。両文書の他の
  コマンド例（オプションの並びなど）は目視で一致を確認したのみで、
  1 行ずつの機械的な突き合わせはしていない
