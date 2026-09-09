# TODO-011 レビュー報告（reviewer）

対象: `git diff`（未コミット）の `src/ytbg/yt_backgammon_server.py`。
確認したもの: 変更後のソース、`git show HEAD:` の変更前ソース、`ytbg.js` の
`emit_msg()` 呼び出し、`flask_socketio/__init__.py` の例外処理、
`~/ytbg-1..4.json` の実データ 62 エントリ、`uv run ruff check .`（全通過）、
`uv run pytest`（10 passed）。

---

## 要修正

### 1. `yt_backgammon_server.py:263-264` のコメントが事実と違う

```python
        except OSError as e:
            # 書き込みの失敗だけを拾う。hist_ent2str() の型の誤りなどは
            # 握りつぶさずに上へ返す (TODO-011)
```

**問題**: 「hist_ent2str() の型の誤りなどは握りつぶさずに上へ返す」が、この
変更の結果であるかのように読める。しかし `save_data()` は `try:` の**前**で
`for h in self._history: j_str += self.hist_ent2str(h)` を回しており、
`try` が囲んでいるのは `Path(path_name).open("w")` と `f.write(j_str)` だけ。

**根拠**: `git show HEAD:src/ytbg/yt_backgammon_server.py` の同じ関数でも
`hist_ent2str()` の呼び出しは `try` の外にある。つまり `hist_ent2str()` の
`ValueError` / `KeyError` / `TypeError` は**変更前から上へ抜けていた**。
今回の変更で挙動が変わるのは `open()` / `write()` が投げる非 OSError だけ
（実質 `UnicodeEncodeError` 程度）。

**補足**: 依頼文の「`save_data()` で OSError 以外が上へ抜けるようになった」
という前提自体が成り立っていない。コメントを実態に合わせるか、
本当に握りつぶしたくないなら `hist_ent2str()` を `try` の中へ入れるかの
どちらか。

---

## 検討

### 2. `yt_backgammon_server.py:288-289` のコメントが拾う範囲より広い

```python
        except (OSError, json.JSONDecodeError) as e:
            # 初回起動ではファイルが無い (FileNotFoundError)。中身が壊れて
            # いる場合も、空の履歴として始める (TODO-011)
```

「中身が壊れている場合も、空の履歴として始める」は成り立たない場合がある。
実測（`load_data()` を直接呼んだ）:

| ファイルの中身 | 結果 |
|---|---|
| 不正な UTF-8 バイトを含む | `UnicodeDecodeError` が上へ抜ける |
| `{"foo": 1}`（`history` キー無し） | `KeyError: 'history'` が上へ抜ける |
| JSON として壊れている | `(0, 0)`（コメントどおり） |

`load_data()` は `__init__()` から呼ばれる。`__init__()` は `main()` の中で
ハンドラの外から呼ばれるので、**この 2 つはサーバが起動しないことを意味する**
（トレースバックで落ちる）。コメントを実態に合わせるか、拾う範囲を広げる。

なお `UnicodeDecodeError` の起きやすさは低い。`hist_ent2str()` は
`playername` を `json.dumps()`（`ensure_ascii=True`）で書くので保存内容は
ASCII になり、この環境では `open()` の encoding が UTF-8 だった
（`LC_ALL=C` でも `f.encoding == 'utf-8'`。Python 3.14.7 で実測）。
手で編集した場合など。

### 3. `data['history']` / `data['fwd_hist']` の KeyError をこの項目で直すか

**意見: この項目で一緒に直すのが妥当。** 理由:

- `TODO.md` の TODO-011 の節が既に「`data['history']` が無いときの
  `KeyError` が要る。**何を拾って何を落とすかを決める**」と書いている。
  BLE001 を直すことと「何を落とすか決める」ことは同じ作業で、
  片方だけ決めると `load_data()` の例外の扱いが中途半端になる
- 結果が「サーバが起動しない」なので軽くない

ただし**どう直すかは別の判断が要る**。壊れたファイルを黙って捨てて空履歴で
始めると、保存済みの棋譜が失われる（`__init__()` は `hist_len < 1` で
`add_history()` を呼び、次の `save_data()` でファイルを上書きする）。
「起動時に落とす」のが望ましいという判断もありうる。範囲が広がるなら
「`load_data()` の壊れたファイルの扱いを決める」で別項目にしてよい。

### 4. 例外が抜けたあとの `_history` の状態（変更前からの挙動）

依頼にあった「サーバが落ちないか、履歴が壊れないか」の確認結果。
**いずれも変更前と同じ**だが、記録として残す。

- **サーバは落ちない**（`on_json()` 経由の場合）。
  `flask_socketio/__init__.py:860-867` が `except:` で拾い、
  `default_exception_handler`（`__main__.py` の `default_error_handler`）へ
  渡す。`svr.on_error()` がログに出して終わる
