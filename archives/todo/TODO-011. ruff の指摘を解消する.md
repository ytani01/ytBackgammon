# TODO-011. ruff の指摘を解消する

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort high | verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 32,712 | 61,322 | 62% |
| reviewer | Opus 5 | high | 10,155 | 59,122 | 21% |
| verifier | Sonnet 5 | medium | 19,692 | 96,620 | 17% |
| 合計 |  |  | 62,559 | 217,064 | 概算 $4.5 |

- reviewer は定義のモデルが sonnet。例外の扱いが変わる判断なので Opus 5 に
  上書きした。effort は定義の high のまま
- verifier は定義のまま（sonnet / medium）
- 集計の始点は `--since '2026-09-10 03:56:31'`。TODO-011 を立てたコミットの
  あとに TODO-012、TODO-013、TODO-007 を立てる作業が挟まっているので、
  そちらを終えた時刻で切った

## きっかけ

TODO-009 で Flask + gevent から Starlette + uvicorn へ移す前に、
先に片付けておくべきものを洗い出したときに挙がった。

TODO-002 で ruff を入れたが、`yt_backgammon_server.py` の指摘が 19 件
残っていた（UP031 が 17 件、BLE001 が 2 件）。TODO-009 では「保存の形式と
`save_data()` の呼び方は同期のまま移す」と決めているので、`hist_ent2str()` は
移行では触らない部分にあたる。整形の差分と設計の差分が混ざらないよう、
先に片付けることにした。

## やったこと

### `hist_ent2str()` の `%` 書式を f-string にした（UP031、17 件）

`board` / `cube` / `name0` / `name1` / `accepted` を局所変数へ取り出してから
f-string で組み立てる形にした。`new_game()` が `score0` / `player0_name` の
ように同じ形で取り出しているので、書き方はそちらに合わせた。

`%d` は `{...:d}` にした。`%d` は `float` を黙って切り捨てるが `:d` は
`ValueError` になるので、`:d` を使うのは値が `int` であることが前提になる。
`:d` にした 6 つ（`sn` / `game_num` / `match_score` / `turn` /
`cube.side` / `cube.value`）について、

- 実データ `~/ytbg-1.json`〜`~/ytbg-4.json` の 62 エントリすべてで `int`
- クライアント側（`ytbg.js`）が送るのは整数リテラルか `parseInt()` の結果
- `sn` は `add_history()` がサーバ側の `_cur_sn` で上書きするので、
  クライアントの値は使われない

を確かめたうえで採用した。

### `except Exception` を絞った（BLE001、2 件）

- `save_data()` → `except OSError`
- `load_data()` → `except (OSError, UnicodeDecodeError, json.JSONDecodeError,
  KeyError)`

`load_data()` は、`data['history']` / `data['fwd_hist']` の取り出しも `try` の
中へ移した。**壊れた保存ファイルがあってもサーバが起動する**ようにするのが
狙い（利用者と決めた）。`load_data()` は `__init__()` から呼ばれ、そこは
ハンドラの外なので、例外が抜けるとサーバが起動しない。

取り出しは局所変数へ受けてから `self._history` / `self._fwd_hist` へ代入する。
`{"history": []}` のように片方のキーだけ無いファイルでも、`_history` だけ
書き換わった状態にならない。

なお `data['history']` の `KeyError` は、**変更前も `try` の外にあって上へ
抜けていた**。今回それを拾うようにしたのは「変更前に戻す」のではなく、
変更前より広げたことになる。

### テストを 3 種類足した

`tests/test_save_load.py`（10 件 → 16 件）。

