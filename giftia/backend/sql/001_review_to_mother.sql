-- 001_review_to_mother.sql
-- 目的: 商品ごとに「母・義母に贈ったと書かれたレビューの件数」を product_facts に入れる（DR-01）
-- 何回流しても同じ結果になる（DR-02）。必ず giftia_t103 を付ける（他の班の DB を変えないため）
-- 実行: MySQL Workbench で、このファイルを全部選んで実行する

SET SQL_SAFE_UPDATES = 0;  -- Workbench の安全モードは、主キーの先頭列を使わない DELETE を止めるため、一時的に外す
START TRANSACTION;

DELETE FROM giftia_t103.product_facts
WHERE fact = 'review_to_mother';

INSERT INTO giftia_t103.product_facts (product_id, fact, value, source)
SELECT r.product_id, 'review_to_mother', COUNT(*), 'review_rule'
FROM giftia_t103.reviews AS r
WHERE r.comment LIKE '%母%'
  AND r.comment NOT LIKE '%祖母%'
  AND r.comment NOT LIKE '%叔母%'
  AND r.comment NOT LIKE '%伯母%'
GROUP BY r.product_id;

COMMIT;
SET SQL_SAFE_UPDATES = 1;

-- 確かめる（期待: rows=312, total=425）
SELECT COUNT(*) AS `rows`, SUM(value) AS total
FROM giftia_t103.product_facts
WHERE fact = 'review_to_mother';

-- NFR-01: 判定したレビューから無作為に20件を出し、人が読んで誤りを数える
-- SELECT r.review_id, r.product_id, r.comment
-- FROM giftia_t103.reviews AS r
-- WHERE r.comment LIKE '%母%'
--   AND r.comment NOT LIKE '%祖母%'
--   AND r.comment NOT LIKE '%叔母%'
--   AND r.comment NOT LIKE '%伯母%'
-- ORDER BY RAND()
-- LIMIT 20;
