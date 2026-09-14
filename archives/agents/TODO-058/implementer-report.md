# TODO-058 実装の報告（implementer）

## 結果

- `tests/browser/*.test.mjs` の本体から、ページの中の `board` への参照を無くした。
  `grep -nE '(^|[^.\w])board(\.|\[|\))' tests/browser/*.test.mjs` で残るのはコメント 4 行だけ
  （`board.test.mjs` というファイル名 2 行と、経緯を書いたコメント 2 行）。
  ほかに残る `board` は `gameinfo.board`（gameinfo の項目）、`?board=2` の URL、
  cookie の名前 `board${id}_player`、画像名 `board-base`、`open_board` / `wait_board` の関数名
- 移せなかった箇所は無い
- `src/` は変えていない

## 変更したファイル

- `tests/browser/helper.mjs:4-12` 冒頭に、テスト本体は board を触らず helper を通す旨を追記
- `tests/browser/helper.mjs:162-186` `open_board()` の待ちを `wait_board()` に置き換え
- `tests/browser/helper.mjs:357-1000` 関数を追加（下の表）
- `tests/browser/*.test.mjs` 11 本のうち `sound.test.mjs` 以外の 10 本（`sound.test.mjs` は board を触っていなかった）
- `docs/Developer.md:440-444` 「テストを書くときに気をつけること」に 1 項目を追加

## 足した helper の関数

「TODO-060 で寄せる側」は想定。C = `controller`、V = `view`。

| 関数 | 行 | 何を見るか・何をするか | 寄せる側 |
|------|----|-----------------------|----------|
| `wait_board(page, {received})` | 377 | board ができて最初の gameinfo が駒に反映されるまで待つ。`received: false` は組み上がりだけ | V（駒の位置）/ 組み上がりは両方 |
| `gameinfo(page)` | 398 | 今の gameinfo の写し（無ければ undefined） | C |
| `settings(page)` | 409 | `player` / `sound` / `free_move` / `disp_pip` | C（Settings を持つ側） |
| `server_id(page)` | 423 | `svr_id`（cookie 名に使う） | C |
| `checkers(page)` | 436 | 駒の表示状態 `[player][num]` の `{id, player, num, point(cur_point), x, y, z, w, h}` | V |
| `stack(page, point)` | 451 | そのポイントに積まれた駒の id と z、先端の駒 | V（並びは rules の `checkers_at`） |
| `dragging(page)` | 467 | 掴んでいる駒 `{id, point, x, y, src}` か undefined | V |
| `shown_parts(page)` | 491 | Roll ボタン・クロックの active、持ち時間、名前、キューブの y1、PIP の表示（値と opacity） | V（持ち時間とクロックは C の可能性あり） |
| `part_el_ids(page)` | 513 | 表示部品が持つ要素の id（取り違えの確認） | V |
| `judge(page, patch)` | 559 | position の count/owner（0〜27）、winner、closeout、active_dice、has_dice。patch は判定の間だけ gameinfo を書き換えて戻す。`resign` は判定後・戻す前の値 | C（rules） |
| `pip_count(page)` | 593 | `Board.pip_count()` を 2 人ぶん呼ぶ（表示も更新する） | C + V |
| `dst_points(page, player, src, dice)` | 606 | `get_dst_points()` | C（rules） |
| `apply_gameinfo(page, gi, opts)` | 622 | 届いたことにして盤面に反映（`sec: 0` 既定、`last_op`） | C の入口 |
| `effects_of_apply(page, gi, last_op)` | 638 | 反映したときに鳴らした音の名前と、回したダイスのプレーヤー | C の入口 + V の演出 |
| `record_received_src(page)` | 677 | 返事を受け取るたびに `last_op.src` を `window.__seen_src` へ | C の `receive` |
| `record_apply(page)` / `take_applied(page)` | 704 / 732 | 表示に反映するたび（予測でも返事でも）の `{has_last_op, has_clock_state, sn, point}` を貯める／取り出す。predict.test.mjs から移した | C（predict と receive の両方を包む） |
| `corrupt_prediction(page, point)` | 746 | 予測で最後に動かした駒を point に置いたことにする | C の `predict` |
| `fail_prediction(page)` | 766 | 予測で例外を投げる | C の `predict` |
| `restore_prediction(page)` | 780 | 上の 2 つを戻す | C |
| `send_put_checker(page, player, num, point)` | 795 | `actions.js` の `put_checker()` で駒を置いて送る | C |
| `put_checker_local(page, player, num, point)` | 812 | `Board.put_checker()` で手元だけ置く。置く前の表示位置を返す | C |
| `press_part(page, name, player)` | 830 | `'roll'` / `'resign'` の `on_mouse_down_xy(0, 0)` を呼ぶ | V（入力のコールバック） |
| `set_free_move(page, on)` | 845 | チェックボックスを書いて `settings.apply_free_move()` | C |
| `press_pass_banner(page, how)` | 863 | パスのバナーを出して押し、押した直後の shown/active。clicks.test.mjs の `press_pass` を移した | V |
| `press_n(page, id, n)` | 902 | 要素を n 回押し、直後の score・得点の表示・dice・表示のダイスを返す。clicks.test.mjs から移した | C + V（下の懸念） |
| `show_banner(page, name)` / `hide_banner(page, name)` | 931 / 953 | 投了・勝ちのバナーを出し、`on_click` を包んで `window.__clicked` に記録／消す | V |
| `drop_cube_while_holding_checker(page, dy)` | 969 | キューブと駒を同時に掴んでキューブを離す一連を 1 タスクで行い、送った type を返す | V（Drag） |

