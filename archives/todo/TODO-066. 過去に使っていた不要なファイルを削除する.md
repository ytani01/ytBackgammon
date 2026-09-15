# TODO-066. 過去に使っていた不要なファイルを削除する

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort medium | verifier |
| 実施 | Opus 5 / effort medium | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | medium | 2,524 | 8,909 | 63% |
| verifier | Sonnet 5 | medium | 5,709 | 44,909 | 37% |
| 合計 |  |  | 8,233 | 53,818 | 概算 $0.7 |

## きっかけ

利用者から、過去に使っていて今は要らないファイルが残っていないか確かめるよう
依頼があった。`git grep` でファイル名を探し、`archives/` を除いてどこからも
参照されていないものを挙げた。

GitHub Pages の設定、`docs/images0/`、`.gitignore` のテンプレートの行の扱いは、
項目を立てる前に利用者に聞いて決めた（どれも削除または整理する）。

## やったこと

削除したもの:

- 直下の `__pycache__/`（git の管理外。旧構成の `MyLogger` / `ytBackgammon` /
  `ytBackgammonServer` / `ytbg` の `.pyc`）
- 直下の `bg.png`, `bg0.png`, `cloth_00043.png`, `twinkle_00028.png`
- `docs/ytBackgammon2.png`, `docs/ytBackgammon3.png`, `docs/ytBackgammon-a.png`,
  `docs/ytbackgammon1-1.png`〜`1-3.png`
- `docs/images0/`（45 ファイル。README がリンクしているのは `docs/images0.zip`）
- `static/sounds/` の `backgammon-src.mp3`, `computerbeep_12.mp3`,
  `computerbeep_43.mp3`, `computerbeep_58.mp3`
- `static/images2/dice1a.png`
- `_config.yml`, `docs/_config.yml`（GitHub Pages のテーマ設定）

`.gitignore` は、GitHub の Python 用テンプレートの行を外し、このリポジトリで
使うもの（Python のビルド物、テスト・型チェックのキャッシュ、`.venv`、
`node_modules`、`.codegraph`）だけにした。

残したもの: `*.xcf` と `images1a/ytbg.pptx` / `ytbg-pptx.png` はデザインの
元ファイルで、`pyproject.toml` でパッケージから除外しているので残した。

## 確かめたこと

verifier が確かめた（[報告](../agents/TODO-066/verifier-report.md)）。

- 削除したファイルがチェックリストと一致し、漏れも余分も無い
- 削除したファイル名への参照が `archives/` 以外に無い
- `uv run pytest`（358 件）、`uv run ruff check .`、`node --test tests/js/`
  （156 件）、`node --test tests/browser/`（105 件）が通る
- `.gitignore` の整理後も `.venv` などは無視されたままで、テストを走らせても
  未追跡のファイルが出ない

Python のコードは変えていないので、mypy と basedpyright は走らせていない。

## 分担の振り返り

- verifier は問題を見つけなかった。削除の漏れと過剰、参照、テストを一通り確かめた
- 見込みと食い違いは無い
- 次に同じ規模の削除をやるなら、同じく main が削除して verifier（Sonnet）1 人で
  確かめる。料金の 37% がテスト一式を走らせた verifier なので、参照の確認と
  `.gitignore` の確認だけなら Haiku に下げてもよいが、ブラウザのテストを走らせる
  なら Sonnet のままにする
