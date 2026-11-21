# B3（#59）の TC-17・18・25・28 を、あとから第三者がやり直せるように書き直した確認用スクリプト（#77 の Approve コメントへの対応）
# 班の DB には SELECT だけを流す。API の関数 product_detail() を直接呼ぶ（HTTP の層は通らない。本物の main.py・プール・SQL を通る）。
# 使い方（giftia/backend で）：.venv\Scripts\python.exe ..\..\docs\evidence\261121_issue-59\check_b3.py
import os
import sys

sys.path.insert(0, os.getcwd())
import main  # noqa: E402
from database import fetch_all  # noqa: E402
from review_text import split_pieces  # noqa: E402

MOTHER_FACT = main.RECIPIENTS["mother"]["fact"]  # product_facts の fact 名（母に贈ったレビューの件数）
fails = []


def check(name, cond, note=""):
    print(("PASS " if cond else "FAIL ") + name + ("  " + note if note else ""))
    if not cond:
        fails.append(name)


def labels_for(rows):
    """レビューの原文（reviews.comment）から、辞書（review_sentences）の polarity・use_scene を別に引く（API の実装を通らない）"""
    keys = sorted({k for r in rows for _, k in split_pieces(r["comment"]) if k})
    if not keys:
        return {}
    marks = ", ".join(["%s"] * len(keys))
    got = fetch_all(f"SELECT sentence, polarity, use_scene FROM review_sentences WHERE sentence IN ({marks})", tuple(keys))
    return {g["sentence"]: g for g in got}


def expected_sentiment(comment, labels):
    """要件定義書 5.2 の決め方：positive と negative の両方があれば mixed、片方だけならその値、どちらもなければ neutral"""
    pols = {labels.get(k, {}).get("polarity") for _, k in split_pieces(comment) if k}
    pos, neg = "positive" in pols, "negative" in pols
    return "mixed" if pos and neg else "positive" if pos else "negative" if neg else "neutral"


def raw_comments(product_id, ids):
    marks = ", ".join(["%s"] * len(ids))
    return {r["review_id"]: r for r in fetch_all(f"SELECT review_id, comment FROM reviews WHERE review_id IN ({marks})", tuple(ids))}


# ---- 商品の選び方（SQL） ----
# TC-25・28・15：本文のあるレビューが30件以下で、母のレビューが2〜12件ある商品を、商品IDの順に3つ
SQL_THREE = """SELECT f.product_id FROM product_facts AS f
               WHERE f.fact = %s AND f.value BETWEEN 2 AND 12
                 AND (SELECT COUNT(*) FROM reviews r WHERE r.product_id = f.product_id AND r.comment IS NOT NULL AND TRIM(r.comment) <> '') <= 30
               ORDER BY f.product_id LIMIT 3"""
# TC-17・18：母のレビューの件数が多い順（同じなら商品ID）に N 商品
SQL_TOP = "SELECT product_id FROM product_facts WHERE fact = %s ORDER BY value DESC, product_id LIMIT %s"

three = [r["product_id"] for r in fetch_all(SQL_THREE, (MOTHER_FACT,))]
print("TC-25・28・15 の商品:", three)

# ---- TC-25（母のレビューの件数）・TC-28（本文の一致）----
for pid in three:
    d = main.product_detail(pid)
    facts = fetch_all("SELECT value FROM product_facts WHERE product_id = %s AND fact = %s", (pid, MOTHER_FACT))[0]["value"]
    n = sum(1 for r in d["reviews"] if r["toMother"])
    check(f"TC-25 {pid} toMother の件数 = product_facts", n == facts, f"API {n} facts {facts} reviewTotal {d['reviewTotal']}")
    raw = raw_comments(pid, [r["id"] for r in d["reviews"]])
    bad = [r["id"] for r in d["reviews"] if "".join(s["text"] for s in r["segments"]) != raw[r["id"]]["comment"]]
    check(f"TC-28 {pid} segments をつなげると原文と一致", not bad, f"{len(d['reviews'])}件 不一致 {bad}")


# ---- TC-17（センチメント）・TC-18（ハイライト）----
def run_17(n):
    ids = [r["product_id"] for r in fetch_all(SQL_TOP, (MOTHER_FACT, n))]
    counts = {"positive": 0, "negative": 0, "mixed": 0, "neutral": 0}
    diff = total = 0
    for pid in ids:
        d = main.product_detail(pid)
        raw = raw_comments(pid, [r["id"] for r in d["reviews"]])
        labels = labels_for(list(raw.values()))
        for r in d["reviews"]:
            total += 1
            counts[r["sentiment"]] += 1
            if r["sentiment"] != expected_sentiment(raw[r["id"]]["comment"], labels):
                diff += 1
    return ids, total, diff, counts


print("\n--- 最初の確認（15商品）：「4種類とも出る」まで求めたとき ---")
ids15, total, diff, counts = run_17(15)
check("TC-17（15商品）sentiment が 5.2 の決め方と一致", diff == 0, f"{total}件 不一致 {diff}")
first_try_ok = all(counts.values())
print(("PASS " if first_try_ok else "FAIL ") + "TC-17（15商品）4種類とも出る  件数", counts)  # ここが FAIL になったのが、最初の確認

print("\n--- 60商品に広げた確認 ---")
ids60, total, diff, counts = run_17(60)
check("TC-17（60商品）sentiment が 5.2 の決め方と一致", diff == 0, f"{total}件 不一致 {diff}")
check("TC-17（60商品）4種類とも出る", all(counts.values()), f"件数 {counts}")

marked = bad18 = 0
for pid in ids15:
    d = main.product_detail(pid)
    raw = raw_comments(pid, [r["id"] for r in d["reviews"]])
    labels = labels_for(list(raw.values()))
    for r in d["reviews"]:
        want = [bool(labels.get(k, {}).get("use_scene")) for _, k in split_pieces(raw[r["id"]]["comment"])]
        got = [s["mark"] for s in r["segments"]]
        marked += sum(got)
        bad18 += got != want
check("TC-18（15商品）mark が辞書の use_scene と一致", bad18 == 0, f"mark の文 {marked}件 不一致 {bad18}")

print("\n不合格の項目:", fails if fails else "なし")
sys.exit(0)
