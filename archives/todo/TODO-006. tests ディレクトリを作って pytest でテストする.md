# TODO-006. tests ディレクトリを作って pytest でテストする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier |
| 実施 | Opus 5 / effort high | implementer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 9,895 | 27,326 | 58% |
| verifier | Sonnet 5 | medium | 7,797 | 44,249 | 22% |
| implementer | Sonnet 5 | medium | 5,785 | 45,507 | 20% |
| 合計 |  |  | 23,477 | 117,082 | 概算 $1.7 |

- implementer も verifier も定義（`~/.claude/agents/*.md`）のまま。
  モデルの上書きはしていない
- 挙動を変えない項目なので reviewer は入れていない

## きっかけ

テストの仕組みが無く、動作確認はブラウザで実際に触るだけだった。
まず骨格を作り、今後必要に応じて足していくことにした。

着手前に決めたこと:

- **範囲は `save_data()` / `load_data()` まで含める。** `gameinfo` の更新だけに
  絞る案もあったが、履歴と保存は TODO-004（`save_data()` の I/O が gevent で
  全体を止める件）の測定にも土台が要る
- **各ファイル 2〜4 本。** 網羅は狙わず、今後テストを足す場所を決めるのが目的
- **既存コードは変えない。** テストを書く途中で不具合が見つかっても直さず、
  別項目にする

## やったこと

- `pyproject.toml` — `pytest>=9.1.1` を dev 依存に足し、
  `[tool.pytest.ini_options]` に `testpaths = ["tests"]` を書いた
- `tests/conftest.py` — フィクスチャ 3 つ。`bg`（`ytBackgammon`）、
  `emitted`（`emit` の呼び出し引数を積むリスト）、`bg_server`
- `tests/test_yt_backgammon.py`（4 本）— `init_gameinfo()` の構造、
  `put_checker()` の ID からプレーヤーを求める計算、`cube()` / `dice()`、
  `set_turn()`
- `tests/test_history.py`（4 本）— `add_history()` の sn 採番、
  `backward_hist()` / `forward_hist()` の往復、`backward_hist(-1)` の全戻し、
  `hist_ent2str()`
- `tests/test_save_load.py`（2 本）— `save_data()` → `load_data()` の往復、
  存在しないファイルを読ませたときの `(0, 0)`
- `CLAUDE.md` — 「テストの仕組みは無い」を実態に合わせ、テストを足すときの
  注意（下記の 2 点）を書いた。実行のコマンドにも `uv run pytest` を足した

サーバ側をテストするために要った工夫:

- `ytBackgammonServer` は**コンストラクタの中で `load_data()` を呼び**、
  保存先をクラス変数 `DATAFILE_DIR`（`$HOME`）から組み立てる。
  `monkeypatch.setattr` で `DATAFILE_DIR` を `tmp_path` に差し替えてから
  生成する
- `flask_socketio.emit` はリクエストコンテキストの外では使えないので、
  `yt_backgammon_server.emit` をモジュール直下で差し替える
- `gevent.monkey.patch_all()` はテストから呼ばない。`time.sleep()` を使う
  `backward_hist()` / `forward_hist()` には `sleep_sec=0` を渡す

## 確かめたこと

- `uv run pytest` → 10 passed（終了コード 0）
- `uv run ruff check .` → 19 件、`uv run mypy src` → 9 件。どちらも変更前と
  同じ（`src/` は 1 行も変えていない）
- **`src/` をわざと壊すと、狙ったテストだけが落ちる。** 4 箇所で確かめた
  （`put_checker()` の ID 換算、`backward_hist()` の `n < 0` の分岐、
  `hist_ent2str()` の `sn` の出力、`load_data()` が存在しないファイルで
  返す値）。壊した変更はすべて元に戻し、`git status` で `src/` の差分が
  無いことを確かめた
- **利用者の `~/ytbg-*.json` を触っていない。** pytest を複数回走らせた
  前後で、既存 4 ファイルの mtime が 1 秒も動かず、ファイルも増えなかった
- `board.roll` が保存で失われる件（下記）を、実際に保存した JSON の中身で
  裏を取った

`backward_hist()` の分岐を壊す実験では、`if n > 0` を `if n >= 0` に変える
だけでは何も落ちなかった（`n = -1` はどちらでも偽で、分岐の意味が変わって
いない）。`if count >= n` に変えて初めて有効な破壊になった。

## 分担の振り返り

- **implementer** は `hist_ent2str()` が `board.roll` を出力しない不具合を
  見つけ、指示どおり直さずに報告した。テスト側では往復比較の前に `roll` を
  除き、経緯をコメントに残している
- **verifier** はミューテーションテストで、追加したテストが狙ったものを
  見ていることを確かめた。加えて、依頼に無かった「`CLAUDE.md` の記述を直す」が
  未実施であることを `TODO.md` と突き合わせて指摘した（main の担当分の
  やり残しで、そのあと main が書いた）
- **見込みと食い違わなかった。** 新規ファイルを足すだけで既存の挙動を
  変えないので、implementer と verifier の 2 人、モデルは定義のまま
  （どちらも Sonnet 5 / medium）で足りた
- **次に同じ規模の項目をやるなら**、担当の組み方は変えず、
  **main が読む量を減らす**。今回 main が料金の 58% を占めたのは、
  追加されたテスト 4 ファイルを全文読み返したため。verifier の
  ミューテーションテストで「テストが狙ったものを見ているか」は担保できて
  いるので、main は `git diff --stat` の範囲確認と報告の要点だけ読めばよい

## 残ること

- **`hist_ent2str()` が `gameinfo['board']['roll']` を出力しない。**
  保存 → 読み込みの往復で `board.roll` が失われる（TODO-007 として立てた）
- `mypy src` は `tests/` を見ていない。テストコード自体の型検査はしていない
