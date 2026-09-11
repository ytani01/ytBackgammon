# TODO-024 implementer 報告

`gameinfo` を dataclass にし、クロックを外し、保存を JSON Lines へ移した。

## 変更したファイル

### 新しく作ったもの

- `src/ytbg/gameinfo.py`（新規 131 行）— `CubeState`（39〜）、
  `BoardState`（63〜）、`GameInfo`（86〜）。`to_dict()` は
  `dataclasses.asdict()`、`from_dict()` は自前。**知らないキーは
  読み捨てる**ので、旧形式の `clock_limit` と `board.clock` はここで落ちる。
  初期配置は `init_checker()` / `init_dice()`（gameinfo.py:23、gameinfo.py:41）
- `src/ytbg/clock.py`（新規 190 行）— `Clock`。`limit` / `sw` / `active` /
  `clock`（残り時間）/ `_start`（基準の時刻）。`cur()`（clock.py:69）、
  `freeze()`（clock.py:89）、`reset()`（clock.py:98）、`start()` /
  `resume()` / `stop()` / `stop_all()` / `set_switch()` / `set_limit()` /
  `set_clock()`、`state()`（clock.py:153）、`to_dict()` /
  `from_dict()`（clock.py:169、clock.py:186）。
  **計算は元の `_cur_clock()` から変えていない**
- `src/ytbg/storage.py`（新規 189 行）— `Storage`。`save()`（storage.py:65）、
  `load()`（storage.py:95）、`_load_jsonl()`（storage.py:111）、
  `_load_old()`（storage.py:143）、`_old_clock()`（storage.py:178）
- `tests/test_clock_unit.py`（新規 230 行）— `Clock` 単体（22 件）

### 直したもの

- `src/ytbg/yt_backgammon.py` — 全面的に書き直し。`_gameinfo` が `GameInfo` に
  なり、`set_clock_limit()` / `set_player_clock()` は消えた（`Clock` へ移動）。
  `new_game()`（yt_backgammon.py:42）を足し、**`board` を作り直して
  `turn` を 2、`resign` を -1 に戻すだけ**にした。
  `set_gameinfo()`（yt_backgammon.py:56）は dict を受け取り
  `GameInfo.from_dict()` で作り直す
- `src/ytbg/yt_backgammon_server.py`
  - 45〜50: 保存先を `.jsonl` にし、`Storage` を持つ
  - 68〜71: `_clock_sw` / `_clock_active` / `_clock_start` を `_clock`（`Clock`）へ
  - 78〜92 `new_game()`: 退避と書き戻しが消え、`self._bg.new_game()` と
    `_clock.reset()` だけになった
  - 94〜107 `add_history()` / 109〜130 `clear_history()`: `gameinfo.sn` /
    `gameinfo.copy()` / 引数なしの `save_data()`
  - 158〜165 `_load_hist_ent()`: **「クロックの残り時間だけは引き継ぐ」例外を
    消し、`hist_ent.copy()` だけにした**
  - 削除: `_cur_clock()` / `_freeze_clock()` / `_reset_clock()` /
    `hist_ent2str()`
  - 185、194 `emit_gameinfo()`: `gameinfo.to_dict()` と
    `clock_state`（`self._clock.state()`。`limit` が増えて 4 つ）
  - 342〜382: `save_data()` / `load_data()` を `Storage` 越しにした（引数なし）
  - `on_json()` のクロック系 7 分岐（yt_backgammon_server.py:509〜551）を
    `Clock` のメソッド呼び出しにした。`set_gameinfo` は `_clock.stop_all()`
- `src/ytbg/webroot/static/ytbg.js` 3572〜3592（`Board.load_gameinfo()`）—
  クロックを `clock_state` からだけ読むようにし、`clock_state === undefined`
  の分岐（「ファイルから読んだとき」）を消した。`clock_limit.set()` は
  `history_flag` の外のまま。**JS の変更はここだけ**
- `tests/conftest.py` 158〜193 — `make_bg_server`（サーバを作る時点を
  テスト側で決められるフィクスチャ）を足し、`bg_server` はそれを呼ぶだけにした。
  保存したファイルを先に置いてから起動するテストに要る
- `tests/test_save_load.py` — 全面的に書き直し（JSON Lines の往復、
  ファイルの形、クロックの保存・復元、壊れたファイル、旧形式の 5 件）。
  `hist_ent2str()` が無くなったので、その書式を固定していた 2 件は消した
- `tests/test_clock.py` — `_clock.*` に合わせ、`back` / `fwd` の 2 件は
  「クロックを履歴に積む」形が作れなくなったので `put_checker` で履歴を
  積む形に書き直した。`clock_state` の `limit` と、gameinfo にクロックが
  無いことの確認を足した
- `tests/test_on_json.py` / `tests/test_history.py` /
  `tests/test_yt_backgammon.py` — 属性アクセスへ。クロック系 5 つの
  parametrize は「gameinfo が変わらないこと」を見る形にした
- `tests/test_datafile_dir.py` 409 — 保存先が `ytbg-test.jsonl` になった
- `tests/browser/helper.mjs` 58 — コメントの `~/ytbg-*.json` を `~/ytbg-*` に

## 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 131 passed、終了コード 0 |
| `uv run ruff check .` | All checks passed、終了コード 0 |
| `uv run mypy src` | no issues found in 8 source files、終了コード 0 |
| `node --test tests/browser/` | 5 pass / 0 fail、終了コード 0 |

