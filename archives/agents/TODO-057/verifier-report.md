# TODO-057 確認の報告（verifier）

## 走らせた検証

文書だけの項目なので、テスト一式は走らせていない（管理者の指示の範囲外）。
代わりに、文書の記述をコードと実行で照らした。

| 確かめたこと | 方法 | 結果 |
|---|---|---|
| ログの `{}` と例外の説明 | `mylog.py` の `loggerInit(False)` のもとで DEBUG を 4 通り呼ぶスクリプト（scratchpad） | 説明と一部食い違う（下の 2-1）。exit=0 |
| uvicorn の ping の既定 | `inspect.signature(uvicorn.Config)` | `ws_ping_interval: 'float | None' = 20.0`。`uvicorn.run()` は上書きしていない（`src/ytbg/__main__.py:51-53`） |

備考: `uv run` を叩いたときに editable インストールが再ビルドされた
（`Uninstalled 1 package` / `Installed 1 package`）。`.venv` の中だけで、作業ツリーの差分は増えていない。

## 変更されたファイル

`git status --short`:

```
 M AGENTS.md
 M CLAUDE.md
 M docs/Developer.md
```

指示の範囲（CLAUDE.md / docs/Developer.md / AGENTS.md）と一致。他のファイルの変更は無い。
CLAUDE.md の追加行は、冒頭の参照・Admin.md への参照・見出し 2 つ・Developer.md への参照・
`design-4.md` の注意・ログの慣習の短縮だけで、テストの節の本文は変わっていない。

## 1. 消した説明の判定

変更前 CLAUDE.md の削除行（504 行）を 1 つずつ見た。

### (d) に当たるもの

**無し。** 順番の縛り・テストで守られない点・既知の不具合・コードに書かれていない理由は、
Developer.md か Admin.md に残っている。

主な対応（抜粋）:

- (a) Developer.md: ping・再接続・差分を埋めない / 数に直して送る / broadcast が遅いクライアントを待つ /
  `from_dict()` の `KeyError` と `LOAD_ERRORS` / `data` 必須・型の照合・`list()` で写さない /
  `turn` が -1 に変わったときだけクロックを止める・履歴の操作では止めない / 予測で `clock_state` と
  `last_op` を渡さない / 続けて押した分が消える件・Roll ボタンが再表示される件 / `Drag` の外す順番 /
  音の決め方 / `History.add()` が進む側を捨てる / 「履歴を削除」を `Replayer.run()` に通す /
  `ensure_ascii` / `sw` の初期値・`active` を保存しない・ハンドラが自分で保存 / 素の `board` /
  画像の読み込み順と `wait_images()` / id 属性 / `checker_src`・`cube_src_y` / `log.js`⇔`settings.js` /
  `?sound=` / `?ts=` と `<meta>` をやめた理由 / `loggerInit` / f-string の件 / mypy と basedpyright の食い違い
- (b) Admin.md: タグの無い clone で `0.1.devN`（`docs/Admin.md:18-19`）/ `-d` と uvicorn のログ（`:109-112`）/
  旧 `.json` を読まない・消さない（`:96-100`）/ 画像ディレクトリとファイル名を揃える（`:55-61`）
- (c) コードで分かる: 名前付き操作の受け付け条件の表（`src/ytbg/gameinfo.py:204-329` の各 `return False`）/
  クロックの切り替え先（`server.py:411-414, 442, 451, 484, 529-530, 544`）/ 受信ループの例外ごとの
  続行・切断（`app.py:96-116`）/ `turn` の値の意味（`gameinfo.py:122`）/ `Clock.cur()` が
  `PlayerClock.update()` と同じ計算であること（`clock.py:15`）/ roll の回転と turn -1（`board.js:716-724`）/
  `move` の `score` と turn -1（`gameinfo.py:267`）/ `[tool.uv] cache-keys`（`pyproject.toml`）

### (c) としたが迷ったもの

1. **n 手の `back` / `fwd` は走っている間 cancel できない（JS は n = 1 しか送らないので待つのは 1 手分）。**
   `replay.py:89-104` の docstring は「その場で最後まで走らせる」までで、「cancel できない」「n が大きいと
   待たされる」は明記されていない。Developer.md（履歴の節）も Task にしない理由だけ。影響は小さい
2. **`gameinfo` が届く前は、盤面を読む操作は何もしない（名前・クロック・履歴は送る）。**
   `actions.js:518`、`board.js:405, 425, 534, 549, 812` の `=== undefined` の分岐で読めるが、
   「どれを送り、どれを送らないか」という線引きは一覧にしないと見えない
3. **積み順を決めているのは `Board.checker_order()` だけ。** `board.js:424-453` で分かるが、
   「ここだけ」という保証は grep しないと分からない。TODO-059 でこの関数を移すので、そのとき効く可能性がある

### 意味が変わって移ったもの（判断が要る）

- 変更前: 「`score` / `playername` / `cube` / `turn` は `apply()` が毎回 `gameinfo` から書き直すので、
  **画面の方が新しい値は 1 往復ぶん巻き戻る**（他のクライアントの変更が飛んでいる間だけ起きる）」
- 変更後（`docs/Developer.md:230-233`）: 「予測を表示してから返事が届くまでの間に、他のクライアントの
  操作による `gameinfo` が届くと、**予測で変えた表示がいったん戻る**」

変更後の記述は、今のコードの流れ（`actions.js` の予測 → `apply()` → 他の `gameinfo` 到着で置き換え）と
矛盾しない。ただし変更前とは別の現象を書いている。変更前の「画面の方が新しい値」は、表示部品が値の写しを
持っていた頃（TODO-052 より前）の話に読めるが、**今のコードで変更前の現象が起きるかは判断できない**
（再現を試していない）。消してよいかは管理者の判断。

