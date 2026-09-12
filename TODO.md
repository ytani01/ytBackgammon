# TODO

**残っている項目: TODO-037〜040。** これまでに 36 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-041` から。**

**TODO-020 で決めた設計の実装（TODO-023〜030）は、これで全部終わった。**
手元の 4 つのボードは 2026-09-12 に `.jsonl` へ移行済み
（旧 `.json` も消さずに残してある）。

TODO-037〜039 は、2026-09-12 に `src/` 全体を過剰実装の観点で読み直した
結果（15 件）を、性質ごとに 3 つへ分けたもの。合計でおよそ 370 行減る
見込み。**依存関係は増減しない。**

**着手する順は TODO-040 → 037 → 039 → 038。** 小さく確実なものから始め、
削除（037）を先にやって、集約（038）で触るコードを減らす。

---

## TODO-037. 呼ばれていないコードを消す

- [ ] `ui/checker.js` の `calc_z()` / `distance()` / `is_last_man()` /
      `get_available_points()`（T.B.D. のまま空を返す）
- [ ] `settings.js` の `CookieBase.save()`。呼び出しが無く、
      `if (Object.keys(this.data)) return;` で常に何もしない
- [ ] `board.js` の `clock_on()` / `clock_off()`
- [ ] `reset_clock` の経路。唯一の送り元 `PlayerClock.emit_reset()` が
      どこからも呼ばれていない。`message.py` の `DATA_TYPES` と
      `server.py` の `_handlers` から両方消す。
      **`Clock.reset()` 自体は `new_game()` と `set_clock_limit` が使うので残す**
- [ ] `rules/position.js` の `Position.empty()` / `count_of()`。
      テストからしか呼ばれていないので、`tests/js/position.test.mjs` の
      該当する `it` ごと消す
- [ ] `board.js` の `apply_sound_switch()` 内の `GlobalSoundSwitch` ブロック
      （`board_num` を読んで何もしない）、コンストラクタの
      `this.score = [0, 0]` の二重初期化
- [ ] コメントアウトされたまま残っている塊。**全部消す**（`board.js` と
      `ui/dice.js` にまたがる `dice_histogram` ~25 行も含む。表示先の
      `#dice-histogram` は `index.html` にも無い）。復活させたくなったら
      git から拾う

盤面の挙動は変わらないはずの削除だけを集めてある。`reset_clock` と
`Position` のメソッドはテストが参照しているので、**テストも一緒に直す**。

**`mylog.py` は触らない。** `exmsg()` と `setLevel(level=None)` はこの
リポジトリでは未使用だが、`mylog.py` は他でも使い回す形のモジュールなので、
ここだけの都合で削らない。

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |

削除でも `reset_clock` は登録表（`DATA_TYPES` / `_handlers`）から分岐が
減るので、「本当に死んでいるか」を見るレビューの担当を入れる。

---

## TODO-038. 同じ形の繰り返しをまとめる

- [ ] `main.js` の 14 個のラッパー関数。履歴用 9 個
      （`back2` / `back_all` / `fwd2` …）と board への委譲 5 個
      （`apply_sound_switch` など）。末尾の登録表へ直接書く（-90 行）
- [ ] `server.py` の `backward_hist()` と `forward_hist()`。
      `_hist.back()` / `forward()` 以外は同じなので 1 本にする（-35 行）
- [ ] `server.py` のハンドラ 6 個が `asdict(data)` で dataclass を dict へ
      戻して `GameInfo` へ渡している。`message.py` で型を付けた意味が
      ここで消えるので、**`GameInfo` 側を dataclass 受け取りにする**
      （`cube(CubeData)` の形。`gameinfo.py` が `message.py` に依存する）
- [ ] `ui/clock.js` の `ClockLimit extends BgText`。`new ClockLimit(this.board)`
      は board を **id の引数**に渡していて `this.board` は undefined、
      `el` も無いので、継承した機能は全部死んでいる。ただの class にする

**構造が変わるので、挙動が変わりうる。** 特に `GameInfo` の更新メソッドの
引数を変える件は、`tests/test_gameinfo_ops.py` と `tests/test_on_json.py` に
影響する。

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

---

## TODO-039. 手書きを標準機能に置き換える

- [ ] `settings.js` の `QueryStringBase` → `URLSearchParams`。
      実際に読んでいるのは `sound` 1 個だけ（-40 行）
- [ ] `board.js` の `get_dst_points()` にある「重複削除」の手書きループ →
      `[...new Set(dst_p)]`（-12 行）
- [ ] `ws.js` の `ws_url()` → `new URL("/ws", location.href)` で protocol を
      差し替える。`document.domain` は非推奨
- [ ] `index.html` の `<meta http-equiv>` 3 行（Pragma / Cache-Control /
      Expires）。今のブラウザは見ない。**消すかわりに、`app.py` の
      `index` の応答に `Cache-Control: no-cache` を付ける**
      （`/static` は `NoCacheStaticFiles` が付けているが、`index.html`
      自身には付いていない）

`QueryStringBase` を `URLSearchParams` に替えると、値の無い `?sound` の
扱いが変わる（`get()` が `null` ではなく空文字を返す）。
**今の扱いを保つ**こと。つまり `?sound`（値無し）は無視して鳴らし、
`?sound=何か` のときだけ止める。

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | implementer + verifier + reviewer |

---

## TODO-040. `-i` の既定値に対応するディレクトリが無い

- [ ] `__main__.py` の `--image_dir` の既定値が `images1` だが、
      `static/` にあるのは `images0a` `images1a` `images2` `images3` の 4 つ

