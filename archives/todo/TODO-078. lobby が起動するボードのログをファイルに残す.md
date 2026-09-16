# TODO-078. lobby が起動するボードのログをファイルに残す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer（実装は main） |
| 実施 | Opus 5 / effort high | verifier + reviewer（実装は main） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 19,212 | 90,233 | 56% |
| reviewer | Sonnet 5 | high | 36,056 | 85,255 | 23% |
| verifier | Sonnet 5 | medium | 18,471 | 70,073 | 21% |
| 合計 |  |  | 73,739 | 245,561 | 概算 $4.4 |

- reviewer・verifier とも `~/.claude/agents/` の定義のまま（モデルを上書きしていない）

## きっかけ

TODO-076 で置き場所を `~/.ytbg/` にまとめ、`[path]` に `log` を書けるように
したが、書いても使われないままだった。lobby が子プロセスとして起動する
ボードの出力は lobby の標準出力・標準エラーへ素通りするので、systemd で
動かしていなければどこにも残らない。

## やったこと

- `BoardProcess._open_log()` を足し、置き場所の `log` の下の
  `board-<server_id>.log` を追記で開いて、子の `stdout` と `stderr` を
  そこへまとめた（`src/ytbg/lobby.py`）。ディレクトリは開くときに作る
- 閉じるのは `_wait()` の `finally`。起動そのものが失敗したときは
  `_wait()` が走らないので、`start()` の `except BaseException` で閉じる
- 置き場所を渡さずに `BoardProcess` を作ったときは、これまでどおり
  lobby の標準出力・標準エラーをそのまま使う
- ローテーションはしない（要るようになってから考える）
- `docs/Admin.md` に「ログ」の節を足し、`docs/Developer.md` の
  「子の stdout と stderr は lobby のもの」という記述と、`paths.py` の
  「log を実際に使うのは TODO-078」という注記を直した

ファイル名を `board-<server_id>.log` にしたのは、あとで lobby 自身の
ログを同じディレクトリに置くことになっても名前がぶつからないため。
起動し直したときは追記にした（落ちた理由を後から追えるようにするため）。

## 確かめたこと

- `uv run pytest`（392 件）・`ruff check .`・`mypy src`・`basedpyright` が通る
- `tests/test_lobby.py` に 3 つ足した
  - 実プロセスの lobby で `log/board-b0.log` ができ、停止・起動で追記になる
  - 置き場所があれば `stdout` がそのファイル、`stderr` は `STDOUT`。
    置き場所が無ければ両方 `None`（継承）
  - 起動そのものが失敗したら、開いたログファイルを閉じる
- **わざと壊して落ちることを確かめた**（verifier が 3 通り、main が 1 通り）
  - `_open_log()` が常に `None` を返す
  - 追記（`'ab'`）ではなく上書き（`'wb'`）で開く
  - `stderr=asyncio.subprocess.STDOUT` を渡さない
  - `start()` の `except` の節でファイルを閉じない
- 手で `ytbg board` を起動したときはログファイルができないこと、
  lobby 経由なら `log/board-<server_id>.log` に出ることを実プロセスで確かめた
- uvicorn 自身の起動ログはファイルに出ないが、これは `-d` が無いときに
  `_run()` が `log_level='warning'` にしているためで、元からの挙動

## 分担の振り返り

- **verifier** — わざと壊す 4 通りをすべて実行し、狙ったテストが落ちることを
  確かめた。恒久テストとして「起動そのものが失敗したときにファイルを閉じるか」を
  足すよう勧めてきたのは、レビューの指摘（下記）と別経路だと気づいたため。
  一方、検証の途中で `git checkout -- src/` を実行して実装を消しかけた
  （保存していた差分から戻して復旧）。**破壊的なコマンドを使わせない指示を、
  依頼の時点で書いておくべきだった**（再確認の依頼では明示した）
- **reviewer** — 要修正は 0 件。`create_subprocess_exec` が例外を投げたときに
  ファイルが閉じられない経路を見つけた。テストは通っていたので、確認の担当
  だけでは出てこない指摘。「動くか」と「良いか」を分ける効果が、
  30 行ほどの差分でも出た
- **見込みとの食い違いは無い。** 差分が 1 ファイルに収まる見込みで実装を
  分けず、そのとおりになった
- **次に同じ規模（1 ファイル・30 行ほど・挙動が変わる）なら、同じ組み方でよい。**
  ただし料金の 56% を main が占めたので、reviewer と verifier を同時に
  起動する形は保ちつつ、レビュー指摘の直しは main が直接入れて、
  再確認だけ verifier に投げる（今回そうした）のが安い

分担の理由と各担当の報告は `archives/agents/TODO-078/` にある。
