# TODO-002 reviewer への依頼

## 目的

implementer の差分を、規約と設計に照らして見る。**コードは直さない。**
`verifier` が「動くか」を見るので、こちらは **「意味が変わっていないか」** を見る。

対象は `git diff -M d834035..HEAD`（未コミットなら `git diff -M d834035`）の
`src/ytbg/` 以下。

## 読むもの

- `TODO.md` の「TODO-002」の節（範囲はこれが正）
- `archives/agents/TODO-002/implementer-task.md`（実装への依頼文）
- `archives/agents/TODO-002/implementer-report.md`（実装の報告）

**依頼文には誤りが 1 つある。** 「`yt_backgammon.py:20` では `__class__` の
エラーが出ていない」と書いてあるが、実際は最初から 2 件出ていた。

## 特に見てほしいところ

lint の掃除だが、**挙動が変わりうる変更を含む**。次を重点的に見ること。

1. **`my_logger.py` の `get_logger()` の分岐統合（SIM114）。**
   `debug` に渡りうる値の種類ごとに、統合の前後で `setLevel()` に渡る値が
   同じかを確かめる。特に `bool`（`True` / `False`）、`0`、`NOTSET`、
   `10` のような生の int、`None`、文字列。
   **実測で裏を取ること**（実際に値を渡して確かめる）。
   `type(debug) == int` が `isinstance` に変わっていないかも見る

2. **`yt_backgammon.py` の `_gameinfo` の型注釈。**
   `None` から `{}` への初期値の変更で、意味が変わる経路が無いか。
   `__init__` の途中で例外が起きた場合、`init_gameinfo()` より前に
   `_gameinfo` を触る経路、`_gameinfo` の真偽判定（`if self._gameinfo:`）を
   している箇所が無いか。**`yt_backgammon_server.py` 側からの
   `self._bg._gameinfo` の使われ方も見る**

3. **PLR1711 で消した `return` が、本当に関数末尾だったか。**
   `backward_hist()` / `forward_hist()` の途中の早期 `return` を
   消していないか。消した行の前後を読んで確かめる

4. **PTH123 の `Path(path_name).open()` 化。**
   モード、エンコーディング、例外の型が変わっていないか。
   `load_data()` / `save_data()` の `except Exception` が捕まえる範囲が
   変わっていないか（`FileNotFoundError` の扱いなど）

5. **shebang の削除。** `my_logger.py` と `yt_backgammon_server.py` を
   直接実行している箇所が、リポジトリのどこかに無いか
   （`ytbg.sh`、`ytbg-boot.sh`、`ytbg-stop.sh`、`README.md`、`docs/`）

6. **改名の漏れ。** 旧ファイル名を参照している箇所が残っていないか。
   Python 以外（シェルスクリプト、`.html`、`.js`、`README.md`）も見る。
   `CLAUDE.md` に残っているのは範囲外として承知済み

7. **範囲。** 指示に無い変更が混ざっていないか。
   今回やらないと決めた 3 種類（UP031 の `hist_ent2str()` 内、BLE001、
   `__main__.py` の `svr`）に手が入っていないか

## やらないこと

- **コードを直さない。** 指摘するだけ
- サーバの起動やブラウザでの確認は `verifier` の担当なので、
  重複してやらなくてよい（実測が要る指摘の裏取りは別）

## 報告

`archives/agents/TODO-002/reviewer-report.md`。
**要修正 / 検討 / 好みの範囲**の順に、`ファイル:行` と根拠を添えて並べる。
確認していない指摘は「未確認」と明記する。管理者への返事は 5 行以内。
