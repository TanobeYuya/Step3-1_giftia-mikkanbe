# 班の DB の接続数の上限と使われ方（2026-11-20、読み取りの確認）

- 対応：#73、仕様・設計書 DS-06 段階②（`maxconnections`・`blocking`）
- 確かめた日・人：2026-11-20、べー（Claude Code が実行）
- 方法：手元のパソコンから、`giftia/backend/database.py` の接続で班の DB（`giftia_t103`）につなぎ、次の SELECT・SHOW だけを流した（書き込みはしていない）
  - `SHOW VARIABLES WHERE Variable_name IN ('max_connections','max_user_connections','wait_timeout')`
  - `SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Max_used_connections')`
  - `SELECT COUNT(*) n, COUNT(DISTINCT db) dbs FROM information_schema.processlist`
- 手元の回線では、Zscaler（会社のネットワークのセキュリティ）が 3306 番ポートへの通信を止めていた（エラー 2003）。Zscaler を一時的に切ってから確かめた

## 結果

| 項目 | 値 | 意味 |
| --- | --- | --- |
| `max_connections` | 171 | サーバー全体で、同時につなげる接続の上限 |
| `max_user_connections` | 0 | ユーザーごとの上限はない（0 は上限なし） |
| `wait_timeout` | 28800 | 使われていない接続を、サーバーが切るまでの秒数（8時間） |
| `Threads_connected` | 9 | 確かめた時点で、サーバーにつながっていた接続の数 |
| `Max_used_connections` | 14 | サーバーが起動してから、同時につながった接続の数の最大 |
| processlist（見える範囲） | 5本、DB は2種類 | 同じユーザーの接続のうち、班の DB 以外の DB を使っているものがある |

## 分かったこと

- DB のサーバーは、他の班と共有と見てよい。接続のユーザー名がクラス共通で、班の DB 以外を使う接続が見えたため。`max_connections` の 171 は、サーバー全体の上限で、他の班と分け合う。
- 171 は、Azure Database for MySQL の Burstable B1ms の既定値と同じ数。ただし、サーバーのプランはポータルで確かめておらず、未確認。
- いまの使われ方は最大14本で、上限には余裕がある。
