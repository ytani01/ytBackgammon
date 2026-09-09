# TODO-013. on_json の分岐ごとのテストを足す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 24,494 | 142,792 | 42% |
| implementer | Sonnet 5 | medium | 45,146 | 305,588 | 27% |
| verifier | Sonnet 5 | medium | 22,000 | 91,481 | 18% |
| reviewer | Opus 5 | high | 13,629 | 68,838 | 13% |
| 合計 |  |  | 105,269 | 608,699 | 概算 $8.7 |

- implementer と verifier は定義（`~/.claude/agents/`）のモデル・effort のまま
- reviewer は定義が sonnet。`CLAUDE.md` の「コードレビューには Opus を充てる」に
  従って Opus 5 に上書きした（effort は定義の high のまま）

## きっかけ

TODO-009 で通信層を Flask-SocketIO から Starlette + 素の WebSocket へ
入れ替える。そのときに壊れるとしたら `on_json()` の分岐なので、
**「この `type` を投げたら `gameinfo` がこう変わり、こう送られる」**を先に
固めておき、移行後は同じテストを通すだけで済むようにする。

いままでの `tests/` は 10 件で、`gameinfo` の更新、履歴、保存・読み込みだけを
見ていた（TODO-006）。

## やったこと

`src/` は変更していない。テストだけを足した。

- `tests/test_on_json.py` を新規に作り、`on_json()` の 17 分岐すべてを投げた。
  16 件から 57 件になった
  - 末尾へ落ちる 9 つ（`put_checker` / `cube` / `dice` / `set_turn` /
    `set_playername` / `set_score` / `resign` / `set_clock_limit` /
    `set_player_clock`）は、`gameinfo` の該当箇所だけが変わることと、
    受け取った `msg` がそのまま broadcast されること
  - `return` する 8 つ（`back` / `back2` / `back_all` / `fwd` / `fwd2` /
    `fwd_all` / `new` / `set_gameinfo`）は、元の `msg` が broadcast
    **されない**こと。ここが移行で崩れやすい
  - `emit_gameinfo()` が送るメッセージの `sec` / `hist_i` / `hist_n` /
    `history_flag` と、`broadcast=True` が付いていること
- `tests/conftest.py` を直した
  - `emitted` を、`emit()` の呼び出し引数のタプルを積むリストから、
    **送られたメッセージの列**を見る `EmittedMessages` に替えた
    （`messages` / `types` / `last` / `kwargs` / `last_kwargs` / `clear()`)。
    TODO-009 で通信層が変わっても、`fake_emit()` の差し替え方だけを直せば
    テスト側は残せる
  - `req` フィクスチャを足した（`on_json(request, msg)` の第 1 引数）。
    **`request` という名前は pytest の予約語**で、フィクスチャに使えない
  - `no_sleep` フィクスチャを足した。`back_all` / `back2` / `fwd_all` /
    `fwd2` は `on_json()` の中から `backward_hist(0)` などを呼ぶので、
    **テストからは `sleep_sec` を渡せない**

## 確かめたこと

**「通るか」ではなく「壊したら落ちるか」で確かめた。** テストが通ることを
見ても、そのテストが何も守っていない場合には気づけない。`src/` に故意の
変更（ミューテーション）を入れて、対応するテストが落ちるかを実測した。

reviewer が最初の版に対して実測し、**値を変えてもテストが通ってしまう箇所を
7 件見つけた**。

- 「受け取った `msg` がそのまま broadcast される」が同一オブジェクトの比較に
  なっており、送信直前に `msg` を書き換えても通る
- `broadcast=True` を全部外しても通る
- `history_flag` を反転しても通る
- `SEC_CHECKER_MOVE` を `0.2` → `0.9` にしても通る
- `hist_i` の定義をずらしても、差分だけを見ているので通る
- `fwd` 系の「broadcast されない」は、前準備で `_fwd_hist` が空のまま
  呼んでいたので **emit が 1 通も起きないまま**成立していた

これらを直したうえで、verifier が別に 13 種のミューテーションを試したところ、
**もう 1 つ穴が見つかった**。`set_score()` の `data['player']` を `0` に
固定しても落ちない。テストが `player: 0` を渡していたので、「指定を読んで
いる」場合と「0 に固定した」場合が区別できていなかった。同じ書き方の
`dice` / `set_playername` / `set_clock_limit` / `set_player_clock` も
同様だったので、5 件とも `1` 側を指定する形に直した。

最終確認（verifier・2 回目）で、この 5 件のミューテーションが落ちること、
先に検出できていたものが今も落ちることを確認した。

- `uv run pytest -q` — 57 passed
- `uv run ruff check .` — 0
- `uv run mypy src` — 7 errors（すべて `__main__.py`、TODO-002 で残した
  既存の指摘。`tests/` は見ていない）

## 分担の振り返り

- **reviewer が値打ちを出した。** 最初の版は 55 件が通っていて、分岐の網羅も
  依頼どおりだった。**通ることを見るだけでは、そのテストが何も守っていない
  ことに気づけない。** reviewer が実際に `src/` を壊して 7 件を挙げたのが
  この項目の中身で、レビューを省いていたら「57 件のテストがある」という
  見かけだけが残った。**Opus 5 に上げたのは効いた**（料金の 13% で、
  項目の質の大半を決めた）
- **verifier も、reviewer が見落とした穴を 1 つ見つけた。** レビューと確認は
  重ならない。reviewer は「テストが実装をなぞっていないか」を見て、
  verifier は「指定したミューテーションが落ちるか」を機械的に試した。
  後者でしか出ないものがあった
- **implementer は 3 巡した**（実装 → 7 件の修正 → 穴 5 件の修正）。
  食い違ったのは見込みではなく、**最初の依頼文**。「送られるメッセージの形を
  確かめる」と書いただけでは、キー名だけを見るテストになった。
  **依頼文に「壊したら落ちることを確かめる」まで書いておけば 1 巡減った**
- **次に同じ規模の項目をやるなら**、implementer への最初の依頼文に
  **ミューテーションのリストを書いて渡す**。「この変更を入れたらこのテストが
  落ちること」まで含めて依頼すれば、reviewer の 7 件のうち少なくとも
  `broadcast` / `history_flag` / `sec` は最初から入る。reviewer は残す
  （実装者が思いつかない壊し方を出すのが reviewer の役目）

## 残ること

- **`on_connect()` の初期配信がテストに載っていない。** `on_connect()` は
  `request.event['args'][0]['REMOTE_ADDR']` を読むので、`SimpleNamespace` の
  フィクスチャでは通らない。押さえるには `src/` 側に手が要る。
  **TODO-009 で最初に書き直すのがまさにここ**なので、そちらで扱う
- **未知の `type` の扱いを仕様として決めていない。** いまはどの分岐にも
  当たらない `type` が末尾まで落ちて `add_history` と broadcast が起きる。
  これが意図した動きなのかは `on_json()` からは読み取れない。
  現状をテストで固定すると TODO-009 で決める余地を先に潰すので、
  **書かないことにした**。TODO-009 で決める
