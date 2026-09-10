# TODO-017 verifier report

## 対象
`git diff -- src/ytbg/webroot/static/ytbg.js`（未コミット）。変更は
`Board.load_gameinfo()` のチェッカーを配る部分のみ。他のファイルは
変更されていない（`git diff --stat` で確認、`src/ytbg/webroot/static/ytbg.js`
の 1 ファイルのみ、+19/-14）。指示の範囲と一致。

## 1. `node --check`

```
$ node --check src/ytbg/webroot/static/ytbg.js
```
終了コード 0（エラーなし）。

## 2. `put_checker()` を通さなくなったことで落ちるもの

`put_checker(ch, p, sec, sound)`（`ytbg.js:3697-3733`）の中身:

```js
put_checker(ch, p, sec=0, sound=true) {
    const prev_p = ch.cur_point;
    if (prev_p !== undefined ) {
        const checkers = this.point[prev_p].checkers;
        const ch_i = checkers.indexOf(ch);
        checkers.splice(ch_i, 1);
    }
    const idx = this.point[p].add(ch, sec);
    ch.cur_point = p;
    if ( sound ) { ... }
    this.pip_count(ch.player);
    if ( this.closeout(1 - this.turn) ) { ... }
}
```

- **元の point の `checkers` からの削除** — `load_gameinfo()` は配る前に
  「clear points」ループ（`ytbg.js:3541-3543`）で**全 point** の `checkers` を
  空配列に入れ替えている。`put_checker()` の削除処理はこの一括クリアと
  等価なので、通さなくても抜け落ちない。確認済み。
- **音** — 変更前も `sound=false` で呼んでいた（`put_checker(ch, p, sec, false)`）
  ので、元から鳴らしていない。変更後も鳴らさない。差なし。
- **`pip_count()`** — ループ内では呼ばなくなったが、`load_gameinfo()` の
  末尾（`ytbg.js:3638-3639`、この diff の外、変更されていない）で
  `this.pip_count(0)` と `this.pip_count(1)` を呼んでいる。30 回中間状態で
  呼んでいたのが最終状態で 1 回ずつになるだけで、表示される値は同じ。
  問題なし。
- **`closeout()` によるボタンの on/off** — `load_gameinfo()` 末尾の
  `this.set_turn(gameinfo.turn, this.resign, false)`（`ytbg.js:3634`、これも
  diff の外、既存コード）が `turn` が 0/1 のとき `closeout(1 - this.turn)` を
  見て `pass_btn` / `roll_btn` を設定する（`ytbg.js:3166-3170`）。この直前に
  全ボタンを `off()` しているので（`ytbg.js:3119-3125`）、`put_checker()` の
  closeout 判定を 30 回通さなくても、最終的なボタン状態は同じになる。
  問題なし。

## 3. `ch.cur_point` を `undefined` に戻さなくなった影響

`grep -n cur_point` の全箇所を確認（`ytbg.js:2218, 2259, 2281, 2283, 2409,
2417, 2427, 2428, 2477, 2482, 2698(idx記載のみ), 3698, 3713, 3808`）。

- `2218`: `Checker` のコンストラクタで `cur_point = undefined` に初期化。
  これはページ読み込み直後、まだ一度も `load_gameinfo()` を受けていない
  瞬間の話で、今回の変更と無関係。
- `2427`: `if ( ch.cur_point !== undefined )` — チェッカーがどこかの point に
  乗っているかの判定。`BoardPoint.add()`（`ytbg.js:3808`）が
  `ch.cur_point = this.idx` を**必ず**設定するので、`load_gameinfo()` を
  1 回でも通れば全チェッカーの `cur_point` は常に定義済みになる
  （旧コードでも新コードでも、配り終わった後は同じ）。旧コードの
  「escape」ループが `undefined` に戻すのは配り直しの**間だけ**で、
  同期処理のため外部から観測されない。よって `undefined` を経由しなく
  なったことによる regression は無い。
- その他の箇所（`2259, 2281, 2283, 2409, 2417, 2477, 2482, 3698`）は
  `cur_point` を point 番号として使うだけで、`undefined` かどうかを
  前提にしていない。

**懸念なし。**

## 4. `ch.el.hidden` の読み書き

`grep -n "el.hidden\|\.hidden\b"` の全箇所（`ytbg.js:1007, 1051, 1059, 2028
(コメントアウト), 3572`）。

- `1007`: `BgImage` のコンストラクタで `el.hidden = false`（既定で表示）。
  `Checker` も `BgImage` 系列なので、生成時点ですでに `hidden = false`。
- `1051` / `1059`: `BgImage.on()` / `off()`。チェッカーに対して `off()` が
  呼ばれている箇所は無い（`grep` で `Checker` 系のインスタンスに対する
  `.off()` 呼び出しは無し。他の要素——`roll_btn` 等——の `off()` のみ）。
