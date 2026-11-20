# 班の DB の設計の確認（2026-11-17、読み取りの確認）

- 対応：要件定義書 付録A の「受け入れたリスク」①〜⑤（#68）
- 確かめた日・人：2026-11-17、べー（Claude Code が実行）
- 方法：手元のパソコンから、`giftia/backend/database.py` の `get_connection()` で班の DB（`giftia_t103`）に接続し、SELECT・SHOW だけを流した（書き込みはしていない）。ユーザー名・ホスト名は記録しない

## ① 権限（`SHOW GRANTS FOR CURRENT_USER()`）

班のユーザーは、`giftia_t101%` 〜 `giftia_t106%` の6つすべてに、次の権限を持つ。

`SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, CREATE TEMPORARY TABLES, LOCK TABLES, CREATE VIEW, SHOW VIEW`

他の班の表も DROP（削除）・ALTER（構造の変更）できる。

## ② product_facts の value の中身（fact ごと）

| fact | 行数 | value の最小 | value の最大 | value の意味 |
| --- | --- | --- | --- | --- |
| indiv_wrap | 1,417 | 0 | 1 | はい／いいえ |
| room_temp | 1,730 | 0 | 1 | はい／いいえ |
| office_orders | 3,204 | 1 | 765 | 件数 |
| review_to_mother | 312 | 1 | 12 | 件数 |
| shelf_life_days | 881 | 3 | 1,095 | 日数 |

fact は `varchar(30)` で、CHECK 制約はない（`SHOW CREATE TABLE`）。

## ③ 商品 ID

- 商品は 8,000件。「G＋4桁」でない ID は 0件（`product_id NOT REGEXP '^G[0-9]{4}$'`）
- ID の順と登録日の順が逆になる商品は 0件（直前の ID より登録日が古い商品を `LAG()` で数えた）
- 上限の G9999 まで、約2,000件

## ④ マスタの表

- 表は order_items・orders・product_facts・product_scenes・products・review_sentences・reviews・users の8つ。カテゴリー・ブランド・シーンのマスタの表はない
- 種類の数：カテゴリー 10、ブランド 570、シーン 9（表記ゆれはない）

## ⑤ レビューのない商品

- products の review_count が0の商品は 3,704件で、rating はすべて NULL
- API（main.py の `to_gift()`）は rating が NULL のとき 0 を返す
