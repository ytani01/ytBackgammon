# TODO-064 implementer の報告

## 変更点

### サーバ

- `src/ytbg/app.py:48-77` — `normalize_prefix()`（前後の `/` を `strip('/')` で取り、空なら `''`、
  あれば `/foo`。各段は `[A-Za-z0-9._~-]+` で `.`・`..` は `ValueError`）と `with_prefix()`
  （prefix があれば routes を `Mount(prefix, routes=...)` で包む）
- `src/ytbg/app.py:79-111, 158-166` — `create_app(..., prefix='')`。テンプレートに `prefix` を渡し、ルートを `with_prefix()` で包む
- `src/ytbg/__main__.py:50-62` — `--prefix` の共通オプション `PREFIX_OPTION`。callback で `normalize_prefix()` を通し、
  誤りは `click.BadParameter`（終了コード 2）。`board`（:78-85）と `lobby`（:94-107）に付けた
- `src/ytbg/lobby.py` — `BoardConfig.prefix: str = ''`（:57）、`_OPTIONAL` に `prefix`（:64）、
  `load_config()` で `normalize_prefix()` を通して `ConfigError`（:124-130）、`url` の検査（:132-150。
  空白 → `//` と `/\` で始まるものを弾く → `/` 始まりはパスとして通す → それ以外は今までどおり http(s) の検査）。
  子プロセスへ `--prefix`（:224-225。prefix が空なら付けない）、`create_lobby_app(boards, debug, prefix)`（:265-）で
  テンプレートへ `prefix`、ルートを `with_prefix()` で包む。lifespan は外側の Starlette のまま
- API の状態（`/api/boards`）は `asdict(conf)` なので、`prefix` が自動で入る

### テンプレート・JS

- `index.html:9,13,14,16`・`lobby.html:8,10,25` — `/static/...` を `{{ prefix }}/static/...` に
- **JS へ prefix を渡す方法: 渡さない。モジュール自身の `import.meta.url` からの相対で組み立てる。**
  モジュールは必ず `{prefix}/static/js/` から読まれるので、`../../ws` などで prefix が付く
  - `ws.js:18` — `new URL("../../ws", import.meta.url)`
  - `sound.js:3-9` — `new URL(`../sounds/${name}`, import.meta.url).pathname`
  - `settings.js:78` — `get_image_dir()` を `new URL(`../${imageDir}/`, import.meta.url).pathname`
  - `lobby.js:17-30, 56, 113` — `api_url()`（`../../api/...`）と `board_url()`。`url` があれば
    `new URL(b.url, location.href).href`（パスだけも解決できる）、無ければ `{protocol}//{hostname}:{port}{prefix}/`
  - `dom.js:29` — コメントの例
  - Node のテスト（`tests/js/`）は壊れていない（`import.meta.url` は Node でも file URL になる）

### テスト

- `tests/test_ws.py:231-274` — prefix `/foo` のアプリで `/foo/`・`/foo/p1`・`/foo/p2`・`/foo/static/...`・`/foo/ws` が応え、
  `/`・`/p1`・`/static/...` が 404。`/foo` のリダイレクト。`index.html` の static の URL に prefix が付く
- `tests/test_lobby.py` — `load_config` の誤りに `//`・`/\`・空白入りのパス・`prefix` の誤り 3 件を足し、
  `url = "/board1/"` が誤りになる既存の 1 件を消した。`test_load_config_prefix_and_path_url`、
  `test_normalize_prefix`・`_error`、`test_cli_bad_prefix`（CliRunner で board と lobby）、
  `test_start_passes_prefix`（`asyncio.create_subprocess_exec` を差し替えて引数を見る）、
  `test_lobby_prefix_routes`（lifespan を走らせない TestClient で lobby の `/lb/`・API・static と 404）
- `tests/browser/helper.mjs:74-111` — `start_server({prefix})`。返す `url` にも prefix を付ける
- `tests/browser/board.test.mjs:251-300` — prefix `/pre/fix` のボード。gameinfo が届く（`/ws` は 404 なので
  `/pre/fix/ws` につながったことになる）、resource timing の JS と画像が全部 `/pre/fix/` の下、`sound.js` の
  `SOUND_ROLL` が `/pre/fix/static/sounds/roll1.mp3` でそれが 200、コンソールエラーが無い
- `tests/browser/lobby.test.mjs` — `start_lobby(boards, prefix)` と、設定の `prefix`。lobby を `/lobby` で起動し、
  iframe の src が `http://127.0.0.1:{port}/board1/?sound=off`、パスだけの `url`（`/board2/`）のリンクが lobby の origin + `/board2/`、iframe の中のボードに gameinfo が届く（helper の `wait_board(frame)`）

