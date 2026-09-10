# TODO-021 reviewer 報告

範囲は依頼どおり、(1) `DATAFILE_DIR` の条件式、(2) `tests/browser/` の
テストが確かめている中身、の 2 点に絞った。**要修正は無し。**

## 直したほうがよい

### 1. `DATAFILE_DIR` の新しい分岐に自動テストが無い

`src/ytbg/yt_backgammon_server.py:30`

```python
DATAFILE_DIR = os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')
```

- 挙動そのものは確認した範囲で安全。
  - `tests/conftest.py:168, 191` の `bg_server` / `bg_server_raw` は
    `ytBackgammonServer.DATAFILE_DIR` をクラス属性ごと `tmp_path` へ
    monkeypatch しており、この式が何を返すかに関係なく上書きされる。
    既存の 101 件の pytest はこの式の変更で壊れない（実際に
    `uv run pytest` は implementer 報告どおり 101 passed）。
  - 両方未設定なら `None` になり、これは変更前の
    `os.getenv('HOME')` 単体でも同じ（退化していない）。
  - `tests/browser/helper.mjs:69, 79` は `mkdtemp()` の結果を渡すので
    空文字にはならない。
- ただし、**この式自体を検証する自動テストは無い。** `YTBG_DATA_DIR` を
  空文字にしたときに `HOME` へ静かにフォールバックすることや、
  設定したときに実際にその値が使われることを確かめる pytest は
  存在しない（`grep` で確認、該当なし）。この項目でレビューの対象に
  名指しされている 1 行であり、`CLAUDE.md` の「テストが要る変更に
  テストが足りているか」に照らすと薄い。壊れたときの実害は小さいが、
  `importlib.reload` で環境変数を差し替えて `DATAFILE_DIR` を検証する
  ような小さな pytest を足す余地がある。

## 検討

### 2. `npm install` に関する懸念の記述が実測と食い違う（未確認の点あり）

implementer 報告は「`npm install` は playwright のブラウザを落としに行く
（数百 MB）。`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` なら
落とさない」としているが、レビューでこの環境（playwright 1.63.0、
`node_modules/playwright/package.json` と `playwright-core/package.json`
のどちらにも `scripts` フィールド自体が無い）で、環境変数を付けずに
別ディレクトリで `npm install` を 2 回（通常の env、`env -i` で
クリーンな env の両方）実測したところ、`~/.cache/ms-playwright` の
中身（`chromium-1234` など）は変化せず、ダウンロードは起きなかった。

- 結果として、`CLAUDE.md:39` の `npm install`（環境変数無し）という
  記述は、少なくともこの playwright のバージョンでは実害が無さそう
  だった（実際に確かめた）。
- 一方で、implementer 報告に書かれている懸念自体が古い playwright の
  挙動を前提にしている可能性があり、**未確認のまま「残る懸念」として
  記録されている。** 誤った前提が後から `CLAUDE.md` に
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` を足す提案などに使われないよう、
  実測結果を implementer 報告か `CLAUDE.md` のどちらかで訂正しておく
  ほうがよい。

### 3. `console_errors()` の origin フィルタは、動作は確認できたが理論上の穴が未確認

`tests/browser/helper.mjs:205-217` は `msg.location().url` が
`origin` で始まらないものを一律で除外している。

- 実装担当は `Checker.on_mouse_move_xy()` に `console.error()` を
  差し込んで「コンソールエラーが出ていない」テストが落ちることを
  確かめており（実測、implementer 報告）、**同一オリジンのスクリプトから
  出た `console.error()` がこのフィルタで消されないこと自体は実証済み**。
- ただし、`msg.location().url` が空文字になるケース（一部のブラウザの
  内部処理でスタック位置が取れない `console.error()` 呼び出し）が
  あった場合、`''.startsWith(origin)` は `false` になり、フィルタで
  消えてしまう。**これは未確認**（実際にそのケースを再現できていない）。
  低確率だが、フィルタが「サーバ以外を消す」という意図を超えて
  「URL が取れないものも消す」側に倒れている点は、コメントに一言
  書いておくと後で疑われにくい。

### 4. スクリーンショットのバイト数チェックは弱い

`tests/browser/board.test.mjs:76-79` は `png.length > 10000` だけを見ており、
中身が実際に盤面を描いているかまでは見ていない（真っ黒や単色の
大きな画像でも通り得る）。同じテストの中でチェッカーの位置・大きさ、
`board-base.png` の `naturalWidth` を別途確認しているので実害は
小さいが、スクリーンショット自体の検証としては形式的。

### 5. `YTBG_DATA_DIR` が実運用の環境に残ったときの沈黙フォールバック

`os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')` は、`YTBG_DATA_DIR` が
（削除済みの一時ディレクトリなどを指したまま）誤って環境に残っていても
何もエラーを出さず、その値をそのまま使う。存在しないディレクトリを
指していれば `save_data()` が書き込みに失敗し、`load_data()` は
warning ログを出すだけで気づきにくい（`yt_backgammon_server.py:79`
付近の既存の挙動）。`tests/browser/helper.mjs` 側は毎回 `mkdtemp` して
渡しているので実害は無いが、手で `YTBG_DATA_DIR` をエクスポートして
試したまま忘れる、という運用ミスの入り口ではある。ドキュメント
（`CLAUDE.md`）に一言、テスト後は `unset` する旨を添えてもよい。

### 6. 後始末は「プロセスが正常終了する経路」でのみ検証済み

`tests/browser/board.test.mjs` の `after()` が `before()` の失敗時にも
走ることは実測した（`node:test` で `before()` が例外を投げても
`after()` が実行されることを確認、また `it()` が例外を投げても
`after()` が実行され後続の `it()` も実行されることを確認）。
一方、**node プロセス自体が `SIGKILL` やタイムアウトで強制終了した
場合**（`detached` で起動した `uv run` の子プロセスや `mkdtemp` の
一時ディレクトリ）の後始末は、この仕組みの範囲外で保証されない。
一般的なテストハーネスの限界であり、この項目固有の欠陥ではないが、
残るリスクとして記録しておく。

## 好みの範囲

特になし。

## その他（規約面）

- コメントは「なぜ」を書く形になっている
  （`helper.mjs` の `CHROMIUM_PATH` や `console_errors()` のコメントなど）。
- 日本語の書き方、`mylog.py` のログ規約への抵触は見当たらない
  （このテストコードはログ機構を使っていない）。
- 造語の使用は見当たらない。

## 2 通りの捕まえ漏れの有無について（依頼の確認事項）

- 「2 枚目のタブへの同期」テストは、page1 でのみ操作し page2 でのみ
  読む（前半）、page2 でのみ操作し page1 でのみ読む（後半）という
  構成で、**両方で同じ操作をしているだけ、ではない**ことをコードで
  確認した。これは本当に broadcast 経由での反映を見ている。
- `broadcast()` の宛先を 1 つ目だけにする改変で 5 件全部が落ちる、という
  報告は、`before()` で page2 が最初の `gameinfo` を受け取れず
  `open_board()` の `waitForFunction` がタイムアウトする、という
  経路として妥当（コードを読んで確認、実行はしていない＝未確認）。