## 2. 足した部分とコードの照合

合っていたもの（根拠）:

- 再接続 1 秒から倍、上限 10 秒: `ws.js:5-7, 66-67`
- ping 20 秒: 上の実行結果
- `LOAD_ERRORS` に `TypeError` が無い: `storage.py:39-40`（`OSError, UnicodeDecodeError, JSONDecodeError, KeyError, IndexError`）
- `broadcast()` の `asyncio.gather()`: `hub.py:85-87`
- `_type_ok()` の bool / float / `list[X]`: `server.py:691-713`
- `list()` で写すのは受け取る側: `message.py:66` のコメント、`clock.py:53-61`、`gameinfo.py:110`
- `turn` が -1 に変わったときだけ止める: `server.py:578-580`（`turn0 != -1 and ... == -1`）
- `clear_hist` を `Replayer.run()` に通す: `server.py:354`
- `History.add()` が必ず `_fwd_hist` を捨てる: `history.py:70-71`
- `ensure_ascii=False` と `encoding='utf-8'`: `storage.py:84, 89, 122`
- `sw` の初期値 `True`: `clock.py:41`、`from_dict` も `sw=True`（`:174`）。Clock のチェックボックス既定 checked: `index.html:60`
- `active` を保存しない: `clock.py:152-165`
- 持ち時間・sw をハンドラが保存: `server.py:510, 532`
- 音: move は turn を見ない・`moves` の `p >= 26` でヒット（`board.js:756-764`）、手番の音は
  `opening` / `end_turn` のときだけ許し `set_turn()` が turn 0/1 で鳴らす（`board.js:733-738, 346-380`）
- `wait_images()` は `dom.js:277` に定義、`main.js:117` で呼ぶ。`build_dom()` はモジュール評価時（`main.js:13`）。
  Developer.md の「`dom.js` の `wait_images()`」は定義の場所として正しい（変更前 CLAUDE.md は「`main.js` の」と書いていた）
- `Drag` が駒を外してから `drop_checker()` を呼ぶ: `drag.js:104-120`。`checker_src` / `cube_src_y`: `drag.js:27-29, 87, 137`
- `log.js` ⇔ `settings.js` の相互 import: `settings.js:4`、`log.js:8`
- `?sound=` は鳴る側: `settings.js:17-19`（`get("sound") || undefined` で空文字が `undefined`）
- `Cache-Control: no-cache` を `/static` と `index.html` に: `app.py:43, 78`
- `loggerInit` を呼ばないと DEBUG が stderr: 実行はしていない（変更前からの記述）

### 2-1. 食い違い（変更前の CLAUDE.md からそのまま移ったもの）

**ログの `{}` の説明が実際の挙動より広い。** `docs/Developer.md:459-462` と CLAUDE.md の「書き方の慣習」
（「リテラルの `{` `}` を書くと抑制される水準でも例外になる」）。
`loggerInit(False)`（DEBUG を抑制）で試した出力:

```
literal braces, no args OK
literal braces + args KeyError 'x'
count mismatch IndexError Replacement index 1 out of range for positional args tuple
extra args OK
```

- 引数を渡さなければ、リテラルの `{` `}` があっても例外にならない（loguru は引数があるときだけ `format()` する、と推定）
- `{}` より引数が**多い**ときも例外にならない。例外になるのは足りないとき

「抑制される水準でも文字列を組み立てるので例外になる」という要点は合っている。条件の書き方を直すかは管理者の判断。

### 実行して確かめていないもの

- 「掴んだ駒を外す順番を逆にしてもテストは通る」「`wait_images()` を外してもテストは通る」
  「Roll を押した直後に ▲ を押すと Roll ボタンが再表示される」: ブラウザテストを壊して走らせてはいない。
  変更前 CLAUDE.md の記述を移したもので、今回の差分で意味は変わっていない
- 「続けて押している途中で返事が届くと消えることがある」: `actions.js:95-111, 530-538` の流れと矛盾しないことだけ見た

## 3. 辿り着けるか

- CLAUDE.md の `[docs/Developer.md](docs/Developer.md)` は CLAUDE.md（リポジトリ直下）からの相対パスで、ファイルは存在する
- AGENTS.md は `docs/Developer.md` と `CLAUDE.md` の両方を読むように書き換わっている
- CLAUDE.md が名前で指す Developer.md の節「型チェックと lint」は存在する（`docs/Developer.md:437`）
- CLAUDE.md に残ったテストの節は、`emit_msg()`・`opening`・`move`・`end_turn`・`put_checker`・`shown_dice()` など
  コードの名前だけを前提にしており、「上の」「下の」で消えた節を指す箇所は無い
- 懸念（根拠は無い）: Developer.md は自動では読み込まれない。サブエージェント定義（`~/.claude/agents/*.md`）は
  CLAUDE.md には触れるが Developer.md には触れていないので、担当が実際に読むかは CLAUDE.md の
  「実装やレビューの前に読むこと」の 1 文に頼る

## 4. TODO 番号と書式

- `grep -n "TODO-" docs/Developer.md`: 0 件
- 見出しは `#` 1 つ → `##` → `###` で、飛びは無い（`## クロック` を新設、`### 気をつけること` が 2 か所、`### 音とダイスの回転` を新設）
- 箇条書きの続き行は 2 字下げで揃っている。表と mermaid は差分で触っていない
- 重複: `?sound=` の説明は CLAUDE.md の `sound.test.mjs` の項と Developer.md の両方にある（害は無い）
