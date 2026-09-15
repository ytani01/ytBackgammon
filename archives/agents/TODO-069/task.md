# TODO-069. implementer への依頼

TODO.md の TODO-069 の節（背景を含む）を読むこと。ここには設計だけ書く。

## 目的

lobby の設定から `url` を無くし、`prefix` のあるボードのリンク・iframe を
「一覧ページと同じオリジンのパス」にする。lobby がそのパスを受けたら
ボード自身のポートへ 302 リダイレクトする。これで、直接開いても nginx 越しでも
同じ設定ファイルで動く（詳しい経緯は TODO.md の「背景」）。

## 変更 1: `src/ytbg/webroot/static/js/lobby.js`

`board_url(b)` を次のように変える。`b.url` は使わない。

```js
function board_url(b) {
    return b.prefix
        ? new URL(`${b.prefix}/`, location.href).href
        : `${location.protocol}//${location.hostname}:${b.port}${b.prefix}/`;
}
```

`new URL(path, location.href)` は絶対パス（`/` 始まり）を渡すと、
現在のページと同じ **プロトコル・ホスト名・ポート** を保ったまま、
パスだけをその値に置き換える。これが「一覧ページと同じオリジンのパス」。
`prefix` が無いボードは今までどおり（`b.port` を使う）。

関数の上のコメント（`board_url` の説明）も、`url` の設定を使う記述から
上の挙動の説明に書き換える。

## 変更 2: `src/ytbg/lobby.py`

### 2a. `url` を無くす

- `BoardConfig` から `url` フィールドを削除する
- `_OPTIONAL` から `'url': str` を削除する（`prefix` だけ残る）
- `url` の値を検証している块（`ent.get('url')` から始まる if ブロック全体、
  および関連コメント）を削除する
- `urlsplit` の import がこの削除で使われなくなるので、import 文からも消す
- `load_config()` の docstring の例から `url = "..."` の行を消す

### 2b. lobby 自身がボードのパスを受けたらリダイレクトする

`create_lobby_app()` に、`prefix` を持つボードごとに、その `prefix` の下の
どんなパスも受けて 302 で返すルートを足す。**lobby 自身の `--prefix` の
下ではなく、トップレベルに置く**（`with_prefix()` で包まない）。

```python
from starlette.responses import JSONResponse, RedirectResponse
```

```python
def _board_redirect(conf: BoardConfig):
    async def endpoint(request):
        sub = request.path_params.get('path', '')
        url = f'{request.url.scheme}://{request.url.hostname}:' \
              f'{conf.port}{conf.prefix}/{sub}'
        if request.url.query:
            url += f'?{request.url.query}'
        return RedirectResponse(url, status_code=302)
    return endpoint
```

`create_lobby_app()` の中で、`boards` のうち `prefix` があるものだけについて
`Mount(b.prefix, routes=[Route('/{path:path}', _board_redirect(b))])` を作り、
最終的な `Starlette(routes=[...], ...)` の `routes` に、
`with_prefix(lobby 自身の既存のルート一覧, prefix)` の結果と並べて足す
（配列を連結する形。既存の `with_prefix([...], prefix)` の呼び出し自体は
変えず、その結果とボード用のルートのリストを `+` で連結する）。

`_board_redirect` はモジュールレベルの関数でも `create_lobby_app` の中の
入れ子関数でもよいが、`conf` を引数として渡す（ループ変数を直接閉じ込めない）
形にすること（クロージャの束縛タイミングの罠を避けるため）。

### 確かめ方の例

`uv run ytbg lobby -c <prefix 付きの設定> --prefix /lobby` を起動し、
`curl -i http://127.0.0.1:<lobbyのポート>/<boardのprefix>/` を叩いて、
`302` と `Location: http://127.0.0.1:<boardのポート>/<boardのprefix>/` が
返ることを確かめる。クエリを付けた `?sound=off` でも試す。

## 変更 3: `ytbg.toml`（リポジトリ直下の設定ファイル）

先頭のコメントから `url` の説明（2 行）を削除する。この設定ファイル自体は
`url` を使っていないので、`[[board]]` の中身は変えない。

## 変更 4: テスト

### `tests/test_lobby.py`

- `VALID` の TOML と `test_load_config` の期待値から `url` を消す
  （`BoardConfig(...)` の呼び出しから `url` 引数を消す。`url` を使う
  ボード 2 のテストは `prefix` を使う例に置き換えるか、単純に `url` 無しの
  2 板構成にしてよい）
- `url` にまつわるエラーケース（`test_load_config_error` の
  `url = "//..."` 系、`url = "ftp://..."` 系など、`'url'` を含む行すべて）を
  `test_load_config_error` から削除する
