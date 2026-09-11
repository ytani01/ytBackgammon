# TODO-031 レビュー（旧形式の読み込みを消す）

対象: `git diff`（未コミット）。`CLAUDE.md` / `docs/Admin.md` /
`src/ytbg/server.py` / `src/ytbg/storage.py` / `tests/test_save_load.py`。

要修正 2 件、検討 4 件、好みの範囲 2 件。

## 要修正

### 1. `src/ytbg/gameinfo.py:236-249` — 非 strict の理由づけが嘘になった

`GameInfo.from_dict()` の docstring が
「旧形式 (.json) は、余分なキーを読み捨てる必要があるので緩いまま。」と
書いているが、旧形式はもう読まない。`strict=False` の呼び出しは
**`src/ytbg/server.py:403`（`set_gameinfo` ハンドラ）が唯一**
（根拠: `src/` 全体の `GameInfo.from_dict` 呼び出しは server.py:403 と
storage.py:129,132 の 3 箇所だけ。後者は `strict=True`）。

この記述のまま読むと「緩い経路はもう要らない」と結論して
`strict=True` にしてしまえる。**実測で、そうしてもテストは落ちない**:
`GameInfo.from_dict` を常に `strict=True` にする pytest プラグインを
外から注入して `uv run pytest` を走らせたところ **231 passed**。
テストの `set_gameinfo` は 2 件とも完全な `to_dict()` を渡している
（`tests/test_on_json.py:283-285`、`:576-580`）ので、キーの欠けた
`set_gameinfo` を守るテストが無い。
※ この穴自体は差分より前からある（消した
`test_old_format_drops_clock_keys` も完全なキーの `OLD_ENT` を
使っていたので、同じ変異を捕まえられなかった）。差分が壊したのでは
なく、**唯一残った理由づけが間違った説明になった**のが問題。

同じ理由で `src/ytbg/gameinfo.py:93`
「dict から作る。旧形式の board.clock は読み捨てる (TODO-024)。」も
根拠が消えている。

### 2. `TODO.md:6-13, 21-23` — 実装と食い違ったまま

差分に `TODO.md` が入っていない。冒頭に
「残っている **TODO-031**（旧形式の読み込みを消す）は、**まだ着手できない。**
`~/ytbg-1〜4.json` が 2026-09-12 時点でまだ旧形式のまま」と書いてあり、
チェックボックス 3 つも未チェック。着手前に「`.json` しか無い
`server_id` が残っていないかを確かめる」と決めてある（TODO.md:33-35）ので、
その確認結果も残っていない。決着処理（`archives/todo/` への移動と目次）と
あわせて main の作業として残っている。

## 検討

### 3. `src/ytbg/storage.py:101-103` — `.json` しか無い利用者が気づけない

実測（`loggerInit(False)` で `.json` だけ置いて `Storage.load()`）:

```
⚠️ WARNING storage.py:102 load()> .../ytbg-9.jsonl: no data file
```

出るのはこの 1 行だけで、**初回起動とまったく同じ文言**。`.json` が
そこにあることには触れない。決めたとおり読まないままでよいが、
`self.path.with_suffix('.json').exists()` を見て
「旧形式のファイルがあるが読まない (TODO-031)」を 1 行出せば、
利用者は気づける。読み込みは復活しないので、決めたことには反しない。
（`old_path` 属性を復活させる必要は無い。`load()` の中のローカルで足りる）

### 4. `docs/Admin.md:95-96` — 「残っていても害は無い」が誤解を招く

害が無いのは「ファイルとして残っていること」だけで、**中身は取り戻せない**。
`.json` しか無いボードを起動すると初期配置で始まり、1 手でも動かせば
`.jsonl` が書かれる。差分前の `load()` は `.jsonl` を先に見ていた
（差分の `storage.py` 旧コード `if self.path.exists(): return
self._load_jsonl()`）ので、**古い版に戻しても旧 `.json` はもう読まれない**。
「古い対局を戻したい場合は、`.json` を読める版で一度起動して `.jsonl` へ
移すしかない（TODO-031 より前の版）」まで書いておかないと、
「害は無い」を読んで起動し、そこで初めて失う。

### 5. `tests/test_save_load.py:332-344` — テスト名と中身がずれた

`test_old_file_is_kept`（「旧ファイルは消さない。書き戻しは .jsonl」）は
`load()` を呼ばなくなり、`save()` だけを見ている。いま `Storage` は
`.json` をどこからも参照しないので実害は薄いが、
「読み込みが旧ファイルを消さない」はもう誰も見ていない。
`test_old_format_is_not_read` に `old_path.exists()` を足して 1 件に
まとめるほうが、名前と中身が合う。

### 6. `docs/Admin.md:44-46` — 向きの説明（`/p1` `/p2` の修正そのものは正しい）

URL で決まらないのは確認できた（`app.py:123-124` は同じ `index` を
返すだけで、向きは `board.js:77` の cookie `board{svr_id}_player` を
`load_player()`／`set_player()` が読み書きする）。2 点だけ足りない。

- cookie 名に `svr_id` が入るので、覚えるのは**ブラウザごと、かつボードごと**
- `settings.js:93` の `document.cookie = \`${key}=${value};\`` は
  `expires` / `max-age` を付けないので**セッション cookie**。ブラウザを
  終了すると忘れて既定の向きに戻る。「ブラウザごとに覚えていて」は
  ずっと覚えている印象を与える
  （**未確認**: 実ブラウザでの再現はしていない。コードを読んだだけ）

## 好みの範囲

### 7. `tests/test_save_load.py:45-51` — `old_file()` の引数が誰にも使われない

`history` / `fwd_hist` を渡す呼び出しが無くなった（3 箇所とも `old_file(path)`）。

### 8. `tests/test_save_load.py` の末尾が空行 2 行 + `##`

`src/ytbg/storage.py:143-144` や `tests/test_ws.py` は空行 1 行。
`uv run ruff check .` は通る（実測: All checks passed）。

## 確かめて、問題が無かったところ

- **消し残しは無い。** `archives/` を除くと `old_path` / `_load_old` /
  `_old_clock` の参照はコード・テスト・文書のどこにも残っていない。
  `docs/Developer.md` にも旧形式の記述は無い。
- **`LOAD_ERRORS`（storage.py:31-38）に旧形式のための項目は無い。**
  `KeyError` は `meta['v']` と `strict=True` の欠落、`IndexError` は
  空ファイルの `lines[0]` で今も要る。
- **`load()` の分岐は 1 本になっただけで、`.jsonl` の読み方は変わっていない。**
- `from typing import Any` の削除は妥当（storage.py に他の用途は無い。
  ruff も通る）。