### 文書

- `ytbg.toml` のコメント、`docs/Admin.md`（`--prefix` の表の行 2 つ、「URL のプレフィクス」の節と nginx の例、設定の
  `prefix` と `url`、一覧ページの iframe の URL）、`docs/Developer.md`（「URL のプレフィクス」の節、一覧サーバの
  `board_url()`）、`CLAUDE.md`（`board.test.mjs` と `lobby.test.mjs` の説明に 1 文ずつ）

## 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest -q tests/test_lobby.py tests/test_ws.py` | 77 passed（exit 0） |
| `node --test tests/js/` | 156 pass、fail 0 |
| `node --test tests/browser/board.test.mjs tests/browser/lobby.test.mjs tests/browser/sound.test.mjs tests/browser/settings.test.mjs` | 20 pass、fail 0 |
| `uv run ruff check .` | All checks passed（exit 0） |
| `uv run mypy src` | no issues（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |

一式（pytest 全体・ブラウザ全体）は verifier に任せた。

## 壊して確かめたこと（すべて戻した）

| 壊し方 | 落ちたテスト |
|--------|--------------|
| `with_prefix()` が prefix を無視 | `test_prefix_routes`・`_redirect`・`_in_index`・`test_lobby_prefix_routes` |
| `normalize_prefix()` で `.`・`..` を弾かない | `test_normalize_prefix_error[/./]`・`[/foo/..]`、`load_config` の `/a/../b` |
| `normalize_prefix()` で `strip('/')` しない | `test_normalize_prefix[/]`・`[/foo]`・`[/foo/]`、`test_load_config_prefix_and_path_url` |
| 子プロセスへ `--prefix` を渡さない | `test_start_passes_prefix[/board1]` |
| `//` を弾かない | `load_config` の `//ytbg1.example.net/` |
| パスだけの `url` を http(s) の検査に回す | `test_load_config_prefix_and_path_url` |
| `index.html` の main.js に prefix を付けない | `test_prefix_in_index` |
| `lobby.html` の lobby.js に prefix を付けない／`lobby.py` がテンプレートに prefix を渡さない | `test_lobby_prefix_routes` |
| CLI の callback で `normalize_prefix()` を通さない | `test_cli_bad_prefix[board]`・`[lobby]` |
| `ws.js` を `new URL("/ws", location.href)` に戻す | board のプレフィクスの 2 件（gameinfo が届かずタイムアウト） |
| `sound.js` を `/static/sounds/` に戻す | board のプレフィクスの 2 件 |
| `settings.js` を `/static/{dir}/` に戻す | board のプレフィクスの 2 件 |
| `lobby.js` の `board_url()` で prefix を付けない | lobby のプレフィクスの 1 件 |
| `lobby.js` の API を `/api/...` に戻す | lobby のプレフィクスの 1 件（一覧が出ずタイムアウト） |
| `lobby.js` でパスだけの `url` を `new URL()` で解決しない | lobby のプレフィクスの 1 件 |

## 決めたこと・判断が要る点

- JS へは prefix を渡さず、`import.meta.url` からの相対にした。テンプレートの `data-*` や JS の定数を増やさずに済む。
  モジュールの置き場所の深さを変えると相対パスも直す必要がある（Developer.md に書いた）
- 前後の `/` は `strip('/')` で全部取る。`//foo//` は `/foo` になる（「空の段」として弾くのは途中の `//` だけ）
- 依頼に無いが、`url` は `//` に加えて `/\` で始まるものも弾いた（ブラウザは `/\host` を `//host` と同じく
  ホストとして解決するため）。テストも 1 件足した。要らなければ外せる
- lobby の `--prefix` の誤りも、ボードと同じく click のエラー（終了コード 2）

## 範囲外で気づいたこと・懸念

- `tests/test_lobby.py` を単独で走らせると、starlette の TestClient を import するので
  `anyio.abc.BlockingPortal` の DeprecationWarning が 1 件出る。`tests/test_ws.py` が前から出しているものと同じで、
  pytest 全体では件数は増えない
- Cookie の path は確かめていない（main の確認どおり直していない）
- `docs/Developer.md` の「クライアント側」冒頭の `<script type="module" src="/static/js/main.js">` の説明は、
  バンドラの話なので prefix を書き足していない
