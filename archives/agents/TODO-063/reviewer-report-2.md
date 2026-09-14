# TODO-063 レビューの報告 2 巡目（reviewer）

対象: 2 巡目の修正後の作業ツリー（`lobby.py`・`lobby.js`・`lobby.html`・`test_lobby.py`・`lobby.test.mjs`・
`ytbg.toml`・`docs/Admin.md`・`docs/Developer.md`）と `implementer-report-2.md`。作業ツリーは書き換えていない。
一式のテストは走らせていない。実測は scratchpad で、一時の `YTBG_DATA_DIR` を使って行い、あと片付けも済ませた。

## 前回の指摘への対応

| 前回 | 結果 | 確かめたこと |
|------|------|--------------|
| 1. 起動後の iframe がエラーのまま | 直った | `lobby.js:96-99` は `listening` が偽から真に変わったときだけ `src` を入れる。カードを作るときは入れない。`listening()`（`lobby.py:169-182`）は子が動いているときだけ `127.0.0.1:<port>` へ接続する。ボードの WebSocket は切れても再接続する（`ws.js:64`）。そのため、別のタブで停止と起動が 3 秒以内に済み、このタブが偽を見逃しても、枠は古いページのまま戻る |
| 2. `server_id` の整数 | 直った | `lobby.py:59-61`・`106`・`116-119`。bool は `isinstance(val, bool)` で、float は型の判定で弾く。重複は `str()` で直したあとの値で判定する。テストは `test_load_config_int_server_id` とエラーのケース（`true`・`1.5`・`""`・`a/b`、`1` と `"1"` の重複） |
| 3. 絶対 URL でない `url` | ほぼ直った | `lobby.py:122-127`。ただし漏れがある（下の 1） |
| 4. 最初の読み込みの失敗で選択が消える | 直った | `show_main()` は保存しない。`refresh()` はカードを初めて作った回に選ぶ（`lobby.js:110-122`）。`post()` は fetch の失敗を拾う |
| 5. テストの抜け | 直った | 二重の start で PID が変わらないこと（`test_lobby.py:200-203`）、404（`:221-227`） |
| 6. 使われない名前 | 直った | `_log`・`app.state.procs` とも無い |
| 7. `templates` | 直った | `from .app import NoCacheStaticFiles, templates`（`lobby.py:36`） |

## 要修正

なし。

## 検討

### 1. ポートや host の書き方が誤った `url` が、まだ検証を通る。書き方によっては traceback になる

- 場所: `src/ytbg/lobby.py:122-127`
- 問題と実測:
  - `url = "http://[::1"` のとき、`urlsplit()` は `ValueError: Invalid IPv6 URL` を投げる。`ConfigError` に
    包まれないので、利用者には traceback が出る（`urlsplit` を単体で呼んで確かめた。lobby は起動していない）
  - `url = "http://h:99999/"`・`"http://h:abc/"`・`"http://exa mple/"` は、scheme と netloc があるので検証を通る。
    ところが、ブラウザの `new URL()` はどれも `TypeError` を投げる（node で実測）。そうなると `lobby.js:25-28` の
    `frame_url()` で前回の 3 と同じことが起き、一覧ページが全部のボードについて空になる（コードを読んで確認）
- 直し方の案:
  - `urlsplit(url)` と、戻り値の `.port` を読む処理を `try` で囲み、`ValueError` を `ConfigError` にする。
    `99999` と `abc` は `.port` を読むと `ValueError` になる（実測）
  - 空白を含む host まで弾くかは判断でよい。弾かない場合でも、JS の `make_card()` で `new URL()` の失敗をそのカードだけに
    とどめれば、ほかのボードは出る

### 2. Admin.md の文が 1 つにつながっている

- 場所: `docs/Admin.md:119-120`
- 問題: 「…「動作中」の 3 つ」のあとに句点が無い。同じ箇条書きの中で改行しているだけなので、表示すると
  「…の 3 つ **認証は無い。**」と 1 文につながる

### 3. lobby の外のボードとポートが重なったときの説明

- 場所: `docs/Admin.md:122-123`（「同じポートを設定に書くと、そのボードは起動できずに停止中になる」）
- 問題: `listening` はポートへ接続できるかしか見ない。そのため、子が起動に失敗して終わるまでの間に読み直しが
  当たると「動作中」になり、iframe に**外のボード**を読み込む。そのあと状態は「停止中」に戻るが、iframe は外のボードを
  出したままになる。Developer.md は「一瞬は動作中になる」とだけ書き、iframe のことには触れていない（コードを読んだ推論。
  実測はしていない）
