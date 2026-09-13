# TODO-047. `message.py` の `from_dict` をまとめる

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | verifier |
| 実施 | Opus 5 / effort 既定（high） | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | 既定（high） | 5,009 | 10,511 | 76% |
| verifier | Sonnet 5 | medium | 8,924 | 46,973 | 24% |
| 合計 |  |  | 13,933 | 57,484 | 概算 $1.7 |

- verifier は定義のまま（Sonnet 5 / medium）
- 分岐が変わらないので、レビューの担当は入れていない（見込みどおり）

## きっかけ

`message.py` の 13 個の dataclass が、どれも「`data` のキーを同じ名前の
フィールドへ写すだけ」の `from_dict()` を手で書いていた。

## やったこと

`dataclasses.fields()` を使う mixin `_FromDict` を 1 つ置き、10 個の
`from_dict()` を消した（287 行 → 249 行）。

残したのは 3 つ。

| 残した `from_dict` | 理由 |
|--------------------|------|
| `GameInfoData` | `data` 全体を 1 つのフィールドに入れる（キー名で写せない） |
| `DiceData` | `list(data['dice'])` でコピーする |
| `PlayerClockData` | `list(data['clock'])` でコピーする |

mixin は dataclass にしていない。そのため `fields(cls)` の引数が
dataclass だと型の上で分からず、mypy と basedpyright が 1 件ずつ指摘した。
`fields(cast(Any, cls))` で塞いだ（呼ばれるのは dataclass のサブクラスだけ）。

## 確かめたこと

| 対象 | 結果 |
|------|------|
| `uv run pytest` | 227 passed |
| `uv run ruff check .` / `mypy src` / `basedpyright` | 指摘なし |

verifier が移す前の `message.py` をスクラッチへ書き出し、`DATA_TYPES` の
全 `type` について移す前と今の `parse()` を並べて比べた。

- 正しい `data` を渡したときの返り値
- `data` のキーを 1 つずつ抜いたときに `KeyError` になること
- 余分なキーを無視すること
- `DiceData.dice` / `PlayerClockData.clock` が渡したリストの複製であること

**すべて一致。** `_FromDict.from_dict()` の `data[f.name]` を
`data.get(f.name)` にわざと壊すと、`test_parse_raises_on_missing_key` が
落ちることも確かめた。

## 分担の振り返り

- **verifier が見つけたもの**: 無し（移す前と今で挙動が一致した）。
  「テストが通る」だけでなく**移す前の版と並べて比べる**依頼にしたので、
  既存のテストが見ていない「余分なキーを無視する」「リストを複製する」も
  確かめられた
- **見込みとの食い違い**: 担当は見込みどおり。main のモデルだけ Opus
  （切り替えるのは利用者）
- **次に同じ規模でやるなら**: 同じ組み方でよい。1 ファイルで分岐が
  変わらない整理は、verifier 1 本で $0.4。main が最初に書いた書き換えの
  スクリプトが正規表現で広く取りすぎて 1 回やり直したので、
  **複数のブロックを消すときは行単位で処理する**
