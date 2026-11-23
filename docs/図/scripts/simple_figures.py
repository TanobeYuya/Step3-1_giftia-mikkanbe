"""企画書の簡略版：アーキ図・シーケンス図・ER 図の3枚。
各図は1つの問いだけに答える（アーキ図＝どこが変わるか、シーケンス図＝どの順で動くか、ER 図＝何を保存するか）。
配色は3枚共通：灰＝既存、オレンジ＋★＝変更・追加、灰の点線＝実装中（Phase2 ②）。
詳細は 02_企画書/ の図と、企画書（261122_Giftia改善企画書.md）を正とする。新しい情報は足さない。
実行: python -I simple_figures.py <出力フォルダ>（既定は ../03_企画書_簡略版）
出典: proposal_figures.py・proposal_er.py（企画書_1_アーキ図・2b_ER図・3_シーケンス図）
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "drawio-diagram", "scripts"))
from drawio_kit import Diagram, HIGHLIGHT  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "03_企画書_簡略版")
AZ = Diagram.AZ
HL_BOX = f"rounded=1;fillColor=#FFFFFF;strokeColor={HIGHLIGHT};strokeWidth=2;"
OLD_BOX = "rounded=1;fillColor=#F3F4F6;strokeColor=#4B5563;"
WIP_BOX = "rounded=1;fillColor=#FFFFFF;strokeColor=#9CA3AF;dashed=1;"
EXTRAS = [(OLD_BOX, "既存（変更なし）"), (HL_BOX, "★ 変更・追加"), (WIP_BOX, "実装中（Phase2 ②）")]


def run(d, name, page):
    p = os.path.join(out, name + ".drawio")
    d.save(p, page_name=page)
    d.export(p, os.path.join(out, name + ".png"))


# ── 1. アーキ図：どこが変わるか ─────────────────
d = Diagram("1. アーキ図（簡略版）― どこが変わるか",
            "★オレンジが今回の変更（Phase1・Phase2 ①）。番号は検索 → 詳細の順。詳細は 02_企画書/企画書_1_アーキ図")
d.legend(1680, 0, lines=[("req", "呼び出し"), ("res", "応答")], extras=EXTRAS)
d.icon(20, 330, AZ + "identity/Users.svg", 64, label="利用者", label_w=104)

d.group(250, 160, 380, 460, "画面　Next.js", tier="front", icon=AZ + "general/Browser.svg")
d.node(280, 220, 320, 80, "★ 検索画面", "「誰に贈る？」「どんな場面？」", "front", highlight=True)
d.node(280, 360, 320, 80, "★ 結果カード", "タグを最大5個出す", "front", highlight=True)
d.node(280, 500, 320, 80, "★ レビューのモーダル　NEW", "使う場面の文をハイライト", "front", highlight=True)

d.group(760, 160, 400, 460, "API　FastAPI", tier="api", icon=AZ + "general/Code.svg")
d.node(790, 220, 340, 80, "★ GET /api/search", "母のレビュー件数の多い順", "api", highlight=True)
d.node(790, 360, 340, 80, "★ 接続プール　NEW", "接続を使い回して速くする", "api", highlight=True)
d.node(790, 500, 340, 80, "★ GET /api/products/{id}　NEW", "レビューと文の辞書を返す", "api", highlight=True)

d.group(1290, 160, 330, 460, "MySQL　giftia_t103", tier="db", icon=AZ + "databases/Azure_Database_MySQL_Server.svg")
d.node(1320, 220, 270, 80, "products ほか", "商品・シーン・レビュー", "infra")
d.node(1320, 360, 270, 80, "★ product_facts", "母へのレビュー件数の行", "db", highlight=True)
d.node(1320, 500, 270, 80, "★ review_sentences　NEW", "文の辞書", "db", highlight=True)

# 番号はシーケンス図（2_シーケンス図）と同じ。利用者の操作（①⑤）と、利用者に返る戻り（⑨）も描く
d.edge([(84, 345), (170, 345), (170, 260), (280, 260)], "req");  d.num(100, 300, "① 条件を選ぶ", align="left")
d.edge([(600, 240), (790, 240)], "req");                         d.num(650, 218, "② 検索", align="left", bg=None)
d.edge([(1130, 250), (1320, 250)], "req");                       d.num(1180, 228, "③ SELECT", align="left", bg=None)
d.edge([(790, 285), (720, 285), (720, 400), (600, 400)], "res"); d.num(645, 330, "④ 結果", align="left", bg=None)
d.edge([(84, 380), (262, 380), (262, 410), (280, 410)], "req");  d.num(116, 390, "⑤ カードを押す", align="left")
d.text(450, 455, 80, 30, "開く ↓", size=12, align="left")
d.edge([(600, 525), (790, 525)], "req");                         d.num(650, 503, "⑥ 詳細", align="left", bg=None)
d.edge([(1130, 540), (1320, 540)], "req");                       d.num(1180, 518, "⑦ SELECT", align="left", bg=None)
d.edge([(790, 565), (600, 565)], "res");                         d.num(645, 572, "⑧ 返す", align="left", bg=None)
d.edge([(280, 560), (60, 560), (60, 470)], "res");               d.num(90, 570, "⑨ 読む", align="left")
d.node(250, 660, 1370, 70, "実装中：Phase2 ② 相談モード", "3問に答えると、生成AIがキーワードに直し、既存の検索で商品を探す（表は足さない）", "api", muted=True)
run(d, "1_アーキ図", "アーキ図")

# ── 2. シーケンス図：どの順で動くか ────────────────
d = Diagram("2. シーケンス図（簡略版）― どの順で動くか",
            "★は今回の変更。実線＝呼び出し、破線＝戻り。詳細は 02_企画書/企画書_3_シーケンス図")
d.legend(820, 0, lines=[("plain", "呼び出し"), ("res", "戻り")])
X = {}
for k, (key, name, tier, actor) in enumerate([("u", "利用者", "user", True), ("f", "画面", "front", False),
                                              ("a", "API", "api", False), ("m", "MySQL", "db", False)]):
    X[key] = d.lifeline(k * 260, 120, name, 640, tier=tier, actor=actor)
d.message(X["u"], X["f"] - 6, 240, "① 誰に・どんな場面 ★")
d.message(X["f"] + 6, X["a"] - 6, 290, "② GET /api/search ★")
d.message(X["a"] + 6, X["m"] - 6, 340, "③ 母のレビュー件数順 ★")
d.message(X["a"] - 6, X["f"] + 6, 390, "④ 結果＋タグ ★", kind="return")
d.message(X["u"], X["f"] - 6, 470, "⑤ カードを押す ★")
d.message(X["f"] + 6, X["a"] - 6, 520, "⑥ GET /api/products/{id} ★")
d.message(X["a"] + 6, X["m"] - 6, 570, "⑦ レビュー＋文の辞書 ★")
d.message(X["a"] - 6, X["f"] + 6, 620, "⑧ ハイライト付きレビュー ★", kind="return")
d.message(X["f"] - 6, X["u"], 680, "⑨ 読む", kind="return")
run(d, "2_シーケンス図", "シーケンス図")

# ── 3. ER 図：何を保存するか ──────────────────
d = Diagram("3. ER 図（簡略版）― 何を保存するか",
            "主キーと、変更に関わる列だけを載せる。★オレンジが変わった表。詳細は 02_企画書/企画書_2b_ER図_変更後")
d.legend(1000, 0, extras=[(HL_BOX, "★ 変わった表")], lines=[("res", "データの作り方（外部キーではない）")])
r = d.entity(0, 160, "reviews　レビュー", [("PK", "review_id", ""), ("FK", "product_id", ""), ("", "comment", "")])
p = d.entity(440, 160, "products　商品", [("PK", "product_id", ""), ("", "product_name", "")])
f = d.entity(880, 160, "★ product_facts【P1】", [("PK,FK", "product_id", ""), ("PK", "fact", "review_to_mother の行を追加"),
                                                ("", "value", "母へのレビュー件数")], highlight=True)
rs = d.entity(440, 360, "★ review_sentences【P2①】NEW", [("PK", "sentence", "定型文"), ("", "polarity", "良い・悪い"),
                                                         ("", "use_scene", "使う場面なら1")], highlight=True)
d.relation(p["product_id"], r["product_id"], "1", "0..n")
d.relation(p["product_id"], f["product_id"], "1", "0..n")
d.edge([(140, 300), (140, 418), (440, 418)], "res")
d.num(160, 396, "本文を文に分けて照合", align="left", bg=None)
d.text(0, 560, 1300, 24, "users・orders・order_items・product_scenes は変更なし（省略）。Phase2 ② は表を足さない", size=13, align="left")
run(d, "3_ER図", "ER図")
