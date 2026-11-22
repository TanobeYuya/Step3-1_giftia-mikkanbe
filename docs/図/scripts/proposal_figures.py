"""企画書（今回の変更案）の図：アーキ図・ER 図・シーケンス図。
変更箇所はオレンジの枠と★でハイライトし、【P1】＝Phase1、【P2①】＝Phase2 ① で区別する。
実行: python -I proposal_figures.py <出力フォルダ>
出典: giftia/backend/main.py・database.py、sql/001・002、要件定義書 5.1・7 章、設計書 DS-05・DS-06
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "drawio-diagram", "scripts"))
from drawio_kit import Diagram, HIGHLIGHT  # noqa: E402

out = sys.argv[1] if len(sys.argv) > 1 else "."
AZ = Diagram.AZ
HL_BOX = f"rounded=1;fillColor=#FFFFFF;strokeColor={HIGHLIGHT};strokeWidth=2;"


def run(d, name, page):
    p = os.path.join(out, name + ".drawio")
    d.save(p, page_name=page)
    d.export(p, os.path.join(out, name + ".png"))


# ── 0. アーキ図（Phase0：変更前） ─────────────────────
d = Diagram("アーキテクチャ図（Phase0：変更前）― 検索1回の流れ",
            "Phase0＝Phase1 に着手する前（#20 で画面を API につないだ時点）。灰色の破線は、DB にあるが検索で使っていない表")
d.legend(1340, 0, lines=[("req", "呼び出し・送信"), ("res", "応答・返る値")],
         tiers=[("front", "画面（Next.js）"), ("api", "API（FastAPI）"), ("db", "DB（MySQL）"), ("muted", "使っていない")])
d.icon(20, 330, AZ + "identity/Users.svg", 64, label="利用者", label_w=104)
d.group(270, 160, 400, 420, "画面　Next.js", tier="front", icon=AZ + "general/Browser.svg")
d.node(300, 220, 340, 110, "page.tsx　検索画面", "いまの検索：キーワード・カテゴリー<br>取引先へのお礼：個包装・価格帯<br>lib/api.ts で fetch", "front")
d.node(300, 420, 340, 110, "ResultCard.tsx　結果カード", "順位・商品名・価格・評価<br>レビュー件数（タグはない）", "front")
d.group(800, 160, 460, 420, "API　FastAPI", tier="api", icon=AZ + "general/Code.svg")
d.node(830, 220, 400, 110, "GET /api/search", "q・category・indiv_wrap・価格<br>個包装は説明文の LIKE で判定<br>販売数の多い順、COUNT と SELECT の2回", "api")
d.node(830, 420, 400, 110, "database.py　fetch_all", "問い合わせのたびに新しく接続し<br>SSL の手続きをやり直す（プールなし）", "api")
d.group(1420, 160, 350, 520, "Azure Database for MySQL<br>giftia_t103", tier="db", icon=AZ + "databases/Azure_Database_MySQL_Server.svg")
d.node(1450, 230, 290, 70, "products", "検索で使うのはこの表だけ", "db")
d.node(1450, 330, 290, 70, "product_scenes", "シーンのタグ（使っていない）", "db", muted=True)
d.node(1450, 430, 290, 70, "product_facts", "個包装・常温など（使っていない）", "db", muted=True)
d.node(1450, 530, 290, 70, "reviews", "レビュー本文（使っていない）", "db", muted=True)
d.edge([(84, 345), (180, 345), (180, 260), (300, 260)], "req");   d.num(110, 300, "① 条件を選ぶ", align="left")
d.edge([(640, 260), (830, 260)], "req");                          d.num(690, 238, "② GET", align="left", bg=None)
d.edge([(1230, 265), (1450, 265)], "req");                        d.num(1290, 243, "③ SELECT×2", align="left", bg=None)
d.edge([(830, 310), (640, 310)], "res");                          d.num(690, 288, "④ 結果", align="left", bg=None)
d.edge([(470, 330), (470, 420)], "res");                          d.num(480, 365, "⑤ カードを並べる", align="left", bg=None)
d.table(0, 660, ["番号", "どこで", "処理", "Phase1・Phase2 ① で変えたこと（変更後の図の番号）"], [
    ["①", "page.tsx", "キーワード・カテゴリーを入れて検索", "「誰に贈る？」「どんな場面？」のプルダウンを足した（①）"],
    ["②", "lib/api.ts → API", "GET /api/search?q=…&category=…", "recipient・scene を足し、選択肢以外は 422（②）"],
    ["③", "API → MySQL", "products だけを、販売数の多い順に。接続は毎回新しく作る", "シーン・母のレビュー件数で絞り並べる。接続はプールで使い回す（③）"],
    ["④⑤", "API → 結果カード", "商品名・価格・評価を返して並べる", "タグを最大5個返す。カードを押すとレビューのモーダル（④〜⑩）"],
], max_width=1700, title="処理の流れと、変更後との対応", first_col_center=True)
run(d, "企画書_0_アーキ図_Phase0", "アーキ図（Phase0）")

# ── 1. アーキ図 ─────────────────────────────
d = Diagram("アーキテクチャ図 ― 検索からレビューのモーダルまで（今回の変更）",
            "★オレンジ枠が変更箇所。【P1】＝Phase1、【P2①】＝Phase2 ①（今回）。①〜⑩ は下の表と対応する（番号の順に追うと経路になる）")
d.legend(1340, 0, lines=[("req", "呼び出し・送信"), ("res", "応答・返る値")],
         tiers=[("front", "画面（Next.js）"), ("api", "API（FastAPI）"), ("db", "DB（MySQL）"), ("muted", "実装中（点線）")],
         extras=[(HL_BOX, "★ 変更箇所")])

d.icon(20, 410, AZ + "identity/Users.svg", 64, label="利用者<br>母に贈る人", label_w=104)

d.group(270, 160, 400, 600, "画面　Next.js 16.4.5", tier="front", icon=AZ + "general/Browser.svg")
d.node(300, 220, 340, 110, "★ page.tsx　検索画面", "【P1】誰に贈る？・どんな場面？<br>【P2①】検索中の表示、古い応答は捨てる<br>lib/api.ts で fetch", "front", highlight=True)
d.node(300, 400, 340, 80, "★ ResultCard.tsx　結果カード", "【P1】タグ（最大5個）を出す", "front", highlight=True)
d.node(300, 590, 340, 110, "★ レビューのモーダル【P2①】", "母のレビューが先頭<br>使う場面の文に mark<br>Enter / Space でも開く", "front", highlight=True)

d.group(800, 160, 460, 600, "API　FastAPI（Azure Functions）", tier="api", icon=AZ + "general/Code.svg")
d.node(830, 220, 400, 110, "★ GET /api/search", "【P1】recipient・scene（選択肢以外は 422）<br>　　 母のレビュー件数順、タグを作る<br>【P2①】q は100文字まで", "api", highlight=True)
d.node(830, 390, 400, 110, "★ database.py　接続プール【P2①】", "PooledDB：最大4本、満杯なら待つ<br>検索ごとの新しい接続＋SSL をやめる<br>5.6〜5.8秒 → 中央値 約1.28秒", "api", highlight=True)
d.node(830, 570, 400, 130, "★ GET /api/products/{id}【P2①】", "id が G＋4桁以外は 422、なければ 404<br>レビュー最大30件、辞書は1回で引く<br>文ごとに mark と sentiment を付ける<br>（接続はどちらの API もプールから）", "api", highlight=True)

d.group(1420, 160, 350, 600, "Azure Database for MySQL<br>giftia_t103", tier="db", icon=AZ + "databases/Azure_Database_MySQL_Server.svg")
d.node(1450, 230, 290, 70, "products / product_scenes", "商品・シーンのタグ（変更なし）", "db")
d.node(1450, 330, 290, 80, "★ product_facts【P1】", "review_to_mother の行を足す<br>（312商品、月1回 SQL）", "db", highlight=True)
d.node(1450, 560, 290, 60, "reviews", "レビュー本文（変更なし）", "db")
d.node(1450, 650, 290, 80, "★ review_sentences【P2①】", "文の辞書 139件<br>polarity・use_scene", "db", highlight=True)

d.edge([(84, 425), (180, 425), (180, 250), (300, 250)], "req");    d.num(120, 340, "① 条件を選ぶ")
d.edge([(640, 250), (830, 250)], "req");                           d.num(690, 228, "② GET", align="left", bg=None)
d.edge([(1230, 265), (1450, 265)], "req");                         d.num(1340, 243, "③ SELECT", bg=None)
d.edge([(830, 310), (640, 310)], "res");                           d.num(690, 288, "④ 結果", align="left", bg=None)
d.edge([(470, 330), (470, 400)], "res");                           d.num(480, 355, "④ カードを並べる", align="left", bg=None)
d.edge([(470, 480), (470, 590)], "req");                           d.num(480, 525, "⑤ カードを押す", align="left", bg=None)
d.edge([(640, 610), (830, 610)], "req");                           d.num(690, 588, "⑥ GET", align="left", bg=None)
d.edge([(1230, 590), (1450, 590)], "req");                         d.num(1275, 568, "⑦ レビュー", align="left", bg=None)
d.edge([(1230, 680), (1450, 680)], "req");                         d.num(1340, 658, "⑧ 辞書", bg=None)
d.edge([(830, 670), (640, 670)], "res");                           d.num(690, 648, "⑨ JSON", align="left", bg=None)
d.edge([(300, 680), (180, 680), (180, 460), (84, 460)], "res");    d.num(120, 600, "⑩ 読む")

d.node(270, 800, 1450, 80, "実装中：Phase2 ② 相談モード（FR-08・FR-10・NFR-05）― 11/24 までに実装予定。③ ベクトル検索は作らない",
       "画面の端のボタンで開き、相手 → 場面 → 最近の一言の3問。POST /api/consult（名前は仮）→ 生成AIがキーワードに直す → 既存の検索で DB から取る。memo は保存しない", "api", muted=True)
d.table(0, 920, ["番号", "どこで", "入力", "処理", "出力"], [
    ["①", "利用者 → page.tsx", "誰に贈る？＝母、どんな場面？＝誕生日", "選んだ値を持ち、検索中を表示する【P2①】", "検索条件"],
    ["②", "page.tsx（lib/api.ts）→ API", "検索条件", "URL のクエリにして送る（接続はプールから借りる【P2①】）", "GET /api/search?recipient=mother&scene=誕生日"],
    ["③", "API → MySQL", "SQL と値（%s で渡す）", "在庫あり・誕生日の商品を、母のレビュー件数の多い順に上位20件【P1】", "商品の行とタグの材料"],
    ["④", "API → page.tsx → 結果カード", "商品の行", "商品ごとにタグを最大5個作る【P1】。古い応答は画面で捨てる【P2①】", "{ total, results }"],
    ["⑤⑥", "結果カード → API", "商品 ID（例 G0200）", "モーダルを開き、詳細を取りに行く【P2①】", "GET /api/products/G0200"],
    ["⑦⑧", "API → MySQL", "商品 ID", "商品とレビュー（母を先頭、最大30件）を取り、文の辞書を1回で引く", "商品・レビュー・辞書の行"],
    ["⑨", "API → モーダル", "レビューと辞書", "文に分け、use_scene＝1 の文に mark、polarity から sentiment を付ける", "{ reviews: [segments, sentiment, toMother] }"],
    ["⑩", "モーダル → 利用者", "レビュー", "使う場面の文をハイライトして見せ、母の暮らしを思い出してもらう", "―"],
    ["例外", "API", "id が abc・G0001;DROP など", "形が違えば 422、商品がなければ 404。SQL やエラーの詳細は返さない", "422 / 404"],
], max_width=1720, title="処理の流れ（例：贈る相手＝母、場面＝誕生日）")
run(d, "企画書_1_アーキ図", "アーキ図")

# ── 2. ER 図は proposal_er.py で描く（変更前・変更後の2枚） ──

# ── 3. シーケンス図 ──────────────────────────
d = Diagram("シーケンス図 ― 結果カードからレビューのモーダルを開く【P2①】",
            "番号はアーキ図の ⑤〜⑩ と同じ。実線＝呼び出し、破線＝戻り")
d.legend(900, 0, lines=[("plain", "呼び出し（同期）"), ("res", "戻り")])
X = {}
for k, (key, name, tier, actor) in enumerate([("u", "利用者", "user", True), ("c", "結果カード<br>モーダル", "front", False),
                                              ("f", "FastAPI<br>/api/products", "api", False), ("p", "接続プール<br>最大4本", "api", False),
                                              ("m", "MySQL<br>giftia_t103", "db", False)]):
    X[key] = d.lifeline(k * 230, 120, name, 780, tier=tier, actor=actor)
d.activation(X["c"], 250, 870, "front")
d.activation(X["f"], 310, 810, "api")
d.message(X["u"], X["c"] - 6, 250, "⑤ カードを押す")
d.message(X["c"] + 6, X["f"] - 6, 310, "⑥ GET /api/products/{id}")
d.fragment(X["f"] - 100, 340, 420, 110, "alt", "[id が G＋4桁でない]", cond_x=X["f"] + 16)
d.message(X["f"] - 6, X["c"] + 6, 420, "422", kind="return")
d.message(X["f"] + 6, X["p"] - 6, 490, "接続を借りる")
d.message(X["p"] + 6, X["m"] - 6, 540, "⑦ 商品・レビュー（母を先頭）")
d.message(X["m"] - 6, X["p"] + 6, 590, "行（なければ 404）", kind="return")
d.message(X["p"] + 6, X["m"] - 6, 640, "⑧ 辞書を1回で引く")
d.message(X["m"] - 6, X["f"] + 6, 690, "辞書の行", kind="return")
d.text(X["f"] + 16, 710, 240, 20, "⑨ 文に分け mark・sentiment", size=12, align="left")
d.message(X["f"] - 6, X["c"] + 6, 790, "⑨ JSON { reviews }", kind="return")
d.message(X["c"] - 6, X["u"], 860, "⑩ ハイライトを読む", kind="return")
run(d, "企画書_3_シーケンス図", "シーケンス図")
