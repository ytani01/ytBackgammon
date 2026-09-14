# TODO-063 確認の依頼（verifier）

## 目的

lobby（複数のボードを子プロセスで起動し、一覧ページで並べて起動・停止する）が、TODO-063 で決めたとおりに
動くか、検証の一式が通るかを確かめる。

## 読むもの

- `TODO.md` の TODO-063（決めたことと、やることのチェックリスト）
- `archives/agents/TODO-063/implementer-report.md`・`implementer-report-2.md`（実装の報告）
- `archives/agents/TODO-063/reviewer-report-2.md`（レビューの最後の報告。検討 1〜4 は main が直した:
  `lobby.py` の `url` の検証に `ValueError` と空白を足し、`test_lobby.py` にそのケースを足し、
  `lobby.test.mjs` の「起動中」の assert を `wait_for` の戻り値で見るようにし、`docs/Admin.md` を直した）

## やること

1. 検証の一式を 1 回ずつ走らせる: `uv run pytest`、`uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`、
   `node --test tests/js/`、`node --test tests/browser/`
2. `node --test tests/browser/lobby.test.mjs` だけを **10 回続けて**走らせる（「起動中」を見るテストがタイミングで
   落ちないかを見るため）。落ちた回があれば、その出力を残す
3. 手で試す（`docs/Admin.md` の「複数のボードを立てる」「止める」に書いたとおりに）:
   - **リポジトリの `ytbg.toml` は使わない**（5001〜5004 は利用者のボードが動いていることがある）。scratchpad に
     空いているポートで 2 面の設定を書き、`YTBG_DATA_DIR` を一時ディレクトリにして `uv run ytbg lobby -c <設定> -p <空きポート>` で起動する
   - `/api/boards` で 2 面が動作中になること。`POST /api/boards/<id>/stop` で停止中、`start` で起動中を経て動作中になること
   - lobby に SIGTERM を送ると、ボードの子プロセスも消えること（`pgrep -af 'ytbg (board|lobby)'` で PID を確かめる）
   - ポートが塞がったボードを設定に書くと、停止中になり、理由が lobby の出力に出ること
   - 誤った設定（`server_id` の重複、`url = "/board1/"`、`url = "http://h:99999/"`）で、traceback ではなくエラーの文で止まること
   - `uv run ytbg board --help` と `uv run ytbg lobby --help` が Admin.md の表と合うこと
4. 壊して落ちるかを確かめる（implementer が 24 通り試しているので、それと重ならないものを 3 つ程度）。
   少なくとも、`lobby.py` の `url` の `parts.port` を読む行を消すと `test_lobby.py` の `"url" is invalid` のケースが落ちること。
   **壊す前にファイルを scratchpad へ控え、戻したら `cmp` で元と一致することを確かめる**
5. TODO.md の TODO-063 のチェックリストの各項目について、満たしているかを書く（チェックは付けない。main が付ける）

## やらないこと

- **コードや文書を直さない。** 見つけたことは報告する（壊して試すのは 4 だけで、必ず戻す）
- 起動したプロセスは PID を確かめて kill する。`pkill` は使わない。終わったら lobby もボードも残っていないことを確かめる

## 報告

`archives/agents/TODO-063/verifier-report.md` に、走らせたコマンドと結果（件数）、10 回の結果、手で試した結果、
壊して確かめた結果、チェックリストの各項目の判定、見つけた問題を書く。返事は 5 行以内（終わったか・報告ファイルのパス・判断が要る点）。
