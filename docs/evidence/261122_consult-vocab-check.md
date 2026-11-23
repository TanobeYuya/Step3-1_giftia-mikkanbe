# 相談モードの語の一覧の確認（2026-11-22）

仕様設計書 11.1 論点4・5 の根拠。班の DB（giftia_t103）に SELECT だけを流した。手元の API の `database.fetch_all` で実行した。スクリプトの全文と、流し直したときのログは 4 にある。

## 1. カテゴリ（在庫あり）

```sql
SELECT category, COUNT(*) AS n FROM giftia_t103.products WHERE stock > 0 GROUP BY category ORDER BY n DESC;
```

| カテゴリ | 件数 |
| --- | --- |
| 生活雑貨 | 1,900 |
| 食品 | 1,858 |
| コスメ | 830 |
| 飲料 | 770 |
| 家電 | 479 |
| インテリア | 456 |
| ビジネス小物 | 407 |
| フラワー | 393 |
| 酒類 | 368 |
| カタログギフト | 301 |

10種で粗い。`/api/search` の q はカテゴリを探さない（商品名・ブランド・説明文の LIKE）ため、語の一覧には使わなかった。

## 2. 語の一覧（113語）

商品名の末尾の語をカテゴリごとに数え、品目を表す語を選んだ。選んだ語ごとに、q と同じ探し方で、在庫ありの件数を数えた。

```sql
SELECT COUNT(*) FROM giftia_t103.products
WHERE stock > 0 AND (product_name LIKE %s OR brand LIKE %s OR description LIKE %s);  -- %s は '%{語}%'
```

結果：113語すべてが1件以上（最小は カフェインレス 11件、最大は タオル 542件）。

```text
タオル:542 ハンカチ:108 エコバッグ:53 ポーチ:258 マグカップ:49 タンブラー:85 保温ボトル:47 グラス:95 茶碗:28 小皿:34
バスソルト:95 入浴剤:144 キャンドル:119 傘:43 エプロン:22 室内履き:23 ルームシューズ:18 ぬいぐるみ:40 ペット:43 ランタン:19
キッチンクロス:17 手袋:32 ハーブ栽培:19 リップ:418 ネイル:50 化粧水:53 美容液:46 ハンドクリーム:302 石けん:115 スキンケア:72
フレグランス:28 シャンプー:25 ヘアケア:31 ヘアオイル:20 メンズ:51 最中:68 どら焼き:52 フィナンシェ:171 マドレーヌ:47 焼き菓子:302
和菓子:81 ゼリー:73 チョコレート:167 クッキー:262 せんべい:76 おかき:61 羊羹:53 調味料:143 だし:88 ハム:53
ジャム:41 はちみつ:80 スープ:43 おつまみ:137 新米:24 ナッツ:38 オリーブオイル:23 カレー:34 果物:274 メロン:22
和牛:41 蟹:24 コーヒー:419 ドリップバッグ:155 コーヒー豆:54 紅茶:232 日本茶:62 ハーブティー:51 ジュース:72 カフェインレス:11
ブランケット:39 フォトフレーム:62 クッション:59 観葉植物:64 ライト:79 置き時計:54 アートポスター:26 一輪挿し:86 花瓶:29 ハーバリウム:42
花束:111 フラワーボックス:192 プリザーブドフラワー:102 ソープフラワー:52 胡蝶蘭:32 体験ギフト:52 カタログ:186 ビール:140 ワイン:177 日本酒:58
焼酎:46 ウイスキー:74 甘酒:15 ノンアルコール:20 名刺入れ:85 ボールペン:123 キーケース:38 パスケース:53 手帳:54 小銭入れ:25
PCケース:40 モバイルバッテリー:34 ファン:62 加湿器:54 トースター:28 充電:237 マッサージャー:52 グリル鍋:25 コーヒーメーカー:42 電動歯ブラシ:42
アイマスク:22 ヘアドライヤー:30 電気ケトル:41
```

- 「ファン」「ライト」「充電」は、別の品目の説明文にも当たる語のため、件数が多めに出ている可能性がある（未確認）
- 実装（B5）で `giftia/backend/consult_words.txt` に置くときは、TC-41 で数え直す

## 3. 事例の組み合わせ（在庫あり、シーンで絞る）

```sql
SELECT COUNT(*) FROM giftia_t103.products p
WHERE p.stock > 0
  AND EXISTS (SELECT 1 FROM giftia_t103.product_scenes s WHERE s.product_id = p.product_id AND s.scene_tag = %s)
  AND (p.product_name LIKE %s OR p.brand LIKE %s OR p.description LIKE %s)   -- 語の数だけ AND で足す
```

| シーン | 語 | 件数 |
| --- | --- | --- |
| 誕生日 | 電気ケトル | 32 |
| 誕生日 | 電気ケトル AND コーヒー | 8 |
| お礼 | コーヒー | 310 |
| お礼 | コーヒー AND ドリップバッグ | 45 |

2語の AND でも、事例では0件にならなかった。ほかの入力で0件になるかは未確認（0件なら、相手と場面だけで探す。FR-08 ⑤）。

## 4. スクリプトとログ

どれも `giftia/backend` で、手元の仮想環境の Python で流した（`database.py` を読み込むため）。接続先は backend の `.env` の値を使う（中身はここに書かない）。SELECT だけを流す。

### 4.1 語を選ぶ手がかり（`vocab_names.py`）

在庫ありの商品名から、括弧の中と数字を含む語を除き、末尾の語をカテゴリごとに数えた。113語は、この出力を見て品目を表す語を人が選んだ。出力は選ぶための手がかりで、残していない。

