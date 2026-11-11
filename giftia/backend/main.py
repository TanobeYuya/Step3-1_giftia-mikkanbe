# main.py — Giftia 検索API
#
# 画面（Next.js）から呼ばれる「窓口」。条件を受け取り、班のDBを検索して、結果を JSON で返す。
# 起動：uvicorn main:app --reload
# 確認：http://localhost:8000/docs（Swagger UI。ブラウザから API を試せる）

import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from database import fetch_all

load_dotenv()  # .env を読む（DB の接続情報・CORS の許可）

app = FastAPI(title="Giftia Search API（2週目）")

# 贈る相手：API の値 → タグの短い名前と、product_facts の fact 名（SP-01・SP-06）
# Phase2 で相手を足すときは、ここに1行足し、DS-01 の形で SQL を足す
RECIPIENTS = {
    "mother": {"tag": "母", "fact": "review_to_mother"},
}
# シーン：選択肢とタグの並び順（SP-02・SP-06）。在庫ありの商品が多い順
SCENES = ["誕生日", "送別", "お礼", "母の日", "お歳暮", "お中元", "結婚祝い", "父の日", "出産祝い"]
TAG_LIMITS = {"recipient": 2, "scene": 3, "fact": 3}  # 系統ごとの上限（SP-06）
TAG_MAX = 5                                            # 全体の上限（SP-06）

# ── CORS ───────────────────────────────────────
# 画面（http://localhost:3000）と API（http://localhost:8000）は別のアプリ＝オリジンが違う。
# ブラウザは既定で「別オリジンへの通信」を止めるので、API 側が「この画面からは受け付ける」と宣言する。
# 許可する画面の URL は .env の CORS_ORIGINS に書く（カンマ区切りで複数可）。空なら何も許可しない。
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])


@app.get("/api/health")
def health():
    """つながっているかの確認。どの DB に何件の商品があるか"""
    row = fetch_all("SELECT DATABASE() AS db, COUNT(*) AS products FROM products")[0]
    return {"status": "ok", "db": row["db"], "products": row["products"]}


@app.get("/api/search")
def search(
    q: str = Query(default="", description="キーワード（空白区切りで複数。すべてを含む商品）"),
    category: str = Query(default="", description="カテゴリー（空ならすべて）"),
    indiv_wrap: bool = Query(default=False, description="true なら、説明文に「個包装」とある商品だけ"),
    price_min: int | None = Query(default=None, ge=0, description="価格の下限（以上）"),
    price_max: int | None = Query(default=None, ge=0, description="価格の上限（以下）"),
    limit: int = Query(default=20, ge=1, le=100, description="返す件数"),
    # 以下2つは仕様・設計書 DS-02-2。Literal にない値は FastAPI が自動で 422 にする（SP-07）。
    # Literal の中身は、上の RECIPIENTS・SCENES と一致させる
    recipient: Literal["", "mother"] = Query(default="", description="贈る相手（空なら指定なし）。選ぶと、その相手に贈ったレビューが多い順に並べる"),
    scene: Literal["", "誕生日", "送別", "お礼", "母の日", "お歳暮", "お中元", "結婚祝い", "父の日", "出産祝い"] = Query(
        default="", description="シーン（空なら指定なし）。選ぶと、そのシーンの商品だけに絞る"
    ),
):
    """条件に合う商品を、人気順（直近1年の販売数）で上位 limit 件返す。recipient を選ぶと、その相手に贈ったレビューの件数が多い順にする"""
    # ① 条件を WHERE に1つずつ足す（値は %s で渡し、SQL の文字列に直接つなげない）
    where, params = ["stock > 0"], []  # 在庫切れは出さない
    for word in q.split():  # q を空白で区切って1語ずつにする（文字列のメソッド）
        where.append("(product_name LIKE %s OR brand LIKE %s OR description LIKE %s)")
        params += [f"%{word}%"] * 3
    if category:
        where.append("category = %s")
        params.append(category)  # %s に入れる値（受け取ったカテゴリー）
    if indiv_wrap:
        where.append("description LIKE %s")  # 「個包装」は列がないので、説明文に書いてあるかで見る
        params.append("%個包装%")  # 「個包装」をどこかに含む、という LIKE のパターン
    if price_min is not None:
        where.append("price >= %s")
        params.append(price_min)
    if price_max is not None:
        where.append("price <= %s")
        params.append(price_max)
    if scene:
        # シーンのタグを持つ商品だけに絞る（SP-04）。贈る相手では絞らない（SP-05）
        where.append("EXISTS (SELECT 1 FROM product_scenes AS s WHERE s.product_id = p.product_id AND s.scene_tag = %s)")
        params.append(scene)
    condition = " AND ".join(where)

    # ② 件数と、上位 limit 件を取る
    total = fetch_all(f"SELECT COUNT(*) AS n FROM products AS p WHERE {condition}", tuple(params))[0]["n"]
    if recipient:
        # 贈る相手を選んだとき：その相手のレビュー件数が多い順 → 販売数 → 商品ID。件数がない商品は 0 件（SP-05）
        rows = fetch_all(
            f"""SELECT p.product_id, p.category, p.brand, p.product_name, p.price, p.rating, p.review_count
                FROM products AS p
                LEFT JOIN product_facts AS f ON f.product_id = p.product_id AND f.fact = %s
                WHERE {condition}
                ORDER BY COALESCE(f.value, 0) DESC, p.sales_count DESC, p.product_id
                LIMIT %s""",
            (RECIPIENTS[recipient]["fact"], *params, limit),
        )
    else:
        # 選ばないとき：いままでと同じ並び順（SP-08）
        rows = fetch_all(
            f"""SELECT p.product_id, p.category, p.brand, p.product_name, p.price, p.rating, p.review_count
                FROM products AS p WHERE {condition}
                ORDER BY p.sales_count DESC, p.product_id
                LIMIT %s""",
            (*params, limit),
        )

    # ③ 商品のタグの材料（シーンと product_facts）を、商品ごとではなくまとめて2回で取る（N+1 を避ける）
    scenes_by_product, facts_by_product = fetch_tag_sources([r["product_id"] for r in rows])

    # ④ DB の行を、画面の Gift 型（1週目）に詰め替えて返す
    results = [
        to_gift(
            r,
            build_tags(scenes_by_product.get(r["product_id"], []), facts_by_product.get(r["product_id"], {}), recipient, scene),
        )
        for r in rows
    ]
    return {"total": total, "results": results}