- `test_hist_ent2str_format` — 1 エントリ分の出力を丸ごと突き合わせる。
  日本語・`"`・`\` を含む `playername`、負の `turn`、`cube.accepted = false`
  を入れてある
- `test_hist_ent2str_is_valid_json` — 末尾のカンマを外すと JSON として読める
- `test_load_data_broken_file_returns_zero` — 壊れた 4 通りのファイル
  （壊れた JSON、`history` キー無し、`fwd_hist` キー無し、不正な UTF-8）で
  `(0, 0)` を返し、元の履歴を書き換えない

既存の `test_save_and_load_roundtrip` は往復が成立するかしか見ておらず、
書式が変わっても通ってしまう。保存の形式は TODO-009 でも変えないと決めて
いるので、形そのものを押さえるテストを足した。

## 確かめたこと

- `uv run ruff check .` → 全通過
- `uv run pytest` → 16 件通過
- `uv run mypy src` → 7 件。すべて `__main__.py` の `svr = None` 由来で、
  変更前から増えていない（この項目の対象外）
- **`hist_ent2str()` の出力が変更前と完全に一致する。** main は実データ
  62 エントリ（1430 行）で、verifier は自作データ 18 通り＋`save_data()`
  全体 3 通りで確かめた。verifier のデータには日本語・引用符・
  バックスラッシュ・絵文字・負数・複数桁が入っている
- **足したテストが実際に効く。** verifier が実装を 2 か所わざと壊し
  （`hist_ent2str()` の末尾の空白を 1 つ削る、`except` から `KeyError` を
  外す）、狙ったテストだけが落ちることを確かめた。壊した実装は戻して
  `git diff` の一致まで確認している
- **壊れたファイルがあってもインスタンスが作れる。** verifier が
  `__init__()` 経由で 3 通りの壊れたファイルを置いて確かめた

## 残ること

reviewer が見つけた、この項目の範囲外のもの。

- **`set_gameinfo` の経路が今も動いていない。** `ytbg.js` の
  `gen_gameinfo()` は `board.checker` ではなく `board.point` を出力し、
  `playername` に存在しないキー（`board.player_name`）を入れる。実測で
  `KeyError: 'playername'` になる。この経路は `index.html` でコメントアウト
  されている「保存 / 読み込み」メニューからしか使われない
- **`str(list)` を JSON として書き出している。** `score` / `clock` /
  `dice` / `checker` は `str()` の結果をそのまま書いている。中身が int の
  リストである限り JSON として通るが、要素が文字列や bool になると壊れる。
  変更前と同じ
- **`save_data()` で例外が抜けると、そのプロセスの間ずっと保存されなくなる。**
  `add_history()` は `_history.append()` の後に `save_data()` を呼ぶので、
  `hist_ent2str()` で落ちるエントリが `_history` に残り続ける。変更前と同じ

## 分担の振り返り

- **reviewer が main の書いたコメントの誤りを見つけた。** main は
  `save_data()` に「`hist_ent2str()` の型の誤りは握りつぶさずに上へ返す」と
  書いたが、`hist_ent2str()` は `try` の**外**で呼ばれており、その例外は
  変更前から上へ抜けていた。main は依頼文にも同じ誤りを書いており、
  **reviewer は依頼文の前提そのものを疑って直した**。コードの動きを追わずに
  コメントだけ書くと、こうなる
- **verifier は「出力が変わらないこと」を自作データで確かめた。** main が
  使った実データは `playername` がすべて空文字列で、`json.dumps()` を通る
  経路をほとんど踏んでいなかった。日本語・引用符・バックスラッシュ・絵文字を
  入れて 18 通り試したのは verifier
- **verifier に「テストを壊して落ちるか確かめよ」と頼んだのが効いた。**
  足したテストが本当に効くかは、書いた本人には確かめられない。実装を 2 か所
  壊して、狙ったテストだけが落ちることを見せてもらった
- **見込みと食い違ったのは、判断が 2 回に増えたこと。** 立てたときは
  「BLE001 で何を拾うか決める」だけのつもりだったが、reviewer の指摘で
  「壊れたファイルを捨てるか、落として気づかせるか」が出てきて、利用者に
  もう一度聞くことになった。実装 → レビュー → 判断 → 実装 → 確認、と
  2 巡している
- **次に同じ規模（1 関数の書式と例外 2 か所）の項目をやるなら、同じ組み方で
  よい。** ただし **reviewer を先に、実装の直後に走らせる**。今回は verifier と
  reviewer を同時に起動したので、verifier は「コメントが誤っている実装」を
  確かめる形になり、reviewer の指摘のあと verifier をもう一度動かした
  （2 回で $0.7）。挙動が変わる項目では、reviewer が終わってから verifier を
  動かすほうが、確認のやり直しが 1 回減る

分担にした理由と各担当の報告は
[archives/agents/TODO-011/](../agents/TODO-011/README.md) にある。
