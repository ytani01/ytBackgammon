# TODO-064 implementer への依頼

## 目的

`http://server:port/foo` の `/foo`（URL のプレフィクス）を、`ytbg board` と `ytbg lobby` の両方で指定できるようにする。
決まったことは `TODO.md` の TODO-064 の節にある。先に読むこと。実装の前に `docs/Developer.md` の「サーバ側」「一覧サーバ」
「クライアント側」も読む。

## 決まっていること（変えない）

- プレフィクス付きのパスはそのままサーバに届く前提。サーバは prefix の下にルートを置く。プロキシがパスを外す構成
  （uvicorn の `root_path`）は扱わない
- `ytbg board --prefix` と `ytbg lobby --prefix`（短いオプションは付けない）。既定は空（今までどおり `/`）
- `ytbg.toml` の `[[board]]` に `prefix`（省略可）。lobby が子プロセスへ `--prefix` で渡す。lobby 自身の prefix は
  オプションだけ
- prefix の正規化: 前後の `/` を取り、空なら prefix 無し、あれば `/foo` の形にする。`foo`・`/foo/`・`/foo` は同じ。
  HTML と JS に埋め込むので、各段は `[A-Za-z0-9._~-]` だけに限り、空の段（`//`）と `.`・`..` の段は弾く。
  弾くときは CLI では `click` のエラー、設定では `ConfigError`。正規化と検査は 1 つの関数にまとめ、両方から使う
- prefix を指定したときは `/` では受けない。`/foo` は `/foo/` へのリダイレクトでよい（Starlette の `Mount` の既定の
  振る舞い）
- 設定の `url` に、`/` で始まるパスだけの値（`/foo/`）も書けるようにする。`//` で始まるもの（ホストを含む）は弾く。
  http(s) の検査は今までどおり
- `url` を省いたときの一覧ページの URL は、`{protocol}//{hostname}:{port}{prefix}/`

## 直すところ

- `src/ytbg/__main__.py`: 両サブコマンドに `--prefix`
- `src/ytbg/app.py` / `src/ytbg/lobby.py`: ルートを prefix の下に置く。テンプレートに `prefix` を渡す。
  lobby の `BoardConfig` に `prefix`、`load_config()` の検査、子プロセスの引数。lobby の `url` の検査にあるコメント
  「パスで分けた相対 URL では動かない」も直す
- `index.html` / `lobby.html`: `/static/...` に `{{ prefix }}` を付ける
- JS: `ws.js` の `/ws`、`sound.js` の音、`settings.js` の画像ディレクトリ、`lobby.js` の `fetch` と `board_url()`。
  JS へ prefix をどう渡すか（`import.meta.url` からの相対、`data-*` 属性など）は任せる。ただし Node で読み込む
  テスト（`tests/js/`）が壊れないこと。`dom.js` などのコメントにある例（`"/static/images1a/"`）も合わせる
- cookie は `document.cookie` に path を付けていない。既定の path はページのディレクトリになり、`/foo/` と `/foo/p1`
  はどちらも `/foo` なので直さなくてよい（main で確かめた。違っていたら報告に書く）

## テスト

- pytest: prefix の正規化と検査、`load_config()` の `prefix` と パスだけの `url`、prefix 付きアプリで `/foo/`・
  `/foo/p1`・`/foo/static/...`・`/foo/ws` が応え `/` が 404 になること、lobby が子プロセスへ `--prefix` を渡すこと
- ブラウザテスト: prefix 付きで board を起動し、盤面が開いて WebSocket がつながり、コンソールエラーが無いこと
  （画像・音・JS の読み込みも含む）。lobby を prefix 付きで起動し、一覧が出て、iframe の URL に board の prefix が
  付くこと。`tests/browser/helper.mjs` のサーバ起動に prefix を渡せるようにする。既存のテストを増やしすぎず、
  必要な分だけ足す
- 走らせるのは関係するテストだけ（一式は verifier が走らせる）。`uv run ruff check .`・`uv run mypy src`・
  `uv run basedpyright` は 0 件にする
- 足したテストは、`src/` をわざと壊して落ちることを確かめ、戻す（どう壊したかを報告に書く）

## 文書

- `ytbg.toml` のコメント、`docs/Admin.md`（オプション、設定の `prefix` と `url`、リバースプロキシで使うときの短い
  nginx の例。`proxy_pass` に URI を付けないこと）、`docs/Developer.md`（URL の組み立て方）、`CLAUDE.md` の
  ブラウザテストの説明に足したテストファイルがあれば 1 行
- Developer.md と Admin.md には TODO の番号を書かない

## 報告

`archives/agents/TODO-064/implementer-report.md` に、変更点、決めたこと（JS へ prefix を渡す方法など）、走らせた
テストと結果、壊して確かめたこと、残る懸念を書く。返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
コミットはしない。
