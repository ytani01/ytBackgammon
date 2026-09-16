# TODO-077 レビュー報告

対象: `git diff`(develop、未コミット)。`uv run ruff check .` / `uv run mypy src` /
`uv run basedpyright` はいずれも 0 件。`uv run pytest tests/test_cli.py`
(18 件)と `node --test tests/browser/board.test.mjs`(11 件)は 1 回走らせて
全件通った。

## 要修正

### `resolve_image_dir()` が空文字・`.`・`..` を「見つかった」と誤判定する

`src/ytbg/__main__.py:83-96`

```python
elif (WEBROOT / 'static' / image_dir).is_dir():
    return image_dir
```

`image_dir` が `''`・`'.'`・`'..'` のとき、`WEBROOT / 'static' / image_dir` は
`Path.__truediv__` の性質上それぞれ `WEBROOT/static` 自身、同じく `WEBROOT/static`、
`WEBROOT`(webroot 自身)になり、`is_dir()` が真になる。結果、存在しない
デザイン名なのに「同梱で見つかった」扱いでそのまま `image_dir` に空文字などが
入り、**「どこにも無ければ起動せずにエラーになる」という仕様(タスク指示・
`docs/Admin.md` の記述)を満たさずに起動してしまう。**

実測(`uv run python3 -c "from ytbg.__main__ import resolve_image_dir; ...`):

```
resolve_image_dir('', Path('/tmp/nonexistent-base')) == ''
```

`.` / `..` も同様に `is_dir()` が真になることを `Path` の挙動として確認済み
(`WEBROOT/'static'/'..'` は `WEBROOT` そのもの)。

起きること: `image_dir=''` は `create_app()` で `isinstance(image_dir, Path)`
が偽なので外側のマウントは足されず、`index.html` の
`{{prefix}}/static/{{image_dir}}/bg.png` が `.../static//bg.png` になり、
クライアントの `settings.js` の `get_image_dir()`(`../${dataset.imageDir}/`)も
`..//` という壊れた相対 URL を作る(未確認: 実際のブラウザでの表示崩れ方は
見ていない。`is_dir()` が真になる/仕様の意図に反することは実測済み)。

`-i ''` は通常のオペレーションでは考えにくい入力だが、タスク指示で明示的に
挙げられている空値のケースであり、`click.Path` 側のバリデーションも無いため
現状は素通りする。名前として受け付ける前に、空文字と `.`・`..`(や `/` を
含まない値に `os.sep` が現れないことは既に保証済みなので、それ以外の
danger な単一セグメント)を弾く一行のガードが要ると考える。

## 検討

### `/static/images` という固定パスが、将来の同梱デザイン名と衝突しうる

`src/ytbg/app.py:108-117`

外のディレクトリは常に `/static/images` にマウントされる。現状の同梱デザイン
(`images0a`・`images1a`・`images2`・`images3`)に `images` という名前は無いが、
この前提はコード上どこにも強制されていない。将来だれかが同梱デザインとして
`static/images/` を追加すると、`resolve_image_dir()` の bundled 判定
(`WEBROOT/'static'/'images'` が存在)が先に成立し、名前として `'images'` を
渡したときの意味が「同梱の images」と「外の `-i` 用の固定マウント名」で
衝突する。実害は無い(今は存在しない)が、`docs/Admin.md` にも
「`images` という名前は同梱デザインに使えない」という制約は書かれていない。
一行のコメントか、Admin.md の表に注記があると事故を防げる。

### lobby 経由での相対パス `image_dir` は cwd 次第(未確認・未テスト)

`src/ytbg/lobby.py:230`(`BoardProcess` が `-i self.conf.image_dir` をそのまま
子プロセスへ渡す。今回の diff はここを変えていない)。

`resolve_image_dir()` は `'/'` を含む値を `Path(image_dir).expanduser()` で
そのまま使うが、絶対パスでも `~` 始まりでもない相対パス
(例 `sub/mydeck`)を `ytbg.toml` の `image_dir` に書いた場合、解決の基準は
**lobby 子プロセスの cwd**(lobby 自身の起動ディレクトリを継承)になり、
`ytbg.toml` が置かれているディレクトリとは限らない。`board` を直接
起動する分には利用者が cwd を意識して使えるが、lobby 経由だと暗黙的になる。
`tests/test_lobby.py` にも `tests/browser/lobby.test.mjs` にもこの組み合わせの
テストは無い(grep で確認)。実際に壊れるかは未確認(相対パスを指定した lobby
経由の起動は試していない)。ドキュメントに「`-i` のパス指定は絶対パスか `~`
始まりを推奨」の一言があると安全だと思う。

### `docs/Admin.md` の「盤面のデザイン」節、外部デザインにもファイル名を
揃える必要があることが明記されていない

`docs/Admin.md:98-111`。直前の段落で「ファイル名(`board-base.png` など)は
共通なので…同じ名前を揃える」と書いているのは同梱デザインを足す文脈で、
新設した「自分で作ったデザインは、パッケージの外に置ける」の表にはこの
要件が繰り返されていない。文脈的に読めばつながるが、初めて自作する人が
表だけ読むと必要なファイル名の一覧を見落とす可能性がある。実害は小さいので
検討どまり。

## 良かった点(確認事項)

- 「置き場所を決めるのは `__main__.py` だけ」(`docs/Developer.md:117`)の
  切り分けは守られている。`resolve_image_dir()` は `__main__.py` にあり、
  `create_app()`(`src/ytbg/app.py:77-117`)は `str | Path` を**受け取るだけ**で、
  docstring にも「どちらを渡すかを決めるのは `__main__.py` だけ」と明記
  (TODO-076 の data_dir と同じ形)
- `create_app()` の呼び出し元は `tests/test_ws.py`(str 固定値のみ、影響なし)、
  `tests/test_cli.py`(新規テストで str/Path 両方を確認)、`lobby.py` は
  `create_app()` を直接呼ばずボード用に別途 `create_lobby_app()` を持つので
  影響なし。既存呼び出し元への破壊的変更は無い
- `/static/images` を `/static` より前に置く理由はコード中にコメントで
  残っており(`app.py:108-109`)、`docs/Developer.md` の「なぜ」を書く流儀に
  沿っている
- `resolve_image_dir()` を `create_app()` 呼び出し前に評価しているので、
  存在しないデザイン名は `create_app()`(や `BackgammonServer` の構築)を
  経由せずに `ClickException` で止まる。`tests/test_cli.py` の
  `test_image_dir_not_found` はこれを実際に確認できている
- `tests/browser/board.test.mjs` の新規テストは `naturalWidth` での画像読込
  確認(既存の「盤面が描画される」テストと同じ手法)、`console_errors` の
  既存フィルタの再利用など、既存パターンをなぞっており、テスト専用の
  抜け道は作っていない。`node --test tests/browser/board.test.mjs` を
  1 回走らせ、新規 2 件を含む 11 件すべて通ることを確認した
- `ruff check .` / `mypy src` / `basedpyright` はいずれも 0 件
- 範囲: 変更は `__main__.py` / `app.py` / `paths.py`(docstring のみ)/
  `docs/Admin.md` / `CLAUDE.md` / テスト 2 ファイルに限られ、TODO-077 の
  仕様外の変更は見当たらなかった
