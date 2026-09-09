# TODO-007. board.roll が使われていない

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier |
| 実施 | Opus 5 / effort high | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 6,449 | 45,935 | 81% |
| verifier | Sonnet 5 | medium | 6,141 | 34,021 | 19% |
| 合計 |  |  | 12,590 | 79,956 | 概算 $1.2 |

- verifier は定義のモデルが sonnet。確かめることが決まっているので上書きしなかった

## きっかけ

TODO-006 でテストを書いたときに見つかった。`init_gameinfo()` は
`board.roll` を持つが、`hist_ent2str()` が出力しないので、**保存 → 読み込みの
往復で `board.roll` が失われる**。実際に保存した JSON に `roll` キーが
無いことを確かめてあった。

調べたところ、`board.roll` は `init_gameinfo()` で `False` を置くだけで、
サーバもクライアントも読み書きしていなかった。クライアントが使う `roll` は
`dice` メッセージの `data.roll` で、`gameinfo` の `board.roll` とは別物。

**保存する側に足すのではなく、`gameinfo` から消す**ことを利用者と決めた。
保存ファイルには元から `roll` キーが無いので、既存のデータはそのまま
読み込める。

## やったこと

- `src/ytbg/yt_backgammon.py` の `init_gameinfo()` から `'roll': False,` の
  1 行を消した
- `tests/test_save_load.py::test_save_and_load_roundtrip` から、比較前に
  両辺の `board.roll` を取り除く処理と、その差異を説明する docstring を消した

## 確かめたこと

確認は verifier に分けた（報告は
[archives/agents/TODO-007/verifier-report.md](../agents/TODO-007/verifier-report.md)）。

- **クライアントは `gameinfo.board.roll` を読み書きしていない。**
  `ytbg.js` の `roll` を含む識別子（`SOUND_ROLL`、`roll_btn`、
  `RollButton.roll()`、プロトコルの `data.roll`）はいずれも別物で、
  `gameinfo` を組み立てる `Board.gen_gameinfo()` と取り込む
  `Board.load_gameinfo()` のどちらにも参照が無い。`index.html` の `roll` は
  DOM の id (`rollbutton0` / `rollbutton1`) だけ
- **サーバ側にも残っていない。** `src/ytbg/*.py` に `roll` という語自体が無い
- **既存の保存ファイルをそのまま読める。** 利用者の `~/ytbg-1.json` 〜
  `~/ytbg-4.json` の 4 つとも `roll` キーを含まず、`load_data()` で例外なく
  読めた（読む前後で md5 が変わらないことも確かめた）
- `uv run pytest` 16 件通過、`uv run ruff check .` 指摘なし。
  `uv run mypy src` の 7 件は全て `__main__.py` のもので、`git stash` した
  変更前と同じ行・同じ内容だった

verifier は追加で、**ソース側の変更だけを戻すと往復テストが落ちる**ことも
確かめている（テストの除外処理を消したことに意味があるかの確認）。

ブラウザでの目視確認はしていない。`gameinfo.board.roll` を誰も参照して
いない以上、画面には出ないため。

## 分担の振り返り

- **verifier は指示した 4 点をすべて確かめ、加えてテストの効きも確かめた。**
  変更を一時的に戻して往復テストが落ちることを見た部分は、指示していない。
  「消したテストの前処理に意味があったか」は実装した側からは出にくい観点で、
  分けた効果が出た
- **見込み（main が実装、verifier が確認）と食い違わなかった。**
  1 行消すだけの項目でも、`roll` という語が JS 側に 60 箇所以上あって
  「別物であること」の確認に手間がかかる。ここを main が兼ねると
  「読んでいないはず」で流しやすい
- **次に同じ規模（キーを 1 つ消す、参照が無いことの確認が要る）の項目なら、
  同じ組み方でよい。** 確認の対象ファイルと「紛らわしい同名のもの」を
  依頼文で名指しすると、Sonnet 5 で $0.2 に収まる。実装まで分ける必要は無い
