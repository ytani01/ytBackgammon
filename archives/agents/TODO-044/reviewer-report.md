# TODO-044 レビューの報告

レビュー対象は 2026-09-12 23:29 頃に取った `git diff`（5 ファイル）。
`top_checker()` が `.slice(-1)[0]`、`apply()` が `add(e.ch, n_at[e.point], sec)`
の版を「レビュー対象」とする。

実測はブラウザ（`tests/browser/helper.mjs` を使った使い捨てのテスト）で行った。
測ったスクリプトはスクラッチに置いただけで、リポジトリには残していない。

---

## 要修正

### 1. 作業ツリーが、いま壊された状態のまま（`board.js:671`, `board.js:852`）

レビュー中に `src/ytbg/webroot/static/js/board.js` が 2 回書き換わった
（mtime 23:31:22 / 23:32:49）。23:33 時点の中身は

- `board.js:671` — `return this.checkers_at(p)[0];`
  （レビュー対象は `.slice(-1)[0]`。**先端ではなく底の駒を返す**）
- `board.js:852` — `this.point[e.point].add(e.ch, 0, sec);`
  （レビュー対象は `n_at[e.point]`。**全部の駒が 1 枚目の位置に重なる**）

verifier が判別力を見るために壊している最中と思われる。**このままコミットすると
バグが 2 つ入る。** コミット前に `git diff` を上のレビュー対象と突き合わせること。

根拠: `ls -l` の mtime と、その時刻に取った `sed -n '659,672p'` /
`sed -n '845,856p'` の出力。ページ側で `board.top_checker.toString()` を
読んでも `[0]` になっていた（実測）。

### 2. 文書が `this.point[]` のまま（`CLAUDE.md:275`, `docs/Developer.md:222-223`）

どちらも「`Board.position()` が `this.point[]` から `Position` を作って渡す」と
書いてある。TODO-044 で `Position.from_gameinfo(this.gameinfo)` に変わったので、
記述が実装と食い違う。`CLAUDE.md` は仕様の正なので、同じコミットで直す
（対で保守するものの片方だけが変わっている状態）。

---

## 確認した結果（指摘ではなく、依頼の 1〜3 への回答）

### 1. 「今と同じ駒が返る」は本当か → **本当**（コード読み ＋ 実測）

コードの上での根拠:

- 変更前の `point[p].checkers` は `apply()` だけが作っていた。
  `add()` の `push` を呼ぶのは `apply()` の 1 か所だけで、
  `apply()` の冒頭で全ポイントを空にしていた（`git grep` で確認）。
- その `apply()` が積む順は「`gameinfo.board.checker` を `(player, i)` の順に
  並べ、`idx` で安定ソート」。`checker_order()` は**同じ配列を同じ順に作って
  同じ比較関数でソートする**ので、要素の並びは一致する。
  `checkers_at()` はそれを `point` で絞るだけなので、点ごとの並びも一致する。
- `this.gameinfo` は `apply()` の 1 行目でしか代入されない
  （`grep "this.gameinfo"`）。`predict_gameinfo()` は
  `JSON.parse(JSON.stringify(...))` で複製してから書き換えるので、
  `this.gameinfo` を壊さない。つまり「最後に `apply()` した gameinfo」
  という点でも、変更前の `checkers` と同じ土台を見ている。
- `ch.cur_point = e.point` は、変更前の `add()` 内の `ch.cur_point = this.idx`
  と同値（`this.point[i].idx == i`。`board.js:216-282` で確認）。

実測（`top_checker()` はレビュー対象の `.slice(-1)[0]` をページ内で
復元して測った）:

| 条件 | `checkers_at(6)` の並び（id, z） | `top_checker(6)` |
|------|--------------------------------|------------------|
| `idx` を入れ替え（p000↔p004） | p004(0) p001(1) p002(2) p003(3) p000(4) | p000 |
| free move で混在（p100 を idx 5 で 6 へ） | …p000(4) p100(5)、`position().pt[6]`=[0,0,0,0,0,1] | p100 |
| 同じ `idx` が 2 つ（p002 と p100 が idx 2） | p004 p001 **p002 p100** p003 p000 | p000 |
| ドラッグ中（`moving_checker`） | 上と同じ並び。掴んだ駒は x,y,z=(10,10,1000) のまま、`cur_point` は 6 | — |