- **履歴は壊れたまま残る**。`add_history()` は `self._history.append()` の
  **後**に `save_data()` を呼ぶので、`hist_ent2str()` で落ちるエントリが
  `_history` に残る。実測で、**以後の `save_data()` が毎回同じ例外で失敗し、
  そのプロセスの間ずっと保存ファイルが更新されなくなる**
- `on_json()` の末尾の `emit('json', msg, broadcast=True)` がスキップされる
  ので、その操作が他のクライアントに届かない
- `backward_hist()` / `forward_hist()` は `_repeat_flag = False` の**後**に
  `save_data()` を呼ぶので、フラグが立ったままにはならない
- `__init__()` 経由では、`add_history()` は `hist_len < 1` のときだけ呼ばれ、
  そのとき `_history` は空で `gameinfo` は `init_gameinfo()` の結果なので、
  `hist_ent2str()` は落ちない

実測（`set_gameinfo` にクライアントの `gen_gameinfo()` 相当を渡した）:

```
2) set_gameinfo(client shape) -> KeyError 'playername'
   _history len after failure = 2
   subsequent save_data -> KeyError 'playername'
```

---

## 問題なし（確認済み）

### 5. `%d` → `:d` の判断は妥当

`:d` を使うのは `sn` / `game_num` / `match_score` / `turn` /
`cube.side` / `cube.value` の 6 つ。クライアントからこれらに値が入る経路を
辿った結果、**float が入り込む経路は無い**。

- `sn` は `add_history()` が `self._cur_sn` で上書きするので、クライアントの
  値は使われない
- `set_score` は `parseInt()`（`ytbg.js:962`。ただし `score` は `%s` 側）
- `set_turn` の `turn` は呼び出し 7 箇所すべてが整数リテラルか
  `1 - this.player`（`ytbg.js:1113, 1949, 2164, 2170, 2177, 2188, 2567`）
- `cube` の `side` / `value` は `Cube.emit()`（`ytbg.js:1251`）で、
  プレーヤー番号とキューブの値
- `game_num` / `match_score` はサーバ側で書き換える箇所が無い
- **唯一 `set_gameinfo` だけが任意の値を通す**（`ytbg.js:3523` の
  `read_gameinfo()` = 利用者が選んだ JSON ファイルをそのまま送る）。
  ただしこの経路は `:d` 以前に既に壊れている: `gen_gameinfo()`
  （`ytbg.js:3449-3492`）は `board.checker` ではなく `board.point` を出力し、
  `playername` に `this.gameinfo.board.player_name`（存在しないキー →
  `undefined` → JSON から消える）を入れる。実測で `KeyError: 'playername'`
  になる。**float の心配より前に、この経路は今も動いていない**（別項目向き）

### 6. `%s` → `{}` は出力が変わらない

実データ `~/ytbg-1.json`〜`ytbg-4.json` の `history` + `fwd_hist` 全 62
エントリで、変更前の実装と変更後の実装の出力が**バイト単位で一致**すること
を確認した（`format(x, '')` は `str(x)` に落ちるため。json が生む型は
dict/list/str/int/float/bool/None だけで、どれも `__format__` が既定）。

`str(list)` を JSON として書き出す危うさ（要素が str なら `['a']`、bool なら
`[True]` になり JSON として不正）は残るが、**変更前と同じ**なのでこの項目の
対象外。

### 7. 中間変数は周りの書き方に合っている

`new_game()`（`yt_backgammon_server.py:62-73`）が `score0` / `player0_name` /
`clock_limit0` のように同じ形で局所変数へ取り出している。ruff の
line-length 78 も全通過。

---

## テスト

### 8. 保存ファイルの中身を固定するテストが無い（検討）

`TODO.md` の「直す前後で保存ファイルの中身が変わらないことを確かめる」は、
既存の `tests/test_save_load.py::test_save_and_load_roundtrip` では担保
できない。往復（save → load）が成立するかしか見ていないので、書式が
変わっても往復が通れば緑になる。`hist_ent2str()` の出力そのものを 1 エントリ
分だけ突き合わせるテストがあると、TODO-009 で通信層を入れ替えるときにも効く
（TODO-009 で「保存の形式と `save_data()` の呼び方は同期のまま移す」と
決めているので、固定する価値がある）。

### 9. 例外の範囲を変えたのにテストが無い（検討）

壊れた JSON を `load_data()` に渡して `(0, 0)` が返ることを見るテストは、
既存の `test_load_data_missing_file_returns_zero` と同じ形で 1 本書ける。
上の 3.（`KeyError` をどうするか）を決めたら、その決定もテストで固定できる。

---

## 好みの範囲

### 10. 中間変数の名前

`new_game()` は `player0_name` / `player1_name`。`name0` / `name1` は
それより短い。揃えるなら前者だが、78 桁に収める都合もあるので許容範囲。

---

## 範囲

指示に無い変更は混ざっていない。`hist_ent2str()` の 17 箇所、`save_data()` /
`load_data()` の `except` 2 箇所、コメント 2 つだけ。