```python
import os, sys, re, collections
sys.path.insert(0, os.getcwd())
from database import fetch_all
rows = fetch_all("SELECT category, product_name FROM giftia_t103.products WHERE stock > 0")
by = collections.defaultdict(collections.Counter)
for r in rows:
    name = re.sub(r"（.*?）|「.*?」|\(.*?\)", " ", r["product_name"])
    toks = [t for t in name.split() if not re.search(r"\d", t)]
    if len(toks) >= 2:
        by[r["category"]][toks[-1]] += 1
for c, cnt in by.items():
    print("==", c, len(cnt), " / ".join(f"{w}:{n}" for w, n in cnt.most_common(45)))
```

### 4.2 113語の件数（`vocab_count.py`、2 の根拠）

`vocab.txt` は、2 の113語を1行1語で並べたファイル（手元の作業用）。

```text
# Windows: .venv\Scripts\python.exe vocab_count.py vocab.txt
# Mac:     .venv/bin/python vocab_count.py vocab.txt
```

```python
import os, sys
sys.path.insert(0, os.getcwd())
from database import fetch_all
words = [w.strip() for w in open(sys.argv[1], encoding="utf-8") if w.strip()]
ok = []
for w in words:
    p = f"%{w}%"
    n = fetch_all("SELECT COUNT(*) AS n FROM giftia_t103.products WHERE stock > 0 AND (product_name LIKE %s OR brand LIKE %s OR description LIKE %s)", (p, p, p))[0]["n"]
    print(f"{w}:{n}", end=" / ")
    if n > 0: ok.append(w)
print(f"\n語 {len(words)} / 1件以上 {len(ok)}")
```

ログ（2026-11-22 に流し直した。2 の数字と同じ）

```text
タオル:542 / ハンカチ:108 / エコバッグ:53 / ポーチ:258 / マグカップ:49 / タンブラー:85 / 保温ボトル:47 / グラス:95 / 茶碗:28 / 小皿:34 / バスソルト:95 / 入浴剤:144 / キャンドル:119 / 傘:43 / エプロン:22 / 室内履き:23 / ルームシューズ:18 / ぬいぐるみ:40 / ペット:43 / ランタン:19 / キッチンクロス:17 / 手袋:32 / ハーブ栽培:19 / リップ:418 / ネイル:50 / 化粧水:53 / 美容液:46 / ハンドクリーム:302 / 石けん:115 / スキンケア:72 / フレグランス:28 / シャンプー:25 / ヘアケア:31 / ヘアオイル:20 / メンズ:51 / 最中:68 / どら焼き:52 / フィナンシェ:171 / マドレーヌ:47 / 焼き菓子:302 / 和菓子:81 / ゼリー:73 / チョコレート:167 / クッキー:262 / せんべい:76 / おかき:61 / 羊羹:53 / 調味料:143 / だし:88 / ハム:53 / ジャム:41 / はちみつ:80 / スープ:43 / おつまみ:137 / 新米:24 / ナッツ:38 / オリーブオイル:23 / カレー:34 / 果物:274 / メロン:22 / 和牛:41 / 蟹:24 / コーヒー:419 / ドリップバッグ:155 / コーヒー豆:54 / 紅茶:232 / 日本茶:62 / ハーブティー:51 / ジュース:72 / カフェインレス:11 / ブランケット:39 / フォトフレーム:62 / クッション:59 / 観葉植物:64 / ライト:79 / 置き時計:54 / アートポスター:26 / 一輪挿し:86 / 花瓶:29 / ハーバリウム:42 / 花束:111 / フラワーボックス:192 / プリザーブドフラワー:102 / ソープフラワー:52 / 胡蝶蘭:32 / 体験ギフト:52 / カタログ:186 / ビール:140 / ワイン:177 / 日本酒:58 / 焼酎:46 / ウイスキー:74 / 甘酒:15 / ノンアルコール:20 / 名刺入れ:85 / ボールペン:123 / キーケース:38 / パスケース:53 / 手帳:54 / 小銭入れ:25 / PCケース:40 / モバイルバッテリー:34 / ファン:62 / 加湿器:54 / トースター:28 / 充電:237 / マッサージャー:52 / グリル鍋:25 / コーヒーメーカー:42 / 電動歯ブラシ:42 / アイマスク:22 / ヘアドライヤー:30 / 電気ケトル:41 / 
語 113 / 1件以上 113
```

### 4.3 事例の組み合わせ（`vocab_scene.py`、3 の根拠）

```python
import os, sys
sys.path.insert(0, os.getcwd())
from database import fetch_all
SQL = """SELECT COUNT(*) AS n FROM giftia_t103.products p
WHERE p.stock > 0 AND EXISTS (SELECT 1 FROM giftia_t103.product_scenes s WHERE s.product_id = p.product_id AND s.scene_tag = %s)
""" 
for scene, words in [("誕生日", ["電気ケトル"]), ("誕生日", ["電気ケトル", "コーヒー"]), ("お礼", ["コーヒー"]), ("お礼", ["コーヒー", "ドリップバッグ"])]:
    sql, params = SQL, [scene]
    for w in words:
        sql += " AND (p.product_name LIKE %s OR p.brand LIKE %s OR p.description LIKE %s)"
        params += [f"%{w}%"] * 3
    print(scene, "+", " AND ".join(words), "=", fetch_all(sql, tuple(params))[0]["n"])
```

ログ（2026-11-22 に流し直した。3 の表と同じ）

```text
誕生日 + 電気ケトル = 32
誕生日 + 電気ケトル AND コーヒー = 8
お礼 + コーヒー = 310
お礼 + コーヒー AND ドリップバッグ = 45
```
