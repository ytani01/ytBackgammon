# TODO-014 確認報告

## 1. 検証コマンド

- `uv sync` — 成功（exit 0）
  ```
  Resolved 36 packages in 0.69ms
  Checked 32 packages in 0.50ms
  ```
- `uv run pytest` — 57 件全件成功（exit 0）
  ```
  collected 57 items
  tests/test_history.py ....                                               [  7%]
  tests/test_on_json.py .........................................          [ 78%]
  tests/test_save_load.py ........                                         [ 92%]
  tests/test_yt_backgammon.py ....                                         [100%]
  ============================== 57 passed in 0.17s ==============================
  ```
- `uv run ruff check .` — 成功
  ```
  All checks passed!
  ```
- `uv run mypy src` — `__main__.py` の 7 件のみ（依頼どおり増えていない）
  ```
  src/ytbg/__main__.py:55: error: "None" has no attribute "app_index"  [attr-defined]
  src/ytbg/__main__.py:61: error: "None" has no attribute "app_index"  [attr-defined]
  src/ytbg/__main__.py:67: error: "None" has no attribute "app_index"  [attr-defined]
  src/ytbg/__main__.py:72: error: "None" has no attribute "on_connect"  [attr-defined]
  src/ytbg/__main__.py:78: error: "None" has no attribute "on_disconnect"  [attr-defined]
  src/ytbg/__main__.py:83: error: "None" has no attribute "on_error"  [attr-defined]
  src/ytbg/__main__.py:89: error: "None" has no attribute "on_json"  [attr-defined]
  Found 7 errors in 1 file (checked 5 source files)
  ```

## 2. バージョンがタグに追従するか

1. 着手前の値: `uv run python -c "import ytbg; print(ytbg.__version__)"` →
   `1.0.1.dev1`（HEAD は `1.0.0` から 1 コミット進んでいる。
   `git describe --tags --long` → `1.0.0-0-ge39811b` ではなく
   `9.9.9-0-ge39811b` は後述のタグ確認時のもの。着手前は
   `1.0.0` から 1 コミット進んだ状態）
2. `git tag 9.9.9` を打つ（HEAD に付く。`git describe --tags --long` →
   `9.9.9-0-ge39811b`、つまり 0 コミット差＝タグそのもの）
3. `uv sync` → ビルドが走り、`ytbg==1.0.1.dev1` → `ytbg==9.9.10.dev0` に
   更新された。`uv run python -c "import ytbg; print(ytbg.__version__)"` →
   `9.9.10.dev0`

   **依頼文は「`9.9.9` になること」を期待していたが、実際は
   `9.9.10.dev0` になった。** 原因は依頼文の想定外ではなく、
   **作業ツリーがこの変更（`pyproject.toml` などの未コミット差分）で
   dirty だったこと**。`git describe` 上はタグと一致（distance 0）でも、
   hatch-vcs（setuptools-scm 系）は dirty な作業ツリーを検知すると
   `guess-next-dev` の既定スキームでパッチ番号を 1 つ繰り上げた
   `X.Y.(Z+1).dev0` を返す。`local_scheme = "no-local-version"` は
   `+dirty` のようなローカル識別子を抑制するだけで、dirty 自体の
   検知や dev バージョンへの切り替えは抑えない。
   **これは実装の不具合ではなく hatch-vcs の既定動作**だが、
   依頼文の完了条件「`9.9.9` になること」とは文字どおりには一致しない
   ため、報告する（判断が要る点）。
   - **cache-keys の効きめ自体は確認できた。** タグを打つ前後で
     `uv sync` が再ビルドを行い（`Building ytbg ...` のログが出て）、
     バージョン文字列が実際に変わった（`1.0.1.dev1` → `9.9.10.dev0`）。
     古い値のまま止まる、という懸念は起きていない
4. `git tag -d 9.9.9` で削除
   ```
   Deleted tag '9.9.9' (was e39811b)
   ```
5. `uv sync` → 再ビルドが走り、`ytbg==9.9.10.dev0` → `ytbg==1.0.1.dev1` に
   戻った。1 の値と一致

最終確認: `git tag` → `1.0.0` のみ（`9.9.9` は残っていない）

## 3. 画面のバージョン表示

- `./ytbg.sh -p 5099 -i images1a 99` で起動（server_id 1〜4 と重複しない）。
  既存の 1〜4 のサーバは触っていない
- `curl -s http://localhost:5099/` の該当行:
  ```
  <strong>ytBackgammon Server v. 1.0.1.dev1</strong>
  ```
  1 つだけ出力され、`id="version"` の要素は無し（`grep -c 'id="version"'` → 0）
- `curl -s http://localhost:5099/static/ytbg.js` を取得し、
  `VERSION` / `ver_el` のいずれも grep で 0 件
