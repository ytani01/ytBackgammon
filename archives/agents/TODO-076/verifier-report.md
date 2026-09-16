# TODO-076 verifier の報告

## 1. 仕様と実装が合っているか

`src/ytbg/paths.py`・`src/ytbg/__main__.py`・`src/ytbg/server.py`・
`src/ytbg/lobby.py`・`src/ytbg/storage.py` を読んだ。

- 基準: `--dir` ＞ `YTBG_DIR` ＞ `~/.ytbg`（`paths.resolve()` 101 行目）— 合っている
- 設定ファイル: `-c` ＞ `<基準>/ytbg.toml`（102-103 行目）— 合っている
- data/log/images: `[path]` の同名キー ＞ `<基準>/<名前>`、相対パスは
  `base / …` で解決（107-108 行目）— 合っている
- 環境変数は `YTBG_DIR` のみ。`YTBG_DATA_DIR` は `src/`・`tests/`・`docs/`
  から 0 件（下記 3.）
- `board` は `_board_config()`（`__main__.py` 88-93 行目）で設定ファイルの
  `[[board]]` から `server_id` の一致するものを探し、`port` / `image_dir`
  の CLI 未指定分だけ埋める。CLI 指定があれば CLI が勝つ（126-129 行目）
- lobby は `create_lobby_app(..., paths.config)` → `BoardProcess.start()`
  が `-c <config>` を子へ渡す（`lobby.py` 204-205 行目）。実行して
  子プロセスの起動コマンドに `-c` が入ることも `tests/test_lobby.py` の
  `test_start_passes_config` で確認されている
- データのファイル名は `ytbg-{server_id}.jsonl` のまま（`server.py` 70 行目）
- 保存先のディレクトリは `storage.py` の `save()` で書く前に
  `mkdir(parents=True, exist_ok=True)`
- `log/` `images/` は `paths.py` が場所を返すだけで未使用（docstring と
  `docs/Admin.md` にも明記）。TODO-076 の範囲を超えていない
- `docs/Admin.md` に既存 `~/ytbg-*` の移行手順あり（下記 5. で実機確認）

範囲外の踏み込みは見当たらなかった。

## 2. 検証の一式（それぞれ 1 回）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | **1 failed, 373 passed**（`tests/test_lobby.py::test_lobby_stops_boards[15]`。下記参照） |
| `uv run ruff check .` | All checks passed（終了コード 0） |
| `uv run mypy src` | Success: no issues found in 14 source files（終了コード 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（終了コード 0） |
| `node --test tests/js/` | 154 pass / 0 fail（終了コード 0） |
| `node --test tests/browser/` | 106 pass / 0 fail（終了コード 0） |

### pytest の失敗（1 件・引用）

```
_________________________ test_lobby_stops_boards[15] __________________________
    lb = lobby_factory([free_port(), free_port()])
    # ボードが listen するまで待つ (起動の途中で止めるのを避ける)
>   boards = wait_for(lb.boards, all_listening)

tests/test_lobby.py:378:
...
E   AssertionError: timeout
```

`sig=signal.SIGTERM`（15）のパラメトライズだけが、**ボードの起動待ち
（`wait_for(lb.boards, all_listening)`、タイムアウト 20 秒）で落ちた**。
まだシグナルを送る前の段階なので、SIGTERM の扱いそのものとは無関係に見える。
`sig=signal.SIGINT`（2）の方は通っている。

判断できないこと: これが TODO-076 の変更による回帰か、実プロセスを
2 面立ち上げる重いテストが環境の負荷で 20 秒以内に listen できなかった
だけ（既存のたまたまの揺れ）かは、**1 回の失敗だけからは判断できない**。
CLAUDE.md の指示どおり同じテストを連続で何度も再実行してはいないので、
再現性は確認していない。`lobby_factory` は `YTBG_DIR=str(tmp_path)` を渡す
形に直っており、子プロセスへの `-c` 渡しなど TODO-076 の変更点自体は
`test_start_stop` など他のテストで通っている。判断は管理者に委ねる。

## 3. `YTBG_DATA_DIR` の残存

