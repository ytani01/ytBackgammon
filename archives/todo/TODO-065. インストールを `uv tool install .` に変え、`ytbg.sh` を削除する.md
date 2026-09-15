# TODO-065. インストールを `uv tool install .` に変え、`ytbg.sh` を削除する

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort medium | verifier |
| 実施 | Opus 5 / effort 不明 | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 不明 | 8,638 | 27,966 | 75% |
| verifier | Sonnet 5 | medium | 7,389 | 42,496 | 25% |
| 合計 |  |  | 16,027 | 70,462 | 概算 $1.3 |

- main の effort は記録に残っておらず、着手時の設定を確かめていない
- verifier は定義（`~/.claude/agents/verifier.md`）のモデル sonnet・effort medium のまま。上書きしていない
- 終点のコミット前に集計したので、決着のコミットの分は入っていない

## きっかけ

利用者がインストールを `uv tool install .` で行うと決めた。そうすれば
`uv run ytbg ...` ではなく `ytbg ...` で起動できる。

## やったこと

コードは変えていない。着手前に次を確かめた。

- wheel に `webroot/`（画像・JS・テンプレート）が入っている（`uv build`）
- lobby はボードを `sys.executable -m ytbg board` で起動するので、`uv run` に依存しない。
  tool でインストールした lobby は tool 用の Python でボードを起動する
- `tests/` と `docs/Developer.md` は `ytbg.sh` を使っていない

決めたこと:

- `ytbg.sh` は削除する（インストール後は `ytbg` が PATH にあるため）
- 開発者向けの手順（テスト・lint・手元での起動）は `uv sync` と `uv run` のまま残す。
  変更がすぐ反映されるため

変更:

- `ytbg.sh` を `git rm`
- `README.md`: インストールを `uv tool install .` に、起動の例を `ytbg board` / `ytbg lobby` に。
  更新とデザインの追加のあとは `uv tool install --reinstall .`。
  「リポジトリのディレクトリの中で実行します」を削除
- `docs/Admin.md`: 同じ書き換えに加え、`~/.local/bin` と `uv tool update-shell`、
  アンインストール（`uv tool uninstall ytbg`）、版の確かめ方（`uv tool list`）、
  `-c` の既定がカレントディレクトリの `ytbg.toml` であることを書いた。
  「`~/bin` にリンクを張れない」の記述を削除
- `CLAUDE.md`: 起動の例を `uv run ytbg ...` にし、開発は `uv run`、
  利用者は `uv tool install .` と書き分けた

`ytbg` に `--version` は無いので、版は `uv tool list` で見る形にした。

## 確かめたこと

verifier が、利用者が入れている `ytbg`（uv tool）に触れないよう `UV_TOOL_DIR` /
`UV_TOOL_BIN_DIR` を scratchpad に向けて、次を再現した
（[報告](../agents/TODO-065/verifier-report.md)）。

- clone に変更を当てて `uv tool install .` → `ytbg v1.1.7.dev4`（タグ由来）
- `ytbg board --help`・`ytbg lobby --help`
- clone の外で `ytbg board` を起動し、トップページと `board-base.png` が 200
- clone の外で `ytbg lobby` を起動し、子のボード 2 面が動作中。子の cmdline が
  `<tools>/ytbg/bin/python -m ytbg board ...`。SIGTERM で子も止まった
- `--reinstall`・`uninstall` が通り、利用者の `uv tool list` は変わらない
- `ytbg.sh` を使う記述が残っていない

## 分担の振り返り

- verifier は手順 8 つをすべて再現し、食い違いは見つけなかった。
  依頼に「利用者の tool を壊さない」「ポート 5000〜5004 を使わない」を書いたので、
  利用者の環境に触れずに済んだ
- 見込みと食い違いは無い
- 次に同じ規模（文書と起動スクリプトだけ、手順を再現できるもの）をやるなら、同じく
  main が書き、verifier 1 人に再現させる。料金の 75% は main なので、減らすなら
  main の調べものを 1 回の Bash にまとめる