def fetch_tag_sources(product_ids: list[str]) -> tuple[dict[str, list[str]], dict[str, dict[str, int]]]:
    """表示する商品のシーンと product_facts を取る。商品が0件なら DB を呼ばない（DS-02-4）"""
    if not product_ids:
        return {}, {}
    marks = ", ".join(["%s"] * len(product_ids))  # IN (%s, %s, ...) の %s を商品の数だけ作る
    scene_rows = fetch_all(
        f"SELECT product_id, scene_tag FROM product_scenes WHERE product_id IN ({marks})",
        tuple(product_ids),
    )
    fact_names = ["room_temp", "indiv_wrap", "shelf_life_days", *[v["fact"] for v in RECIPIENTS.values()]]
    fact_marks = ", ".join(["%s"] * len(fact_names))
    fact_rows = fetch_all(
        f"SELECT product_id, fact, value FROM product_facts WHERE product_id IN ({marks}) AND fact IN ({fact_marks})",
        (*product_ids, *fact_names),
    )
    scenes_by_product: dict[str, list[str]] = {}
    for row in scene_rows:
        scenes_by_product.setdefault(row["product_id"], []).append(row["scene_tag"])
    facts_by_product: dict[str, dict[str, int]] = {}
    for row in fact_rows:
        facts_by_product.setdefault(row["product_id"], {})[row["fact"]] = row["value"]
    return scenes_by_product, facts_by_product


def build_tags(scenes: list[str], facts: dict[str, int], recipient: str, scene: str) -> list[dict]:
    """結果カードに出すタグを、仕様・設計書 SP-06 の規則で組み立てる。DB は呼ばない（DS-02-4）"""
    # 贈る相手のタグ：レビュー件数が 1 以上の相手。選んだ相手を先頭、残りは件数の多い順
    recipient_tags = [
        {"kind": "recipient", "name": info["tag"], "count": facts[info["fact"]]}
        for info in RECIPIENTS.values()
        if facts.get(info["fact"], 0) >= 1
    ]
    chosen_name = RECIPIENTS[recipient]["tag"] if recipient else None
    recipient_tags.sort(key=lambda t: (t["name"] != chosen_name, -t["count"]))
    recipient_tags = recipient_tags[: TAG_LIMITS["recipient"]]

    # シーンのタグ：SCENES の順。選んだシーンを先頭
    scene_tags = [{"kind": "scene", "name": s} for s in SCENES if s in scenes]
    scene_tags.sort(key=lambda t: t["name"] != scene)  # sort は安定なので、選んだ以外は SCENES の順のまま
    scene_tags = scene_tags[: TAG_LIMITS["scene"]]

    # 商品の性質のタグ：常温 → 個包装 → 日持ち
    fact_tags = []
    if facts.get("room_temp") == 1:
        fact_tags.append({"kind": "fact", "name": "常温"})
    if facts.get("indiv_wrap") == 1:
        fact_tags.append({"kind": "fact", "name": "個包装"})
    if "shelf_life_days" in facts:
        fact_tags.append({"kind": "fact", "name": f"日持ち{facts['shelf_life_days']}日"})
    fact_tags = fact_tags[: TAG_LIMITS["fact"]]

    # 並べる順：選んだ相手 → 選んだシーン → 残りの相手 → 残りのシーン → 商品の性質。全体で TAG_MAX 個まで
    chosen = []
    if recipient_tags and recipient_tags[0]["name"] == chosen_name:
        chosen.append(recipient_tags.pop(0))
    if scene_tags and scene_tags[0]["name"] == scene:
        chosen.append(scene_tags.pop(0))
    return (chosen + recipient_tags + scene_tags + fact_tags)[:TAG_MAX]


def to_gift(r: dict, tags: list[dict]) -> dict:
    """DB の列名 → 画面（lib/api.ts の Gift 型）の項目名。画面側は1週目のまま変えない。tags は DS-02-5"""
    return {
        "id": r["product_id"],
        "category": r["category"],
        "brand": r["brand"],
        "name": r["product_name"],  # 商品名の列名（データ定義.md の products を見る）
        "price": r["price"],
        "rating": float(r["rating"]) if r["rating"] is not None else 0,  # レビューなしは 0
        "reviewCount": r["review_count"],
        "tags": tags,
    }
