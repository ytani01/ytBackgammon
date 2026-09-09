# TODO-002. ruff と mypy の指摘を解消する

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 36,212 | 100,204 | 50% |
| implementer | Opus 5 | medium | 9,830 | 127,896 | 27% |
| reviewer | Opus 5 | high | 2,843 | 60,768 | 13% |
| verifier | Sonnet 5 | medium | 8,748 | 68,815 | 10% |
| 合計 |  |  | 57,633 | 357,683 | 概算 $6.4 |

- implementer は定義のモデルが sonnet。改名の波及と型注釈の判断が要るので
  Opus 5 に上書きした（`effort` は定義の `medium` のまま）
- reviewer も定義のモデルは sonnet。挙動が変わりうる点を見る担当なので
  Opus 5 に上書きした（`effort` は定義の `high`）
- verifier は定義のまま（sonnet / `effort medium`）
- main の `effort` は記録に残らない。立てたときの見込みどおり `high` として書いた
- 立てたときの見込みは「Sonnet 5 / effort high、implementer + verifier」で、
  着手時に上記へ書き直した（`todo-workflow` の「着手時に見込みの行を
  書き直してよい」に従った）

## きっかけ

TODO-001 で ruff と mypy を入れたが、既存のコードに対する指摘はそのままに
してあった。着手時点で ruff 38 件、mypy 33 件。

## 決めたこと

着手前に方針を 3 つ決めた。

- **安全に直せるものだけを直す。** 挙動が変わりうるものは今回やらない
- **モジュール名は snake_case に改名する**（見送る案もあったが改名を選んだ）
- **確認とは別にレビューも入れる。** 分岐の統合や型注釈は、
  「ruff が通ったか」を見ても意味が変わったことは捕まえられない

## やったこと

### モジュール名を snake_case にした（N999 3 件）

- `src/ytbg/MyLogger.py` → `src/ytbg/my_logger.py`
- `src/ytbg/ytBackgammon.py` → `src/ytbg/yt_backgammon.py`
- `src/ytbg/ytBackgammonServer.py` → `src/ytbg/yt_backgammon_server.py`

`git mv` で改名し、import・docstring を追随させた。
`ytBackgammonServer.py` の docstring は `ytBackgammon.py` と誤記していたので、
あわせて直した。**クラス名（`MyLogger` / `ytBackgammon` /
`ytBackgammonServer`）とプロジェクト名の `ytBackgammon` は変えていない。**
`CLAUDE.md` の「構成」の節も新しいパスに直した（49・52 行）。

### そのほかの ruff の指摘

- I001（2 件）import の並び、PLR2044（3 件）空コメント、C408（2 件）
  `dict()` → dict リテラル、PLR1711（2 件）末尾の裸の `return`、
  RUF059（1 件）未使用の `fwd_hist_len`
- EXE001（2 件）— `my_logger.py` と `yt_backgammon_server.py` は import
  専用なので shebang を消した（`chmod +x` はしていない）
- PTH123（2 件）— `open()` を `Path.open()` に
- SIM114（1 件）— `get_logger()` の 2 分岐を `or` で統合。
  **`type(debug) == int` は `isinstance` にしていない。** `bool` は `int` の
  サブクラスなので、`isinstance` にすると `debug=True` が `setLevel(True)`
  （= レベル 1）になって挙動が変わる
- UP031（1 件）— `_datafile_path` の組み立てだけ f-string に

`ruff check --fix` は使ったが `--unsafe-fixes` は使っていない。

### mypy の `Any | None` 24 件

`yt_backgammon.py` の `self._gameinfo = None` が原因だった。
`self._gameinfo: dict[str, Any] = {}` にした。`_gameinfo` を `None` と
比較している箇所も、真偽判定している箇所もコード中に無い。

### コメントを 2 箇所足した

reviewer の指摘を受けたもの。どちらもコメントだけで、コードは変えていない。

- `yt_backgammon_server.py:362` — PLR2044 で消した空コメント 3 行は、
  `on_json()` の中で「`return` で抜ける分岐群」と「`return` せずに
  落ちていく分岐群」の境目だった。中身のある 1 行に置き換えた
- `my_logger.py:68-70` — 統合した `or` の条件に、後半がなぜ要るかと、
  `isinstance` にしてはいけない理由を書いた。この注意は `TODO.md` に
  書いてあったが、決着すると archives へ移ってコード側に残らないため

## 確かめたこと

ruff は 38 件 → **19 件**、mypy は 33 件 → **9 件**。
残りはいずれも「今回やらないと決めたもの」だけであることを、件数ではなく
出力の中身で確かめた。

- 改名が機械的な置換だけか — `git diff -M` を 1 件ずつ目視。旧ファイル名の
  参照が `.sh` / `.html` / `.js` / `README.md` に残っていないことも確認
- **保存ファイルの中身が変わっていないこと** — `HOME` を差し替えた環境で
  `~/ytbg-1.json` のコピーを読み込ませ、`save_data()` で書き戻して `diff`。
  **バイト単位で一致**。`Path.open()` 化と f-string 化の影響が無いことの確認。
  implementer と verifier が別々に組み立てて再現した
- **SIM114 の統合で挙動が変わらないこと** — 統合の前後を関数に切り出し、
  `True` / `False` / `0` / 生の int / float / `nan` / `None` / 文字列など
  20 種類の値で `setLevel()` に渡る値を比較。全件一致