- `url` を書いたら「知らないキー」エラーになることを確かめるテストを 1 つ足す
  （`BOARD + 'url = "https://example.net/"'` を `unknown key ['url']` で
  弾かれることを見る）
- `test_load_config_prefix_and_path_url` は `url` を前提にしているので、
  `BoardConfig(...)` の期待値から `url` 引数を外す（`prefix` の検証だけ残す）。
  関数名とコメントも `url` を使わない内容に直す
- 新しいテストを足す: prefix のあるボードへ `{prefix}/...` を GET すると
  302 で `http://<host>:<port>{prefix}/...` へ飛ぶこと。クエリが残ること。
  lobby 自身の `--prefix` の外でも受けること（`create_lobby_app()` に
  `TestClient` で直接つなぐ形。`test_lobby_prefix_routes` の隣に置くとよい）

### `tests/browser/lobby.test.mjs`

- `start_lobby()` の設定生成で `b.url` を書く分岐は削除する
  （`url` はもう設定に無い）
- 1 つ目の `describe`（`'lobby の一覧ページ'`）の `before` で `b2` に
  `url: ...` を渡しているのをやめ、`prefix` の無いボードとして単純化する
  （もともと `url` 無しのときと同じ挙動を確かめる目的だったはずなので、
  `url` を渡さなくても同じ URL になるはず）
- 2 つ目の `describe`（`'URL のプレフィクス付きの lobby とボード'`）の
  `before` で `p2` に渡している `url: '/board2/'` をやめ、`p2` は
  `prefix` なしのボードにする（今までどおり `http://<host>:<port>/` の
  リンクになることを見るケースとして使う）
- 同じ `it` の中の `p1`（`prefix: 'board1/'`）の期待値を見直す。
  `board_url()` は「一覧ページと同じオリジンのパス」を返すので、
  **iframe の `src` 属性の値**は `${lobby.url を組み立てたオリジン}/board1/?sound=off`
  になる（`lobby.url` は `http://127.0.0.1:<lobbyのポート>` なので、
  `http://127.0.0.1:<lobbyのポート>/board1/?sound=off`）。
  これは lobby 自身のポートへのアクセスで、lobby がリダイレクトを返し、
  ブラウザがそれを追って最終的にボード自身のポートのページが開く。
  **iframe の `src` 属性**と**iframe が最終的に読み込むページの URL**
  （`frame.url()`）は別物なので、両方を分けて確かめること
  （`src` はリダイレクト前の値、`frame.url()` はリダイレクト後の値）。
  既存の `wait_board(frame)` でページが実際に開くこと自体は確認できる。
  `p2` の `a` の `href` は `http://127.0.0.1:<p2のポート>/` になる
  （`prefix` が無いボードなので）

## 変更 5: 文書

### `docs/Admin.md`

- 設定ファイルの説明（`url` は... の段落）を削除する
- 「`url` は省かないこと」の段落と、設定例の `[[board]]` から
  `url = "..."` の行を削除する
- 削除した結果、設定例が「直接開いても nginx 越しでも同じ設定で動く」ことを
  一言添える（設定ファイルの説明の段落の近く）
- 「一覧ページ」の節の iframe の URL の説明（「設定に `url` があればそれ…」）を
  「一覧ページと同じオリジンの、ボードの `prefix` のパス」という説明に直す
- nginx の節（`== 困ったとき` の手前、または設定例の節）に、
  「nginx の `location` を書き忘れると、lobby が外から届かない
  `<host>:<board のポート>` へ 302 を返す」という、書き忘れに気づく手がかりを
  一言添える（TODO.md の背景の最後の段落を参照）

### `ytbg.toml` のコメント

上の変更 3 と同じ（重複作業ではなく 1 か所）。

### プロジェクトの `CLAUDE.md`

`lobby.test.mjs` の説明の段落（「`iframe の URL（設定の `url` の有無）」を
含む部分）を、新しい挙動（`url` は無い。iframe の `src` はリダイレクト前の
一覧ページと同じオリジンのパス、最終的にはボード自身のポートへ届く）に
合わせて書き直す。

## 検証

- `uv run pytest`
- `uv run ruff check .`
- `uv run mypy src`
- `uv run basedpyright`
- `node --test tests/js/`（変更が無いはずだが念のため）
- `node --test tests/browser/lobby.test.mjs`

## 範囲外（やらなくてよい）

- `prefix` の重複チェックを新設すること（今回は依頼していない）
- lobby 以外のボードの起動オプション・CLI の変更

## 報告

`archives/agents/TODO-069/implementer-report.md` に書くこと。
