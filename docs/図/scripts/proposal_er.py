"""企画書の ER 図：Phase0（変更前）と変更後（Phase1＋Phase2 ①）を、同じ配置で2枚描く。
全ての表を載せ、変わった表だけを★とオレンジ枠でハイライトする。
実行: python -I proposal_er.py <出力フォルダ>
出典: 要件定義書 5.1（変更前の ER 図）、giftia/backend/sql/001_review_to_mother.sql・002_review_sentences.sql
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "drawio-diagram", "scripts"))
from drawio_kit import Diagram, HIGHLIGHT  # noqa: E402

out = sys.argv[1] if len(sys.argv) > 1 else "."
HL_BOX = f"rounded=1;fillColor=#FFFFFF;strokeColor={HIGHLIGHT};strokeWidth=2;"
DASH = "edgeStyle=entityRelationEdgeStyle;dashed=1;endArrow=open;strokeColor=#6B7280;strokeWidth=1.5;fontSize=11;"


def er(after: bool):
    if after:
        d = Diagram("ER 図（変更後：Phase1 ＋ Phase2 ①）― 全ての表",
                    "変更前と同じ配置。★オレンジ枠が変わった表。【P1】product_facts に行を足した（列は同じ）。【P2①】review_sentences を足した")
        d.legend(1500, 0, extras=[(HL_BOX, "★ 変わった表")], lines=[("res", "外部キーではない（データの作り方・照合）")])
    else:
        d = Diagram("ER 図（変更前：Phase0）― 全ての表",
                    "配布の DB（要件定義書 5.1）。検索で使っていたのは products だけ")
        d.legend(1500, 0, lines=[("res", "外部キーではない（データの作り方）")])

    u = d.entity(0, 160, "users　会員", [("PK", "user_id", "VARCHAR(20)"), ("", "age_group", "VARCHAR(10)"),
                                        ("", "gender", "VARCHAR(10)"), ("", "registered_at", "DATE")])
    o = d.entity(420, 120, "orders　注文", [("PK", "order_id", "VARCHAR(12)"), ("FK", "user_id", "VARCHAR(20)"),
                                          ("", "ordered_at", "DATETIME"), ("", "gift_purpose", "VARCHAR(20)"),
                                          ("", "estimated_scene", "VARCHAR(20)"), ("", "recipient_key", "VARCHAR(16)"),
                                          ("", "ship_to_type", "VARCHAR(10)"), ("", "total_amount", "INT")])
    r = d.entity(420, 560, "reviews　レビュー", [("PK", "review_id", "VARCHAR(12)"), ("FK", "product_id", "VARCHAR(10)"),
                                              ("FK", "user_id", "VARCHAR(20)"), ("", "rating", "INT"),
                                              ("", "comment", "TEXT"), ("", "posted_at", "DATE")])
    oi = d.entity(880, 120, "order_items　注文明細", [("PK,FK", "order_id", "VARCHAR(12)"), ("PK", "line_no", "INT"),
                                                  ("FK", "product_id", "VARCHAR(10)"), ("", "quantity", "INT"),
                                                  ("", "unit_price", "INT")])
    p = d.entity(880, 400, "products　商品", [("PK", "product_id", "VARCHAR(10)"), ("", "product_name", "VARCHAR(100)"),
                                             ("", "category", "VARCHAR(30)"), ("", "price", "INT"), ("", "brand", "VARCHAR(50)"),
                                             ("", "description", "TEXT"), ("", "rating", "DECIMAL(2,1)"),
                                             ("", "review_count", "INT"), ("", "sales_count", "INT"), ("", "stock", "INT"),
                                             ("", "registered_at", "DATE")])
    s = d.entity(1360, 120, "product_scenes　シーン", [("PK,FK", "product_id", "VARCHAR(10)"), ("PK", "scene_tag", "VARCHAR(20)")])
    f = d.entity(1360, 320, ("★ product_facts【P1】" if after else "product_facts　商品の事実"),
                 [("PK,FK", "product_id", "VARCHAR(10)"), ("PK", "fact", "VARCHAR(30)"), ("", "value", "INT"),
                  ("", "source", "VARCHAR(30)")], highlight=after)
    d.relation(u["user_id"], o["user_id"], "1", "0..n")
    d.relation(u["user_id"], r["user_id"], "1", "0..n")
    d.relation(o["order_id"], oi["order_id"], "1", "1..n")
    d.relation(p["product_id"], oi["product_id"], "1", "0..n")
    d.relation(p["product_id"], r["product_id"], "1", "0..n")
    d.relation(p["product_id"], s["product_id"], "1", "0..n")
    d.relation(p["product_id"], f["product_id"], "1", "0..n")
    if after:
        rs = d.entity(1360, 640, "★ review_sentences【P2①】", [("PK", "sentence", "VARCHAR(100)"), ("", "polarity", "VARCHAR(10)"),
                                                               ("", "use_scene", "TINYINT(1)"), ("", "source", "VARCHAR(30)")],
                      highlight=True)
        d.edge([(560, 748), (560, 900), (1300, 900), (1300, 417), (1360, 417)], "res")
        d.num(600, 878, "本文を SQL で集計（P1）→ product_facts", align="left", bg=None)
        d.edge([(640, 748), (640, 860), (1330, 860), (1330, 685), (1360, 685)], "res")
        d.num(680, 838, "文に分けて照合（P2①）→ review_sentences", align="left", bg=None)
        rows = [
            ["★ product_facts【P1】", "列は同じ。fact＝review_to_mother の行を 312商品に足した（value＝母・義母へのレビュー件数、source＝review_rule）", "開発が SQL を月1回流す（001_review_to_mother.sql）"],
            ["★ review_sentences【P2①】", "新しい表。レビューの定型文ごとに polarity（positive・negative・none）と use_scene（使う場面なら1）を持つ", "開発時に AI が案を出し、人が確認（002_review_sentences.sql）"],
            ["変わらない表", "users・orders・order_items・products・product_scenes・reviews", "―"],
            ["Phase2 ② 相談モード（実装中）", "表は足さない。3問目の自由記述（memo）は保存しない。③ ベクトル検索は作らない", "―"],
        ]
        d.table(0, 1000, ["表", "変わったこと", "誰が作るか"], rows, max_width=1700, first_col_center=False,
                title="変更前との違い")
    else:
        d.edge([(560, 748), (560, 900), (1300, 900), (1300, 417), (1360, 417)], "res")
        d.num(600, 878, "Phase1 で本文から集計 → product_facts", align="left", bg=None)
        d.table(0, 1000, ["表", "検索での使い方（Phase0）"], [
            ["products", "検索で使っていた唯一の表。販売数の多い順に返す"],
            ["product_scenes・product_facts・reviews", "DB にはあるが、検索では使っていない"],
            ["users・orders・order_items", "購入の記録。検索では使っていない（変更後も同じ）"],
        ], max_width=1200, first_col_center=False, title="表の使い方")
    return d


for after, name in [(False, "企画書_2a_ER図_Phase0"), (True, "企画書_2b_ER図_変更後")]:
    d = er(after)
    path = os.path.join(out, name + ".drawio")
    d.save(path, page_name="ER図")
    d.export(path, os.path.join(out, name + ".png"))
