# TODO-063 実装の依頼（implementer）

## 目的

複数のボードのサーバを子プロセスとして起動し、1 ページに iframe で並べて、ボードごとに
起動・停止できる一覧サーバ（lobby）を作る。個々のボードは今までどおり個々のサーバが制御する。
TODO の節は `TODO.md` の TODO-063（決めたことが全部書いてある。**そこから外れない**）。
**実装の前に `docs/Developer.md` を読むこと。**

## 決まっていること（TODO.md より）

- CLI: `ytbg` を click の group にする。ボード 1 面は `ytbg board SERVER_ID -p -i -d`（今の `main` の中身）、
  一覧サーバは `ytbg lobby -c ytbg.toml`。`pyproject.toml` の入口は `ytbg.__main__:main` のまま
- 設定は TOML（標準の `tomllib`）。ボードごとに `server_id`・`port`・`image_dir`・`url`（省略可）
- lobby は起動時に設定のボードを全部、子プロセスとして起動する。lobby を止めると（Ctrl+C・SIGTERM）
  ボードも止める。**落ちたボードは自動で再起動しない。** lobby の外で動いているボードを探して扱うことはしない
- 一覧ページ: ボードごとの状態（動作中・停止中）と起動・停止ボタン。**認証はしない**
- 並べ方は、選んだ 1 面を大きく、残りを小さく（今の `ytbg.html` と同じ形。選んだボードは cookie か
  localStorage に覚える）。Jitsi の埋め込みは入れない
- iframe の URL: 設定に `url` があればそれ。無ければ一覧ページを開いたホスト名にボードのポートを付ける
  （`location` から組み立てる）。iframe には `?sound=off` を付ける（全面の音が重なるのを避ける。
  付け方は `tests/browser/sound.test.mjs` の冒頭のコメントを参照）。ボード名を押すと別タブで音ありで開く
- ボードが起動できない（ポートが塞がっているなど）ときは「停止中」と出し、理由を lobby のログに残す
  （子の stderr をそのまま lobby の stderr に流し、終了コードを lobby のログに出す、で足りる）
- Web から足したり消したりはしない。動いている lobby へ指示を送るコマンドは作らない

## 設計の目安（変えてよいが、変えたら理由を報告に書く）

- `src/ytbg/lobby.py` に、設定の読み込み・子プロセスの管理・Starlette の app をまとめる。
  子は `sys.executable -m ytbg board ...` を `asyncio.create_subprocess_exec` で起動し、`-d` は lobby の `-d` を引き継ぐ
- 停止は SIGTERM を送り、数秒待っても終わらなければ SIGKILL。lobby の終了は Starlette の lifespan で全ボードを止める。
  **SIGKILL で lobby を殺した場合に子が残るのは扱わない**（docs の Admin.md に一言書く）
- API は `GET /api/boards`（状態の一覧）、`POST /api/boards/{server_id}/start`・`/stop` 程度。
  ページの JS は数秒おきに状態を読み直せば足りる。テンプレートは `webroot/templates/`、JS は `webroot/static/js/` に置く
- lobby のポートは `ytbg lobby -p`（既定 5000）で渡す。TOML には入れない
- 設定の誤り（`server_id` やポートの重複、必須のキーが無い）は起動時に分かるエラーで止める
- リポジトリのトップに `ytbg.toml` を置き、今の `ytbg-boot.sh` と同じ 4 面（1〜4、5001〜5004、
  images2 / images0a / images1a / images3）を書く

## 対象範囲

- 変えてよい: `src/ytbg/__main__.py`、`src/ytbg/lobby.py`（新規）、`webroot/templates/`・`webroot/static/js/` への追加、
  `ytbg.toml`（新規）、`ytbg.sh`（usage のコメント）、`README.md`、`docs/Admin.md`・`docs/Developer.md`・`docs/Player.md`、
  `tests/` への追加、`tests/browser/helper.mjs`（ボードの起動が `ytbg board` になる箇所と、`ytbg-boot.sh` に触れたコメント）、
  `tests/browser/sound.test.mjs` のコメント
- 消す: `ytbg-boot.sh`・`ytbg-stop.sh`・`ytbg.html`（`git rm`）
- **変えない:** ボードのサーバ（`app.py`・`server.py` など）とボードのクライアントの挙動、`CLAUDE.md`・`TODO.md`（main が直す）

## テスト

- pytest: 設定の読み込み（正しいもの・誤ったもの）、API での起動・停止と状態、**lobby を止めたらボードの子プロセスも
  止まること**（lobby を実プロセスで起動して SIGTERM を送り、子の PID が消えたかを見る）。
  ボードの実プロセスを起動するテストは `YTBG_DATA_DIR` を一時ディレクトリにし、ポートは空いているものを使う
- ブラウザ: `tests/browser/lobby.test.mjs` を足す。一覧ページで iframe の `src` が設定どおり（url 省略時はポート）か、
  ボードを選ぶと大きい枠が替わるか、停止・起動ボタンで状態の表示が変わるか
- `src/` をわざと壊して、足したテストが落ちることを確かめる（壊したものは必ず戻す）
- 走らせるのは関係するテストだけでよい（一式は verifier が走らせる）。`uv run ruff check .`・`uv run mypy src`・
  `uv run basedpyright` は 0 件にする

## 報告

`archives/agents/TODO-063/implementer-report.md` に、変えたファイルと理由、設計の目安から外れた点、走らせたテストと結果、
壊して確かめたこと、残る懸念を書く。**返事は 5 行以内**（終わったか・報告ファイルのパス・判断が要る点）。
**コミットはしない。**
