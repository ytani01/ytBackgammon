# TODO-024 implementer 報告 (2)

reviewer の指摘のうち、main が直すと決めた 9 件（1, 4, 5, 6, 7, 9, 11, 12,
13）を直した。他の指摘（2, 3, 8, 10, 14）には触っていない。

## 変更したファイルと箇所

### 1（重大）`sw` が保存されない

- `src/ytbg/yt_backgammon_server.py:532-540` — `set_clock_switch` の分岐で
  `self._clock.set_switch()` のあとに `self.save_data()` を呼ぶ。
  `history` フラグとは別に、ここだけ保存する。理由（ytbg.js の
  `apply_clock_sw()` が `history: false` で送るので、ここで保存しないと
  `sw` が残らない／`start`・`stop`・`resume`・`reset_clock` は
  ターンのたびに走るので保存しない）をコメントに書いた
- `tests/test_save_load.py:149-163`（`test_clock_switch_is_saved`）—
  `'history': True` を `'history': False` に直し、docstring に
  「クライアントが実際に送る形」である理由を書いた

### 4 `GameInfo.from_dict()` が綴り違いを黙って既定値にする

- `src/ytbg/gameinfo.py:48-58` — module 関数 `_get(data, key, default,
  strict)` を足した。`strict` なら `data[key]`（＝欠落で `KeyError`）
- 同 `CubeState.from_dict()` / `BoardState.from_dict()` /
  `GameInfo.from_dict()` に `strict: bool = False` の引数を足し、`_get()`
  経由にした。`strict` は入れ子（board → cube）まで伝わる。
  必須キーは `to_dict()` が出すキー全部（15 個）
- `src/ytbg/storage.py:136-141` — `_load_jsonl()` だけ
  `GameInfo.from_dict(ent['h'], True)`。`_load_old()` は今までどおり
  緩いまま（余分なキーを読み捨てる必要があるため）
- `tests/test_save_load.py:200-253` — テストを 2 つ足した
  - `test_jsonl_missing_key_is_broken_file`（15 件のパラメータ。
    `to_dict()` が出すキーを 1 つずつ落とす）
  - `test_jsonl_misspelled_key_is_broken_file`（`checker` → `cheker`）
  - どちらも `Storage(path).load() == ([], [], None)`。つまり例外は
    `LOAD_ERRORS` で捕まり、履歴が空として扱われる（＝起動はする）

### 5 `open()` の encoding 未指定

- `src/ytbg/storage.py:93`（save の `open('w')`）、`122`（`_load_jsonl`）、
  `165`（`_load_old`）に `encoding='utf-8'` を足した。`ensure_ascii=False`
  は残してある。理由（日本語をそのまま書くので encoding を指定しないと
  ロケール依存になる）をコメントに書いた

### 6 `LOAD_ERRORS` が広い

- `src/ytbg/storage.py:38-42` —
  `(OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError)`
  に絞り、`TypeError` / `AttributeError` / `ValueError` を外した。
  理由をコメントに書いた。外したことで落ちたテストは無い

### 7 `tests/test_on_json.py` のクロック 5 件

- `tests/test_on_json.py:195-198` — `no_clock_keys(gameinfo)` を足した
  （`'clock_limit' not in gameinfo and 'clock' not in gameinfo['board']`）
- 同 `222-232` — クロック系 5 件の `get_value` を
  `lambda g: g['turn'], 2` から `no_clock_keys, True` に直し、
  コメントも「gameinfo にクロックのキーは戻ってこない」に合わせた

### 9 `new_game()` が `server_version` を更新しない

- `src/ytbg/yt_backgammon.py:42-58` — `new_game()` の末尾で
  `self._gameinfo.server_version = self.svr_ver`。docstring に
  旧挙動に戻した理由を書いた

### 11 `Clock.stop_all()` の docstring

- `src/ytbg/clock.py:125-131` — 「保存したものを読み込んだ直後に使う」を
  消し、「盤面ごと入れ替わる set_gameinfo で使う」だけにした

### 12 `clock.py:55` が 79 文字

- `src/ytbg/clock.py:55-56` — `self.limit = (list(limit) if limit is not
  None\n else list(self.DEF_LIMIT))` に折った。`clock.py` に 78 文字を
  超える行は無くなった（文字数で数え直して確認）

### 13 `ytbg.js:3154` のコメント

- `src/ytbg/webroot/static/ytbg.js:3154` — `_clock_active` を
  `Clock.active` に直した。中身の説明はそのまま

## 検証の結果

いずれも終了コード 0。

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 147 passed（前回 130 → 足した 17 件ぶん増） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 8 source files |
| `node --test tests/browser/` | tests 5 / pass 5 / fail 0 |

### わざと壊して、狙ったテストが落ちることを確かめた

- **1**: `set_clock_switch` の `self.save_data()` を消す →
  `tests/test_save_load.py::test_clock_switch_is_saved` が
  `assert True is False` で落ちる（1 failed, 146 passed）。
  直せば通る
- **4**: `_load_jsonl()` の `from_dict(..., True)` を `False`（緩いほう）に
  する → 足した 16 件（欠落 15 ＋ 綴り違い 1）が全部落ちる
  （16 failed, 131 passed）。直せば通る

どちらも元に戻した。`grep -rn 壊した版 src tests` は **0 件**。
`uv run pytest` / `ruff` / `mypy` / `node --test tests/browser/` は
戻したあとに走らせ直して、上の表のとおり全部通っている。

## 判断が要る点・残る懸念

- **`strict` の引数は位置引数で渡している**（`from_dict(ent['h'], True)`）。
  キーワード（`strict=True`）のほうが読みやすいが、`storage.py` の
  行が 78 文字に収まらなくなるので位置引数にした。折り返してでも
  キーワードにしたければ直す
- **`set_gameinfo` の入口は緩いまま**（`GameInfo.from_dict()` の既定は
  `strict=False`）。reviewer 4 も「入口の検査は TODO-026 送りでよい」と
  しているので触っていない
- **指摘 8（`set_clock_limit` が中身の同じ履歴を積む）は直していない。**
  `history` の付け方の見直しなので別項目
- `src/ytbg/storage.py:165` の `_load_old()` の `encoding='utf-8'` は、
  旧ファイルが `ensure_ascii=True` で書かれている以上、実害の無い
  予防。読み方を揃える意味で足した
- 作業ツリーには `CLAUDE.md` と `TODO.md` の変更が入っているが、
  こちらでは触っていない（main の担当）
