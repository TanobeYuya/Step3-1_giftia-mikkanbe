# B3（商品の詳細とレビューの API）の手元での確認（2026-11-21）

- 対応：#59（B3）、仕様・設計書 DS-05、SP-13・SP-14・SP-16・SP-18、TC-15〜TC-19（API の部分）・TC-25・TC-28
- 確かめた日・人：2026-11-21、あかぷ（Claude Code が実行）
- 方法：手元のパソコンで API（ポート 8001、`127.0.0.1`）を起動し、班の DB（`giftia_t103`）につないだ。DB には SELECT だけを流した（書き込みはしていない）。確認用のスクリプトは、API を子プロセスとして起動し、最後に止める
- 対象：`feature/issue-59-product-detail`（`origin/main` の 5796bdd に、`/api/products/{product_id}` を足したもの）
- 辞書（`review_sentences`）は 139 件が DB に入っている

## TC-19（ID の形と404）

```text
PASS  TC-19 abc は 422・詳細を返さない  status 422
PASS  TC-19 G0001;DROP は 422・詳細を返さない  status 422
PASS  TC-19 G9999 は 404・詳細を返さない  status 404 body {"detail":"商品がありません"}
PASS  TC-19 G１２３４（全角の数字）は 422・詳細を返さない  status 422
```

- 422 の本文は FastAPI の入力検査の標準の形（どの入力が形に合わないか）。DB の内容・SQL・スタックトレースは含まない
- 本文に `Traceback`・`SELECT`・`pymysql`・DB 名が含まれないことも確かめた

## TC-25（母のレビューの件数）・TC-15（並び順）・TC-28（本文の一致）

本文のあるレビューが 30 件以下で、母のレビューが 2〜12 件ある商品を、商品 ID の順に 3 つ選んだ（G0091・G0200・G0244）。

```text
PASS  TC-25 G0091 toMother 件数 = product_facts  API 2 facts 2 reviewTotal 7
PASS  TC-25 G0200 toMother 件数 = product_facts  API 4 facts 4 reviewTotal 16
PASS  TC-25 G0244 toMother 件数 = product_facts  API 2 facts 2 reviewTotal 9
PASS  TC-15 G0091 母のレビューが先頭に並ぶ  1100000
PASS  TC-15 G0200 母のレビューが先頭に並ぶ  1111000000000000
PASS  TC-15 G0244 母のレビューが先頭に並ぶ  110000000
PASS  TC-15 商品名・価格・説明文がある（3商品）
PASS  TC-28 G0091 segments をつなげると原文と一致  7件 不一致 []
PASS  TC-28 G0200 segments をつなげると原文と一致  16件 不一致 []
PASS  TC-28 G0244 segments をつなげると原文と一致  9件 不一致 []
```

- 並びの `1` は母に贈ったレビュー、`0` はそれ以外
- TC-28 の原文は、`reviews.comment` を別に取って比べた

## TC-17（センチメント）・TC-18（ハイライト）

- TC-17：母のレビュー件数が多い 60 商品の 824 件で、API の `sentiment` を、辞書（`review_sentences.polarity`）から別に計算した値（要件定義書 5.2：ポジティブとネガティブの両方あれば mixed、片方だけなら positive・negative、どちらもなければ neutral）と比べた。不一致は 0 件
  - 件数：positive 741、mixed 79、negative 4、neutral 1。4 種類とも出た
- TC-18：15 商品のレビューで、`mark` が true の文が、辞書の `use_scene` ＝ 1 の文と一致した。`mark` の文は 87 件、不一致は 0 件。本文は原文のまま（TC-28 で確認）
- 最初の確認では、15 商品の中にニュートラルが出ず、TC-17 の「4種類とも出る」の項目が FAIL になった。コードの誤りではなく、選んだ商品が少なかったため。60 商品に広げ、辞書から別に計算した値との照合に直して合格にした（確認の条件をゆるめたのではなく、5.2 の決め方との一致を確かめる形にした）

## TC-16（レビュー0件）・件数の上限・ほかの API

```text
PASS  TC-16 G0002 レビュー0件でも商品情報を返す  status 200（reviewTotal 0、reviews []、説明文あり）
PASS  上限 G3759 本文あり 163件 → reviews は30件・reviewTotal は 163
PASS  /api/search?recipient=mother&scene=誕生日 が 200（変更前と同じ形）
```

## 確認していないこと

- 画面の部分（TC-15 の押す・閉じる、TC-16・TC-17・TC-18 の見た目）：F1（#60）の範囲
- 速さ：DS-05 に応答時間の基準はなく、この PR では測っていない
- 自動テストのコード：このリポジトリにはテストの置き場がなく、確認用のスクリプトは PR に含めていない