- `3572`: 今回のループ内で `ch.el.hidden = false` を毎回設定しているが、
  上記の通りチェッカーは元から `hidden = false` のままなので、実質的には
  何もしていない（冗長だが害はない）。

**チェッカーが `hidden` のまま残る経路は無い。** ただし次の点は本文の
チェックリストには無いが、目視確認で気づいたので書いておく。

### 気づいた点（要ブラウザ確認）: 初回接続時のちらつき

旧コードは「escape」ループで配り直しの**間だけ** `hidden = true` にして
いた。これは配り直し中にチェッカーが見えないようにする効果があり、
特に**初回接続時**（`new Board(...)` で 30 個のチェッカーが `(0,0)` 付近に
生成されてから、WebSocket で最初の `gameinfo` が届いて `load_gameinfo()` が
走るまでの間）に、ブラウザが 1 フレームでもチェッカーを描画すると
左上に固まって見える可能性がある。今回の変更はこの `hidden` の
トグルを無くしたので、理論上はこの一瞬のちらつきが起きる余地が
新しくできている。実際に見えるかは通信の速さ次第で、**コードを
読んだだけでは断定できない**。ブラウザで確かめる項目に含めた。

## 5. `point.checkers` の積み順と `set_z()` の重なり順

`BoardPoint.add(ch, sec)`（`ytbg.js:3796-3812`）:

```js
add(ch, sec=0) {
    const n = this.checkers.length;
    ...
    ch.set_z(n);
    ch.cur_point = this.idx;
    this.checkers.push(ch);
    return n;
}
```

旧コードは 3 重ループ（`i: idx` → `p` → `c`）の中で `put_checker()` を呼び、
`put_checker()` の中で `this.point[p].add(ch, sec)` を呼んでいた。今回の
変更はこの `put_checker()` の呼び出しを省いて `add()` を直接呼ぶだけで、
**3 重ループの構造（idx の小さい順に p=0,1 を先に見る）は変えていない**。
また `add()` が呼ばれる直前の `this.point[p].checkers` の状態は、どちらの
コードでも「clear points」ループで全 point を空にした後、同じ順番で
`add()` を呼んでいくので同一になる。よって `checkers` への push 順・
`set_z(n)` の `n` の値は変更前後で一致する。

**確認済み。ズレは無い。**

## pytest

今回の diff は `src/ytbg/webroot/static/ytbg.js` のみで、Python 側
（`src/ytbg/*.py`、`tests/`）は変更されていない。JS のテストは無い
（`CLAUDE.md` にも「クライアントの JS はテストしていない」とある）ため、
pytest は関係なしと判断し、実行していない。

## ブラウザでの確認手順（利用者向け）

`./ytbg.sh -d -p 5001 -i images1a 1` でサーバを起動し、
`http://localhost:5001/` をブラウザで開く。

1. **初回接続のちらつき確認**（上記「気づいた点」に対応）
   ページをリロードして、チェッカーが一瞬でも左上に固まって表示されてから
   本来の位置へ飛ぶように見えないか確認する。滑らかに、あるいは
   最初から正しい位置に現れれば問題なし。ちらついて見えたら直った
   とは言えない。
2. **履歴の連続再生が滑らかに動くか**（TODO-017 の本題）
   何手か打ったあと、「戻す」を連打する、または `back_all` /
   `fwd_all`（全部戻す・全部進める）を実行する。チェッカーが
   瞬間移動ではなく、動いた分だけアニメーションして見えれば直っている。
   逆に、位置が変わっていないチェッカーまで毎回ガクガク動いて見えたら
   直っていない。
3. **積み重なりの見た目**
   同じ point に複数チェッカーが乗っている状態（初期配置の
   6 ポイント目など）で、戻す・進めるを繰り返しても重なり順（手前・奥）が
   入れ替わって見えないか確認する。
4. **盤面が破綻しないか**
   通常の対局操作（駒を動かす、サイコロを振る、パス）を何手か行い、
   チェッカーの数・位置が正しいまま推移するか確認する。

## 確かめられなかったこと・判断が要る点

- **初回接続時のちらつきが実際に見えるかどうか。** コードを読んだ限りでは
  起きる余地があると分かったが、実機・実ネットワークでの見え方は
  ブラウザで確かめるしかない。上の手順 1 に含めた。
- ブラウザでの目視確認そのものは実施していない（利用者に依頼する
  項目として `TODO.md` にも明記されている）。

## 再確認（レビュー指摘の修正後）