- 並びは**画面の z（重なり順）と毎回一致**した。`top_checker()` が返すのは
  z がいちばん大きい駒、つまり見た目の先端で、変更前と同じ意味になっている
- 同じ `idx` のときは `(player, i)` の順（p002 → p100）。`Array.sort` の
  安定性への依存は変更前と同じで、増えていない
- 予測した `gameinfo` を `apply()` に渡した直後も同じ（上の表は全部
  `board.apply(gi, {sec:0, predict:true})` の直後に測っている）

### 2. `apply()` の配り直し → 問題なし

- 枚数: 変更前は `add()` の中の `this.checkers.length`、いまは `n_at[e.point]`。
  どちらも「この `apply()` の中でそのポイントへ既に置いた枚数」なので同値。
  実測でも z が 0,1,2,3,4 と並んだ
- `ch.cur_point` の設定は残っている（`board.js:851`）。ドラッグ中の駒も
  `cur_point` が gameinfo どおりに更新されることを実測で確認
- 「掴んでいるチェッカーを手元へ戻す」処理（`mv_pos`）は残っている。
  ループの前で控えて、あとで戻す順序も変わっていない。実測で
  (10,10,1000) が保たれた

### 3. `Board.position()` のガード → 変更前と同じ

`this.gameinfo` が `undefined` のとき、実測で `pt.length = 28`、全部空、
`pip_count(0) = 0`、`closeout(0) = false`、`checker_order().length = 0`。
変更前（`this.point[]` の `checkers` が空）と同じ結果。

初期化の途中で `position()` を呼ぶ経路は見つからなかった。
`pip_count()` / `winner_is()` / `closeout()` / `get_dst_points()` /
`RollButton.check_disable()` の呼び出し元を辿ると、入口はすべて
`apply()` か利用者の操作で、`Board` と `RollButton` のコンストラクタからは
呼ばれない（`RollButton.constructor()` が呼ぶのは `off()` だけ）。

参考（**今回の変更ではない、以前からの挙動**）: 空の盤面で `winner_is(0)` は
`2`（ギャモン勝ち）を返す。実測済み。`set_turn(turn < 0)` が最初の
`gameinfo` より前に呼ばれたら勝者バナーが出ることになるが、その経路は
今は無い。

---

## 検討

### 3. `predict.test.mjs` の枚数の assert が、見るものを変えている

`tests/browser/predict.test.mjs:203-204, 342-343, 374`

変更前の `board.point[p].checkers.length` は「`apply()` が配り直した結果」
＝表示側の値だった。`board.checkers_at(p).length` は `board.gameinfo` から
数え直した値なので、**配り直しが行われたかどうかを見なくなった**。

- とくに `342-343` の `assert.equal(state.n20, 0, 'point 20 にチェッカーが
  残っている')` は、サーバが送ってきた `gameinfo` が point 3 と言っている
  以上ほぼ自明に 0 になる。「わざと外した予測の駒が point 20 に
  残っていないか」を見るという元の意図が落ちている
- `203-204` は同じ `evaluate` の中で `entry: board.gameinfo.board.checker[0][i]`
  も見ているので、`n3`/`n6` が同じ出どころの値の言い換えになっている

同じ `evaluate` の `point: board.checker[0][i].cur_point` は `apply()` の
配り直しで設定される値なので、「`apply()` が走ったこと」自体は今も見ている。
枚数まで表示側で見たいなら、最小の直し方は

```js
n20: board.checker.flat().filter((c) => c.cur_point === 20).length,
```

（`cur_point` は `board.js:851` で `apply()` が設定する）。

なお `374` の `n0` は `wait_for` の待ち条件だが、`apply()` は同期で
`this.gameinfo` の代入と配り直しを行うので、途中の状態が観測されることは
無い（待ち方は変わらない）。

### 4. 積み順を見るテストが無い（implementer の懸念 1 つめ）

実測で裏を取った。**ソートを外しても今のテストは落ちない**
（ページ内で `checker_order()` をソート無しに差し替えて確認。
`checkers_at(6)` が p000…p004 の順になり、先端が p004 になった）。

