# TODO-038. 同じ形の繰り返しをまとめる

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 9,758 | 29,146 | 38% |
| implementer | Opus 5 | medium | 17,230 | 101,785 | 29% |
| reviewer | Opus 5 | high | 20,875 | 86,172 | 24% |
| verifier | Sonnet 5 | medium | 11,665 | 67,805 | 8% |
| 合計 |  |  | 59,528 | 284,908 | 概算 $7.6 |

- implementer は定義のモデルが sonnet。`GameInfo` の更新メソッドの引数を
  変える件が込み入るので Opus 5 に上書きした（effort は定義のまま medium）
- reviewer も定義の sonnet を Opus 5 に上書きした

## きっかけ

2026-09-12 に `src/` 全体を過剰実装の観点で読み直した結果の残り。
**同じ形が繰り返されている箇所**を集めた項目で、TODO-037（削除）と
TODO-039（標準機能への置き換え）のあとに回した。

## やったこと

差し引き -106 行。

### `main.js` のラッパー 14 個をやめた

履歴用 9 個（`new_game` / `backward_hist` / `back2` / `back_all` /
`forward_hist` / `fwd2` / `fwd_all` / `clear_hist` / `board_inverse`）と、
board への委譲 5 個。末尾の `addEventListener` の登録表へ直接書いた。

**`menu_emit(type, data, confirm_msg)` 1 本だけ残した。**
「メニューを閉じる → log →（confirm があれば確認）→ 送る」はメニュー
項目の共通の決まりで、9 箇所に同じ 2 行を並べるほうが読みにくい。
Ctrl-Z / Ctrl-Y もこれを呼ぶ（変更前もラッパー経由でメニューを閉じていた
ので、副作用まで同じ）。

`main.js` は 307 行 → 200 行。

### `backward_hist()` / `forward_hist()` を 1 本に

`_replay_hist(pop, n, sleep_sec)` を足し、`pop` に `History.back` /
`History.forward` を渡す。**2 つの名前は残した**（テストと `CLAUDE.md` が
名前で呼んでいる）。ログは呼び出し側に残したので、出るログも変わらない。

### `asdict()` をやめ、`GameInfo` を dataclass 受け取りに

`server.py` のハンドラ 6 個が `asdict(data)` で dataclass を dict へ
戻していた。`message.py` で型を付けた意味がそこで消えていたので、
`GameInfo` 側を `cube(CubeData)` の形にした。`gameinfo.py` が
`message.py` に依存するようになったが、`message.py` は何も import
しないので循環しない。

### `ClockLimit` の継承をやめた

`new ClockLimit(this.board)` は board を **id の引数**に渡していて
`this.board` も `el` も undefined。継承した機能は全部死んでいた。
`BgText` を継承しないただの class にした。

## 確かめたこと

- `uv run pytest`（227 passed）/ `uv run ruff check .` / `uv run mypy src` /
  `uv run basedpyright` / `node --test tests/js/`（57）/
  `node --test tests/browser/`（51）がすべて終了コード 0
- **ラッパー 14 個を 1 つずつ、変更前と突き合わせた**（reviewer）。
  送る `type` / `data` / `history`、既定引数、`confirm()` の文言、
  メニューを閉じる順序まで一致。**違うのはログの文字列だけ**
- **旧 `backward_hist()` と `forward_hist()` の本体を、pop の呼び先だけ
  同じ文字列に置換して diff したところ完全に一致**（reviewer）。
  まとめても失われるものが無いことの裏
- **`GameInfo` の 6 つの更新メソッドを、ブラウザから実際に操作して
  確かめた**（verifier）。`CubeState.from_dict()` をやめた件も、
  `parse()` が 3 つのキーを必須で組み立てているので同じ結果になることを
  確認（reviewer）。ファイルから読む経路（`BoardState.from_dict()`）は
  触っていないので、「必須キーの欠落を例外にする」は保たれている
- **テストを 2 件足した。**
  - Ctrl-Z / Ctrl-Y（`clicks.test.mjs`）。書き換えた経路で、押して
    見ているものが無かった
  - **確認をキャンセルすると「履歴を削除」が送られない**（同）。
    `confirm` の分岐は今回新しく書いたのに、テストは `confirm()` を
    自動 OK しているだけで、キャンセル側を誰も見ていなかった
    （reviewer の指摘）。`menu_emit()` の分岐を潰すと、この 1 件だけが落ちる
- **わざと壊して狙ったテストが落ちることを、合計 5 通りで確かめた**
  （implementer が 4 通り、main が confirm の分岐で 1 通り）

## 残ること

- `back2` / `fwd2`（連続で戻す・進める）は、ブラウザで押してメッセージが
  送られることまでは見ているが、**再生そのものをブラウザで目視していない**
  （verifier が明記）。サーバ側の連続再生は pytest が見ている
- `menu_emit()` という名前を Ctrl-Z / Ctrl-Y からも呼んでいる（reviewer の
  「検討」）。メニューを閉じるのは両方に要るので、そのままにした

## 分担の振り返り

- **reviewer が 2 件の文書の食い違いと、テストの穴を見つけた。**
  `docs/Developer.md` のクラス階層図に `ClockLimit` が残っていた件は、
  `ui/base.js` の図だけ直して対になっている mermaid を忘れたもの。
  **同じ図を 2 箇所に持っているので、片方だけ直すと誤った図が残る。**
  依存図に `gameinfo --> message` が無い件も同じ
- **「confirm のキャンセル側を誰も見ていない」は reviewer だけが気づいた。**
  verifier は依頼された範囲（ラッパーが押せるか、6 つの更新メソッドが
  効くか）を実ブラウザで確かめたが、**新しく書いた分岐そのものは
  依頼に無かった**ので届かなかった。TODO-039 と同じ形で、
  「指示された項目を確かめる」verifier と「指示に無い壊れ方を探す」
  reviewer の役割分担がそのまま出ている
- **implementer を Opus 5 に上げたのは効いた。** `GameInfo` の更新メソッドの
  引数を変える件で、reviewer が指摘するような取りこぼし（`from_dict()` の
  既定値、frozen の書き換え、循環 import）がどれも無かった。
  料金は implementer が $2.2 で、Sonnet だった TODO-037（$2.1）と
  ほぼ同じ。**込み入った項目では上げて損が無い**
- 次に同じ規模（構造が変わる、挙動が変わりうる）の項目をやるなら、
  同じ組み方でよい。ただし **reviewer への依頼に「新しく書いた分岐に
  テストがあるか」を毎回入れる**。TODO-038 と TODO-039 で続けて
  同じ穴が出た
