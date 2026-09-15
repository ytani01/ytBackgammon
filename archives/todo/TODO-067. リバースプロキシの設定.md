# TODO-067. リバースプロキシの設定

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | verifier |
| 実施 | Opus 5 / effort high | verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 16,760 | 85,760 | 83% |
| verifier | Sonnet 5 | medium | 10,124 | 51,272 | 17% |
| 合計 |  |  | 26,884 | 137,032 | 概算 $2.5 |

- 集計は `--since '2026-09-15 22:30:00'`（利用者が「TODO-067を確認して」と送った時刻）から。
  nginx.conf を読んで答えるまでを項目を立てるコミットより前に済ませたので、始点のコミットからでは数えられない
- verifier はグローバルの定義（`~/.claude/agents/verifier.md`）のまま。モデルは上書きしていない

## きっかけ

利用者が節を書いた。`ytbg lobby` を `https://www.ytani.net/ytbg`、ボード 1・2 を
`/ytbg1`・`/ytbg2` として見せたい。ytbg は rpi5-2 で動かし、既存の nginx
（revproxy の `/conf/usr/local/etc/nginx/nginx.conf`）の裏に置く。
rpi5-2 での起動スクリプトと、nginx.conf の修正内容を知りたい、というもの。

## やったこと

- revproxy の `nginx.conf` と、そこから読み込んでいる `proxy.conf` を読んで答えた。
  `proxy.conf` に `proxy_http_version 1.1` と `Upgrade` / `Connection` が既にあるので、
  実際の nginx.conf には `www.ytani.net` の `server` へ次の 3 つを足すだけでよい
  （`location /` の前。既存の `/storgan2/` と同じ書き方）

  ```nginx
  location /ytbg/  { proxy_pass http://rpi5-2:5000/ytbg/;  include proxy.conf; proxy_set_header Host $host; }
  location /ytbg1/ { proxy_pass http://rpi5-2:5001/ytbg1/; include proxy.conf; proxy_set_header Host $host; }
  location /ytbg2/ { proxy_pass http://rpi5-2:5002/ytbg2/; include proxy.conf; proxy_set_header Host $host; }
  ```

  `ytbg.ytani.net` の `server` は既に `https://www.ytani.net/ytbg` へリダイレクトしている
- 利用者の依頼で、答えを `docs/Admin.md` の「## 設定例」にまとめた。GitHub に公開される
  ので、ホスト名は例示用の `www.example.net`・`board-host` にした（利用者に聞いて決めた）。
  `proxy.conf` は利用者の環境にしか無いので、WebSocket の header も書いた単独の形にした
- 認証は付けない（利用者が決めた）。一覧ページに認証が無いことだけ書き添えた

## 確かめたこと

verifier が設定例の `ytbg.toml` で lobby を起動した（報告は
[`archives/agents/TODO-067/verifier-report.md`](../agents/TODO-067/verifier-report.md)）。

- `/ytbg/`・`/ytbg1/`・`/ytbg2/` が 200、`/` が 404
- 一覧ページの API の `url` が `/ytbg1/`・`/ytbg2/` で、`lobby.js` の `board_url()` が
  一覧ページの URL を基準に解決する。`url` を省いたときの URL の形の記述もコードと合う
- `/ytbg1/ws` に WebSocket でつながる
- lobby に SIGTERM を送ると、ボード 2 面も止まる
- systemd のユニットは `systemd-analyze --user verify` でエラー無し（enable・start はしていない）
- nginx はこのホストに無いので動かしていない。記述が「URL のプレフィクス」の節と矛盾しないことを読んで確かめた

ブラウザでの iframe の描画は見ていない。iframe の URL の決め方は既存の lobby の動作で、
`tests/browser/lobby.test.mjs` が見ているので、足さなかった。

## 残ること

- rpi5-2 への設定と revproxy の nginx.conf の書き換えは、利用者が行う
- revproxy の `ytbg1〜4.ytani.net` の `server` は、古いホスト `ytbg0` の 5001〜5004 を
  指したまま。`ytbg0` をやめるなら消してよい

## 分担の振り返り

- **verifier が見つけたこと:** 設定例の誤りは無かった。確かめられなかった点
  （ブラウザでの描画、nginx の実行）を分けて報告した
- **見込みとの食い違い:** 無し。文書だけの項目だが、`ytbg.toml` と起動のコマンドは
  書いたとおりに試せるので verifier を分けた
- **次に同じ規模なら:** 同じく main が書き、verifier（Sonnet）に書いたとおり試させる。
  料金の 8 割は main で、nginx.conf の取得と質問への回答のやり取りが大半。
  設定ファイルを読む項目では、最初にファイルが手元にあるかを確かめてから答え始める