既存の `set_turn()`・`shown_dice()` の中の board は依頼どおりそのまま。

## 1 つの evaluate にまとめたもの（順番と同期性を保つため）

- `press_n()`・`press_pass_banner()`：押した直後、返事が届く前に読む
- `drop_cube_while_holding_checker()`：Drag のメソッドを同じタスクで続けて呼ぶ（送信の捕捉も中に含めた）
- `effects_of_apply()`：音とダイスを包む → apply → 戻す
- `judge(page, {resign: 1})`：書き換え → 判定 → 戻す

## 分けたもの（evaluate を複数に分けても意味が変わらないと判断した箇所）

- `board.test.mjs` の積み順：gameinfo を読む → 書き換えて apply → `stack()` → 元に戻す。
  このページには他から何も届かない場面なので、分けても読み取る値は同じ
- `predict.test.mjs` の先行実行直後の読み取り：送信を止めているので返事が来ない。
  `wait_for` の中の読み取り（hit, correction）は駒の表示だけを 1 回で読むようにした
  （hit の待ちで読んでいた `sn` は判定にもアサーションにも使っていなかったので外した）
- `opening.test.mjs`：`roll_btn[0].on_mouse_down_xy()` と `emit_msg('dice')` を 1 つの evaluate で
  呼んでいたのを、`press_part('roll')` → `send_msg('dice')` の 2 回に分けた。送る順は変わらず、
  2 秒の自動クリックに対して往復の遅れはわずか
- `player_cookie.test.mjs`：送信の包み → `settings()` → `press_part('resign')` → 包みを外す、の 4 回に分けた。
  その間ページは何も送らない（クロックの `setInterval` は送信しない）
- `clicks.test.mjs` の `settle()`：プレーヤー 1 の名前を `gameinfo()` で読んでから送る。このファイルは名前を変えない
- `player_cookie.test.mjs` の最後の `waitForFunction(turn === -1)` は `wait_for` にした。
  待ち時間は playwright の既定と同じ 30 秒を渡した

## テストの件数と結果

- 変える前：`node --test tests/browser/` → tests 92 / suites 11 / pass 92 / fail 0、終了コード 0
- 変えたあと：`node --test tests/browser/` → tests 92 / suites 11 / pass 92 / fail 0、終了コード 0（1 回）
- `node --check` で helper と全テストの構文を確認

## 判断が要る点・懸念

- **テスト名を 6 件変えた**（件数は同じ）。名前の中の `board.settings.xxx` を `settings.xxx` に、
  `board.position()` を `position()` にした（clicks.test.mjs 5 件、rules.test.mjs 1 件）。
  依頼の「本体に board を残さない」に合わせたが、名前を元に戻したければ戻せる
- `press_n()` は、押した直後に gameinfo（C）と得点・ダイスの表示（V）を同じタスクで読むので、
  TODO-060 では 1 関数の中で両方を触ることになる。返事が届く前に読む必要があるため分けられない
- `pip_count()` は `Board.pip_count()` と同じく表示も更新する。`judge()` には入れず、
  副作用の無い判定だけを `judge()` にまとめた（predict.test.mjs で表示の PIP を読む前に計算し直すと、
  「表示が更新されていない」を見逃すため）
- `corrupt_prediction()` は元の関数を `board.predict_gameinfo` ではなくプロトタイプから取るようにした
  （包みを重ねないため）。見ている意味は同じ
- 壊して落ちるかの確認は行っていない（verifier の担当）
- 範囲外で気づいたこと：`opening.test.mjs` は helper の `set_free_move` を `apply_free_move` という別名で
  import している（ファイル内に同名で assert 付きの関数があるため）。気になるなら名前を変える