`-i` を付けずに起動すると、画像が全部 404 になる。**既定値を `images1a` に
直す**（今の `images1` に一番近い名前で、README や `ytbg.sh` の例でも
使っている）。

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |

1 行の変更だが、既定値で起動できるようになるという挙動の変化なので、
確認は別の担当に分ける。

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-036.** README と docs/ の日本語を見直す](archives/todo/TODO-036.%20README%20と%20docs_%20の日本語を見直す.md)
- [**TODO-031.** 旧形式（~/ytbg-{server_id}.json）の読み込みを消す](archives/todo/TODO-031.%20旧形式（~_ytbg-{server_id}.json）の読み込みを消す.md)
- [**TODO-033.** README.md,とドキュメント類を整備](archives/todo/TODO-033.%20README.md,とドキュメント類を整備.md)
- [**TODO-032.** history フラグの付け方を見直す](archives/todo/TODO-032.%20history%20フラグの付け方を見直す.md)
- [**TODO-035.** LICENSE を置き、ファイル先頭の表記を揃える](archives/todo/TODO-035.%20LICENSE%20を置き、ファイル先頭の表記を揃える.md)
- [**TODO-034.** basedpyright の型チェックの水準を揃える](archives/todo/TODO-034.%20basedpyright%20の型チェックの水準を揃える.md)
- [**TODO-030.** 表示更新の経路を 1 本にする](archives/todo/TODO-030.%20表示更新の経路を%201%20本にする.md)
- [**TODO-027.** JS のルール層を純粋関数として切り出し、node --test を足す](archives/todo/TODO-027.%20JS%20のルール層を純粋関数として切り出し、node%20--test%20を足す.md)
- [**TODO-029.** DOM 生成を JS へ移し、onClick 属性をやめる](archives/todo/TODO-029.%20DOM%20生成を%20JS%20へ移し、onClick%20属性をやめる.md)
- [**TODO-028.** JS を ES Modules に分割し、継承階層を組み直す](archives/todo/TODO-028.%20JS%20を%20ES%20Modules%20に分割し、継承階層を組み直す.md)
- [**TODO-026.** メッセージを型付けし、on_json をディスパッチ表にする](archives/todo/TODO-026.%20メッセージを型付けし、on_json%20をディスパッチ表にする.md)
- [**TODO-025.** サーバを分割する（hub / history / storage / replay / app）](archives/todo/TODO-025.%20サーバを分割する（hub%20_%20history%20_%20storage%20_%20replay%20_%20app）.md)
- [**TODO-024.** gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す](archives/todo/TODO-024.%20gameinfo%20を%20dataclass%20にし、クロックを外し、保存を%20JSON%20Lines%20へ移す.md)
- [**TODO-022.** favicon が無く、初回ロードで 404 になる](archives/todo/TODO-022.%20favicon%20が無く、初回ロードで%20404%20になる.md)
- [**TODO-023.** デッドコードを消す](archives/todo/TODO-023.%20デッドコードを消す.md)
- [**TODO-021.** ブラウザでの動作確認の仕組みを作る](archives/todo/TODO-021.%20ブラウザでの動作確認の仕組みを作る.md)
- [**TODO-020.** モジュール構成とクラス構成を見直す](archives/todo/TODO-020.%20モジュール構成とクラス構成を見直す.md)
- [**TODO-019.** 履歴を削除する機能をメニューから使えるようにする](archives/todo/TODO-019.%20履歴を削除する機能をメニューから使えるようにする.md)
- [**TODO-018.** _history が上限なく伸び続ける（対応しない）](archives/todo/TODO-018.%20_history%20が上限なく伸び続ける.md)
- [**TODO-015.** サーバからの受信を gameinfo 1 本にまとめる](archives/todo/TODO-015.%20サーバからの受信を%20gameinfo%201%20本にまとめる.md)
- [**TODO-004.** save_data() のファイル I/O がイベントループを止める（対応しない）](archives/todo/TODO-004.%20save_data()%20のファイル%20I_O%20がイベントループを止める.md)
- [**TODO-017.** load_gameinfo() が毎回チェッカーを全部置き直す](archives/todo/TODO-017.%20load_gameinfo()%20が毎回チェッカーを全部置き直す.md)
- [**TODO-016.** 再接続するとクロックの動作中／停止中が復元されない](archives/todo/TODO-016.%20再接続するとクロックの動作中／停止中が復元されない.md)
- [**TODO-010.** プロトコルを一方向にするか決める](archives/todo/TODO-010.%20プロトコルを一方向にするか決める.md)
- [**TODO-009.** Flask + gevent から Starlette + uvicorn へ移す](archives/todo/TODO-009.%20Flask%20+%20gevent%20から%20Starlette%20+%20uvicorn%20へ移す.md)
- [**TODO-014.** バージョンを git tag に連動させる](archives/todo/TODO-014.%20バージョンを%20git%20tag%20に連動させる.md)
- [**TODO-013.** on_json の分岐ごとのテストを足す](archives/todo/TODO-013.%20on_json%20の分岐ごとのテストを足す.md)
- [**TODO-012.** on_json のクロック系の分岐を消す](archives/todo/TODO-012.%20on_json%20のクロック系の分岐を消す.md)
- [**TODO-007.** board.roll が使われていない](archives/todo/TODO-007.%20board.roll%20が使われていない.md)
- [**TODO-011.** ruff の指摘を解消する](archives/todo/TODO-011.%20ruff%20の指摘を解消する.md)
- [**TODO-008.** app_top() と top.html を消す](archives/todo/TODO-008.%20app_top()%20と%20top.html%20を消す.md)
- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
