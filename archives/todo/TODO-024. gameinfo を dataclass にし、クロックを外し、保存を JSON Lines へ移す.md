# TODO-024. gameinfo を dataclass にし、クロックを外し、保存を JSON Lines へ移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 18,418 | 59,291 | 22% |
| implementer | Opus 5 | medium | 29,202 | 138,249 | 35% |
| reviewer | Opus 5 | high | 27,730 | 130,907 | 31% |
| verifier | Sonnet 5 | medium | 29,098 | 137,876 | 12% |
| 合計 |  |  | 104,448 | 466,323 | 概算 $12.2 |

- implementer と reviewer は定義のモデルが sonnet。構造の移し替えと
  挙動のレビューなので Opus 5 に上書きした。effort は定義の frontmatter の値
- implementer は 2 回、verifier は 2 回動いている（1 回目のあとに
  reviewer の指摘を直し、直したところをもう一度確かめた）

## きっかけ

TODO-020 で決めた構成の中心。**構造・クロック・保存形式の 3 つは連動する**
ので 1 項目にまとめた（`GameInfo` が変われば `asdict` / `from_dict` も
保存形式も変わり、クロックを外すこと自体が `GameInfo` の構造変更）。

型と構造は [`docs/design.md`](../../docs/design.md) の「GameInfo」「クロックは
gameinfo の外」「保存は JSON Lines」にある。

### 決めたこと

- **クロックは `clock_state` に `limit` を足して 1 本にまとめる。**
  JS は `gameinfo.clock_limit` と `gameinfo.board.clock` を見るのをやめ、
  クロック関連をすべて `clock_state`（`sw` / `active` / `clock` / `limit`）
  から読む。送信は今までどおり `gameinfo` 1 本（TODO-015）
- **旧形式の読み込みは当面残す。** 消すのは別項目（TODO-031）にして、
  移行が済んだのを確かめてから決める

着手時に main が決めた 9 点（保存形式の詳細、`active` を保存しない理由、
旧形式の扱い、`new_game()` の範囲、JS の追随範囲）は
[`archives/agents/TODO-024/README.md`](../agents/TODO-024/README.md) にある。

## やったこと

### 新しく作ったもの

- `src/ytbg/gameinfo.py` — `GameInfo` / `BoardState` / `CubeState`。
  `to_dict()` は `dataclasses.asdict()`、`from_dict()` は自前。
  **`strict=True` を渡すと必須キーの欠落が `KeyError` になる**
- `src/ytbg/clock.py` — `Clock`。`limit` / `sw` / `active` / 残り時間 /
  基準の時刻を持ち、`cur()` / `freeze()` / `reset()` / `start()` /
  `resume()` / `stop()` / `state()` / `to_dict()` / `from_dict()` を持つ
- `src/ytbg/storage.py` — `Storage`。JSON Lines の保存・読み込みと旧形式の変換
- `tests/test_clock_unit.py` — `Clock` 単体（22 件）

### 直したもの

- `yt_backgammon.py` — `_gameinfo` が `GameInfo` になった。
  `set_clock_limit()` / `set_player_clock()` は `Clock` へ移って消えた。
  `new_game()` を足し、**`board` を作り直して `turn` を 2、`resign` を -1 に
  戻すだけ**にした（`score` / `playername` / `game_num` / `match_score` は残る）
- `yt_backgammon_server.py` — `_clock_sw` / `_clock_active` / `_clock_start`
  が `Clock` 1 つになり、`_cur_clock()` / `_freeze_clock()` /
  `_reset_clock()` / `hist_ent2str()` が消えた。
  **`_load_hist_ent()` の「クロックの残り時間だけは引き継ぐ」例外も消えた**
  （クロックが `gameinfo` の外に出たので要らない）。
  `new_game()` の退避・書き戻しも消えた
- `ytbg.js` — `Board.load_gameinfo()` がクロックを `clock_state` からだけ
  読むようにした。`clock_state` が無いときの分岐は消した。**JS の変更はここだけ**
- `tests/` — 属性アクセスへ直し、`conftest.py` に `make_bg_server`
  （サーバを作る時点をテスト側で決められるフィクスチャ）を足した。
  保存・読み込みのテストは書き直して増やした（147 件）

### 保存の形

```
{"v": 2, "clock": {"limit": [120, 12], "sw": true, "clock": [[120, 12], [120, 12]]}}
{"h": {...gameinfo...}}
{"f": {...gameinfo...}}
```

- **`active` は保存しない。** サーバが落ちている間の時間は数えられないので、
  読み込んだときは必ず止まった状態で始める
- **`set_clock_switch` だけは `history: false` でも保存する。**
  `ytbg.js` の `apply_clock_sw()` がそう送るので、ここで保存しないと
  「切ったまま再起動しても戻ってしまう」。`start_clock` / `stop_clock` /
  `resume_clock` / `reset_clock` はターンのたびに走るので保存しない