- 直し方の案: Admin.md に「そのとき iframe には外のボードが出ることがある」と一言足す。挙動は「lobby の外のボードは扱わない」
  という決めごとの範囲なので、コードは直さなくてよいと考える

## 好みの範囲

### 4. 「起動中」を見るブラウザテストの読み方（`tests/browser/lobby.test.mjs:204-206`）

`wait_for` で「停止中」以外になるのを待ったあと、`status('b1')` を**もう一度読んで**から assert している。
時間の関係を並べると次のとおり。

- 起動を押すと、`post()` は POST の応答を受けて、すぐに `refresh()` の GET を送る。サーバは POST の中で子を起動し、
  応答の `status()` を返す。その間はミリ秒単位
- ボード（`python -m ytbg board`）が起動してから listen するまでは約 0.26 秒（前回の実測）
- 「起動中」の表示が次に変わるのは、3 秒ごとの読み直しで `listening` が真になったとき
- `wait_for` は 50 ミリ秒ごとに読む

このため、落ちるのは次のどちらかが起きたときに限られる。

- `wait_for` が返ってから、もう一度読むまでの数ミリ秒の間に、3 秒ごとの読み直しが「動作中」を描く
- listen より前に出ていた読み直しの応答が、`post()` の読み直しより遅れて届き、「停止中」を描き戻す

どちらも、起きる時間の幅はミリ秒単位になる。マシンが速くても、子の起動は数ミリ秒では済まないので、この関係は変わらない。
**普通に走らせて落ちることは、まず無いと判断した**（10 回連続では走らせていない）。気になるなら、もう一度読むのをやめ、
`wait_for` が返した値で assert すれば、前者の余地が無くなる（`const s = await wait_for(...); assert.equal(s, '起動中');`）。
「起動中」を返すことそのものは、`tests/test_lobby.py:215` が API の応答で決まった形で見ている

## 新しい問題が無かった点（確かめたこと）

- **状態を読むたびに接続すること:** ボードを `-d` 付きで起動し、`asyncio.open_connection` での接続と切断を 3 回繰り返した。
  uvicorn にも loguru にもログは 1 行も出なかった（実測）。接続は、動いている子にだけ `127.0.0.1` で張り、
  すぐ閉じる。3 秒ごとに、開いているタブの数 × ボードの数だけ接続が張られる。拒否も受け付けも手元で即座に済むので、
  `CONNECT_TIMEOUT_SEC`（0.5 秒）まで待つのは、backlog があふれたときくらい
- **listening の分岐:** `running` が偽なら接続しない。`OSError`・`TimeoutError` は偽になる。`wait_closed()` の
  `OSError` は握りつぶす。`status()` は `running` → `listening` → `pid` の順に読み、途中に await があるので、
  その間に子が終わると `running: true, pid: null` の組み合わせがありうる。一覧ページは `pid` を使わないので、影響は無い
- **JS の入れ直しの条件:**
  - 最初の読み込み: 動作中なら入れる
  - 起動中から動作中: 入れる
  - 動作中のまま: 入れない
  - 落ちたボード: 偽になる。次に真になったとき、もう一度入れる
  - 読み直しが重なって古い応答があとから届いた場合: 真 → 偽 → 真と見えて 1 回余計に読み直すことがある。表示が壊れるわけではない
  - 起動中の表示では、起動のボタンが押せず、停止のボタンは押せる
- **テストが壊したら落ちる形か:**
  - `test_start_stop:215`（起動直後の `listening` は偽）は、子の起動時間に対して十分に決まった形
  - `test_board_cannot_start` は、ポートを塞いだソケットにも `listening()` がつながりうる。ただし `running` が偽になるまで
    待ってから `listening` を見ているので、揺れない
  - `lobby.test.mjs` の選択の件は、`page.route` で `/api/boards` だけを止める。`waitForTimeout(500)` は 3 秒ごとの
    読み直しより短いので、「カードが無い」の assert は揺れない
  - implementer が壊して確かめた表は、分岐ごとに落ちるテストと対応している
- **docs:**
  - Developer.md の `running` / `listening` と iframe の `src` の説明は、実装と合っている
  - Admin.md の「パスだけの URL は書けない（WebSocket を `/ws` でつなぐ）」は、`ws.js:15` の `new URL("/ws", location.href)` と合っている
  - `ytbg.toml` と Admin.md の例は、どちらも整数の `server_id` になっている
