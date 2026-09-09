# TODO

**残っている項目: TODO-004、TODO-005、TODO-006。** これまでに 3 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-007` から。**

---

## TODO-004. save_data() のファイル I/O が gevent では全体を止める

- [ ] 実際にどれだけ止まるのかを測る
- [ ] 実害があるなら対処する

TODO-003 で gevent へ移行したときに、reviewer が見つけた。

`monkey.patch_all()` を呼んでも `builtins.open` は組み込みのままで、gevent は
通常ファイルの読み書きを置き換えない。そのため `save_data()` / `load_data()` の
間は、プロセス全体（全 greenlet）が止まる。threading のときは書き込み中に
GIL が解放され、他のスレッドが進めた。**振る舞いが変わっている方向。**

- `add_history()` は 1 手ごとに `save_data()` を呼ぶので、履歴が伸びるほど
  1 回の停止時間が伸びる
- 同じ理由で、連続再生を止める要求（`_repeat_flag` の書き換え）の反映も
  `save_data()` の間だけ遅れる
- **実害の大きさは未確認。** 今の規模（数 KB の JSON）なら問題にならないと
  見ているが、測っていない。まず測ってから、対処するかを決める
- 対処するなら、`gevent.fileobject` を使うか、保存を別の greenlet へ追い出す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

---

## TODO-005. ログを my_logger.py から mylog.py（loguru）へ移す

- [ ] `src/ytbg/mylog.py` を tmr から持ってくる
- [ ] ログ呼び出し 47 箇所を書き換える（うち 32 箇所は `%s` 書式）
- [ ] `my_logger.py` を消す
- [ ] `CLAUDE.md` の「書き方の慣習」を直す

`~/work/tmr/src/tmr/mylog.py` を使う。loguru のグローバル logger に名前を
付けて、名前ごとに水準を変えられるようにしたもの。

着手前に相談して決めたこと:

- **`src/ytbg/mylog.py` にコピーする。** 依存に増えるのは loguru だけ。
  tmr とは別々に持つので、片方を直してももう片方には反映されない
- **`%s` 書式は loguru の `{}` に書き換える。** f-string にすると、
  出力しない水準でも毎回文字列を作ることになる（`gameinfo` 全体を出す
  箇所があるので効いてくる）
- **クラスの `debug` 引数は落とす。** クラス本体に
  `__log = getLogger(__qualname__)` を置き、`main()` の先頭で
  `loggerInit(debug)` を 1 回だけ呼ぶ。TODO-003 で見送った
  「`ytBackgammonServer(..., debug=True)` が固定」も、これで消える

書き換えの量:

| ファイル | ログ呼び出し |
|---|---|
| `yt_backgammon_server.py` | 26 |
| `yt_backgammon.py` | 15 |
| `__main__.py` | 6 |

ログの書式も変わる（`HH:MM:SS LEVEL filename.name.funcName:lineno>` から
loguru の `MM/DD HH:mm:ss アイコン LEVEL file:line function()>` へ）。

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |

---

## TODO-006. tests/ を作って `uv run pytest` でテストする

- [ ] `pytest` を dev 依存に足し、`pyproject.toml` に `[tool.pytest.ini_options]` を書く
- [ ] `tests/conftest.py` — `ytBackgammon` と `ytBackgammonServer` のフィクスチャ
- [ ] `tests/test_yt_backgammon.py` — `init_gameinfo()` の構造、`put_checker()` の
      ID からプレーヤーを求める計算、`cube` / `dice` / `set_turn`
- [ ] `tests/test_history.py` — `add_history` / `backward_hist` / `forward_hist` /
      `hist_ent2str`
- [ ] `tests/test_save_load.py` — `tmp_path` に保存して読み込み、`gameinfo` が戻ること
- [ ] `CLAUDE.md` の「テストの仕組みは無い」を実態に合わせて直す

これまでテストの仕組みが無く、動作確認はブラウザで実際に触るだけだった。
まずは骨格を作り、今後必要に応じて足していく。

- **各ファイル 2〜4 本ずつ。** 網羅は狙わない。今後テストを足す場所を
  決めるのが目的
- `ytBackgammonServer.__init__` は SocketIO インスタンスを取る。
  `monkey.patch_all()` を呼ばずに生成できる形をフィクスチャで確かめる。
  `emit` は差し替える
- `save_data()` / `load_data()` はパスを引数で受け取るので、
  `~/ytbg-{server_id}.json` ではなく `tmp_path` を渡す
- **既存コードは変えない。** テストを書く途中で不具合が見つかったら、
  直さずに報告し、別項目にする

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier |

- 挙動は変えないのでレビューの担当は入れない
- 複数のファイルにまたがり、設定・テスト・文書がまとまって要るので実装も分ける

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