対象は同じく `git diff -- src/ytbg/webroot/static/ytbg.js`（未コミット）。
今回の修正で、配置のループが「idx (0〜14) を外側に回して一致するものだけ
置く」形から、「30 枚すべてを `{ch, point, idx}` の配列に集めて idx で
安定ソートしてから順に `point.add()` する」形に変わった
（`ytbg.js:3560-3588` 付近）。他ファイルの変更なし
（`git diff --stat` で `src/ytbg/webroot/static/ytbg.js` の 1 ファイルのみ、
+34/-20、確認済み）。

### 1. `node --check`

```
$ node --check src/ytbg/webroot/static/ytbg.js
NODE_CHECK_OK
```
終了コード 0（エラーなし）。前回と変わらず通る。

### 2. 新旧実装で配置・重なり順が一致するか

`BoardPoint.add()`（`ytbg.js:3796-3812`）と、旧実装（idx 0〜14 を回す
3 重ループ＋ `put_checker()` 経由）／新実装（配列に集めて idx でソート）の
両方を Node の小スクリプトに写し、3 通りの入力で
「各チェッカーの `[point, 配列内の位置, z]`」を突き合わせた
（スクリプトはスクラッチ領域に置き、リポジトリには置いていない）。
座標計算式（`cx` / `y0` / `max_n` / `direction`）自体は移していないが、
`point.checkers` への push 順と `set_z(n)` の `n` はこの式に依存しないため、
比較には影響しない。

- **(a) 初期配置**（30 枚が各 point に 1〜5 枚ずつ、idx 0〜4 の範囲）
  → 旧新とも 30/30 配置、`point`・`z` の不一致 0 件、各 point 内の並び順も完全一致
- **(b) 1 point に 5 枚積んだ形**（idx 0〜4）
  → 同上、不一致 0 件、並び順も完全一致
- **(c) 1 point に両プレーヤー合わせて 30 枚積み、idx が 0〜29 まで
  伸びる形**（free move で起きうる、レビューで指摘された状況）
  → **旧実装は idx 15〜29 の 15 枚（プレーヤー 1 の全 15 枚）が
  一度も `point.checkers` に入らない**（`missing (never placed)` に
  `ch10`〜`ch114` の 15 個が出る。`total checkers present = 15/30`）。
  **新実装は 30/30 全て配置される。** 配置された 15 枚（プレーヤー 0 分）
  については `point`・`z` とも旧新で一致し、新実装はその後ろに
  プレーヤー 1 の 15 枚を idx 順（15〜29）で追加した状態になっている。

再現結果:
```
=== (c) 16+ stacked on one point (idx up to 29) ===
old: missing (never placed) = [ch10,ch11,ch12,ch13,ch14,ch15,ch16,ch17,ch18,ch19,ch110,ch111,ch112,ch113,ch114]
new: missing (never placed) = []
old: total checkers present in points[].checkers = 15 / 30
new: total checkers present in points[].checkers = 30 / 30
mismatches among checkers placed by both = 0
```

これは指摘どおりの不具合（idx が 15 以上になると旧実装は置き去りにする）
が新実装で解消されていることを示す。(a)(b) では旧新の差が無いことも
確認できたので、**通常の局面では見え方が変わらず、idx が 15 を超える
異常局面だけ挙動が改善される**という説明と一致する。

### 3. 30 枚すべてがどこかの `point.checkers` に入るか

上の (a)(b)(c) いずれも新実装は `total checkers present in points[].checkers
= 30 / 30`。**漏れは無い。**

コード側でも、`ch_list` は `p: 0..1` × `c: 0..14` の 30 通りを漏れなく
`push` しており、`sort()` は要素の増減をしない。ソート後の `for (const e of
ch_list)` は 30 要素全部を走査して `point.add()` を呼ぶので、`point`
の値（`ch_point[p][c][0]`）がどんな数であっても、対応する `this.point[...]`
が存在する限り必ずどこかの `checkers` に積まれる。

### 4. 「初回接続時のちらつき」への影響

この修正はループの中身（配り方）だけを変えたもので、**「escape」ループを
使わない**という前提（`hidden` のトグルを行わない）は前回の版と変わって
いない。`ytbg.js:1007`（`BgImage` コンストラクタで `hidden=false`）、
`Checker` に対する `off()` 呼び出しが無いことも前回確認済みのままで、
今回の diff でも変わっていない。

**前回報告した「初回接続時のちらつきの余地」は、この修正の前後で変わらない。**
直ったわけでも悪化したわけでもない。ブラウザでの確認項目（前回の
「ブラウザでの確認手順」1）はそのまま有効。

### 再確認のまとめ

- `node --check`: 通過
- idx が 15 以上になる状況での置き去り: 旧実装で再現、新実装で解消を確認
- 通常局面（idx < 15）での配置・重なり順: 旧新で完全一致、regression 無し
- 30 枚の配置漏れ: 無し
- ちらつきの懸念: 未解消・未悪化（変更なし）。ブラウザでの確認が必要な点として残る