- 日本語のプレーヤー名はそのまま書く（`ensure_ascii=False`）。そのぶん
  `open()` に `encoding='utf-8'` が要る
- 旧形式（`.json`）は `.jsonl` が無いときだけ読み、**旧ファイルは消さない**

## 確かめたこと

`uv run pytest`（147 passed）、`uv run ruff check .`、`uv run mypy src`、
`node --test tests/browser/`（5 pass）がいずれも終了コード 0。

**実際に動かして確かめたもの**（verifier。報告は
[verifier-report.md](../agents/TODO-024/verifier-report.md) と
[verifier-report2.md](../agents/TODO-024/verifier-report2.md)）:

- 旧形式の `.json` を置いて起動 → 履歴・盤面・`clock_limit` が引き継がれ、
  `.json` は消えず `.jsonl` が新しく書かれる
- 2 枚のタブでクロックが同期し、`clock_state.limit` が届く
- **Clock のチェックボックスを外して再起動 → 外れたまま**（`sw` の保存）
- **`checker` のキーを落とした `.jsonl` で起動 → 落ちずに初期配置で立ち上がり、
  ログに警告が出る**
- 日本語のプレーヤー名が `\uXXXX` ではなくそのまま書かれ、読み直して戻る

**わざと壊して狙ったテストが落ちることを、実装側で 9 通り確かめた**
（`Storage.save()` が既定の `Clock` を書く、`.jsonl` より旧形式を先に読む、
`_old_clock()` が旧形式を見ない、`Clock.to_dict()` が `active` も保存する、
`_load_hist_ent()` が `reset()` を呼ぶ、`Clock.freeze()` が時刻を打ち直さない、
`GameInfo.to_dict()` がクロックを残す、`set_clock_switch` の保存を消す、
必須キーの検査をやめる）。verifier がそのうち 3 通りを自分で再現した。

## 残ること

- **`set_clock_limit` が、中身の同じ履歴を 1 件積む。** `ytbg.js` が
  `history: true` で送るが、`clock_limit` は `gameinfo` から出たので
  `sn` 以外は 1 つ前と同じエントリになる。積まれること自体は前からだが、
  積まれるものが「差分のあるエントリ」から「同じエントリ」に変わった。
  `history` フラグの付け方の見直しなので、直すなら別項目
- **`set_gameinfo` の入口は緩いまま。** `GameInfo.from_dict()` の既定は
  `strict=False` なので、壊れた dict が来ると既定値の盤面になる。
  入口の検査は TODO-026（`message.py` の `parse()`）の担当。
  **ファイルからの読み込みは `strict=True` で塞いである**
- **`set_gameinfo` で渡されたクロックは無視される。** 送るクライアントは
  今のところ無い
- 非 UTF-8 ロケールでの `encoding='utf-8'` の効きは、この機械に
  非 UTF-8 ロケールが無いため切り分けられなかった

## 分担の振り返り

- **reviewer が重大な 1 件を見つけた。** 「`sw` を保存する」という前提が、
  実装もテストも通っているのに**満たされていなかった**（テストが
  `history: True` で送っており、クライアントが実際に送る `history: false` の
  経路を通っていなかった）。verifier は「テストが通るか」を見る担当なので、
  この種の「テストが間違っている」は捕まえられない。**挙動が変わる項目に
  reviewer を入れる決まりが、そのとおりに効いた**
- reviewer はほかに、`encoding` 未指定 ＋ `ensure_ascii=False` の組み合わせ、
  `from_dict()` が綴り違いを黙って既定値にすること、`LOAD_ERRORS` の広さも
  見つけた。いずれも「テストは通るが壊れ方が重い」たぐいで、
  **verifier の担当範囲の外**
- **見込みと食い違ったのは、回数**。implementer と verifier が 2 回ずつ
  動いた（指摘を直して確かめ直した）。1 回で終わる見込みだった
- 料金は $12.2 で、implementer 35% + reviewer 31% が大半。
  **reviewer に旧実装との 1 対 1 の突き合わせを頼んだぶんが効いている**
  （クロックの計算が同値であることを、`git show 0831b55` と照らして確認した）
- **次に同じ規模（構造の移し替え ＋ 挙動の変化）をやるなら、同じ 3 人で組む。**
  ただし **reviewer を実装の直後ではなく、verifier の 1 回目と同時に走らせる**
  のは今回やってよかった（並行にしたので待ち時間は短い）。一方で
  **同じ作業ツリーを verifier が壊しては戻すので、reviewer が「壊した版」を
  読む瞬間が 2 回あった**。次は verifier に `git worktree` で別の作業ツリーを
  使わせるか、reviewer → verifier の順に直列にする
