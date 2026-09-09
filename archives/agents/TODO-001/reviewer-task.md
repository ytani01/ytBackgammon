# TODO-001 reviewer への依頼

## 目的

uv 移行（TODO-001）の差分を、規約と設計に照らしてレビューする。
とくに **Flask-SocketIO 4.x → 5.x、socket.io 1.3.5 → 4.8.1 の版上げで
挙動が変わっていないか**を見る。

## 対象

`git status` と `git diff HEAD`（`git mv` を含むので `git diff HEAD -M` も
使う）。implementer の報告は
`archives/agents/TODO-001/implementer-report.md`、依頼は `implementer-task.md`。

## 見てほしいこと

1. **挙動の変化**
   - `handle_disconnect(reason=None)` の追加は妥当か。他にも 5.x で
     引数の数が変わったハンドラは無いか（`connect`, `on_error_default`,
     `json`）
   - `emit(..., broadcast=True)` を残した判断は妥当か
   - `app.json.ensure_ascii = False` への置き換えで、元の「文字化け対策が
     効かない」という状況が変わるのか変わらないのか
   - `allow_unsafe_werkzeug=True` の追加は、この用途（家庭内・自分で起動する
     ボード）で妥当か。危険がある場面はあるか
   - `static/ytbg.js` を無変更で socket.io 4.x に載せた判断は妥当か。
     `io.connect()` の引数、再接続の既定値、`ws.on("json")` の受け取り方が
     1.x と 4.x で変わっていないか。**JS 側は 4000 行あるので、通信に
     関わる部分だけ**を見ればよい
2. **パスの解決**
   - `Flask(template_folder=..., static_folder=...)` の組み立てが、
     どこから起動しても（`uv run ytbg`、`ytbg.sh`、別ディレクトリから）
     正しく解決されるか
   - 状態ファイル `~/ytbg-{server_id}.json` の場所が変わっていないか
3. **スクリプト**
   - `ytbg-stop.sh` の `ps ... grep 'python.*/bin/[y]tbg'` は、
     `ytbg.sh` 経由・`ytbg-boot.sh` 経由の両方で確実に拾えるか。
     親の `uv run` が残らないか。関係ないプロセスを巻き込まないか
   - `ytbg-boot.sh` の `"${MYDIR}"/ytbg.sh` が `~/bin` からのシンボリック
     リンク越しでも動くか（`setup.sh` を消したのでリンクは張られなくなった。
     その扱いも含めて）
4. **`pyproject.toml`**
   - ytsched の書き方に揃っているか。version を静的にした判断、
     hatchling の packages 指定、webroot がホイールに入るか

## 注意

- **コードは直さない。** 見つけたことを報告するだけ。直すかどうかは
  管理者が決める
- 「ruff / mypy の指摘が残っている」ことは TODO-002 の範囲なので指摘しない

## 報告

`archives/agents/TODO-001/reviewer-report.md` に書く。指摘は
「どこが・何が問題で・どうなると困るか」を、重要な順に。返事は
「終わったか・報告ファイルのパス・判断が要る点」を 5 行以内で。
