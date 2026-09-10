# TODO-023. デッドコードを消す

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |
| 実施 | Opus 5 / effort high | main + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 11,150 | 56,139 | 81% |
| verifier | Sonnet 5 | medium | 7,788 | 48,683 | 19% |
| 合計 |  |  | 18,938 | 104,822 | 概算 $2.0 |

- verifier は定義（`~/.claude/agents/verifier.md`）のまま。上書きしていない
- main は Opus 5 で動かした。見込みでは Sonnet 5 を想定していた

## きっかけ

TODO-020 の実装項目の 1 つ目。**早いうちにやる**（消すものを後の項目が
運ばずに済む）。場所と未使用であることは TODO-020 の調査で確かめてあった。

盤面のファイル保存・読み込みは、`index.html` の側でメニューがコメントアウト
されていて、どこからも呼べない状態だった。`gen_gameinfo()` は古い `point`
形式を返し、`board.player_name`（実際は `playername`）を読む壊れた状態でも
あった。履歴はサーバ側に保存されているので、盤面が失われることはない
（TODO-020 で復活させないと決めた）。

## やったこと

### `src/ytbg/webroot/static/ytbg.js`（104 行削除）

- `const GAMEINFO_FILE = "gameinfo.json";`
- `Board.gen_gameinfo()` / `Board.write_gameinfo()` / `Board.read_gameinfo()`
- トップレベルの `write_gameinfo` / `read_gameinfo` / `clear_filename`
- `Board.apply_sound_switch()` の中の
  `window.open("http://www.ytani.net:8080/ytbackgammon/",'_parent');`

### `src/ytbg/webroot/templates/index.html`（12 行削除）

- コメントアウトされていた「保存 / 読み込み」メニューの `<ul>` ブロック

### `window.open` は生きているコードだった

TODO-020 の調査では未使用の扱いだったが、実際は `apply_sound_switch()` の
中にあり、**Sound のチェックを切り替えるたびに親フレームを外部サイトへ
飛ばしていた**。消したのは意図どおりで、直る方向の挙動の変更になる。

### サーバ側の `set_gameinfo` は残した

`read_gameinfo()` が唯一の送信元だったので、消すと `set_gameinfo` を送るものが
無くなる。ただし `yt_backgammon_server.py` の分岐、`ytBackgammon.set_gameinfo()`、
`tests/test_on_json.py` と `tests/test_clock.py` のテスト、`docs/design.md` の
ディスパッチ表は動いたままなので、今回は触らないと決めた。要否は
TODO-026（メッセージの型付けと `on_json()` のディスパッチ表化）で改めて判断する。

## 確かめたこと

verifier（Sonnet 5）が担当した。報告は
[`archives/agents/TODO-023/verifier-report.md`](../agents/TODO-023/verifier-report.md)。

- `uv run pytest` → 105 passed
- `uv run ruff check .` → All checks passed
- `uv run mypy src` → Success: no issues found in 5 source files
- `node --test tests/browser/` → 5 tests / 5 pass / 0 fail
- `git diff` を読み、削除が指示の 6 か所だけで、閉じ括弧やコメントの対応が
  崩れていないこと
- 削除した識別子への参照が `src/` `tests/` `ytbg.html` に残っていないこと
- ブラウザ（`tests/browser/helper.mjs` の仕組みを使った使い捨てスクリプト）で、
  メニューから「保存」「読み込み」が消え、残る 9 項目が表示されること。
  「1つ戻す」「New Game」が例外なく動くこと。コンソールエラーが 0 件であること
- **Sound のチェックを切り替えてもページが遷移しないこと**

### 逆確認

「遷移しない」という確認が空振りでないことを確かめるため、消した
`window.open` の 1 行だけを一時的に戻して同じスクリプトを走らせた。
`page.url()` が変わり、遷移が検出された。そのあと足した 1 行だけを消し、
`git diff --stat` が逆確認の前と一致することを確かめた。

## 分担の振り返り

- **verifier が見つけたこと。** 4 つのテストとブラウザの動作は、いずれも
  main が予想したとおりだった。**新しい問題は見つかっていない。**
  ただし逆確認を省いたことを自分から「残る懸念」に書いてきたのは有効で、
  そこを指摘して追加で走らせた結果、確認の仕組みが空振りでないことが
  裏付けられた。**報告に「やらなかったこと」を書かせる形は効いている。**
- **見込みとの差。** 担当（main + verifier）は見込みどおり。違ったのは
  main のモデルで、見込みの Sonnet 5 に対して Opus 5 で動いた。削除そのものは
  Sonnet 5 で足りる作業だったが、`window.open` が生きているコードだと
  気づいて `set_gameinfo` の扱いまで先に相談できたのは、範囲を読み直した
  結果でもある。料金の 81% は main が占めた。
- **次に同じ規模でやるなら。** 削除だけの項目は main を Sonnet 5 で回して
  よい。ただし「未使用だと分かっている」という前提は疑ってかかること。
  TODO-020 の調査では `window.open` も未使用の扱いだったが、実際は
  呼ばれていた。**消す前に呼び出し元を自分で 1 度引き直す**手順を、
  削除の項目には入れる。verifier への依頼では、**逆確認まで最初の依頼文に
  書く**（今回は追加のやり取りが 1 往復増えた）。
