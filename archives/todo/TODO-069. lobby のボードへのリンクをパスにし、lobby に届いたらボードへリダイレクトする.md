# TODO-069. lobby のボードへのリンクをパスにし、lobby に届いたらボードへリダイレクトする

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |
| 実施 | Sonnet 5 / effort medium | implementer + verifier（2回）+ reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Sonnet 5 | medium | 27,199 | 117,143 | 43% |
| implementer | Sonnet 5 | medium | 16,645 | 78,183 | 22% |
| verifier | Sonnet 5 | medium | 14,282 | 98,751 | 19% |
| reviewer | Sonnet 5 | high | 12,727 | 75,510 | 17% |
| 合計 |  |  | 70,853 | 369,587 | 概算 $3.7 |

- 表は `implementer` / `verifier` / `reviewer` の定義ファイルどおりのモデル・effort（上書きなし）
- `verifier` は reviewer の指摘を受けた追加修正（下記）の確認も含め 2 回呼んでおり、上の行は合算値

## きっかけ

`~/ytbg/ytbg.toml`（Admin.md の設定例と同じ、`url = "/ytbg1/"`）で
`ytbg lobby -c ~/ytbg/ytbg.toml -p 5000 --prefix /ytbg` を起動し、
`http://rpi5-1:5000/ytbg/` を直接開くと、どのボードのリンクも
`http://rpi5-1:5000/ytbg1/` になり 404 だった。パスだけの `url` は
nginx 越しの前提で、`url` を消すと今度は nginx 越しで
`https://www.example.net:5001/ytbg1/` になって動かなかった。
直接開いて試した設定のまま、nginx を通せる形にしたかった。

2026-09-16 に利用者と相談して決めたこと:

- 中継ではなくリダイレクトにする。WebSocket はブラウザがボードへ直接つなぐ。
  nginx 越しでは `/ytbg1/` を nginx が 5001 へ振り分けるので lobby には来ず、
  Admin.md の nginx の設定例はそのまま使える
- 開き方をポート番号から推測したり、届くほうを問い合わせて決めたりはしない
- `prefix` の無いボードは今の形のまま（`prefix` を必須にはしない）
- `url` は無くす（ボードを別のホスト名で出す構成は作れなくなる）

## やったこと

- `src/ytbg/webroot/static/js/lobby.js` の `board_url()` を、`prefix` が
  あれば `new URL(`${b.prefix}/`, location.href).href`（一覧ページと同じ
  オリジンのパス）、無ければ従来どおり `location.hostname` とポートで
  組み立てる形に変更。`b.url` は使わなくなった
- `src/ytbg/lobby.py`
  - `BoardConfig` / `_OPTIONAL` / `load_config()` から `url` を削除。
    `url` を書くと「知らないキー」エラーになる
  - `_board_redirect(conf)` を新設。`conf.prefix` の下のどんなパスも、
    `http(s)://<リクエストのホスト名>:<conf.port><conf.prefix>/<サブパス>`
    （クエリは保持）へ 302 で返す
  - `create_lobby_app()` で、`prefix` のあるボードごとに
    `Mount(b.prefix, routes=[Route('/{path:path}', _board_redirect(b))])` を
    作り、lobby 自身の `--prefix`（`with_prefix()` でラップした既存ルート）
    とは別に、トップレベルへ連結した。lobby 自身の `--prefix` の外の
    パスでも受ける
- `ytbg.toml`・`docs/Admin.md`・プロジェクトの `CLAUDE.md`
  （`lobby.test.mjs` の説明）から `url` の記述を削除し、新しい挙動
  （`prefix` の有無での分岐、lobby からの 302）に書き換えた。
  Admin.md には、nginx の `location` を書き忘れると外から届かない
  ホスト名への 302 になる（気づく手がかり）ことも追記した
- `tests/test_lobby.py` に `test_board_redirect` を新設し、パス・クエリ付き
  パスの 302 と `Location`、lobby 自身の `--prefix` の外で受けることを確認。
  `url` 関連のエラーケースを `unknown key` の 1 ケースに置き換えた
- `tests/browser/lobby.test.mjs` から `url` を使う設定を無くし、`prefix`
  ありボードの `iframe` の `src`（リダイレクト前）と `frame.url()`
  （リダイレクト後）を分けて確認する形にした
- reviewer の指摘（検討 3 件）を受けて main が追加で直した:
  - `docs/Developer.md` に残っていた `url` 前提の古い説明を、`prefix` の
    有無での分岐と `_board_redirect()` の説明に書き換えた
  - `_board_redirect()` の docstring に、`conf.prefix` が `/static` や
    lobby 自身の `--prefix` と衝突するとこのリダイレクトが効かない旨を
    注記した（`prefix` の重複チェックの新設は今回の範囲外のまま）
  - `tests/browser/lobby.test.mjs` に `prefix` ありボード（`p1`）の
    `a` 要素の `href` を確認するアサーションを追加した

## 確かめたこと

- `uv run pytest`（349 passed）・`uv run ruff check .`・`uv run mypy src`・
  `uv run basedpyright`・`node --test tests/js/`（156 pass）・
  `node --test tests/browser/lobby.test.mjs`（4 pass）、すべて成功
- verifier が、302→200・`Location` から `prefix` を落とす・
  リダイレクト用ルートを lobby 自身の `--prefix` の下へ移す・`url` を
  再び許すキーに戻す・`lobby.js` の `prefix` 分岐を消す、の 5 通りで
  実装をわざと壊し、狙ったテストだけが落ちることを実測した
- reviewer が差分を規約・設計に照らして確認し、要修正 0 件（検討 3 件は
  上記のとおり対応済み）
- 追加修正 3 件についても、別の verifier 呼び出しで
  `docs/Developer.md` の記述と実装の一致、`lobby.py` の docstring 変更後の
  型チェック、追加した `a.href` アサーションが `board_url()` の `prefix`
  分岐を壊すと単独で落ちることを実測して確認した
- `git status` / `git diff` を都度確認し、指示範囲外のファイルは
  変わっていない

## 分担の振り返り

- implementer は task.md（main が先に固めた設計）どおりに機械的に実装でき、
  判断で迷った点はほぼ無かった。verifier は 5 通りの意図的な破壊で
  テストの実効性を裏付け、reviewer は分岐の衝突（`prefix` と `/static` /
  lobby 自身の `--prefix` の重なり）という、verifier の実測だけでは
  出てこない設計上の穴を見つけた。工程を分けた効果がそのまま出た項目
- 見込みどおり `implementer + verifier + reviewer` の 3 役で足り、
  モデル・effort の上書きも不要だった。ずれたのは、reviewer の検討事項を
  main が直接直したぶん、verifier をもう 1 回呼んだこと（見込みには
  含めていなかった小さな追加ラウンド）
- 次に同じ規模（設計を main が固めてから実装を渡す形）でやるなら、
  「文書の記述漏れが無いか」を最初の依頼書（task.md）の対象文書一覧に
  `docs/Developer.md` も明示的に含めておけば、reviewer の指摘 1 件と
  それに伴う追加の verifier ラウンドを避けられた。依頼書の文書対象は
  `grep -rl` などで「変更対象の挙動に言及している文書」を洗い出してから
  確定するとよい
