# TODO-064 verifier の報告

対象: 作業ツリーの未コミットの差分（`git status --short` で 19 ファイル）。コードは書き換えていない
（確かめのため一時的に `src/ytbg/app.py` を 2 通り壊したが、いずれも `\cp` で元に戻し、
`git diff --stat` が壊す前と一致することを確認した）。

## 1. 一式（1 回ずつ）

| コマンド | 結果 |
|----------|------|
| `uv run pytest`（`YTBG_DATA_DIR` を一時ディレクトリに設定） | 358 passed, 1 warning（exit 0）。warning は implementer の報告どおり `anyio.abc.BlockingPortal` の DeprecationWarning |
| `uv run ruff check .` | All checks passed（exit 0） |
| `uv run mypy src` | Success: no issues found in 13 source files（exit 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（exit 0） |
| `node --test tests/js/` | tests 156, pass 156, fail 0 |
| `node --test tests/browser/`（`YTBG_DATA_DIR` を一時ディレクトリに設定） | tests 105, pass 105, fail 0（約 70 秒） |

すべて通った。落ちたものは無い。

## 2. 実際に起動して試す

環境変数 `YTBG_DATA_DIR` を毎回一時ディレクトリに設定し、ポートは OS に選ばせた。起動したプロセスは
すべて `pgrep`/`ps aux` で確認してから `kill`（`pkill` は使っていない）。

### `uv run ytbg board --prefix /foo -p <port> 1`

```
curl /foo/                 => 200
curl /foo/p1                => 200
curl /foo (redirect)        => 307  Location: http://127.0.0.1:<port>/foo/
curl /foo/static/js/main.js => 200
curl /                      => 404
```

依頼どおりの結果。プロセスは `ps aux | grep "[y]tbg board"` で確認して kill、停止後に再度確認して
消えていることを確かめた。

### 誤った `--prefix`

```
--prefix "a b"    => exit 2, Error: Invalid value for '--prefix': invalid prefix 'a b': ...
--prefix "/a//b"  => exit 2, 同様のメッセージ
--prefix "/.."    => exit 2, 同様のメッセージ
--prefix "foo/"   => 正常に起動（ログに prefix=/foo と出る。/foo として動く）
```

すべて依頼どおり。

### prefix を付けない `ytbg board`

```
curl / => 200
```

今までどおり `/` で開く。

### `ytbg lobby --prefix /lb`（`[[board]]` に `prefix = "/board1"`、`url = "/board1/"` の一時設定）

```
curl /lb/           => 200
curl /lb/api/boards => [{"server_id":"1","port":<port>,"image_dir":"images1a","url":"/board1/","prefix":"/board1","running":true,"listening":true,"pid":<pid>}]
curl http://127.0.0.1:<board port>/board1/ => 200   (子プロセスが prefix 付きで listen していることを確認)
```

lobby の起動時にログで子プロセスの起動コマンドに `--prefix /board1` が渡っていることを確認
（`start: [..., 'ytbg', 'board', '-p', '<port>', '-i', 'images1a', '--prefix', '/board1', '--', '1']`）。

lobby を kill すると、子の board プロセスも消えることを `ps aux` で確認した
（lobby のプロセス群を kill した後、board の python プロセスも一覧から消えた）。

### 設定エラー（`url = "//evil/"` / `prefix = "a b"`）

```
url = "//evil/" の設定  => exit 1, Error: ...: "url" must start with http://, https:// or a single "/"
prefix = "a b" の設定   => exit 1, Error: ...: "prefix": invalid prefix 'a b': each segment must be [A-Za-z0-9._~-] and not empty, "." or ".."
```

どちらも起動せずにエラーで止まる。依頼どおり。

## 3. `docs/Admin.md` の記述

- コマンド例・設定例は上記の起動確認でほぼ再現できた（`--prefix`、`prefix`/`url` の設定、iframe の URL 組み立て方の説明は
  実測の挙動と一致）。
- nginx の例（`proxy_pass http://127.0.0.1:5001;` に URI を付けない書式）は、nginx を入れずに書式だけを確認した。
  reviewer の報告どおり「パスを外さない前提」と合っている。

## 4. 足したテストを壊して確かめる（2 件）

いずれも `src/ytbg/app.py` を編集し、`uv run pytest` の該当テストだけを走らせた後、`\cp` で元に戻した。

### (a) `with_prefix()` が prefix を無視するように壊す

```python
def with_prefix(routes: list, prefix: str) -> list:
    return routes  # 元は: [Mount(prefix, routes=routes)] if prefix else routes
```

`uv run pytest -q tests/test_ws.py -k prefix` の結果:

```
FAILED tests/test_ws.py::test_prefix_routes - AssertionError: /foo/
FAILED tests/test_ws.py::test_prefix_redirect - assert False
FAILED tests/test_ws.py::test_prefix_in_index - assert 'src="/foo/static/js/m...' in 'Not Found'
3 failed, 11 deselected
```

狙ったテストが落ちた。元に戻して `git diff --stat` が壊す前と一致することを確認。

### (b) `normalize_prefix()` の `.`・`..` の判定を外す

```python
if not _PREFIX_SEGMENT.fullmatch(seg):  # 元は: or seg in ('.', '..') も見ていた
```

`uv run pytest -q tests/test_lobby.py -k normalize_prefix_error` の結果:

```
FAILED tests/test_lobby.py::test_normalize_prefix_error[/./] - Failed: DID NOT RAISE ValueError
FAILED tests/test_lobby.py::test_normalize_prefix_error[/foo/..] - Failed: DID NOT RAISE ValueError
2 failed, 7 passed
```

狙ったテストが落ちた。元に戻して `git diff --stat` が壊す前と一致することを確認し、
`uv run pytest -q tests/test_lobby.py -k normalize_prefix` が 16 passed に戻ることも確認した。

## 変更ファイルと指示の範囲

`git status --short` の 19 ファイル（`CLAUDE.md`、`docs/Admin.md`、`docs/Developer.md`、
`src/ytbg/__main__.py`・`app.py`・`lobby.py`、`src/ytbg/webroot/` の JS・テンプレート、
`tests/browser/`・`tests/test_lobby.py`・`tests/test_ws.py`、`ytbg.toml`）と
`archives/agents/TODO-064/`（未追跡）は、implementer の報告に書かれた変更点（サーバ・テンプレート・JS・テスト・文書）と
一致しており、依頼の範囲外のファイルは見当たらない。reviewer の指摘 1（文書）・2（テスト 2 行）・3（リダイレクトの説明）は
それぞれ `docs/Admin.md`・`tests/test_lobby.py`・`docs/Developer.md` に反映されているのを確認した
（指摘 4 は好みの範囲として未対応のまま、指摘どおり）。

## 確かめられなかったこと・判断が要る点

- reviewer が「実測していない」とした「`lobby.html` の背景画像・favicon から prefix を消しても落ちるテストが無い」
  （検討 2）は、今回のテストが実際に通ったことしか確認しておらず、この欠落自体を実際に壊して再確認してはいない
  （依頼の「足したテストの中から 2 つ選ぶ」対象は実装側の分岐であり、reviewer の指摘そのものの検証は依頼の範囲外と判断した）。
  テストを足すかどうかは main の判断が要る
- `--prefix` の誤りでの終了コード（2）や設定ファイルの誤りでの終了コード（1）は、依頼にある
  「エラーで止まる」を満たしているが、コード自体の値（2 と 1 で異なる）が意図どおりかは
  依頼文からは読み取れず、判断できなかった
