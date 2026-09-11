# TODO-032. history フラグの付け方を見直す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 40,211 | 203,313 | 35% |
| implementer | Sonnet 5 | medium | 52,598 | 195,497 | 30% |
| reviewer | Opus 5 | high | 28,518 | 235,459 | 27% |
| verifier | Sonnet 5 | medium | 13,109 | 159,293 | 8% |
| 合計 |  |  | 134,436 | 793,562 | 概算 $14.7 |

- implementer と verifier は定義（`~/.claude/agents/`）のまま
  （`model: sonnet` / `effort: medium`）
- reviewer は定義が `model: sonnet` / `effort: high`。挙動が変わる項目なので
  呼び出し時に Opus 5 へ上書きした

## きっかけ

TODO-024 で `clock_limit` を `gameinfo` から出したあと、reviewer が見つけた。
`ClockLimit.emit_set()` は `set_clock_limit` を `history: true` で送るが、
`clock_limit` は `gameinfo` に無くなったので、**積まれるエントリは `sn` 以外
すべて 1 つ前と同じになる**。`back` を 1 回押しても盤面が変わらない手が挟まる。

着手時に調べたところ、実際に無駄なエントリを作っているのは `set_clock_limit`
だけだった。`set_player_clock` は `PlayerClock.emit()` の既定が
`add_hist=false` で、呼び出し側も何も渡していない。

## 決めたこと

**履歴に積むかどうかを、すべてサーバ側の `type` ごとの表で決める**方針で
始めたが、調べていくうちに**それでは 1 手の区切りを表せない**ことが分かり、
利用者と相談して次の形にした。

1 つの操作で複数のメッセージが飛び、**最後の 1 通だけが `history: true`**
になっている。

| 操作 | 送られるメッセージ |
|------|-------------------|
| チェッカーを動かす | `put_checker`（false、ヒット時は 2 通）→ `dice`（true） |
| オープニングロール | `dice`（false）→ `set_turn`（true） |

**`dice` は前者では最後、後者では途中**なので、`type` だけでは区切りを
決められない。完全に表で決めると、ヒットを含む 1 手が履歴 3 件になり、
back を 3 回押すことになる。

そこで、

- **クロック系の 7 つの `type` は、サーバ側の表で履歴に積まないと決める**
  （`gameinfo` を書き換えないので、`history: true` で届いても積まない）
- **盤面系の `type` は、いまどおりクライアントが 1 手の区切りを知らせる**
- **1 つ前のエントリと `sn` 以外が同じなら積まない**

## やったこと

- `src/ytbg/message.py` — `NO_HISTORY_TYPES` を足した。
  `set_clock_limit` / `set_player_clock` / `set_clock_switch` /
  `start_clock` / `resume_clock` / `stop_clock` / `reset_clock` の 7 つ
- `src/ytbg/server.py` — `on_json()` の末尾を
  `if m.history and m.type not in NO_HISTORY_TYPES:` にした
- `src/ytbg/history.py` — `History.add()` が、1 つ前と `sn` 以外が同じなら
  積まないようにした。**積む・積まないに関わらず `_fwd_hist` は必ず捨てる。**
  戻り値の意味を「積んだか」から**「履歴が変わったか（保存が要るか）」**に
  変えた
- 保存の取りこぼしを塞いだ。`_on_set_clock_limit()` に `save_data()` を足し、
  `new_game()` は `add_history()` と二重になっても必ず保存するようにした
- `ui/clock.js` — `ClockLimit.emit_set()` の `add_hist` 引数を消し、常に
  `history: false` で送るようにした（サーバが無視するので意味が無くなった）。
  呼び出し側は `board.js` の `apply_clock_limit()` 1 箇所
- `tests/conftest.py` — 同じ盤面は積まれなくなったので、
  「1 手ぶん盤面を変えてから積む」ヘルパーを足し、
  `add_history(bg_server._gameinfo)` を繰り返していたテストを置き換えた
- `CLAUDE.md` — 「状態と通信」と「履歴（戻す・進める）」の節に足した

## 確かめたこと

`uv run pytest`（233 件）/ `uv run ruff check .` / `uv run mypy src` /
`uv run basedpyright` / `node --test tests/js/` / `node --test tests/browser/`
がすべて通る。

**通ることだけを見ず、わざと戻して落ちることも確かめた**（verifier が別途再現）。

- `server.py` の `NO_HISTORY_TYPES` のガードを外す
- `history.py` の重複排除の判定を外す
- `ui/clock.js` の `emit_set()` が `true` を送るように戻す（ブラウザのテスト）
- 上の 2 件の修正をそれぞれ戻す

**レビューで実際のバグが 2 件見つかり、直してから決着させた。**

1. **New Game が進む側の履歴を捨てなくなっていた。**
   `new_game()` は `score` / `playername` / `game_num` / `match_score` を
   残すので、盤面がすでに初期配置なら New Game 後の `gameinfo` は直前の
   エントリと `sn` 以外すべて同じになり、積まれない。`_fwd_hist` を捨てる
   処理は `History.add()` の中にしか無かったので、**New Game のあとに
   「進む」を押すと前のゲームの手が復活した**（共有ボードなので全員の画面が戻る）。
   当初は「積まないときは `_fwd_hist` を捨てない」と決めていたが、これを撤回し、
   変更前と同じ「必ず捨てる」に戻した
2. **`set_clock_limit` がファイルに保存されなくなっていた。**
   これまでは `history: true` → `add_history()` → `save_data()` の経路で
   保存されていた。その経路が消えたので、変更直後にサーバを落とすと黙って
   元に戻った。New Game のときのクロックのリセットも同じだった

## 分担の振り返り

- **各担当が何を見つけたか。**
  reviewer が上の 2 件を見つけた。どちらも**テストが全部通っている状態**で
  見つかったもので、verifier の 6 つの検証では捕まらなかった。
  「動くか」と「良いか」を分けた効果がそのまま出た形。
  verifier は、わざと戻して落ちることを自分で再現し、
  テストの書き換えで assert が弱くなっていないことを確かめた。
  implementer は指示どおり実装し、「重複排除と `NO_HISTORY_TYPES` の
  機能が重なる」ことを自分から報告した
- **見込みと食い違ったのはなぜか。**
  担当の編成は見込みどおり（implementer + verifier + reviewer）。
  食い違ったのは**設計のほう**で、「サーバ側の表ですべて決める」で
  立てた項目が、着手して調べた結果「クロック系だけ表で禁じる」に変わった。
  `dice` が操作によって最後にも途中にもなることは、**コードを読むまで
  分からなかった**。料金は概算 $14.7 で、main が 35%、reviewer が 27%
- **次に同じ規模ならどう組むか。**
  同じ組み方でよいが、**reviewer を最初から Opus にする判断は正しかった**
  （見つけた 2 件はどちらも「テストは通るが挙動が変わる」類い）。
  減らせる余地は main 側にある。着手前の調査（JS の `emit_msg()` の
  呼び出し元をすべて読む）を main が自分でやったが、ここは
  `Explore` に読むファイルを名指しして渡せば安く済んだ。
  ただし**「`dice` が操作によって位置が変わる」という発見は、
  規約と設計に照らした判断**なので、`Explore` に任せきりにはできない。
  調査の「集める」部分だけを外に出すのがよい
