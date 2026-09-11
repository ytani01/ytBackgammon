# TODO-024 の分担

`gameinfo` を dataclass にし、クロックを外し、保存を JSON Lines へ移す項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— 複数のファイルにまたがり、実装と
  テストがまとまって要る。定義の sonnet では構造の移し替えが荷が重い
- **verifier**（定義のまま Sonnet 5）— 4 つの検証と、旧形式の読み込み、
  `src/` を壊して狙ったテストが落ちること
- **reviewer**（Opus 5 に上書き）— 挙動が変わる。履歴とクロックの絡みは
  TODO-016 で一度こじれている

## main が決めたこと（実装の前提）

`docs/design.md` の「GameInfo」「クロックは gameinfo の外」「保存は
JSON Lines」に加えて、着手時に main が決めた分。**迷ったらここに従う。**

### 1. dataclass は可変にする

`put_checker()` などが書き換えるので `frozen=True` にしない。
`to_dict()` は `dataclasses.asdict()`、`from_dict()` は自前で書く。

### 2. `ytBackgammon` クラスはこの項目では残す

`_gameinfo` の中身を dict から `GameInfo` に替えるだけにする。
`ytBackgammon` を無くして `GameInfo` に吸収するのは TODO-025。
ただし `set_clock_limit()` と `set_player_clock()` は `Clock` へ移すので、
`ytBackgammon` からは消える。

### 3. `Clock` が持つもの

`limit`（`[秒, 秒]`）、`sw`（bool）、`active`（`[bool, bool]`）、
残り時間（`[[秒, 秒], [秒, 秒]]`）、基準の時刻（`time.monotonic()`）。

今の `ytBackgammonServer` にある `_cur_clock()` / `_freeze_clock()` /
`_reset_clock()` と、`on_json()` のクロック系 7 分岐の中身を移す。
**計算そのものは変えない**（`ytbg.js` の `PlayerClock.update()` と同じで、
持ち時間はマイナスも許す）。

### 4. `clock_state` に `limit` を足す

`emit_gameinfo()` が送るのは `{sw, active, clock, limit}` の 4 つ。
JS は `gameinfo.clock_limit` と `gameinfo.board.clock` を見るのをやめ、
すべて `clock_state` から読む。

### 5. 保存の形

`~/ytbg-{server_id}.jsonl`。1 行目がメタ、以降が履歴。

```
{"v": 2, "clock": {"limit": [120, 12], "sw": true, "clock": [[120, 12], [120, 12]]}}
{"h": {...gameinfo...}}
{"f": {...gameinfo...}}
```

- `h` が `_history`、`f` が `_fwd_hist`。**書かれた順がスタックの順**
- `clock.clock` に書くのは、保存した時点の残り時間（`cur()` の値）。
  求めるだけで `_clock_start` は打ち直さない（保存に副作用を持たせない）
- **`active` は保存しない。** 読み込んだときは必ず止まった状態で始める。
  サーバが落ちている間の時間は数えられないので、動作中のまま復元すると
  残り時間が実際とずれる
- `sw` は保存して復元する。利用者が切ったまま再起動したら切れたまま

### 6. 旧形式（`~/ytbg-{server_id}.json`）

- `.jsonl` が**無いときだけ**読む。両方あれば `.jsonl` を読む
- **旧ファイルは消さない。書き戻しも常に `.jsonl`**
- `clock_limit` と `board.clock` は `history` の最後のエントリの値を
  `Clock` の初期値にする。`sw` は既定（`True`）
- 旧形式のエントリにある `clock_limit` と `board.clock` のキーは、
  `GameInfo.from_dict()` が読み捨てる

### 7. `new_game()`

`board` を作り直し、`turn` を 2、`resign` を -1 に戻すだけ。
`score` / `playername` / `game_num` / `match_score` は残す
（退避と書き戻しは消える）。クロックは `reset()` で `limit` に戻して止める。

### 8. `_load_hist_ent()`

「クロックの残り時間だけは引き継ぐ」例外を消し、
`deepcopy(hist_ent)` を入れるだけにする。

### 9. JS 側は最小限

`Board.load_gameinfo()` のクロックの読み先を `clock_state` に寄せるだけ。
`clock_state` が無いときの分岐（「ファイルから読んだとき」）は、
`gameinfo` からクロックが消えるので**消す**。
`clock_limit.set()` を `history_flag` の外で呼んでいるのはそのまま
（クロックは履歴の対象外なので、再生中でも今の値でよい）。
**それ以外の JS の整理はこの項目でやらない**（TODO-027〜030）。

## 報告

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
