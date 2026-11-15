"""文の辞書（review_sentences）の CSV と SQL を作る道具（仕様・設計書 DS-04）

使い方（giftia/backend で実行する）
  python tools/sentences.py export   本文のあるレビューを SELECT で読み、文を数えて sql/review_sentences.csv に書く
  python tools/sentences.py sql      sql/review_sentences.csv から sql/002_review_sentences.sql を作る

班の DB への書き込みはしない（export は SELECT だけ）。SQL を流すのは人（DS-04 手順5）。
"""
import csv
import re
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))  # review_text.py と database.py を読み込むため

from review_text import split_pieces  # noqa: E402

CSV_PATH = BACKEND / "sql" / "review_sentences.csv"
SQL_PATH = BACKEND / "sql" / "002_review_sentences.sql"
COLUMNS = ["sentence", "count", "polarity", "use_scene"]
MAX_LEN = 100  # review_sentences.sentence は VARCHAR(100)
POLARITIES = {"positive", "negative", "none"}
PRODUCT_ID = re.compile(r"^G[0-9]{4}$")

SQL_HEAD = """\
-- 002_review_sentences.sql
-- 目的: 文の辞書 review_sentences を作り直す（DR-04）。何回流しても同じ結果になる。必ず giftia_t103 を付ける
-- CREATE TABLE は、実行すると自動でコミットされる。そのため、DELETE・INSERT のトランザクションより前に置く
-- このファイルは tools/sentences.py が sql/review_sentences.csv から作る。直接は直さない
CREATE TABLE IF NOT EXISTS giftia_t103.review_sentences (
  sentence  VARCHAR(100) NOT NULL PRIMARY KEY,
  polarity  VARCHAR(10)  NOT NULL,           -- positive・negative・none
  use_scene TINYINT(1)   NOT NULL DEFAULT 0, -- 使う場面を想起させる文なら 1
  source    VARCHAR(30)  NOT NULL DEFAULT 'ai_checked',
  CHECK (polarity IN ('positive', 'negative', 'none')),
  CHECK (use_scene IN (0, 1))
);

SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

DELETE FROM giftia_t103.review_sentences;

"""

SQL_TAIL = """\

COMMIT;
SET SQL_SAFE_UPDATES = 1;

-- 確かめる（期待: rows が CSV の行数と同じ）
SELECT COUNT(*) AS `rows`, SUM(use_scene) AS use_scene_rows FROM giftia_t103.review_sentences;

-- NFR-04: 本文のあるレビューから無作為に20件を出し、SP-19 の基準で人が読む
SELECT review_id, product_id, rating, comment FROM giftia_t103.reviews
WHERE comment IS NOT NULL AND TRIM(comment) <> '' ORDER BY RAND() LIMIT 20;
"""


def read_existing_labels() -> dict[str, tuple[str, str]]:
    """export を再実行しても、人が付けた polarity・use_scene を消さないよう、いまの CSV から読む"""
    if not CSV_PATH.exists():
        return {}
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        return {r["sentence"]: (r["polarity"], r["use_scene"]) for r in csv.DictReader(f)}


def export() -> None:
    from database import fetch_all  # SELECT だけを使う。.env がなくても sql コマンドは動くよう、ここで読む

    rows = fetch_all(
        "SELECT review_id, product_id, comment FROM reviews "
        "WHERE comment IS NOT NULL AND TRIM(comment) <> ''"
    )
    counts: Counter[str] = Counter()
    per_product: Counter[str] = Counter()
    bad_ids = set()
    for r in rows:
        per_product[r["product_id"]] += 1
        if not PRODUCT_ID.match(r["product_id"]):
            bad_ids.add(r["product_id"])
        for _text, key in split_pieces(r["comment"]):
            if key:  # 「。」だけ・空白だけのかたまりは辞書に入れない
                counts[key] += 1

    existing = read_existing_labels()
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as f:  # BOM 付き（Excel で開いても文字化けしない）
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for sentence, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
            polarity, use_scene = existing.get(sentence, ("", ""))
            w.writerow([sentence, n, polarity, use_scene])

    top_product, top_n = per_product.most_common(1)[0] if per_product else ("-", 0)
    long_sentences = [s for s in counts if len(s) > MAX_LEN]
    print("--- 10.2 の数字 ---")
    print(f"本文のあるレビューの件数: {len(rows)}")
    print(f"本文のあるレビューがある商品の数: {len(per_product)}")
    print(f"文の種類の数: {len(counts)}")
    print(f"1商品あたりの本文のあるレビューの最大件数: {top_n}（{top_product}）")
    print(f"商品 ID がすべて G＋4桁か: {'はい' if not bad_ids else 'いいえ ' + str(sorted(bad_ids)[:10])}")
    print(f"{MAX_LEN}文字を超える文: {len(long_sentences)}件")
    print(f"CSV に書いた: {CSV_PATH}")


def sql_quote(value: str) -> str:
    """SQL の文字列にする。MySQL は \\ もエスケープに使うので、' と \\ の両方を直す"""
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def make_sql() -> int:
    if not CSV_PATH.exists():
        print(f"CSV がありません。先に export を実行する: {CSV_PATH}", file=sys.stderr)
        return 1
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    problems = []
    for i, r in enumerate(rows, start=2):  # 2行目から（1行目は見出し）
        s = r["sentence"]
        if len(s) > MAX_LEN:
            problems.append(f"{i}行目: {len(s)}文字で、{MAX_LEN}文字を超えている: {s}")
        if r["polarity"] not in POLARITIES:
            problems.append(f"{i}行目: polarity が positive・negative・none のどれでもない: {r['polarity']!r}")
        if r["use_scene"] not in {"0", "1"}:
            problems.append(f"{i}行目: use_scene が 0・1 のどちらでもない: {r['use_scene']!r}")
    if not rows:
        problems.append("CSV に行がない")
    if problems:
        print("SQL を作らずに止まる。次を直してから、もう一度実行する:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1

    values = ",\n".join(
        f"  ({sql_quote(r['sentence'])}, {sql_quote(r['polarity'])}, {int(r['use_scene'])}, 'ai_checked')"
        for r in rows
    )
    insert = (
        "INSERT INTO giftia_t103.review_sentences (sentence, polarity, use_scene, source) VALUES\n"
        f"{values};\n"
    )
    SQL_PATH.write_text(SQL_HEAD + insert + SQL_TAIL, encoding="utf-8")
    print(f"{len(rows)}行の SQL を作った: {SQL_PATH}")
    return 0


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"export", "sql"}:
        print(__doc__)
        return 2
    if sys.argv[1] == "export":
        export()
        return 0
    return make_sql()


if __name__ == "__main__":
    sys.exit(main())
