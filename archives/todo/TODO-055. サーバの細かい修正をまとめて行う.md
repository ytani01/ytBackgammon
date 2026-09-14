# TODO-055. サーバの細かい修正をまとめて行う

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier + reviewer |
| 実施 | Opus 5 / effort medium | verifier + reviewer（2 巡。2 巡目は確認だけ） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 22,270 | 59,084 | 70% |
| reviewer | Opus 5 | high | 16,564 | 92,823 | 17% |
| verifier | Sonnet 5 | medium | 21,625 | 151,734 | 14% |
| 合計 |  |  | 60,459 | 303,641 | 概算 $10.5 |

- reviewer は定義のモデルが sonnet。`load_data()` の判断と `Developer.md` を
  今の実装と照らす判断が要るので Opus 5 に上書きした。effort は定義の値
- verifier は定義のまま（Sonnet 5 / medium）
- 集計は `--since` で TODO-054 の決着のコミットから切った。main の割合が大きいのは、
  実装と `Developer.md` の書き直しを main が行い、長くなった会話の cache_read が
  そのたびにかかったため

## きっかけ

TODO-049 で決めた構成の見直し（第 3 弾）の最後。サーバに残っていた細かい点と、
構成が変わった分の文書を片付ける。`server.py` を変えるので、TODO-050 と差分が
混ざらないよう最後にした。

## やったこと

- **保存先を、`BackgammonServer` を作るときに環境変数から読む。**
  クラス変数 `DATAFILE_DIR` を消した。テストの差し替えも、クラス変数の
  monkeypatch から環境変数 `YTBG_DATA_DIR` の差し替えに変えた（`conftest.py`、
  `test_ws.py`）。**レビューのあとで `HOME` も一時ディレクトリに差し替えた**
  （import のときに読む形へ戻っても、利用者の `$HOME` に書かないように）。
  `test_datafile_dir.py` はモジュールを読み直さず、環境変数を変えてからサーバを
  作る形に書き直し、「import したあとで環境変数を変えても効く」を足した
- **`add_history()` の `gameinfo=None` と `History.add()` の `None` の分岐を消し、**
  `History._cur_sn` をなくした（通し番号は戻す側の末尾の `sn` から求める）
- **`load_data()` は「読めて、履歴が 1 件以上あったか」を返す。** 呼ぶ側は今の盤面を
  1 件目として積むかどうかにしか使っていなかった。ヘッダだけで履歴が 0 件のファイルでも
  1 件目を積むテストを足した（確認の担当が、壊しても落ちないことを見つけたため）
- `backward_hist()` / `forward_hist()` の docstring を「`n <= 0` で最後まで」に揃えた
- **`docs/Developer.md` を今の構成に合わせて書き直した。** 通信（1 つの操作を 1 通、
  名前付きの操作、盤面と合わない操作を捨てる、1 つの登録表と型の確かめ）、先行実行、
  クライアントの `actions.js` / `drag.js` / `Settings`、表示部品に要素を渡すこと
- **`docs/design.md` を `archives/docs/design-3.md` へ移した。** 冒頭に「実装した構成で
  現行仕様ではない」ことを書き、`CLAUDE.md` の構成の節にも書いた。`design.md` を
  指していたテストのコメントも直した

## 確かめたこと

- verifier（1 巡目）が一式を 1 回: `uv run pytest`、`ruff`、`mypy src`、`basedpyright`、
  `node --test tests/js/`、`node --test tests/browser/`。すべて通った。
  2 巡目は JS を変えていないので、Python の検証と `tests/js/` だけ
- **利用者の `~/ytbg-*` の更新時刻が、検証の前後で変わらなかった**
- わざと壊して落ちること: 保存先をクラス変数に戻すと `test_datafile_dir.py` の 4 件が
  落ちる。`load_data()` を「履歴 0 件でも True」にすると、1 巡目では何も落ちず、
  2 巡目で足したテストが落ちた。`History.add()` の `sn` をずらすと履歴のテストが落ちる
- 変更前と並べて、ヘッダだけ・進む側だけ・壊れたファイルの 3 通りで起動の判断が
  同じになることを、レビュー担当が実測した

## 分担の振り返り

- **各担当が見つけたこと**
  - reviewer: 保存先を import のときに読む形へ戻る退行が起きると、テストが本物の
    `$HOME` に書くこと（実測で `ytbg-test.jsonl` が作られた）。`Developer.md` の
    「type を足すときに直すのはこれだけ」に `apply()` が抜けていたこと、得点の ▲▼ の
    予測が free move に限るように読めること。docstring と注釈の細かい点
  - verifier: `load_data()` を壊しても落ちないテストの穴。`HOME` を差し替えずに
    壊した形で走らせかけたが、途中で伝えた注意に従い一時ディレクトリで走らせ直した
- **見込みとの食い違い:** 担当は見込みどおり。main が実装と文書を持ったので、
  料金の 70% が main になった
- **次に同じ規模の項目をやるなら**
  - **保存先や `HOME` に関わる箇所をわざと壊す依頼では、最初から「`HOME` を一時
    ディレクトリにする」と書く。** 今回はレビューが先に気づいたので間に合ったが、
    確認とレビューを同時に走らせると、気づく前に壊した形で走ってしまう
  - 長くなった会話で main が実装すると cache_read がかさむ。コードの変更が
    数ファイルでも、`Developer.md` のような長い文書の書き直しを含むなら、
    implementer に任せて main は依頼と判断に絞る方が安い見込みがある
