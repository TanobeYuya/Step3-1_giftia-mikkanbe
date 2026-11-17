# 依存関係図（Phase2 ①）を作る。python -I docs/図/scripts/dependency_phase2_1.py
# 出典：仕様・設計書 10.7（課題と依存関係）、#67（DS-06 段階③④）、2026-11-17 の F-1 の判断（文書の PR を分ける）
import os
import sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/drawio-diagram/scripts"))
from drawio_kit import Diagram  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DRAWIO = os.path.join(HERE, "..", "drawio", "依存関係図.drawio")
PNG = os.path.join(HERE, "..", "png", "依存関係図_1_Phase2-1.png")

d = Diagram(
    "Phase2 ① の課題の依存関係図（2026-11-17 時点）",
    "仕様・設計書 10.7 の課題に、#67（速度の設計）と #68・#69（個包装）を足した。左端は完了した課題。横は日程の目安、段は担当",
)

# 説明と凡例
d.vertex(0, 90, 860, 136,
         "<font style='font-size:13px' color='#374151'><b>依存関係ってなに？</b></font><br>"
         "<font color='#1F2937'>「先に終わっていないと始められない関係」のこと。<br>"
         "カレーなら、野菜を切る → 煮込む → ルウを入れる。切る前には煮込めない。<br>"
         "この図の矢印も同じで、矢印の元が終わってから、矢印の先を始める。</font>",
         "rounded=1;arcSize=4;fillColor=#FFFFFF;strokeColor=#374151;align=left;verticalAlign=middle;"
         "spacingLeft=16;fontSize=12;", kind="node", pad=(16, 10, 6, 6))
d.legend(
    900, 90,
    lines=[("req", "依存関係（元が終わってから先を始める）"),
           ("res", "ゆるい依存（仮のデータで先に作り、完成したら本物につなぐ）")],
    extras=[("rounded=1;fillColor=#FFFFFF;strokeColor=#D83B01;strokeWidth=2;", "★ 新しく足した課題・遅れると発表に響く道"),
            ("rounded=1;fillColor=#FFFFFF;strokeColor=#9CA3AF;dashed=1;", "完了した課題")],
    tiers=[("db", "PM・QA"), ("api", "バックエンド"), ("front", "フロントエンド")],
)

# 列（日程の目安）と段（担当）。左端の列は、完了した課題の一覧
W, H = 300, 120
G = 150                         # 列の間（矢印とラベルを通す）
COL = [40 + i * (W + G) for i in range(6)]
DATES = ["完了（11/10〜16）", "11/17〜18", "11/18〜19", "11/19〜20", "11/21〜22", "11/23（発表 11/24）"]
for x, t in zip(COL, DATES):
    d.text(x, 250, W, 24, t, size=13, color="#111827", bold=True)

LANE_W = COL[5] + W + 40
Y_PM, Y_BE, Y_FE = 290, 740, 1190
d.group(0, Y_PM, LANE_W, 350, "PM・QA　べー", tier="db")
d.group(0, Y_BE, LANE_W, 350, "バックエンド　あかぷさん", tier="api")
d.group(0, Y_FE, LANE_W, 190, "フロントエンド　みかんさん", tier="front")
R1 = lambda y: y + 50          # 1段目の上端
R2 = lambda y: y + 50 + H + 40  # 2段目の上端
H2 = H * 2 + 40                 # 2段分の高さ

# 完了した課題（11/10〜16。GitHub で閉じた Issue のうち、完了したもの）
d.node(COL[0], R1(Y_PM), W, H2, "✓ 完了した課題",
       "#35 Phase2 の範囲を決める<br>#31 母に贈ったレビューの件数<br>#34 Phase1 の通しの確認<br>"
       "#36 Phase2 ① の仕様・設計書<br>#58 Q1 文の辞書を DB に入れる", tier="db", muted=True)
d.node(COL[0], R1(Y_BE), W, H2, "✓ 完了した課題",
       "#32 検索 API に相手・シーン・タグ<br>#56 B1 レビューを文に分ける道具<br><br>"
       "#37〜#41 は Phase3 へ移し、<br>作らずに閉じた（11/14 MTG）", tier="api", muted=True)
d.node(COL[0], R1(Y_FE), W, H, "✓ 完了した課題",
       "#33 検索画面にプルダウン・タグ", tier="front", muted=True)

# べー
d.node(COL[1], R1(Y_PM), W, H, "★ #67 設計書：検索を速くする",
       "DS-06 段階③④と TC-32 を足す<br>Approve：あかぷさんかみかんさん<br>依存関係：なし", tier="db", highlight=True)
d.node(COL[1], R2(Y_PM), W, H, "★ P1（#68）個包装の定義を直す",
       "要件定義書・TC-12・付録A を直す PR<br>Approve：あかぷさん・みかんさん<br>依存関係：なし", tier="db", highlight=True)
d.node(COL[3], R1(Y_PM), W, H, "Q0（#55）試用の1回目",
       "Phase1 の画面を1〜2人に見せて記録する<br>依存関係：なし（すぐ始められる）", tier="db")
