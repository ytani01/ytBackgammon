# TODO-012. on_json のクロック系の分岐を消す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier |
| 実施 | Opus 5 / effort high | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 11,832 | 54,539 | 88% |
| verifier | Sonnet 5 | medium | 6,575 | 34,090 | 12% |
| 合計 |  |  | 18,407 | 88,629 | 概算 $1.9 |

- verifier は定義（`~/.claude/agents/verifier.md`）のモデル・effort をそのまま使った

## きっかけ

`ytBackgammonServer.on_json()` に、中身が `pass` の分岐が 5 つ残っていた。
しかもサーバ側の綴りが誤っていて、クライアントが実際に送る `type` と
一致していなかった。

| サーバ（`on_json`） | クライアント（`ytbg.js`） |
|---|---|
| `set_clock_swith` | `set_clock_switch` |
| `resume_clcok` | `resume_clock` |
| `start_clcok` | `start_clock` |
| `stop_clcok` | `stop_clock` |
| `reset_clcok` | `reset_clock` |

名前が一致しなくても末尾の `add_history` と broadcast へ落ちるので、
いままでも正しく動いていた（クロックの進行はクライアント側で完結している）。

TODO-009 で「`type` はサーバとクライアントの両方に同じ名前で書く」を
写すときに、誤った綴りごと運ばないよう先に消すことにした。

## やったこと

- `src/ytbg/yt_backgammon_server.py` の `on_json()` から、上の 5 分岐を削除した。
  実体のある `set_clock_limit` と `set_player_clock` は残した
- `CLAUDE.md` の「状態と通信」の節の該当記述を書き直した。
  「綴りが誤っている」という説明を消し、サーバに残っているのが
  `set_clock_limit` と `set_player_clock` の 2 つだけであること、
  `start_clock` などは分岐を持たず broadcast へ落ちることを書いた

## 確かめたこと

verifier（報告は `archives/agents/TODO-012/verifier-report.md`）。

- `uv run ruff check .` は 0、`uv run mypy src` は 7 errors（すべて
  `__main__.py`、TODO-002 で残した既存の指摘）、`uv run pytest` は 16 passed。
  いずれも変更前と同じ
- `ytbg.js` の `emit_msg(` の呼び出しをすべて拾って `type` の一覧を作り、
  削除した 5 つの綴り（`clcok` / `clock_swith`）がどこにも無いことを確認した。
  残っている分岐と JS 側の綴りにも食い違いは無い
- ポート 5099 で起動し、socketio クライアントを 2 本つないで
  `start_clock` / `stop_clock` / `reset_clock` / `resume_clock` /
  `set_clock_switch` を送り、もう一方へそのまま届くことを確認した。
  `history: true` を付けたときは履歴に 1 手積まれた
- `set_clock_limit` / `set_player_clock` が `gameinfo` の `clock_limit` /
  `board.clock` を指定どおり更新することを、保存された JSON で確認した

利用者がブラウザでタブを 2 つ開き、クロックが今までどおり動くことを確認した。

## 分担の振り返り

- **verifier が見つけたこと。** 不具合は見つからなかった。値のあった確認は
  「削除した 5 つの綴りが `ytbg.js` に無い」の裏取りで、これは main が
  「消しても経路は変わらない」と判断した根拠そのものを、別の目で
  数え直したことになる。socketio クライアント 2 本での broadcast 確認も、
  main の推論だけでは埋まらない部分だった
- **見込みとの食い違いは無い。** 立てたときに「verifier のみ、レビューは
  置かない」と決めたとおりに動いた。到達不能な分岐を消すだけで、
  条件式も分岐の意味も変わらないので、レビューを入れる理由が無かった
- **次に同じ規模ならどう組むか。** 同じでよい。ただし料金の 88% を main が
  使っており、その大半は `TODO.md` と過去の archives を読んで着手する項目を
  選ぶ部分だった。**項目が利用者から指定されている場合は、その分が要らない。**
  verifier への依頼文は過去の `verifier-task.md` を雛形にすると速い

## 残ること

- ブラウザでの目視確認は playwright が使えず、main も verifier も代われない。
  この種の項目では最後の確認を利用者に依頼することになる
