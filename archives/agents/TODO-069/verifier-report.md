# TODO-069. verifier 報告

## 検証コマンド（すべて実行、終了コード）

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run pytest` | 0 | 349 passed |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 13 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | 156 pass / 0 fail |
| `node --test tests/browser/lobby.test.mjs` | 0 | 4 pass / 0 fail |

すべて成功。落ちた出力は無い。

## task.md の「変更 1」〜「変更 5」との突き合わせ

`git diff` を差分単位で読み、task.md の指示と 1 対 1 で対応することを確認した。

- **変更 1**（`lobby.js` の `board_url()`）: 指示のコード片とバイト単位で一致。
  コメントも `url` を前提にしない説明に書き換わっている。過不足なし。
- **変更 2a**（`lobby.py` から `url` を消す）: `BoardConfig` の `url` フィールド、
  `_OPTIONAL` の `'url': str`、`ent.get('url')` から始まる検証ブロック全体、
  `urlsplit` の import、docstring の `url = "..."` の行、すべて削除されている。
  過不足なし。
- **変更 2b**（lobby 自身のリダイレクト）: `_board_redirect(conf)` は指示のコードと
  ほぼ同一（`conf` を引数に取るクロージャで、ループ変数を直接閉じ込めていない）。
  `create_lobby_app()` で `board_routes` を作り、
  `with_prefix([...], prefix) + board_routes` の形で連結しており、
  「lobby 自身の `--prefix` の外、トップレベルに置く」という指示どおり。
- **変更 3**（`ytbg.toml`）: 先頭コメントの `url` の説明 2 行のみ削除。
  `[[board]]` の中身は変えていない。指示どおり。
- **変更 4**（テスト）:
  - `tests/test_lobby.py`: `VALID` の 2 板目が `url` から `prefix = "/board2"` に
    変わり、`test_load_config` の期待値も追随。`test_load_config_error` から
    `url` 系のケースをすべて削除し、`url = "https://example.net/"` を
    `unknown key ['url']` で弾くケースを追加。
    `test_load_config_prefix_and_path_url` は `test_load_config_prefix` に改名され、
    `url` 引数を外して `prefix` の検証だけに絞られている。
    `test_board_redirect` を新設し、パス・クエリ付きパスの 302 と
    `Location` の中身、lobby 自身の `--prefix`（`/lb`）の外で受けることを
    確認している。指示どおり。
  - `tests/browser/lobby.test.mjs`: `start_lobby()` から `b.url` の分岐を削除。
    1 つ目の `describe` の `b2` は `prefix` 無しのボードに単純化され、期待値も
    `http://127.0.0.1:...` に修正されている。2 つ目の `describe` の `p2` から
    `url` を外して `prefix` 無しのボードにし、`p1` のテストは `src`
    （リダイレクト前）と `frame.url()`（リダイレクト後）を分けて確認している。
    指示どおり。
- **変更 5**（文書）: `docs/Admin.md` は「設定ファイルの説明」の `url` の段落、
  「`url` は省かないこと」の段落と設定例の `url = "..."` の行、
  「一覧ページ」の iframe の説明、nginx の節の書き忘れの手がかりを、
  すべて指示どおりに書き換え・追加している。`ytbg.toml` のコメントも同じ 2 行を削除。
  `CLAUDE.md` の `lobby.test.mjs` の説明も、`url` 前提の記述を `prefix` の有無・
  `src` と `frame.url()` を分けて確認する説明に書き換えている。過不足なし。

## 実装をわざと壊してテストが落ちることを確認（実測）

`src/ytbg/lobby.py` と `src/ytbg/webroot/static/js/lobby.js` を一時的に壊し、
狙ったテストが落ちることを確認したあと、`\cp` で元に戻した
（`git diff --stat` で復元を確認済み）。

1. **302 のステータスコードを 200 に変える**
   → `test_board_redirect` が `assert 200 == 302` で失敗。
2. **Location の組み立てから `conf.prefix` を落とす**
   （`f'{conf.port}/{sub}'` に変更、`conf.prefix` を消す）
   → `test_board_redirect` が
   `'http://testserver:5001/board1/index.html?sound=off'` に対し
   `'http://testserver:5001/index.html?sound=off'` が返り失敗。
3. **`board_routes` を `with_prefix()` の中（lobby 自身の `--prefix` の下）に
   移す**（`with_prefix([...] + board_routes, prefix)` に変更）
   → `test_board_redirect` が `404` になり失敗
   （lobby 自身の `--prefix` の外で受けることを確かに見ている）。
4. **`_OPTIONAL` に `'url': str` を戻す**（`url` を知らないキーとして
   弾かなくする）
   → `test_load_config_error` の `unknown key ['url']` のケースが
   `Failed: DID NOT RAISE ConfigError` で失敗。
5. **`lobby.js` の `board_url()` を `prefix` の有無で分岐しない実装
   （常に `b.port` を使う）に戻す**
   → `node --test tests/browser/lobby.test.mjs` の
   「一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く」
   が `frame.url()` の期待値で不一致になり失敗
   （`http://127.0.0.1:<p1のポート>/board1/...` を期待するところ、
   壊した版では `http://127.0.0.1:<lobbyのポート>/board1/...` にならず、
   実際には `port` を使った別のポートへ直接行こうとして不一致になった。
   出力の実測値は上記のとおり)。

5 通りすべてで、狙った箇所だけが落ちることを確認した。

## git status / git diff（指示範囲外の変更が無いか）

変更されたファイルは次の 7 つで、task.md の「変更 1」〜「変更 5」の対象と
過不足なく一致する。

```
M CLAUDE.md
M docs/Admin.md
M src/ytbg/lobby.py
M src/ytbg/webroot/static/js/lobby.js
M tests/browser/lobby.test.mjs
M tests/test_lobby.py
M ytbg.toml
```

`archives/agents/TODO-069/`（`task.md` / `implementer-report.md` /
この報告）は作業記録で、指示範囲外の実装ファイルではない。

指示に無いファイルの変更は無し。

## 確かめられなかったこと・判断が要る点

- task.md の「確かめ方の例」にある `curl -i` での実プロセスへの手動確認
  （`uv run ytbg lobby -c ... --prefix /lobby` を起動して `curl` で叩く）は
  行っていない。`tests/test_lobby.py::test_board_redirect` が
  `TestClient` 経由で同等の内容（302・Location・クエリ・lobby 自身の
  `--prefix` の外）を見ており、かつそのテストが実際に狙った壊し方で
  落ちることを確認済みなので、実プロセスでの追加確認は不要と判断した。
  ただし本当に実プロセス・実ポートで動くかまでは見ていない。
- レビュー（分岐やロジックの妥当性そのものの評価）は行っていない。
  これは reviewer の担当と理解している。
