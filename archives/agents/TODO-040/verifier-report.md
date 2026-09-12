# TODO-040 verifier-report

## 検証項目と結果

| 検証 | 終了コード | 結果 |
|------|-----------|------|
| `uv run pytest` | 0 | 231 passed, 1 warning（starlette の DeprecationWarning のみ） |
| `uv run ruff check .` | 0 | All checks passed! |
| `uv run mypy src` | 0 | Success: no issues found in 12 source files |
| `uv run basedpyright` | 0 | 0 errors, 0 warnings, 0 notes |
| `node --test tests/js/` | 0 | 59 tests, fail 0 |

すべて通過。落ちた項目なし。

## `git diff` の確認

```diff
diff --git a/src/ytbg/__main__.py b/src/ytbg/__main__.py
index 6ad6d54..9ac912d 100755
--- a/src/ytbg/__main__.py
+++ b/src/ytbg/__main__.py
@@ -29,7 +29,7 @@ _log = getLogger('main')
 @click.option('--port', '-p', 'port', type=int, default=5001,
               help='port number')
 @click.option('--image_dir', '-i', 'image_dir', type=str,
-              default="images1",
+              default="images1a",
               help="Images directory under '/static/'")
 @click.option('--debug', '-d', 'debug', is_flag=True, default=False,
               help='debug flag')
```

変更は `src/ytbg/__main__.py` の 1 行（既定値 `"images1"` → `"images1a"`）だけ。
指示の範囲と一致している。`git status` にも他の変更ファイルは出ていない。

## `-i` なし起動の実地確認

- `YTBG_DATA_DIR` をスクラッチディレクトリに設定し、空きポート（49727）で
  `uv run ytbg -p 49727 verify1` を起動（`-i` は付けない）。
- `setsid` でプロセスグループを分けて起動し、確認後は
  `kill -TERM -- -<pgid>` でプロセスグループごと終了。`pkill` は未使用。
  終了後に `ps -ef` で子プロセスが残っていないことを確認済み。
- `curl -s http://127.0.0.1:49727/` の応答に
  `data-image-dir="images1a"` が入っていることを確認（既定値が
  正しく反映されている）。
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:49727/static/images1a/board-base.png`
  → `200`。
- サーバログには `no data file` の警告が出ているが、これは初回起動で
  データファイルが無いことによる想定内の警告であり、画像 404 とは無関係。
- 保存ファイルはスクラッチ側の
  `.../scratchpad/ytbg_verify/ytbg-verify1.jsonl` にのみ作成され、
  利用者の `~/ytbg-*` には触れていない。
- 起動中に確認したところ、利用者が別途 `ytbg.boot.sh` 相当で立てていたと
  思われる既存の 4 サーバ（ポート 5001〜5004、`images2` / `images0a` /
  `images1a` / `images3`）が動いていたが、これは今回の検証とは無関係の
  既存プロセスであり、今回の検証では一切操作していない。

## 確かめられなかったこと・判断が要る点

- 特になし。指示された検証項目はすべて実施し、いずれも問題は見つからなかった。
