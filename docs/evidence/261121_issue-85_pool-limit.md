# 接続プールの上限（4本）と、上限に達したときの待ちの確認（2026-11-21）

- 対応：#85、仕様・設計書 DS-06 段階②（接続数の上限）
- 確かめた日・人：2026-11-21、あかぷ（Claude Code が実行）
- 方法：手元から班の DB（`giftia_t103`）へ。流したのは `SELECT CONNECTION_ID()`・`SELECT 1` と、検索の SELECT だけ。書き込みはしていない。接続は最大4本（上限どおり）

## 変えたもの

`giftia/backend/database.py` の `PooledDB` に `maxconnections=4, blocking=True` を足した。

## 結果

| 確かめたこと | 結果 | 証拠 |
| --- | --- | --- |
| プールの設定が `maxconnections=4`・`blocking=True` になっている | なっている | [check_pool_limit.log](261121_issue-85/check_pool_limit.log) 1行目 |
| 4本を借りた状態で5本目を借りに行くと、エラーにならず待つ | 3秒後も待っていた（エラーなし） | 同 6行目 |
| 1本返すと、待っていた5本目が借りられ、SELECT が通る | 通った（返してから 0.88秒） | 同 7行目 |
| `/api/search` が今までどおり 200 を返す | 200。total 4503（#83 の確認と同じ）、返った件数 20 | [check_search.log](261121_issue-85/check_search.log) |

## 補足

- `check_search.py` は 127.0.0.1 で呼んだ。`localhost` は Windows で約2秒遅いため（#72）
- 受け入れたリスク（待ちに時間の上限がない）は、DS-06 に書いたとおり。ここでは確かめていない
- スクリプトの全文：[check_pool_limit.py](261121_issue-85/check_pool_limit.py)・[check_search.py](261121_issue-85/check_search.py)
