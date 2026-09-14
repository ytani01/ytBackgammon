# TODO-063. 複数サーバーの制御

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort 記載なし | implementer + reviewer + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 記載なし | 27,480 | 79,141 | 30% |
| implementer | Opus 5 | medium | 58,779 | 269,337 | 41% |
| reviewer | Opus 5 | high | 34,632 | 194,924 | 21% |
| verifier | Sonnet 5 | medium | 21,297 | 94,050 | 8% |
| 合計 |  |  | 142,188 | 637,452 | 概算 $14.7 |

- implementer と reviewer は定義のモデルが sonnet。子プロセスの扱いと状態の分岐が込み入るので
  Opus 5 に上書きした。effort は定義の値（implementer medium、reviewer high）。
  verifier は定義のまま（Sonnet 5 / medium）
- main の effort はこのセッションで指定した記録が無いので「記載なし」とした
- implementer と reviewer は 2 巡ずつ動いた（2 巡目は同じ担当への追加の指示）
- 集計は決着のコミットの直前まで

## きっかけ

ytbg の複数のサーバを立ち上げ、すべてのボードを一覧できるサーバを作りたいと利用者から依頼があった。
起動・停止を制御でき、ytbg のサブコマンドとして作り、1 ページに iframe で並べる。個々のボードは
個々のサーバが制御する。

2026-09-15 に利用者と次のことを決めた。

- CLI はサブコマンドに分ける（`ytbg board` / `ytbg lobby`）。`hub` は `hub.py` の `ClientHub` と紛らわしいので使わない
- ボードの並びは TOML の設定ファイルで固定する。Web から足したり消したりはしない
- lobby は起動時に全ボードを子プロセスで起動し、lobby が止まったら全部止める。落ちたボードは自動で
  再起動せず「停止中」と出す。lobby の外で動いているボードは扱わない
- 個別の起動・停止は一覧ページのボタンで行う。コマンドで扱うのは lobby の起動と終了だけ。認証はしない
- iframe の URL は、既定では一覧ページのホスト名にボードのポートを付けたもの。設定の `url` で上書きできる
- 並べ方は今の `ytbg.html` と同じく、選んだ 1 面を大きく、残りを小さく
- `ytbg-boot.sh`・`ytbg-stop.sh`・`ytbg.html` は消す（Jitsi の埋め込みは無くなる）

## やったこと

- **`src/ytbg/__main__.py`** — click の group にし、元の `main` を `board` に移した（引数・既定値は同じ）。
  `lobby` は `-c`（既定 `ytbg.toml`）・`-p`（既定 5000）・`-d`（ボードにも渡す）。設定の誤りは
  `click.ClickException` で終了コード 1
- **`src/ytbg/lobby.py`**（新規）
  - `load_config()`: `[[board]]` を読み、必須キー・型・知らないキー・ポートの範囲・重複を検証する。
    `server_id` は整数も受けて文字列に直し、空と `/` を含む値は弾く。`url` は `http(s)` の絶対 URL に限り、
    ポートが不正なものと空白を含むものも弾く
  - `BoardProcess`: `python -m ytbg board ... -- SERVER_ID` を子として起動する。停止は SIGTERM から 5 秒で SIGKILL。
    起動と停止は `asyncio.Lock` で順に処理し、動作中への `start` は何もしない。終了コードをログに出す。
    `listening()` は子のポートへ接続できるかを見る
  - `create_lobby_app()`: lifespan で全部起動・全部停止。`/`・`GET /api/boards`・`POST /api/boards/{server_id}/start`・`/stop`
    （知らない id は 404）
- **`webroot/templates/lobby.html`・`webroot/static/js/lobby.js`**（新規） — 3 秒ごとに状態を読み、「停止中」「起動中」
  （プロセスはあるが listen していない）「動作中」を出す。iframe の `src` は listen が偽から真に変わったときに入れる
  （起動直後に読み込んでエラー画面のまま残るのを避けるため）。iframe には `?sound=off`。選んだボードは localStorage に覚え、
  最初の読み込みに失敗しても消さない
