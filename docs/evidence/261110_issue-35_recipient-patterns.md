# Phase2 の贈る相手：レビューの1文目の型（読み取りのみ）

- 目的：父・友人・両親・同僚に贈ったレビューを数える条件を決める（要件定義書 5.2）
- 実行：2026-11-10、べー（MySQL Workbench、班の DB `giftia_t103`）。DB は変えていない
- 件数はレビューの件数で、商品数ではない

## 流した SQL

```sql
SELECT who, first_sentence, COUNT(*) AS n
FROM (
  SELECT '父' AS who, SUBSTRING_INDEX(r.comment, '。', 1) AS first_sentence
  FROM giftia_t103.reviews AS r WHERE r.comment LIKE '%父%'
  UNION ALL
  SELECT '友', SUBSTRING_INDEX(r.comment, '。', 1)
  FROM giftia_t103.reviews AS r WHERE r.comment LIKE '%友%'
  UNION ALL
  SELECT '両親', SUBSTRING_INDEX(r.comment, '。', 1)
  FROM giftia_t103.reviews AS r WHERE r.comment LIKE '%両親%'
  UNION ALL
  SELECT '同僚', SUBSTRING_INDEX(r.comment, '。', 1)
  FROM giftia_t103.reviews AS r WHERE r.comment LIKE '%同僚%'
) AS t
GROUP BY who, first_sentence
ORDER BY who, n DESC;
```

## 結果

| who | first_sentence | n | 判断 |
| --- | --- | --- | --- |
| 両親 | 義理の両親へのお歳暮に | 259 | 数える |
| 友 | 長い付き合いの友人に贈りました | 221 | 数える |
| 友 | 誕生日の友人へ、少し早めに届くようにしました | 218 | 数える |
| 友 | 遠方に住む友人の誕生日に送りました | 208 | 数える |
| 友 | 毎年誕生日を祝い合っている友人へ | 208 | 数える |
| 友 | 学生時代からの友人へ | 202 | 数える |
| 友 | 友人の誕生日に贈りました | 195 | 数える |
| 友 | 地元の友人の誕生日に | 191 | 数える |
| 友 | 友だちの誕生日プレゼントに | 189 | 数える |
| 友 | 結婚した友人夫婦に贈りました | 76 | 数える |
| 友 | 友人の結婚祝いに | 70 | 数える |
| 友 | 友人の新居へのお祝いを兼ねて | 69 | 数える |
| 友 | 出産した友人へのお祝いに選びました | 47 | 数える |
| 友 | 友人の出産祝いに | 39 | 数える |
| 友 | 友人夫婦に赤ちゃんが生まれたお祝いに | 33 | 数える |
| 同僚 | お世話になった同僚の送別に購入しました | 70 | 数える |
| 同僚 | 産休に入る同僚へ | 61 | 数える |
| 父 | 叔父へのお歳暮に | 250 | 除く（叔父） |
| 父 | 義父の誕生日に | 82 | 数える |
| 父 | 父の誕生日に贈りました | 79 | 数える |
| 父 | 祖父の誕生日に | 73 | 除く（祖父） |
| 父 | 父の日に | 37 | 数える |
| 父 | 義父への父の日の贈りものに | 35 | 数える |
| 父 | 父の日のプレゼントに選びました | 32 | 数える |

## 合計（数えるものだけ）

| 相手 | レビュー件数 | 条件 |
| --- | --- | --- |
| 父 | 265 | 「父」を含み、「祖父」「叔父」「伯父」を含まない |
| 友人 | 1,966 | 「友」を含む |
| 両親 | 259 | 「両親」を含む |
| 同僚 | 131 | 「同僚」を含む |
