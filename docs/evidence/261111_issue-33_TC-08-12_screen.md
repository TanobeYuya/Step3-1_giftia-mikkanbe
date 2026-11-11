# #33 画面の確認（TC-08 の画面部分・TC-12）

- 確かめた日：2026-11-11
- 確かめた人：みかん
- 確かめ方：Playwright（Chromium）で画面を操作し、`/api/search` に送られた URL と、表示されたカードを読んだ。API の応答は差し替えていない。
- 画面：`giftia-frontend`（`npm run dev`、`NEXT_PUBLIC_API_URL=http://localhost:8001`）
- API：#32 をマージした main（`b383278`）の `giftia/backend`（`uvicorn main:app --port 8001`）。班の DB（`giftia_t103`）は読み取りだけ。
- 変更前の API：`d4d7456` の `main.py`（`--port 8002`）。TC-12 の比較にだけ使った。
- 確認した範囲：画面に出る上位20件（API の既定の件数）。全件は確かめていない。

## 送られた条件（SP-01・SP-02）

| 操作 | 送られた URL |
| --- | --- |
| 何も選ばずに検索 | `/api/search?`（recipient・scene は送られない） |
| 母（義母を含む）× 誕生日 | `/api/search?recipient=mother&scene=誕生日` |
| 母（義母を含む）× 母の日 | `/api/search?recipient=mother&scene=母の日` |
| 取引先へのお礼（個包装・3,000〜5,000円） | `/api/search?indiv_wrap=true&price_min=3000&price_max=4999`（recipient・scene は送られない） |

- 見出し「誰に贈る？」「どんな場面？」は、それぞれ1つ出る。見出しを押すとプルダウンにフォーカスが移る（SP-03）。
- 取引先タブには「誰に贈る？」「どんな場面？」が出ない（SP-01・SP-02）。

## TC-08（画面部分）

- 4つの検索（上の表）の計80枚のカードで、タグが5個を超えるもの、同じタグが重なるものは0件。
- 画面に「おすすめ」の文字はない。
- 「母 × 誕生日」の1件目：［母 12件］［誕生日］［送別］［母の日］。API の1件目と一致した。
- タグが0個のカードに空の枠が出ないことは、仮データ（`tags` が空の商品）で確かめた。実際の API の20件には、タグが0個の商品がなかった。

## TC-12

- 条件：取引先へのお礼で、個包装・3,000〜5,000円。
- 変更前の API と、いまの API で、total（384件）と上位20件の id・順が一致した。
- 画面の各カードにタグが付いている。

## 画面の表示のスクリーンショット

- `261111_issue-33_TC-08_standard-tags.png`（母 × 誕生日）
- `261111_issue-33_TC-12_business-tags.png`（取引先へのお礼）
