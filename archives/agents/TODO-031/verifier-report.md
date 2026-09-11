# TODO-031 verifier report

## 1. 検証コマンド（終了コード）

| コマンド | 終了コード |
|---|---|
| `uv run pytest` | 0（231 passed, 1 warning） |
| `uv run ruff check .` | 0（All checks passed!） |
| `uv run mypy src` | 0（no issues found in 12 source files） |
| `uv run basedpyright` | 0（0 errors, 0 warnings, 0 notes） |
| `node --test tests/js/` | 0（59 passed） |
| `node --test tests/browser/`（1 回） | 0（44 passed） |

すべて通った。落ちた項目は無い。

## 2. 旧形式の読み込みが消えていること

`grep -rn "_load_old\|_old_clock\|old_path\|\.json\b" src/ytbg/ docs/ CLAUDE.md`（`.jsonl` を除く）は
何もヒットしなかった。`src/ytbg/storage.py` の `load()` は `_load_jsonl()` の
1 本だけで、`.json` を読む分岐は無い。`git diff` で見た変更点も、
`_load_old()` / `_old_clock()` / `old_path` の削除と整合していた。

## 3. 新しいテストが変更前で落ちること

`git worktree add --detach` で変更前（HEAD、コミット `0b027c5`）の
ワークツリーを作り、そこへ現行の `tests/test_save_load.py` をコピーして
`uv run pytest tests/test_save_load.py -q` を実行した（`.venv` はシンボリック
リンクで共有）。

結果: `2 failed, 31 passed`。

- `test_old_format_is_not_read` — 変更前は旧形式を読んでしまうので、
  `history == []` の assert が `[GameInfo(...)]` と食い違って落ちた
- `test_server_starts_with_only_old_format` — 同じ理由で
  `playername == ['', '']` が `['Alice', 'Bob']` と食い違って落ちた

狙った変更を戻すと、狙ったテストだけが落ちることを確認できた。
ワークツリーは検証後に `git worktree remove --force` で削除済み。

## 4. 実際の挙動（サーバ起動）

`YTBG_DATA_DIR` を一時ディレクトリに向け、`server_id=verifytest999`
（未使用）・ポート 58123（空きポート）でサーバを起動した。事前に
`ytbg-verifytest999.json`（旧形式、`Alice`/`Bob`、score `[1, 3]` などを含む
`tests/test_save_load.py` の `OLD_ENT` 相当）だけを置いた状態。

- 起動ログ:
  ```
  WARNING storage.py:102 load()> .../ytbg-verifytest999.jsonl: no data file
  WARNING server.py:117 __init__()> load_data(...): error
  ```
  旧形式を読んだ形跡（`load old format` のようなログ）は無かった
- 生成された `.jsonl` の履歴 1 件目は `playername: ['', '']`、
  `score: [0, 0]` — 初期配置から始まっていた（旧形式の `Alice`/`Bob`、
  `score: [1, 3]` は反映されていない）
- `.json` は起動前後でバイト同一（`read_text()` 相当の比較で差分なし）。
  消えても書き換わってもいない

サーバは `pgrep` で PID（1809979 の `uv run` と子の 1809987 の python）を
確かめてから `kill` で止めた。利用者の `~/ytbg-*` には一切触れていない。

## 5. `~/ytbg-1〜4.jsonl` の整合性（読み取りのみ）

| ファイル | 1 行目 `v` | 総行数 | history 件数 | fwd 件数 |
|---|---|---|---|---|
| `~/ytbg-1.jsonl` | 2 | 90 | 89 | 0 |
| `~/ytbg-2.jsonl` | 2 | 2 | 1 | 0 |
| `~/ytbg-3.jsonl` | 2 | 38 | 37 | 0 |
| `~/ytbg-4.jsonl` | 2 | 2 | 1 | 0 |

4 ファイルとも `v: 2`、各行が正しい JSON として読め、
「1（メタ）+ history + fwd = 総行数」が一致していた。壊れているものは無い。

## 6. 文書の記述が実装と合っているか

- `CLAUDE.md` の「履歴」節・`Storage` の説明 — 旧形式の読み込みへの
  言及が「TODO-031 で消した」に更新されており、実装と合っている
- `docs/Admin.md` の「状態の保存」節 — 「古い版が書いた `.json` は、もう
  読まない」に更新され、実装と合っている
- `docs/Admin.md` のもう一箇所の修正（`/p1` `/p2` の向きが URL では
  決まらないという記述）も、`main.js` の実装（Cookie で向きを覚える）と
  食い違いは見当たらなかった。ただし今回の TODO-031 の主題（旧形式の
  読み込み）とは別件の修正で、この点の実装側の裏取りは行っていない
  （判断が要れば追加で確認する）
- `docs/Developer.md` — `grep` で旧形式・`.json` への言及は無かった

## 確かめられなかったこと・判断が要ること

- `docs/Admin.md` の `/p1` `/p2` の記述修正は、TODO-031 の主題（旧形式の
  読み込み削除）の範囲外の変更に見える。誤りを直したこと自体は
  妥当そうだが、この項目の担当がどこまで手を広げてよいかは判断できない
  ので報告する
- basedpyright は `tests/` も含めて 0 件だが、今回のテスト書き換え
  （`tests/test_save_load.py`）についても改めて明示しておく（上の表の
  実行時点で `tests/` 込みの結果）
