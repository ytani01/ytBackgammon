# TODO-019 レビュー依頼（reviewer）

## 目的

「履歴を削除する機能をメニューから使えるようにする」の差分を、
このリポジトリの規約と設計に照らして見る。**コードは直さない。**
見つけたことは報告するだけ。直すかどうかは管理者が判断する。

`verifier` が「動くか」を見るので、こちらは「良いか」を見る。
特に**挙動が変わるところ・条件の抜け**を見てほしい。

## 対象範囲

`git diff`（コミット前の作業ツリー）。触ったのは次の 5 ファイル。

- `src/ytbg/yt_backgammon_server.py` — `clear_history()` と
  `on_json()` の `clear_hist` 分岐
- `src/ytbg/webroot/static/ytbg.js` — `clear_hist()`
- `src/ytbg/webroot/templates/index.html` — メニュー項目
- `tests/test_history.py`, `tests/test_on_json.py` — テスト
- `CLAUDE.md` — 「履歴（戻す・進める）」節への追記

## 見てほしいこと

1. **並行実行**。`_replay_lock` と `_cancel_replay()` の使い方が
   `back` / `back_all` の既存の扱いと揃っているか。
   `clear_history()` の最中・直後に別のメッセージが入ると壊れる筋が
   残っていないか（`_cur_sn` と `add_history()` の関係、
   `_load_hist_ent()` を通らないこと、クロックへの影響）
2. **保存と読み込み**。`save_data()` / `load_data()` と食い違わないか。
   `_history` が 1 件だけの状態は既存の `backward_hist()` の下限
   （`len(self._history) > 1`）と整合するか
3. **規約**（`CLAUDE.md` と `~/.claude/CLAUDE.md`）。ログは `{}` と引数で
   渡しているか、docstring とコメントの書き方が周りに合っているか、
   `CLAUDE.md` への追記が事実と合っているか
4. **テストの中身**。何を固定しているか。通るだけで中身を見ていない
   ものが混ざっていないか。足りない観点があれば挙げる
5. **クライアント側**。`confirm()` の文言、共有ボードであることの伝わり方、
   既存のメニュー項目との一貫性

## 報告

`archives/agents/TODO-019/reviewer-report.md` に書く。
指摘は「どこ・何が問題・なぜ・どうするか」を 1 件ずつ。
重さ（直すべき／好みの範囲）を付ける。
返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内。