- 確認後、`pgrep -af "p 5099"` で PID（613952, 613957）を確認してから
  `kill` で停止。`pkill` は使っていない。停止後 `~/ytbg-99.json` が
  新規に作られていたため `\rm` で削除済み

## 4. 既存の保存ファイルが読めるか

1. `\cp ~/ytbg-1.json <scratch>/datadir/ytbg-1.json` でコピー
   （利用者の実データは直接読んでいない）
2. `ytBackgammonServer.DATAFILE_DIR` を差し替えて
   `svr_id='1'` でインスタンス化 → 例外にならず、
   `len(svr._history)` は 38（0 でない）
3. 先頭の既存エントリは元のまま `server_version: "0.80"`
   （読み込みは変換せずそのまま保持）。`svr.new_game()` で
   履歴を 1 件追加すると、新しいエントリの `server_version` は
   `1.0.1.dev1`（新形式）になることを確認した

## 5. 指示との突き合わせ

`git status` / `git diff` の変更ファイル:
`CLAUDE.md`, `pyproject.toml`, `src/ytbg/webroot/static/ytbg.js`,
`src/ytbg/webroot/templates/index.html`, `uv.lock`（機械生成、editable
インストールに伴う自動更新）。いずれも依頼文の「対象範囲」に含まれる。
範囲外のファイルは変わっていない。`tests/test_save_load.py` の
`'0.80'` はやらないこと通り未変更。新しいタグは打っていない
（一時タグ `9.9.9` は本確認の手順で打って削除済み）。

## 判断が要る点

- 「2. バージョンがタグに追従するか」で、期待値 `9.9.9`（ちょうど）に
  対し実測は `9.9.10.dev0`（作業ツリーが dirty なため hatch-vcs が
  dev バージョンへ繰り上げる）だった。cache-keys の効きめ自体は
  確認できているので実装の欠陥ではないと考えるが、依頼文の完了条件の
  文言とは食い違うため、依頼文を「作業ツリーがクリーンな状態で
  確認する」あるいは「dirty のときの挙動もふまえた文言に直す」か、
  現状の説明で良しとするかは管理者の判断が要る

---

# 追記: レビュー指摘の修正後の再確認（main が実施）

verifier がセッションの上限（HTTP 429）で止まったため、この分は main が
確かめた。実装は implementer が行っているので、実装と確認は分かれている。

## 検証コマンド

- `uv sync` — 成功
- `uv run pytest -q` — 57 件全件成功
- `uv run ruff check .` — `All checks passed!`
- `uv run mypy src` — `__main__.py` の 7 件のみ（増えていない）
- `uv run python -c "import ytbg; print(ytbg.__version__)"` → `1.0.1.dev1`

## cache-keys の `file` の分が効くか

`pyproject.toml` の `description` を一時的に `CACHE KEY TEST` に書き換えて
`uv sync` したところ、再ビルドが走り、インストール済みの METADATA が
追随した。元に戻して `uv sync` すると元の値に戻った。

```
（書き換え前）Summary: ytBackgammon: network shared backgammon board
（書き換え後）Summary: CACHE KEY TEST
（戻した後）  Summary: ytBackgammon: network shared backgammon board
```

reviewer が別プロジェクトで実測した「cache-keys を書くと既定のキーが
置き換わる」件は、このリポジトリでも `{ file = "pyproject.toml" }` を
足したことで解消していることを確かめた。`git diff` に `description` の
差分は残っていない。

## ytbg.js が壊れていないか

- `node --check src/ytbg/webroot/static/ytbg.js` — 構文エラーなし
- サーバを `-p 5099 -i images1a 99` で起動して `curl` で確認
  - `/` の該当行は `<strong>ytBackgammon Server v. 1.0.1.dev1</strong>` の
    1 つだけ。`id="version"` は 0 件
  - `/static/ytbg.js`（120,836 バイト）に `MY_NAME` / `name_el` /
    `ver_el` / `const VERSION` は 0 件
- 確認後にプロセスを停止し、できた `~/ytbg-99.json` を削除した。
  利用者が動かしている 5001〜5004 の 4 サーバには触っていない

**ブラウザで実際に盤面を開く確認はしていない**（`CLAUDE.md` のとおり、
クライアントの動作確認は利用者が行う）。`Board` のコンストラクタから
2 行消しているので、盤面が出ることだけ一度見てほしい。

### 後始末での失敗

プロセスを止めるときに `pgrep -f` のパターンが自分のシェルにも一致し、
シェルごと落ちた（`CLAUDE.md` の「`pkill` はパターンで自分のシェルを
巻き込む」と同じ失敗を `pgrep -f` + `kill` でやった）。ytbg の 2 プロセスは
先に止まっており、実害は無い。**`pgrep` で出した PID をそのまま使い、
ループの中で `pgrep` を引き直さないこと。**
