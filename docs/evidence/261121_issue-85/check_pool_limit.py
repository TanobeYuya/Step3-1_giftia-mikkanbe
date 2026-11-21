# 接続プールの上限（maxconnections=4・blocking=True）を確かめる（#85、DS-06 段階②）
# 本物の database.py のプールを使い、班の DB に SELECT だけを流す。接続は最大4本（上限どおり）。
# 手順：4本借りる（上限）→ 5本目を別スレッドで借りに行く → 待っている（エラーにならない）→ 1本返す → 5本目が借りられる
# 使い方（giftia/backend で）：.venv\Scripts\python.exe ..\..\docs\evidence\261121_issue-85\check_pool_limit.py
import os
import sys
import threading
import time

sys.path.insert(0, os.getcwd())
import database  # noqa: E402

pool = database._get_pool()
print("maxconnections =", pool._maxconnections, "/ blocking =", pool._blocking)

held = [pool.connection() for _ in range(4)]  # 上限の4本をすべて借りる
for c in held:
    with c.cursor() as cur:
        cur.execute("SELECT CONNECTION_ID() AS id")
        print("借りた接続 Id:", cur.fetchone()["id"])

result = {}


def fifth():
    t0 = time.monotonic()
    try:
        c = pool.connection()  # 上限に達しているので、空くまで待つはず
        with c.cursor() as cur:
            cur.execute("SELECT 1 AS one")
            result["rows"] = cur.fetchall()
        c.close()
        result["waited"] = time.monotonic() - t0
    except Exception as e:  # エラーになったら不合格
        result["error"] = repr(e)


th = threading.Thread(target=fifth)
th.start()
time.sleep(3)
waiting = th.is_alive() and "error" not in result
print(f"3秒後：5本目は待っている={waiting}（エラー={result.get('error')}）")

t_release = time.monotonic()
held.pop().close()  # 1本返す
th.join(timeout=30)
print(f"返してから5本目が終わるまで：{time.monotonic() - t_release:.2f}秒 / 結果={result.get('rows')} / 待った時間={result.get('waited')}")

for c in held:
    c.close()

ok = waiting and result.get("rows") == [{"one": 1}] and "error" not in result
print("合格" if ok else "不合格")
sys.exit(0 if ok else 1)
