# TODO-056. モジュール構成とクラス構成を見直す（第 4 弾）

|      | main | 担当 |
|------|------|------|
| 見込み | GPT-6 | reviewer（設計の確認） |
| 実施 | GPT-6（設計）→ Opus 5 / effort high（確認と相談） | verifier + reviewer（Codex） |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main（Codex） | GPT-6 | 記録なし | 測定なし | 測定なし | 測定なし |
| verifier（Codex） | gpt-5.6-luna | medium | 測定なし | 測定なし | 測定なし |
| reviewer（Codex） | gpt-5.6-sol | high | 測定なし | 測定なし | 測定なし |
| main（Claude Code） | Opus 5 | high | 43,767 | 185,998 | 100%（Claude Code の分） |
| 合計 |  |  | 43,767 | 185,998 | 概算 $4.5（Claude Code の分だけ） |

- 項目を立てて設計案を書くまで（55362a3〜bc01191）は Codex で行った。
  Codex の分はトークンと料金を測っていない。モデルと effort は
  `archives/agents/TODO-056/README.md` の記録を写した。reviewer は、
  実行時の表示が GPT-5 で、起動時の定義と一致していない
- Claude Code の分は、codex ブランチの確認を始めた時刻から
  `--since '2026-09-14 20:17:54'` で集計した。effort は途中で `/effort` により
  high にした。それまでの値は記録していない
- main（Claude Code）はサブエージェントを使っていない。決めるだけの作業で、
  確かめる対象が設計案の文書だけだったため

## きっかけ

利用者から、動作を保てるなら大きな変更も許容して、モジュール構成とクラス構成を
もう一度見直す依頼があった。`Board` が画像クラスを継承したまま、状態の保持・
部品の生成・ルールの呼び出し・予測・表示・演出を受け持っている。
`actions.js` の行き先の判定と `Board.predict_gameinfo()` も `Checker` などの
表示部品に依存している。

## やったこと

- **Codex で設計案を書いた。** codex ブランチで項目を立て（55362a3）、
  `docs/design-4.md` を書いた（bc01191）。reviewer が現行コードと照らして
  4 点を指摘し（時計の interval の持ち主、段階移行の途中で状態の持ち主が 2 つに
  なる件、操作の判定の公開範囲、Clock スイッチの反映の範囲）、main が反映して
  reviewer が再確認した。あわせて Codex 向けの指示 `AGENTS.md` を足した
- **codex ブランチを starlette へ取り込んだ**（fast-forward）
- **Claude Code で設計案を確認し、利用者と決めた。** 問題の表のうち 5 点を
  コードで確かめ、合っていた。そのうえで次を決め、設計案の本文を書き直した。
  詳しくは `docs/design-4.md` の「変える挙動」「実装項目の分け方」
  「設計確認で決めたこと」

| 論点 | 決めたこと |
|------|-----------|
| CLAUDE.md の実装の説明 | 最初の版は「CLAUDE.md は編集しない」だった。`docs/Developer.md` へ移し、CLAUDE.md と AGENTS.md はそこを参照する。実装の前に別の項目で、Claude Code で行う |
| ブラウザテスト | `board` を直接触る 64 か所を `helper.mjs` の関数に集める。純粋関数へ移す項目とは別にして先に行う |
| ファイルの数 | `presentation.js`、`input.js`、`rules/state.js` はやめる。使う側が 2 つ以上になるまで分けない |
| 変える挙動 | 目が 0 のダイスを 0 のまま送る。Clock のチェックボックスは返事を待って変える。履歴の返事でも `clock_state` を全部反映する。ドラッグ中のキューブを手元に残す |
| 残す挙動 | Roll の直後に ▲ などを押すと Roll ボタンがもう一度出る件。予測の描画で `score` などが 1 往復ぶん戻る件 |
| 変える挙動を入れる時期 | そのコードを移す段階で入れる |
| 移し方 | 段階的に移す。最初の版の第 4 段階（文書とテストの補助関数を揃える）は無くし、文書は各段階で直す |
| 項目の分け方 | 5 項目（TODO-057〜061）。その後、過剰な実装の点から見直して TODO-061 をやめ、4 項目にした |

- 書式も揃えた（英数字の前後の空白、あまり使わない言い回し、見込みの表の形）

## 確かめたこと

- 設計案の「現行コードで確認した問題」のうち、`BgBase.get_xy()` が
  `board.settings` を読む、`BoardPoint` が駒を直接動かす、2 秒後の自動クリックが
  `RollButton` にある、`settings.js` と `log.js` の循環、`checker_order()` が
  `Checker` を返す、の 5 点をコードで確かめた
- 変える挙動の 4 つの今の動きをコードで確かめた（`disable_unusable()` の
  `v % 10 + 10`、`apply_clock_sw()` と `set_clock_switch()`、`apply()` の
  `history_flag`、`apply()` がキューブだけ `Cube.set()` で定位置へ動かす）
- `tests/browser/` が `board.apply` / `board.gameinfo` / `board.load_gameinfo` を
  触る箇所を数えた（64 か所）
- `git diff --check` で問題なし

## 分担の振り返り

- **各担当が見つけたこと**
  - reviewer（Codex）: 上の 4 点。どれも設計の穴で、反映された
  - main（Claude Code）: CLAUDE.md が古くなる件、テストと実装が同時に変わる件、
    ファイルの分け過ぎ、残す挙動を決めていない件。reviewer は「今の挙動を保てるか」を
    見ていたので、保つべきかどうかは見ていなかった
- **見込みとの食い違い:** 見込みは Codex の main と reviewer だけだったが、
  Claude Code での確認と相談が加わった。料金は Claude Code の分しか分からない
- **次に同じ規模の設計をするなら**
  - 設計の reviewer には、「今の挙動を保てるか」に加えて
    「その挙動を保つ理由があるか」「テストと実装が同じ項目で変わらないか」も
    見させる
  - 別のツールで設計するときは、どちらのツールの指示ファイルが実装の説明を
    持つかを、項目を立てるときに決める
