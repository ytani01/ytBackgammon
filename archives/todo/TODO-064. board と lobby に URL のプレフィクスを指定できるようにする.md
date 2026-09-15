# TODO-064. board と lobby に URL のプレフィクスを指定できるようにする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort low | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | low | 10,863 | 33,846 | 21% |
| implementer | Opus 5 | medium | 34,155 | 122,079 | 49% |
| reviewer | Opus 5 | high | 20,386 | 78,780 | 22% |
| verifier | Sonnet 5 | medium | 10,559 | 68,901 | 9% |
| 合計 |  |  | 75,963 | 303,606 | 概算 $6.6 |

- implementer と reviewer は、定義のモデルが sonnet。どのページの URL から開いても URL の組み立てが合うかを
  考える必要があるので、Opus 5 に上書きした
- effort は定義ファイルの値（implementer と verifier は medium、reviewer は high）
- 料金の割合は四捨五入のため、足すと 101% になる

分担の理由と各担当の報告は [`archives/agents/TODO-064/`](../agents/TODO-064/README.md) にある。

## きっかけ

`http://server:port/foo` の `/foo` を board と lobby のどちらでも指定できるようにしたい、と利用者から依頼があった。
リバースプロキシで、1 つのホストのパスごとにボードを振り分けるため。

2026-09-15 に利用者と決めた。

- プレフィクス付きのパスは、そのままサーバに届く前提。プロキシがパスを外す構成（uvicorn の `root_path`）は扱わない
- `ytbg board --prefix` と `ytbg lobby --prefix`。`ytbg.toml` の `[[board]]` に `prefix` を書き、lobby が子プロセスへ渡す
- 設定の `url` に、パスだけの値（`/foo/`）も書けるようにする

## やったこと

- `app.py` に `normalize_prefix()`（前後の `/` を取り、各段を `[A-Za-z0-9._~-]` に限り、途中の空の段と `.`・`..` を弾く）と
  `with_prefix()`（ルートを `Mount` で包む）を足し、board と lobby の両方で使う。CLI の `--prefix` の callback と
  `load_config()` が同じ `normalize_prefix()` を通す
- prefix を付けると `/` は 404。`/foo` は Starlette の Router（`redirect_slashes`）が `/foo/` へリダイレクトする
- `index.html`・`lobby.html` の `/static/...` に `{{ prefix }}` を付けた
- JS へは prefix を渡さず、`import.meta.url` からの相対で URL を組み立てる（`ws.js`・`sound.js`・`settings.js`・`lobby.js`）。
  モジュールは必ず `{prefix}/static/js/` から読まれるため
- lobby: `BoardConfig.prefix`、子プロセスへの `--prefix`、パスだけの `url`（`//` と `/\` で始まるものは弾く）。
  `url` を省いたときの URL は `{protocol}//{hostname}:{port}{prefix}/`
- テスト: `tests/test_ws.py`（prefix 付きのルート・リダイレクト・`index.html`）、`tests/test_lobby.py`（正規化・設定・
  CLI の誤り・子プロセスの引数・lobby のルートと `lobby.html`）、ブラウザテスト（prefix 付きのボードが開いて WebSocket が
  つながり、読み込みが全部 prefix の下へ行く。prefix 付きの lobby で iframe の URL に prefix が付く）
- 文書: `ytbg.toml` のコメント、`docs/Admin.md`（オプション、「URL のプレフィクス」の節と nginx の例、設定の `prefix` と
  `url`）、`docs/Developer.md`（URL の組み立て方）、`CLAUDE.md`（ブラウザテストの説明）

cookie は `document.cookie` に path を付けていないが、既定の path は `/foo`・`/foo/`・`/foo/p1` のどれから開いても
`/foo` になるので直していない（reviewer が chromium で確かめた）。

## 確かめたこと

- 一式を 1 回ずつ: `uv run pytest` 358 passed、`node --test tests/js/` 156 pass、`node --test tests/browser/` 105 pass、
  ruff・mypy・basedpyright の指摘 0 件
- 実際に起動: `ytbg board --prefix /foo` で `/foo/`・`/foo/p1`・`/foo/static/js/main.js` が 200、`/foo` が 307、`/` が 404。
  `a b`・`/a//b`・`/..` は終了コード 2 で止まり、`foo/` は `/foo` として動く。prefix 無しは今までどおり `/` で開く。
  `ytbg lobby --prefix /lb` で一覧と API が応え、子プロセスのボードが prefix 付きで listen し、lobby を止めるとボードも止まる
- 足したテストは、`src/` を壊して落ちることを確かめた（implementer が 15 通り、verifier が 2 通り、main が
  `lobby.html` の背景画像の prefix を外して 1 通り）

## 分担の振り返り

- **各担当が見つけたこと:** implementer は、ブラウザが `/\host` を `//host` と同じく読むことに気づき、依頼に無い検査を足した。
  reviewer は、文書と実装の食い違い（前後の `//` が通る）、`lobby.html` の背景画像と favicon を見るテストが無いこと、
  リダイレクトをしているのが Mount ではなく Router であることの 3 件を見つけた（要修正は 0 件）。verifier は
  食い違いを見つけなかった（一式・実際の起動・壊しテストはどれも依頼どおり）
- **見込みとの食い違い:** 担当の組み合わせは見込みどおり。main の effort は見込みの high ではなく low で進めたが、
  依頼を細かく書いたので、手戻りの 2 巡目は要らなかった
- **次に同じ規模なら:** reviewer の指摘が文書の言い回しとテスト 2 行だけだったので、依頼に「決めた挙動が文書の書き方と
  合っているか」を書いておけば implementer の段階で潰せた。verifier の依頼では、main が直したことを
  「確かめ済み」と書き、判断が要る点として戻ってこないようにする。reviewer は、ルートと URL の組み立てが変わる項目では
  今回と同じく Opus 5 で入れる