## わざと壊して確かめた 7 通り

いずれも `src/` を 1 箇所だけ書き換えて `uv run pytest` を走らせ、
そのあと元に戻した。**7 通りすべてで落ちた。**

| # | 壊した内容 | 落ちたテスト |
|---|-----------|--------------|
| 1 | `Storage.save()` が、いまのクロックではなく既定の `Clock()` を書く | `test_save_and_load_roundtrip` |
| 2 | `Storage.load()` が `.jsonl` より旧形式を先に読む | `test_jsonl_wins_when_both_exist`、`test_save_and_load_roundtrip`、`test_running_clock_is_saved_stopped`、`test_clock_switch_is_saved`、`test_clear_history_saves_data`（5 件） |
| 3 | `_old_clock()` が旧形式の `clock_limit` / `board.clock` を見ずに既定を返す | `test_old_format_is_read_when_no_jsonl` |
| 4 | `Clock.to_dict()` が `active` も保存する | `test_to_dict_has_no_active` |
| 5 | `_load_hist_ent()` が `_clock.reset()` も呼ぶ（履歴でクロックが巻き戻る） | `test_back_does_not_rewind_running_clock` |
| 6 | `Clock.freeze()` が基準の時刻を打ち直さない | `test_resume_clock_keeps_remaining_delay` |
| 7 | `GameInfo.to_dict()` が `clock_limit` と `board.clock` を残す | `test_clock_is_not_in_history` |

（2 以外は `-x` 付きで走らせたので、最初に落ちた 1 件だけを載せている。
2 は `-x` なしで走らせた）

## 判断が要る点

1. **`CLAUDE.md` は直していない。** 依頼には「「構成」「クロック」「履歴」の
   節を書き直す」とあったが、implementer の役割として「`CLAUDE.md` や
   その他の文書を触らない（管理者と `wording` の担当）」と決まっているので、
   下書きだけ置く。main の判断で反映してほしい。直すべきは次の 4 箇所:
   - 「構成」— `src/ytbg/` の一覧に `gameinfo.py`（`GameInfo` /
     `BoardState` / `CubeState`）、`clock.py`（`Clock`）、
     `storage.py`（`Storage`）を足す。`yt_backgammon.py` の説明は
     「`gameinfo`（`GameInfo`）を保持し、更新するだけ」に
   - 「状態と通信」— 「`gameinfo` が唯一の状態
     （`ytBackgammon.init_gameinfo()` に構造がある）」は、
     「`GameInfo`（`gameinfo.py`）が盤面の状態」に。列挙から
     `clock_limit` と `board.clock` を外す
   - 「クロック」— `_clock_sw` / `_clock_active` / `_clock_start` の 3 つを
     `Clock`（`clock.py`）が持つ形に。`clock_state` は
     `sw` / `active` / `clock` / **`limit`** の 4 つで、クライアントは
     クロック関連をすべてここから読む（`gameinfo.clock_limit` と
     `gameinfo.board.clock` は無くなった）
   - 「履歴」— 「クロックの残り時間だけは引き継ぐ」の一文を消す。
     保存の節（`save_data()` が文字列連結、`hist_ent2str()` を直し忘れると
     落ちる）は、「`~/ytbg-{server_id}.jsonl` に 1 行 1 手で書く。
     1 行目がメタ（形式のバージョンとクロック）。旧形式（`.json`）は
     `.jsonl` が無いときだけ読み、旧ファイルは消さない（TODO-031 で消す）」に
2. **保存は `ensure_ascii=False` にした。** 旧形式は `json.dumps()` の既定で
   プレーヤー名が `田中` になっていた。読みやすさが JSON Lines に
   した狙いの 1 つなので日本語のまま書くようにしたが、元の書式に合わせる
   なら `ensure_ascii=True` に戻す（読み込みはどちらでも同じ）
3. **`set_clock_limit` / `set_player_clock` が `gameinfo` を変えなくなった。**
   `ytbg.js` は `set_clock_limit` を `history: true` で送る
   （`ClockLimit.emit_set()`）ので、**中身が 1 つ前と同じ履歴が 1 件積まれる**。
   これ自体は今までと同じ動き（積まれること）だが、積まれるものが
   「差分のあるエントリ」から「同じエントリ」に変わった。`history` フラグの
   付け方を見直すなら別項目。この項目では変えていない

## 範囲外だが気づいたこと

- `Board.load_gameinfo()` の引数は `clock_state=undefined` のままにしてある。
  もう無しでは動かない（`clock_state.limit` を読む）ので、既定値を外すか
  必須にするのが素直だが、JS の整理は TODO-027〜030 なので触っていない
- `GameInfo.from_dict()` は足りないキーを既定値で埋める。`set_gameinfo` に
  壊れた dict が来ても `KeyError` にならず、既定値の盤面になる。
  入口で弾くのは TODO-026（`message.py` の `parse()`）の担当
- クロックがファイルへ書かれるのは `save_data()` が走るとき、つまり
  履歴を積んだときと連続再生の終わりだけ。`start_clock` /
  `stop_clock`（`history: false`）だけでは保存されない。これは
  TODO-024 より前も同じ（`board.clock` を書き換えても保存はされなかった）
- `ytBackgammonServer._history` / `_fwd_hist` の型注釈が無いままなので
  `list[GameInfo]` とは書いていない。サーバの分割は TODO-025 なので
  そちらで付けるのがよさそう
