# TODO-019 確認依頼（verifier）

## 目的

「履歴を削除する機能をメニューから使えるようにする」の実装が、
`TODO.md` の TODO-019 に書いた設計どおりか確かめる。**コードは直さない。**
見つけたことは報告するだけ。直すかどうかは管理者が判断する。

## 対象範囲

`git diff`（コミット前の作業ツリー）。触ったのは次の 5 ファイル。

- `src/ytbg/yt_backgammon_server.py` — `clear_history()` と
  `on_json()` の `clear_hist` 分岐
- `src/ytbg/webroot/static/ytbg.js` — `clear_hist()`
- `src/ytbg/webroot/templates/index.html` — メニュー項目
- `tests/test_history.py`, `tests/test_on_json.py` — テスト
- `CLAUDE.md` — 「履歴（戻す・進める）」節への追記

## 完了条件

`TODO.md` の TODO-019 の「決めたこと」「設計」に書いた次が満たされていること。

1. 消す範囲は「今の盤面だけ残して全部消す」。`_history` は現在の
   `gameinfo` 1 件だけ、`_fwd_hist` は空、盤面そのものは変わらない
2. `sn` を振り直す
3. `save_data()` する
4. `on_json()` の `clear_hist` は `_replay_lock` を握って
   `_cancel_replay()` してから消す
5. 消したあと `emit_gameinfo()` で全員へ送り、`hist_i` / `hist_n` が 1 / 1 になる
6. クライアントは押した人の画面に `confirm()` を出し、
   キャンセルしたら何も送らない
7. メニュー項目が「連続で進める(高速)」の下、New Game の上にある

## 検証方法

- `uv run pytest`、`uv run ruff check .`、`uv run mypy src` を実行して、
  すべて通ること・指摘 0 件を確かめる
- **テストが通ることだけを見ない。** `src/` をわざと壊して、
  TODO-019 で足したテストが狙いどおり落ちることを確かめる
  （`clear_history()` の各行、`_cancel_replay()` の呼び出しなど）。
  **壊した箇所は必ず元に戻す**（`git diff` で戻ったことを確かめる）
- ブラウザの実機確認は利用者が行うので、JS と HTML は読んで確かめる
  （`clear_hist()` が `nav.checked=false` を含め既存の関数と同じ形か、
  `emit_msg()` の第 3 引数が `false` か、メニューの位置と綴り）

## 報告

`archives/agents/TODO-019/verifier-report.md` に書く。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。

---

## 追加の確認依頼（レビュー指摘の反映分）

reviewer の指摘 4 件を利用者の判断で全て反映した。その差分を確かめてほしい。
**コードは直さない。**

### 反映した内容

1. **検討2**: `clear_history()` を `async def` にし、`on_json()` の
   `clear_hist` 分岐を `await self._run_replay(self.clear_history)` に
   置き換えた（ロックと cancel の手順を書き写すのをやめた）
2. **検討4**: `tests/test_clock.py` に
   `test_clear_hist_keeps_running_clock` を足した
3. **検討3**: `CLAUDE.md` に「連続再生の途中で押すと、止まった時点の
   盤面がそのまま残る」を足した
4. **検討1**: `ytbg.js` の `new_game()` にも `confirm()` を足し、
   `CLAUDE.md` にその旨を書いた

### 完了条件

- 前半の完了条件 1〜7 が引き続き満たされていること
  （特に `_run_replay()` 経由にしても、ロック → cancel → 消す の順が
  変わっていないこと）
- `new_game()` がキャンセル時に何も送らないこと。`clear_hist()` と同じ形か
- `CLAUDE.md` の追記が実装と合っていること

### 検証方法

- `uv run pytest`、`uv run ruff check .`、`uv run mypy src`
- わざと壊す確認は、**今回足した／変えた箇所**について行う
  （`_run_replay` を通さない形に戻す、`clear_history()` から
  クロックへ副作用を出す、など）。**壊した箇所は必ず元に戻す**

### 報告

`archives/agents/TODO-019/verifier-report.md` に「## 追加分の確認」として
追記する（前半は消さない）。返事は 5 行以内。
