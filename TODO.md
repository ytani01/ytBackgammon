# TODO

**残っている項目: TODO-004。** これまでに 3 件を決着させた。
新しく足すときは「完了済み」の上に節を作る。**番号は `TODO-005` から。**

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

## 完了済み

1 項目 1 ファイル。`archives/todo/` にある（新しい順）。
**やらないと決めたものの理由もそこにある。** 蒸し返す前に読むこと。

- [**TODO-003.** 切断のたびにログへ ConnectionError と 500 が出る](archives/todo/TODO-003.%20切断のたびにログへ%20ConnectionError%20と%20500%20が出る.md)
- [**TODO-002.** ruff と mypy の指摘を解消する](archives/todo/TODO-002.%20ruff%20と%20mypy%20の指摘を解消する.md)
- [**TODO-001.** uv への移行](archives/todo/TODO-001.%20uv%20への移行.md)