d.node(COL[5], R1(Y_PM), W, H, "★ Q2（#42）通しの確認",
       "TC-15〜TC-32 を確かめ、試用の2回目<br>TC-12 の画面はみかんさんが撮り直す<br>依存関係：B2・B3・F2・B4", tier="db", highlight=True)

# あかぷさん
d.node(COL[2], R1(Y_BE), W, H, "★ B2（#57）検索を速くする",
       "DS-06 段階①〜④（往復を減らす）<br>マージ後に Azure で測る。1秒超なら<br>インデックスを見直す<br>依存関係：#67", tier="api", highlight=True)
d.node(COL[3], R1(Y_BE), W, H, "★ B3（#59）詳細とレビューの API",
       "モーダルに渡すデータを返す<br>依存関係：Q1（完了）・B2", tier="api", highlight=True)
d.node(COL[2], R2(Y_BE), W, H, "★ B4（#69）個包装の絞り込みを直す",
       "main.py の LIKE を product_facts に<br>変える<br>依存関係：#68・B2", tier="api", highlight=True)

# みかんさん
d.node(COL[2], R1(Y_FE), W, H, "F1（#60）レビューのモーダル",
       "カードを押すとレビューが開く<br>依存関係：B3（それまでは仮のデータ）", tier="front")
d.node(COL[3], R1(Y_FE), W, H, "F2（#61）検索中の表示",
       "検索中を出し、古い結果で上書きしない<br>依存関係：F1", tier="front")

# 矢印。ラベルは線の中央に自動で置かず、段と段のすき間に置く
cy = lambda y: y + H / 2
GAP1 = Y_PM + 350 + 30          # べーとあかぷさんの段のすき間（ラベルの y）
GAP2 = Y_BE + 350 + 22          # あかぷさんとみかんさんの段のすき間
LBL = dict(size=12, color="#0F3E6E", bold=True)


def label_left(x, y, t, w=130):
    d.text(x - 8 - w, y, w, 20, t, align="right", **LBL)


def label_right(x, y, t, w=130):
    d.text(x + 8, y, w, 20, t, align="left", **LBL)


# #67 → B2、#68 → B4
xr = COL[1] + W
v2, v3 = xr + 100, xr + 50
d.edge([(xr, cy(R1(Y_PM))), (v2, cy(R1(Y_PM))), (v2, cy(R1(Y_BE))), (COL[2], cy(R1(Y_BE)))], "req")
label_right(v2, GAP1, "段階③④の設計")
d.edge([(xr, cy(R2(Y_PM))), (v3, cy(R2(Y_PM))), (v3, cy(R2(Y_BE))), (COL[2], cy(R2(Y_BE)))], "req")
label_left(v3, GAP1, "個包装の定義")
# B2 → B4（同じ search() を触るため、B2 を先にマージする）
bx = COL[2] + W / 2
d.edge([(bx, R1(Y_BE) + H), (bx, R2(Y_BE))], "req")
d.text(bx + 10, R1(Y_BE) + H + 10, 140, 20, "同じ search()", align="left", **LBL)
# B2 → B3
d.edge([(COL[2] + W, cy(R1(Y_BE))), (COL[3], cy(R1(Y_BE)))], "req")
d.text(COL[2] + W + 10, cy(R1(Y_BE)) - 28, G - 20, 20, "connection()", **LBL)
# B3 → Q2、B4 → Q2（11/21〜22 の列は通り抜けて、Q2 の左へ）
xr3 = COL[3] + W
v5, v6 = COL[5] - 95, COL[5] - 50
d.edge([(xr3, cy(R1(Y_BE)) - 20), (v5, cy(R1(Y_BE)) - 20), (v5, cy(R1(Y_PM)) - 15), (COL[5], cy(R1(Y_PM)) - 15)], "req")
label_left(v5, GAP1, "マージした API")
d.edge([(COL[2] + W, cy(R2(Y_BE))), (v6, cy(R2(Y_BE))), (v6, cy(R1(Y_PM)) + 15), (COL[5], cy(R1(Y_PM)) + 15)], "req")
label_right(v6, GAP1, "マージした検索")
# B3 → F1（ゆるい依存）
hx = Y_FE - 25
d.edge([(COL[3] + W / 2, R1(Y_BE) + H), (COL[3] + W / 2, hx), (COL[2] + W / 2, hx), (COL[2] + W / 2, R1(Y_FE))], "res")
d.text(COL[2] + W / 2 + 20, hx - 26, 260, 20, "完成したら本物の API につなぐ", size=12, color="#4B5563", bold=True)
# F1 → F2
d.edge([(COL[2] + W, cy(R1(Y_FE))), (COL[3], cy(R1(Y_FE)))], "req")
d.text(COL[2] + W + 10, cy(R1(Y_FE)) - 28, G - 20, 20, "ApiError（api.ts）", **LBL)
# F2 → Q2
v9 = COL[5] + W / 2
d.edge([(xr3, cy(R1(Y_FE))), (v9, cy(R1(Y_FE))), (v9, R1(Y_PM) + H)], "req")
label_right(v9, GAP2, "マージした画面")

d.save(DRAWIO, page_name="1_Phase2-1")
Diagram.export(DRAWIO, PNG, width=2400)
print("OK", DRAWIO, PNG)
