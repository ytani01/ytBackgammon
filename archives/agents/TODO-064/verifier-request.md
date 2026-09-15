# TODO-064 verifier への依頼

## 目的

作業ツリーの未コミットの差分（TODO-064: URL のプレフィクス）が、決めたとおりに動くかを確かめる。コードは直さない。

## 読むもの

- `TODO.md` の TODO-064 の節
- `archives/agents/TODO-064/implementer-report.md`、`reviewer-report.md`
  （reviewer の指摘 1〜3 は main が直した。1 は文書を実装に合わせ、2 は `test_lobby_prefix_routes` に 2 行足し、
  3 はリダイレクトの説明を直した。4 は直さない）

## 確かめること

1. 一式を 1 回ずつ走らせる: `uv run pytest`、`uv run ruff check .`、`uv run mypy src`、`uv run basedpyright`、
   `node --test tests/js/`、`node --test tests/browser/`。落ちたら出力を報告に貼る
2. 実際に起動して試す（ポートは空いているもの。終わったら `pgrep` で PID を確かめて止める。`pkill` は使わない。
   保存先は `YTBG_DATA_DIR` を一時ディレクトリにして、利用者の `~/ytbg-*` を触らない）
   - `uv run ytbg board --prefix /foo -p <port> 1`: `curl` で `/foo/`・`/foo/p1`・`/foo`（リダイレクト先）・
     `/foo/static/js/main.js` が応え、`/` が 404
   - `--prefix 'a b'`・`--prefix /a//b`・`--prefix /..` がエラーで止まり、`--prefix foo/` が `/foo` として動く
   - prefix を付けない `ytbg board` が今までどおり `/` で開く
   - `ytbg lobby --prefix /lb` を、`[[board]]` に `prefix` と パスだけの `url`（`/board1/`）を書いた一時の設定で起動し、
     `/lb/`・`/lb/api/boards` が応え、ボードの子プロセスが prefix 付きで listen する（`/board1/` が応える）。
     lobby を止めるとボードも止まる
   - 設定の `url = "//evil/"` と `prefix = "a b"` が起動時のエラーになる
3. `docs/Admin.md` に書いたコマンド例と設定例（prefix の節）を、書いたとおりに試せる範囲で試す。nginx の例は
   nginx を入れずに、書式が決めた前提（`proxy_pass` に URI を付けない）と合っているかだけ見る
4. 足したテストの中から 2 つ選び、`src/` をわざと壊して落ちることを確かめ、元に戻す（1 回ずつでよい）。
   戻したあと `git diff --stat` が壊す前と同じであることを確かめる

## 報告

`archives/agents/TODO-064/verifier-report.md` に、各項目の結果（実行したコマンドと要点の出力）、壊し方と落ちたテスト、
食い違いを書く。返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
