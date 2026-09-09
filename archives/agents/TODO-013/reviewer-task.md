# TODO-013 レビューの依頼（reviewer）

TODO-013（`on_json()` の分岐ごとのテストを足す件）をレビューする。
**コードは直さない。** 見つけたことは報告するだけ。

作業ディレクトリは /home/ytani/work/ytBackgammon。

## 変更の内容

`git diff` と `git status`（`tests/test_on_json.py` は未追跡）を見ること。
実装者の報告は `archives/agents/TODO-013/implementer-report.md`、
指示は `archives/agents/TODO-013/implementer-task.md` にある。**両方読むこと。**

## この項目の目的

TODO-009 で通信層を Flask-SocketIO から Starlette + 素の WebSocket へ
入れ替える予定で、そのときに壊れるとしたら `on_json()` の分岐。
**「この `type` を投げたら `gameinfo` がこう変わり、こう送られる」**を先に
固め、移行後は同じテストを通すだけで済むようにするのがねらい。
`TODO.md` の TODO-013 の節も読むこと。

## 見てほしいこと

**「網羅しているか」ではなく「守るべきものを守っているか」。**
テストの本数ではなく、移行で壊れたら困るものが書き留められているかを見る。

1. **移行で壊れたら困るのに、書かれていないもの。**
   `on_json()` と `emit_gameinfo()` / `backward_hist()` / `forward_hist()` /
   `new_game()` / `add_history()` を読んで、通信層を入れ替えたときに
   崩れうる前提を洗う。たとえば送られるメッセージの形、broadcast の有無、
   履歴の位置（`hist_i` / `hist_n`）、`sec`（アニメーションの秒数）、
   `history_flag`。テストが押さえていないものがあれば挙げる

2. **テストが実装をなぞっているだけになっていないか。**
   実装と同じ式で期待値を組み立てていると、実装が変わっても一緒に
   変わってしまい何も守らない。期待値は**べた書き**か、実装とは別の
   経路で作られているべき

3. **`conftest.py` の `EmittedMessages` の設計。**
   TODO-009 で `flask_socketio.emit` が無くなったとき、
   **テスト側を書き換えずに済む形になっているか。**
   `fake_emit` の差し替え方だけを直せば残せるか

4. **偽陽性・偽陰性。** 常に通ってしまうテスト（アサーションが弱い、
   条件が実質いつも真）や、環境で揺れるテストが無いか

5. **プロジェクトの慣習に合っているか。** `CLAUDE.md` の
   「テストを足すときの注意」と「書き方の慣習」に照らす。
   既存の `tests/test_history.py` / `tests/test_save_load.py` との揃い方も見る

## 報告

`archives/agents/TODO-013/reviewer-report.md` に書く。**指摘は
「直すべき」「直さなくてよいが記録しておく」に分けること。**
どちらか判断がつかないものは、そう書いて理由を添える。

返事は 5 行以内で、終わったか・報告ファイルのパス・判断が要る点だけ。
ファイルの全文を返事に貼らない。
