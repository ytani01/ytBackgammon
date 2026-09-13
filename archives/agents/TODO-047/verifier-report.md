# TODO-047 verifier 報告

## 1. 変更の範囲

```
$ git status --porcelain
 M src/ytbg/message.py
```

`src/ytbg/message.py` 1 ファイルのみ。指示どおり。
`archives/agents/TODO-047/` は本報告のために自分で作成した
（着手前は存在しなかった）。

## 2. 実装内容の確認

指示（TODO.md の TODO-047 節）と現在の `src/ytbg/message.py` を突き合わせた。

- `_FromDict` mixin を追加し、`dataclasses(cls) as cast(Any, cls)` で
  `fields()` を呼んでいる。**`_FromDict` 自体は `@dataclass` になっていない**
  （指示どおり）
- `_FromDict` を継承して mixin 任せの `from_dict` にしたクラス:
  `NoData`, `HistStepData`, `PutCheckerData`, `CubeData`, `TurnData`,
  `PlayerNameData`, `ScoreData`, `PlayerData`, `ClockLimitData`,
  `ClockSwitchData` の 10 個
- 独自の `from_dict` を残したクラス: `GameInfoData`（dict をまるごと
  1 フィールドへ）、`DiceData`（`list(data['dice'])` でコピー）、
  `PlayerClockData`（`list(data['clock'])` でコピー）の 3 個
- 合計 13 個のうち 10 個を mixin 化、3 個を個別実装のまま、という
  指示の数と一致

## 3. 検証コマンド（各 1 回）

| コマンド | 結果 | 終了コード |
|---|---|---|
| `uv run pytest` | 227 passed | 0 |
| `uv run ruff check .` | All checks passed! | 0 |
| `uv run mypy src` | Success: no issues found in 12 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |

## 4. 挙動が同じか（移す前と今の比較）

使い捨てスクリプトをスクラッチディレクトリに書いて実施した
（`/tmp/claude-649/.../scratchpad/todo047/compare.py`。リポジトリには残していない）。

手順:
1. `git show HEAD:src/ytbg/message.py` を `message_old.py` として書き出し、
   `importlib` で読み込む（旧版）
2. `src/ytbg/message.py` を通常どおり import（新版）
3. `DATA_TYPES` の全 20 種類の `type` それぞれについて、
   - 正しい `data` を渡したときの `dataclasses.asdict()` の結果が
     旧版・新版で一致すること
   - `data` に余分なキーがあっても無視され、結果が変わらないこと
   - `data` のキーを 1 つずつ抜いたとき、旧版・新版とも `KeyError` になること
     （抜くキーごとに）
   - `DiceData.dice` / `PlayerClockData.clock` が渡したリストの複製で
     あること（元のリストを書き換えても値が変わらず、`is` でも別オブジェクト
     であること）

   **注**: `set_gameinfo`（`GameInfoData`）は仕様上 `data` の中身を
   一切見ずに丸ごと 1 フィールドへ入れるので、「余分なキー無視」
   「キー欠落で KeyError」という他の型と同じテストは意味を持たない
   （余分なキーも `gameinfo` の一部として素通しされ、欠落しても
   `KeyError` にならないのが元々の仕様）。この型だけは
   「渡した dict がそのまま `gameinfo` に入ること」だけを確かめた。

結果: **全項目 OK**（旧版・新版の一致、`DATA_TYPES` のキー集合の一致含む）。
mixin 化前後で挙動の差は見つからなかった。

## 5. わざと壊して pytest が落ちるか

`_FromDict.from_dict()` の `data[f.name]` を `data.get(f.name)` に
書き換えて（キーが足りなくても例外にならないようにして）
`uv run pytest` を実行した。

```
FAILED tests/test_message.py::test_parse_raises_on_missing_key[back-data0-n]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[fwd-data1-n]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[put_checker-data2-ch]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[put_checker-data3-p]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[put_checker-data4-idx]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[cube-data5-accepted]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[set_turn-data7-resign]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[set_playername-data8-name]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[set_score-data9-score]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[resign-data10-player]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[set_clock_limit-data11-clock_limit]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[set_clock_switch-data13-switch]
FAILED tests/test_message.py::test_parse_raises_on_missing_key[start_clock-data14-player]
13 failed, 214 passed, 1 warning in 2.22s
```

狙ったとおり `test_parse_raises_on_missing_key` の該当ケースが落ちた
（キー欠落を確かめるテストが、狙った壊し方に反応することを確認できた）。

その後、壊した変更を元のファイル（バックアップからの復元）に戻し、
`uv run pytest` が 227 passed に戻ることを確認した。

## 6. 戻したあとの diff

```
$ git diff --stat
 src/ytbg/message.py | 91 +++++++++++++++++------------------------------------
 1 file changed, 28 insertions(+), 63 deletions(-)
```

壊す前と同じ（28 insertions, 63 deletions）で変化なし。

## 確かめられなかったこと・判断できないこと

- 特になし。指示された 1〜5 の項目はすべて実施でき、いずれも
  問題は見つからなかった。
