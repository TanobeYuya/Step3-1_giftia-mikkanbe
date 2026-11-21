# /api/search が今までどおり 200 を返すことを確かめる（#85）。
# 本物の main.py を uvicorn で起動し、127.0.0.1 へ HTTP で1回だけ GET する（localhost は Windows で約2秒遅いため使わない）。終わったら自分で止める
import json
import os
import sys
import threading
import time
import urllib.request

import uvicorn

sys.path.insert(0, os.getcwd())
import main  # noqa: E402

server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=8001, log_level="warning"))
th = threading.Thread(target=server.run)
th.start()
while not server.started:
    time.sleep(0.1)

url = "http://127.0.0.1:8001/api/search?recipient=mother&scene=%E8%AA%95%E7%94%9F%E6%97%A5"
with urllib.request.urlopen(url, timeout=60) as r:
    status = r.status
    body = json.load(r)
server.should_exit = True
th.join()

print("状態コード:", status, "/ total:", body["total"], "/ 返った件数:", len(body["results"]), "/ 先頭の id:", body["results"][0]["id"])
sys.exit(0 if status == 200 and body["results"] else 1)