- **`ytbg.toml`**（新規） — `ytbg-boot.sh` と同じ 4 面
- **消した:** `ytbg-boot.sh`・`ytbg-stop.sh`・`ytbg.html`
- **文書:** `ytbg.sh` の usage、README、`docs/Admin.md`（board と lobby の起動、設定ファイル、一覧ページ、止め方、
  SIGKILL で子が残ること）、`docs/Developer.md`（lobby の構成と落とし穴）、`docs/Player.md`、CLAUDE.md の実行とテストの節
- **テスト:** `tests/test_lobby.py`（設定の読み込み、API での起動・停止と状態、二重の start、404、SIGTERM と SIGINT で
  lobby を止めたらボードも止まること、ポートが塞がったボード）、`tests/browser/lobby.test.mjs`（iframe の URL、
  大きく出すボードの切り替えと記憶、停止・起動で表示と iframe の読み直し）。`tests/browser/helper.mjs` の起動を `ytbg board` に

レビューを受けて直したもの:

- 停止から起動したボードの iframe がエラー画面のまま戻らなかった（listen を見る状態を足した）
- `url = "/board1/"` のような値が検証を通り、一覧ページが全部出なくなっていた
- `server_id` の整数、使われない `_log`・`app.state.procs`、`templates` の二重定義
- 2 巡目の検討: `url` の `ValueError` が traceback になる件、`lobby.test.mjs` の「起動中」を読み直してから assert していた件
  （`wait_for` の戻り値で見るようにした）、Admin.md の説明（main が直した）

あわせて、テストを走らせる回数の決まりを CLAUDE.md の「テスト」に移した。main のメモリの索引にしか無く、
サブエージェントには「10 回連続は判別力を見るときだけ」の 1 行だけが届いていた。そのため担当が
「10 回連続では走らせていない」を懸念として報告し、main がそれを verifier への依頼に書いてしまった（利用者の指摘で取りやめた）。

## 確かめたこと

- verifier: `uv run pytest` 328 件、ruff・mypy・basedpyright は指摘 0 件、`node --test tests/js/` 156 件、
  `node --test tests/browser/` 102 件がすべて通った（各 1 回）
- verifier が手で試した: 空いたポートの 2 面の設定で lobby を起動し、API での停止・起動（起動中を経て動作中）、
  SIGTERM でボードも消えること、ポートが塞がったボードが停止中になり理由が出ること、誤った設定がエラーの文で止まること、
  `--help` が Admin.md の表と合うこと
- main が手で試した: lobby のプロセスグループへ SIGINT を送ると（Ctrl+C と同じ）、ボード 2 面を止めてから終わり、
  プロセスが残らない
- 壊して落ちること: implementer が 24 通り、verifier が重ならない 3 通り（`url` のポートの検証、`port` の重複、404）

## 残ること

- 一覧ページの見た目（大小の配置、ボタンの色）は目視していない。DOM の class と大きさはブラウザテストで見ている
- 一覧ページの `post()` の fetch が失敗したときの処理はテストしていない
- `tests/browser/helper.mjs` の `start_server()` の `stop()` は `Promise.race` の `sleep(5000)` のタイマーが残り、
  テストファイルごとに最大 5 秒余計に待っている可能性がある（implementer が気づいた。範囲外なので直していない）

## 分担の振り返り

- **各担当が見つけたこと:** reviewer は 1 巡目で、起動し直したボードの iframe がエラー画面のまま戻らない件を
  実際に試して見つけた（ブラウザテストは状態の文字しか見ておらず、implementer も verifier も捕まえられない種類）。
  2 巡目では `url` の検証の抜けを見つけた。verifier は新しい問題を見つけなかったが、Ctrl+C を試していないことを
  挙げ、main が補った。implementer は範囲外の `helper.mjs` のタイマーに気づいた
- **見込みとの食い違い:** 担当は見込みどおり。レビューが 2 巡になったのは、1 巡目の直しで状態の分岐（listen）と
  JS の読み直しの条件が新しく入ったため。verifier に 10 回連続を依頼したのは誤りで、利用者の指摘で 1 回にした
- **次に同じ規模なら:** 子プロセスや画面の読み込みの順番が絡む項目では、reviewer に「実際に起動して試す」ことを
  依頼に書く（今回の要修正は、コードを読むだけでは出ず、試して出た）。2 巡目のレビューは、直した差分だけに絞る依頼にして
  トークンを抑える。テストの回数は CLAUDE.md の「テスト」に従い、担当の「N 回では走らせていない」を依頼に持ち込まない
