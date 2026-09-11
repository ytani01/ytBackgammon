# TODO-025. サーバを分割する（hub / history / storage / replay / app）

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 23,373 | 56,306 | 32% |
| implementer | Opus 5 | medium | 42,738 | 202,232 | 41% |
| reviewer | Opus 5 | high | 18,231 | 137,974 | 19% |
| verifier | Sonnet 5 | medium | 16,988 | 87,998 | 7% |
| 合計 |  |  | 101,330 | 484,510 | 概算 $15.7 |

- implementer と reviewer は定義のモデルが sonnet。責務の移し替えと
  そのレビューなので Opus 5 に上書きした。effort は定義の frontmatter の値
- **TODO-024 と違い、reviewer を先に、verifier を後に回した**
  （TODO-024 では、verifier が `src/` を壊しては戻す最中に reviewer が
  読んでいて、「壊した版」を読む瞬間が 2 回あった）
- implementer は 2 回動いている（指摘を直す回）

## きっかけ

`ytBackgammonServer`（722 行）が 7 つの責務を抱えていた（接続管理・配信・
履歴・永続化・クロック・メッセージ分岐・HTTP 応答）。分割の一覧は
[`docs/design.md`](../docs/design.md) の「モジュール構成」にある。
`storage.py` と `clock.py` は TODO-024 で作ったので、ここは残りの分割。

**挙動は変えない。**

### 決めたこと

**WebSocket 経路のテストは Starlette の `TestClient` で書く。**
`create_app()` に直接つなぐのでプロセスを起こさずに済む。

着手時に main が決めた 8 点（ファイル構成、`broadcast()` の素通しを
残さない、`History` は保存を持たない、`create_app()` は
`app.state.svr` にサーバを入れる、など）は
[`archives/agents/TODO-025/README.md`](../agents/TODO-025/README.md) にある。

## やったこと

### 新しく作ったもの

- `src/ytbg/hub.py` — `ClientHub`。接続中の WebSocket と連番の名前、
  `asyncio.gather()` での並行送信
- `src/ytbg/history.py` — `History`。`_history` / `_fwd_hist` / `_cur_sn`。
  **保存は持たない**（`Storage` と `Clock` が要るので、保存するのはサーバ）
- `src/ytbg/replay.py` — `Replayer`。`start()`（Task にして投げる）/
  `run()`（ロックを握ったまま走り切る）/ `_cancel()`。
  **cancel と Task の差し替えは、どちらもロックの中**（TODO-009）
- `src/ytbg/server.py` — `BackgammonServer`（旧 `ytBackgammonServer`）
- `src/ytbg/app.py` — `create_app()`。ルーティング、`index.html` の応答、
  WebSocket の受信ループ。**モジュールのグローバルだった `svr` と `app` は
  無くなった**
- `tests/test_ws.py` — WebSocket 経路と HTTP のルートのテスト

### 消したもの

- `src/ytbg/yt_backgammon.py` — `ytBackgammon` は `GameInfo` に吸収。
  `init_gameinfo()` と未使用の `player` 属性は消えた
- `src/ytbg/yt_backgammon_server.py` — `BackgammonServer` へ

### そのほか

- `src/ytbg/__main__.py` は click の `main()` だけになった（60 行）
- dev 依存に `httpx2` を足した。**`httpx` ではない。** Starlette 1.6.0 の
  `testclient.py` は `import httpx2 as httpx` を先に試し、`httpx` しか
  無いときは非推奨の警告を出す
- `GameInfo` のメソッド名は `resign_game()`。`resign` は dataclass の
  フィールド名なので同名にできない
- `tests/test_yt_backgammon.py` → `tests/test_gameinfo_ops.py`

## 確かめたこと

`uv run pytest`（155 passed）、`uv run ruff check .`、`uv run mypy src`、
`node --test tests/browser/`（5 pass）がいずれも終了コード 0。

**reviewer が、旧 32 メソッド（`ytBackgammonServer` 21 ＋ `ytBackgammon` 11）の
移送先を 1 対 1 で突き合わせた。** どこにも行っていないものは無かった。
`on_json()` の 20 個の `if` は、順序・`return` する分岐と落ちる分岐の別・
`msg['history']` の位置・`sec` の決め方まで同じ。受信ループは `svr` が
グローバルからクロージャになった以外 1 文字も違わない。

**verifier が実際に動かして確かめたもの**（報告は
[verifier-report.md](../agents/TODO-025/verifier-report.md)）:

- `/`、`/p1`、`/p2` が 200 で同じ中身を返し、`/static/` の画像も 200
- 2 枚のタブで、片方の Roll がもう片方へ同期する
- **分割前（`b47895e`）で保存した `.jsonl` を、いまのコードが読める**
  （`git worktree` で旧コードを出して作ったファイルで実測）
- `YTBG_DATA_DIR` の外（`$HOME`）は触られない

**わざと壊して狙ったテストが落ちることを、実装側で 10 通り、
verifier が別に 4 通り確かめた。** `replay.py` の `start()` で
`_cancel()` をロックの外に出すと `test_replay.py::test_only_one_replay_runs`
が落ちるので、**TODO-009 の「どこからも辿れない再生 Task が残る」性質を
見るテストが、いまも機能している**。

## 残ること

- **`History._cur_sn` は `load()` のあと更新されない。** 保存ファイルから
  読んだ直後は 0 のまま。次の `add()` が `_history[-1].sn + 1` から
  数え直すので実害は無く、分割前も同じだった。公開のプロパティは消した
- `on_json()` の 20 個の `if` はそのまま移しただけ。ディスパッチ表は TODO-026
- `tests/test_ws.py` の `test_disconnect_removes_client` は、切断の反映を
  待つために「もう 1 本つないで数える」形にしてある。`TestClient` に
  「切断が処理し終わるのを待つ」手立てが無いため

## 分担の振り返り

- **reviewer が見つけたのは「動いているのにテストが 1 件も通っていない経路」
  2 つ。** `/p1` `/p2` `/static` のルート（この項目でファイルをまたいで
  移ったのに、`Route` を落としても pytest もブラウザテストも気づかない）と、
  New Game 後の `server_version`（`new_game()` の引数を消しても 1 件も
  落ちない）。**どちらも「テストが通るか」を見る verifier の担当範囲の外**で、
  TODO-024 と同じ性質の収穫だった
- **reviewer が自分の指摘を 1 件撤回した。** 最初の返事では
  「`Replayer.run()` が `_task` を `None` に戻さない」を重大として挙げたが、
  報告を書き直す過程で旧実装と機械的に差分を取り、成立しないことを
  自分で確かめて取り下げた。**返事だけで判断せず、報告ファイルを読む
  手順が効いた**（返事の 5 行だけを信じて implementer に直させていたら、
  無い問題を「直す」ところだった）
- **報告ファイルが書かれずに終わったことがある。** reviewer の 1 回目は
  返事だけ返って `reviewer-report.md` が作られていなかった。
  `ls` で気づいて書き直させた。**返事を受け取ったら、報告ファイルの
  存在を確かめること**
- **見込みと食い違ったのは、main の割合**（32%、$5.0）。TODO-024 の 22% より
  増えた。指摘の仕分け（要修正 / 検討 / 好みから、直すものを選ぶ）を
  main がやるので、reviewer の報告が厚いほど main も重くなる
- **次に同じ規模（責務の移し替え）をやるなら、同じ組み方でよい。**
  reviewer → verifier の直列は、待ち時間は伸びるが作業ツリーの取り合いが
  無くなるので、**こちらを既定にする**。並行にしたいなら verifier に
  `git worktree` を使わせること
