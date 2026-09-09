# TODO

**残っている項目: TODO-004、TODO-007、TODO-008。** これまでに 5 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-009` から。**

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

## TODO-007. save_data() が board.roll を保存しない

- [ ] `board.roll` が何に使われているかを確かめる（クライアント側を含む）
- [ ] 直すか、対応しないかを決める
- [ ] 直すなら `hist_ent2str()` に `roll` を足し、
      `tests/test_save_load.py` の往復テストから `roll` を除く処理を消す

TODO-006 でテストを書いたときに見つかった。`init_gameinfo()`
（`yt_backgammon.py:61`）は `board.roll` を持つが、`hist_ent2str()`
（`yt_backgammon_server.py:200-228`）が出力しないので、**保存 → 読み込みの
往復で `board.roll` が失われる**。実際に保存した JSON に `roll` キーが
無いことを確かめてある。

`CLAUDE.md` の「`gameinfo` にキーを足したときは `hist_ent2str()` も直さないと
保存されずに落ちる」に、まさに当てはまる。

- **まず `roll` の役割を確かめる。** 失われても実害が無いなら、
  その理由を書いて対応しないという結論もありうる
- 今の `tests/test_save_load.py::test_save_and_load_roundtrip` は、
  この差異を吸収するため比較前に両辺から `roll` を除いている。
  直したらその処理も消す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- 保存する内容が変わるのでレビューの担当を入れる
- 変更は `hist_ent2str()` の数行の見込みなので、実装は main が行う

---

## TODO-008. app_top() と top.html を消す

- [ ] `app_top()` と `top.html` を消す
- [ ] `static/menu.css` が他から使われていないか確かめ、使われていなければ消す

TODO-005 の確認で verifier と reviewer が見つけた。`app_top()`
（`yt_backgammon_server.py:428`）は `top.html` を返すが、`__main__.py` の
ルート（`/`、`/p1`、`/p2`）はすべて `app_index()` を呼んでいるので、
**どこからも呼ばれない**。TODO-005 では、この 1 行のログだけ実行しての
確認ができなかった。

`top.html` は「反時計回り（`/p1`）／時計回り（`/p2`）」を選ばせる
メニューページで、以前は `/` がこれを返していたと思われる。

着手前に決めたこと:

- **消す。** `/menu` のような別のパスで残す案、`/` を `top.html` に戻す案も
  あったが、**URL を開いたらすぐボードが出る**今の振る舞いのほうが、
  1 枚のボードを共有する使い方に合っている
- `static/menu.css` は `top.html` からしか使われていない見込み。
  確かめてから消す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |

- 変更はファイルの削除と数行なので、実装は main が行う
- コードとテンプレートが消えるので、レビューの担当を入れる

---

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-005.** ログを my_logger.py から mylog.py（loguru）へ移す](archives/todo/TODO-005.%20ログを%20my_logger.py%20から%20mylog.py（loguru）へ移す.md)
- [**TODO-006.** tests ディレクトリを作って pytest でテストする](archives/todo/TODO-006.%20tests%20ディレクトリを作って%20pytest%20でテストする.md)
- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