- 消した `return` が 2 つとも関数の末尾だったこと（途中の早期脱出は
  `while` の `break` で、`return` ではない）
- `Path.open()` の例外の型が組み込み `open()` と同じこと。差が出るのは
  空文字パスのときだけで、`path_name` は必ず `self._datafile_path` なので
  到達しない
- 追加したコメントが本当にコメントだけか — tokenize で機械的に照合し、
  実行されるコードが変わっていないことを確認
- `uv run ytbg --help`、サーバの起動、`/` `/p1` `/p2` が 200 を返すこと。
  利用者のサーバ（5001〜5004）は使わず、空きポートと未使用の `server_id` で試した

## 残ること

今回やらないと決めたもの。**ruff 19 件、mypy 9 件が残っている。**

- **UP031 17 件** — すべて `hist_ent2str()` の中。保存ファイルの中身そのもので、
  `%d` と `{}` では float が来たときの結果が違う
- **BLE001 2 件** — `load_data()` / `save_data()` の `except Exception`。
  捕まえる例外を絞るのは挙動の変更になる
- **mypy 7 件** — `__main__.py` のグローバル `svr = None`。`None` の判定を
  足すと挙動が変わる
- **mypy 2 件（`__class__`）** — これは**直せない**。mypy がメソッド本体の
  暗黙の `__class__` セル参照を持っていないため、
  `class A:` `def __init__(self):` `__class__.x = 1` という最小の例でも
  同じエラーが出る（mypy 2.3.1 で implementer と reviewer が別々に再現）。
  消すには `__class__._log` を明示的なクラス名に書き換えるしかないが、
  `__class__._log` に入れるのは `CLAUDE.md` に明記された書き方なので残した。
  `# type: ignore` も、慣習どおりの書き方に注釈を付けて回ることになるので
  入れていない

そのほか、範囲外として記録に残ったもの。

- `yt_backgammon.py` の `CONTEXT_SETTINGS` はどこからも使われていない
  （click を使うのは `__main__.py` だけ）
- `__main__.py` に 78 桁を超える行が 3 本ある。TODO-001 由来で、
  `E501` が有効になっていないので指摘は出ていない
- `my_logger.py` の `type(debug) == int` は E721 に該当しうる。
  `extend-select` に `E` を足すと出る

## 分担の振り返り

分担にした理由と各担当の報告は
[archives/agents/TODO-002/](../agents/TODO-002/README.md) にある。

### 各担当が何を見つけたか

- **implementer** — 依頼文の前提の誤りを見つけた。「`__class__` の指摘は
  `yt_backgammon.py` では出ていない」と書いてあったが、実際は最初から
  2 件出ていた。原因（mypy の未実装）を最小の再現例まで詰めて報告した。
  main が `mypy` の出力を `tail -30` で切って読んだのが誤りの元
- **reviewer** — 要修正は 1 件（`CLAUDE.md` の旧ファイル名）だけで、
  **挙動が変わる変更は見つからなかった**。ただし「検討」として挙げた
  2 件は、どちらも実際に価値があった。消した空コメントが
  `on_json()` の構造の区切りだったこと、統合した `or` に「なぜ 2 つ要るか」
  が書かれていないこと。前者は `on_json()` 全体を読まないと分からない
- **verifier** — 指摘の残件数と内訳、改名の差分、保存ファイルのバイト一致を
  自分で組み立て直して再現した。`__class__` が最初から 2 件だったことも
  worktree で裏を取った。追加したコメントが本当にコメントだけかを
  tokenize で機械的に照合したのは、目視より確かな確かめ方だった

### 見込みと食い違ったのはなぜか

**立てたときの見込み（Sonnet 5 / implementer + verifier）では足りなかった。**
「lint の掃除」という見た目から軽く見積もっていたが、中身は
分岐の統合・型の初期値の変更・3 ファイルの改名で、
「動くか」だけでは捕まえられないものが混ざっていた。
着手時に指摘の中身を数えて初めて分かったので、
**見込みを立てる時点で `ruff check --statistics` を一度走らせておけば、
最初から正しく見積もれた**。

reviewer を足した判断は当たった。要修正は 1 件だけだったが、
「検討」2 件はどちらも採用しており、reviewer 無しなら
コメントの無い `or` 条件が残っていた。料金の割合は 13% で、
一番安い担当でもある。

### 次に同じ規模の項目をやるなら

- **main が 50%（$3.2）を占めた。** 担当 3 人の合計より多い。
  main の仕事は方針決め・依頼文・報告の読み取りで、これ自体は減らせないが、
  **依頼文に事実誤認を書いたせいで、implementer と reviewer と verifier の
  3 人が同じことを確かめ直した**（`__class__` が何件か）。
  依頼文に書く「実測の前提」は、切った出力から書かない
- **同じ規模なら、この 3 人の編成をそのまま使う。** 減らすなら verifier
  ではなく reviewer を外したくなるが、逆。今回は reviewer の指摘が
  成果物を良くした一方、verifier の再確認（追加コメント分）は
  コメントだけの変更に対して重かった。**コメントだけを足したときの
  再確認は、依頼を 3 点に絞って短く回す**のが良い（今回そうして
  0.1 ドル程度で済んだ）
- implementer を Opus 5 に上げたのは妥当だった。改名の波及、
  型注釈の影響範囲、`__class__` の原因究明はいずれも判断が要る