```
$ git grep -n YTBG_DATA_DIR -- ':!archives'
TODO.md:44:| データ | `$HOME/ytbg-{id}.jsonl` | `YTBG_DATA_DIR` のみ（CLI 無し） |
TODO.md:62:- `YTBG_DATA_DIR` は残さず、`YTBG_DIR` に置き換える。テストも直す
```

`src/`・`tests/`・`docs/`・`CLAUDE.md` からは 0 件。残っているのは
`TODO.md` の「変更前はこうだった」という説明文だけで、コードや利用者向け
文書には残っていない。`CLAUDE.md` も implementer の報告では未対応と
書かれていたが、確認時点ではすでに `YTBG_DIR` に直っていた（履歴の
節と保存先の節の両方）。問題なし。

## 4. わざと壊して確認（3 通り、いずれも壊した直後に 1 回だけ実行し、即座に元へ戻した）

1. **基準の優先順位を反転**（`YTBG_DIR` を `cli_dir` より先に見るよう変更）
   → `tests/test_paths.py::test_cli_dir_beats_env` だけが落ちた
2. **`[path]` の相対パス解決から `base /` を外す**（絶対パスと同じ扱いに
   なるよう壊す）
   → `test_paths.py` の 5 件（`test_default` / `test_env` /
   `test_config_paths` / `test_cli_config_is_read` / `test_board_config_only`）
   と `test_cli.py` の 2 件（`test_data_dir_follows_dir_option` /
   `test_config_option`）、計 7 件が落ちた。相対パス解決に依存する
   テストが広く落ちることを確認できた
3. **CLI ＞ 設定ファイルの優先順位を無効化**（`board` の `port` 決定を
   `if port is None:` → `if True:` にして常に設定を優先させる）
   → `tests/test_cli.py::test_cli_beats_config` だけが落ちた
   （`image_dir` 側は壊していないので、`port` の不一致だけで落ちている）

3 通りとも、狙った箇所だけが落ちることを確認し、`sed` で元の行に戻した。
戻したあとの `git status` は開始時点と同じ（`src/ytbg/paths.py` は
新規追加の未追跡ファイルなので `git diff` には出ないが、該当行を
`grep` して手作業で元の文字列と一致することを確認した）。壊した際に
実行した pytest が、カレントディレクトリに相対パスで `data/`・`d/` を
作ってしまったので、検証後に削除した（テストの一時ディレクトリ隔離が
壊れた状態でのみ起きる副作用で、通常の実装・テストには影響しない）。

## 5. `docs/Admin.md` の移行手順の再現

`docs/Admin.md` の「古い版からの移行」節のコマンド:

```bash
mkdir -p ~/.ytbg/data
mv ~/ytbg-*.jsonl ~/.ytbg/data/
```

`/tmp/ytbg-verify-admin-migrate` を `$HOME` に見立てて実機で再現した
（`ytbg-1.jsonl` を置いてから上記 2 行を実行）。結果:
`~/.ytbg/data/ytbg-1.jsonl` に正しく移った。書いてあるとおりに動く。

## 6. 実際に起動して動くか

```
YTBG_DIR=/tmp/ytbg-verify-live uv run ytbg board -p 35825 1
```

を `setsid` でプロセスグループとして起動し、`curl` で `200` を確認、
`/tmp/ytbg-verify-live/data/ytbg-1.jsonl` が作られることを確認した。
確認後 `kill -TERM -<pgid>` でプロセスグループごと止め、`pgrep` で
残っていないことを確認した（`pkill` は使っていない）。一時ディレクトリは
削除済み。利用者の `~/.ytbg/` や `~/ytbg-*` には一切触れていない。

途中、`ps` で無関係なプロセス
（`/tmp/pytest-of-ytani/.../test_lobby_stops_boards_2_0/ytbg.toml` を
使う lobby）が一瞬見えたが、上記 5. の pytest 実行が残した一時的な
子プロセスで、確認した数秒後には自然に消えていた（`pgrep` で再確認済み）。
verifier がこの作業中に新たに起動したまま放置したプロセスは無い。

## 残る懸念・判断が要る点

1. **`test_lobby_stops_boards[15]` の 1 件の失敗が回帰か環境要因か
   判断できない。** 1 回の失敗のみで、CLAUDE.md の指示により連続再実行は
   していない。管理者の判断が要る。
2. それ以外は 1〜6 のすべてで指示どおりの動作を確認した。
