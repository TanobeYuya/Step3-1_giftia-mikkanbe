# #34 Phase1 の通しの確認（TC-01〜TC-12）

- 確かめた日：2026-11-14
- 確かめた人：べー（実行は Claude Code。結果と画面のスクリーンショットはべーが見た）
- 対象：main の `3d1a05e`（#31・#32・#33 のマージ後）
- 期待する結果：仕様・設計書 5章のとおり。変えていない

## 確かめ方

- API：`giftia/backend` で `uvicorn main:app --port 8001` を起動し、`/api/search` の JSON を Python で検査した。DB は班の `giftia_t103` を読み取りだけで使った
- 変更前の API：#32 より前の main（`d4d7456`）の `main.py` を `--port 8002` で起動した。TC-04・TC-12 の比較にだけ使った
- 画面：`giftia-frontend` を `NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev` で起動した。Playwright（Edge）で操作し、送られた URL と表示されたカードを読んだ。API の応答は差し替えていない
- API の `limit` の上限は100で、ページ送りがない。そのため「全件」の確認は上位100件で行った
- 元データ：API の応答は [261114_issue-34_api-raw.json](261114_issue-34_api-raw.json)、画面の結果は [261114_issue-34_screen-result.json](261114_issue-34_screen-result.json)

## 結果

| TC | 入力 | 結果 | 判定 |
| --- | --- | --- | --- |
| TC-01 | `recipient=mother` | 1件目の tags の先頭が `{"kind":"recipient","name":"母","count":12}`。上位100件で母の件数が降順（上位20件は 12, 11, 9, 7, 5, 5, 5, 4, …）。母の件数が同じ商品が隣り合う91組は、すべて販売数の多い順（DB の sales_count を SELECT で照合）。total＝7,762 で、指定なしと同じ | 合格 |
| TC-02 | `recipient=mother&scene=誕生日` | 上位100件すべてに「誕生日」がある。1件目は［母 12件］［誕生日］の順で始まる。total＝4,503（4,503 以下） | 合格 |
| TC-03 | `recipient=mother&scene=母の日` | 上位100件すべてが「母の日」を持つ。母の件数は 12, 9, 5, 4, …で、上位に母のレビューがある商品。total＝1,757 | 合格 |
| TC-04 | （引数なし） | 変更前と total（7,762）が同じ。上位100件の id が同じ順で一致（先頭は G7282, G3759, G5425） | 合格 |
| TC-05 | `recipient=mother&scene=出産祝い` | total＝493。上位100件すべてが「出産祝い」を持つ。母の件数が0の商品が74件あり、母の件数がある商品の後ろに並ぶ（0件にならない） | 合格 |
| TC-06 | `recipient=mother&q=タオル` | total＝542。上位100件の商品名がすべて「タオル」を含み、母の件数が降順 | 合格 |
| TC-07 | `recipient=mother&price_min=3000&price_max=6000` | total＝4,011。上位100件の価格は 3,000〜5,980 円で、範囲外なし | 合格 |
| TC-08 | TC-01〜TC-07 の全結果 | API：8通り（引数なし＋TC-01〜07）の計700件で、tags が6個以上・同じタグの重なり・「おすすめ」はどれも0件。画面：下の7つの検索の計140枚で同じく0件 | 合格 |
| TC-09 | TC-01 の上位20件 | 上位20件の商品と母の件数が、#31 の確認のとき（[261112_issue-31_7_tc01-top20-api.json](261112_issue-31_7_tc01-top20-api.json)）とすべて一致した。データが変わっていないため、#31 の目視の結果（[261112_issue-31_6_tc09-top20.md](261112_issue-31_6_tc09-top20.md)）がそのまま当てはまる | 合格 |
| TC-10 | （試用） | 試用のため対象外（仕様・設計書 5章で、実装の PR の条件にしない） | 未実施 |
| TC-11 | `recipient=father`、`scene=クリスマス` | どちらも HTTP 422 | 合格 |
| TC-12 | 画面の「取引先へのお礼」で、個包装・3,000〜5,000円 | 送られた条件は `indiv_wrap=true&price_min=3000&price_max=4999`。表示された20件の商品名と順が、変更前の API と一致した（total はどちらも384）。20枚すべてにタグが付いている | 合格 |

## 画面の確認（TC-08・TC-12）

| 操作 | 送られた URL | カード | 1件目のタグ | スクリーンショット |
| --- | --- | --- | --- | --- |
| 何も選ばずに検索 | `/api/search?` | 20枚 | 母 3件、誕生日、送別、お礼 | [261114_issue-34_screen_none.png](261114_issue-34_screen_none.png) |
| 母（義母を含む） | `?recipient=mother` | 20枚 | 母 12件、誕生日、送別、母の日 | [261114_issue-34_screen_TC-01.png](261114_issue-34_screen_TC-01.png) |
| 母 × 誕生日 | `?recipient=mother&scene=誕生日` | 20枚 | 母 12件、誕生日、送別、母の日 | [261114_issue-34_screen_TC-02.png](261114_issue-34_screen_TC-02.png) |
| 母 × 母の日 | `?recipient=mother&scene=母の日` | 20枚 | 母 12件、母の日、誕生日、送別 | [261114_issue-34_screen_TC-03.png](261114_issue-34_screen_TC-03.png) |
| 母 × 出産祝い | `?recipient=mother&scene=出産祝い` | 20枚 | 母 2件、出産祝い、誕生日、お礼 | [261114_issue-34_screen_TC-05.png](261114_issue-34_screen_TC-05.png) |
| 母 ＋ キーワード「タオル」 | `?q=タオル&recipient=mother` | 20枚 | 母 5件、誕生日、送別、お礼 | [261114_issue-34_screen_TC-06.png](261114_issue-34_screen_TC-06.png) |
| 取引先へのお礼（個包装・3,000〜5,000円） | `?indiv_wrap=true&price_min=3000&price_max=4999` | 20枚 | （TC-12 を参照） | [261114_issue-34_screen_TC-12.png](261114_issue-34_screen_TC-12.png) |

- 何も選ばずに検索したときも「母 3件」が出る。SP-06 の「その相手のレビュー件数が1以上なら出す」のとおり
- TC-07 の入力（価格 3,000〜6,000円）は、画面では入れられない。「いまの検索」タブに価格の欄がないため（DS-03 で足していない）。TC-07 の結果は API だけで確かめた

## 確かめていないこと

- 上位100件より後ろの商品