足すなら次の 1 件が最小。場所は `tests/browser/board.test.mjs` の
「チェッカーをドラッグできる」の**直前**（このファイルは書いた順に依存して
いて、drag 以降は初期配置が崩れるため）。サーバへは何も送らない
（`predict: true` のとき `set_turn()` の `emit_stop()` は通らない）。

```js
    it('積み順は gameinfo の idx で決まる', async () => {
        const r = await page1.evaluate(() => {
            const save = JSON.parse(JSON.stringify(board.gameinfo));
            const gi = JSON.parse(JSON.stringify(board.gameinfo));
            // 初期配置では checker[0][0..4] が point 6 に idx 0..4 で並ぶ。
            // いちばん下 (p000) といちばん上 (p004) の idx を入れ替える
            const before = [0, 1, 2, 3, 4].map((i) => gi.board.checker[0][i]);
            gi.board.checker[0][0][1] = 4;
            gi.board.checker[0][4][1] = 0;

            board.apply(gi, { sec: 0, predict: true });
            const at6 = board.checkers_at(6);
            const out = { before,
                          ids: at6.map((c) => c.id),
                          z: at6.map((c) => c.z),
                          tip: board.top_checker(6).id };

            board.apply(save, { sec: 0, predict: true }); // 後始末
            return out;
        });

        assert.deepEqual(r.before, [[6,0],[6,1],[6,2],[6,3],[6,4]],
                         '初期配置が変わった (テストの前提)');
        assert.deepEqual(r.ids,
                         ['p004', 'p001', 'p002', 'p003', 'p000']);
        assert.deepEqual(r.z, [0, 1, 2, 3, 4]);
        assert.equal(r.tip, 'p000');
    });
```

判別力は実測で確かめた。

| 壊し方 | 結果 |
|--------|------|
| `checker_order()` のソートを外す | `ids` が p000…p004、`tip` が p004 → 落ちる |
| `add(e.ch, 0, sec)`（枚数を数えない） | `z` が全部 0 → 落ちる |
| `top_checker()` が `[0]` を返す | `tip` が p004 → 落ちる |

（上の 2 つめと 3 つめは、いま作業ツリーに入っている壊れた状態で
実際に観測した値）

### 5. `checker_order()` の `c < ch_point[p].length`（`board.js:641`）

変更前の `apply()` は `c < 15` で固定だった。`gameinfo` の
`board.checker[p]` が 15 と違う長さのとき、挙動が変わる。

- 16 以上: `this.checker[p][c]` が `undefined` になり、`apply()` が
  `e.ch.el.hidden` で例外 → 盤面の更新が途中で止まる
  （変更前は 16 枚目以降を黙って無視していた）
- 15 未満: 余った `Checker` が前の位置に残る
  （変更前は `ch_point[p][c][0]` で例外）

サーバは常に 15 を送る（`gameinfo.py` の `init_checker()`）が、
`GameInfo.from_dict()` は長さを検証しないので、壊れた `.jsonl` では起こりうる。
**未確認**（短い `gameinfo` を実際には流していない）。直すなら
`for (let c=0; c < 15; c++)` に戻すのが最小。

### 6. `rules/position.js:92` の docstring が古い

「Board の `this.point[p].checkers` をそのまま写すための入口」と書いてあるが、
`from_points()` の本番の呼び出しは `position()` の空盤面だけになった
（implementer も報告済み）。1〜2 行の書き換えで済む。

---

## 好みの範囲

### 7. `position()` の空盤面

`Position.from_points(Array.from({length: N_POINT}, () => []))` のために
`N_POINT` を import している。`Position.from_gameinfo()` と並べるなら
`from_points()` を挟まず `new Position(...)` でもよい。動きは同じなので
どちらでも。

---

## 範囲について

指示に無い変更は混ざっていない。テスト 2 ファイルの変更は
`point[].checkers` を消したことによる機械的な置き換えで、
上の 3 以外は意図を変えていない（`board.test.mjs:121` は
`top_checker()` 自体を見る assert になり、むしろ素直になっている）。

ログの追加は無し。コメントは日本語で周りに揃っていて、「なぜ」を
書いている（`checker_order()` の「2 か所にあるとずれる」、`add()` の
「持っているのは座標の計算だけ」）。命名は `TODO.md` の表のとおり
（`checkers_at` / `top_checker`）。`checker_order()` は表に無い追加だが、
積み順を 1 か所に閉じ込めるための入口なので妥当。
