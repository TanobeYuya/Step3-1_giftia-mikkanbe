# database.py — 班のDB（Azure Database for MySQL）につなぐ（穴なし。置いて、読む）
#
# 接続情報は .env に置く（Workbench に入れたものと同じ5つ）。コードに書かない。GitHub に上げない。
#   DB_HOST     = ホスト名（xxx.mysql.database.azure.com）
#   DB_PORT     = 3306
#   DB_USER     = 配られたユーザー名（例 tech0gen13-class1）
#   DB_PASSWORD = 班のパスワード
#   DB_NAME     = 班のDB名（例 giftia_t101 ＝ クラス1の班1）
#   DB_SSL_CA   = 配布された SSL証明書のパス（任意。入れると Workbench の「Verify CA」と同じく相手を確かめる）

import os
import threading
from contextlib import contextmanager

import pymysql
from dbutils.pooled_db import PooledDB
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読み、os.environ に入れる


def _connect_kwargs() -> dict:
    """pymysql.connect に渡す接続の設定。get_connection とプールで同じ値を使う"""
    required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(f".env に設定がありません: {', '.join(missing)}（.env.example を .env にコピーして埋める）")

    # Azure は暗号化（SSL/TLS）しない接続を断る。証明書のパスがあれば、相手が Azure のサーバーかも確かめる
    ssl = {"ca": os.environ["DB_SSL_CA"]} if os.environ.get("DB_SSL_CA") else {"ssl_disabled": False}

    return dict(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # 行を {列名: 値} の形で受け取る（JSON にしやすい）
        connect_timeout=10,
        ssl=ssl,
    )


def get_connection():
    """班のDBへの接続を1つ作って返す（プールを使わない）。使い終わったら close() する"""
    return pymysql.connect(**_connect_kwargs())


# 接続プール（DS-06 段階②）。接続の確立に約1.3秒かかるため、作った接続を使い回す。最初に使うときに作る
_pool = None
_pool_lock = threading.Lock()  # 同時に2つのリクエストがプールを作らないようにする


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:  # ロックを待つ間に、他のリクエストが作り終えていることがある
                # maxconnections：作る接続の数の上限。blocking=True：上限に達したら、エラーにせず空くまで待つ
                _pool = PooledDB(creator=pymysql, mincached=1, maxcached=4, maxconnections=4, blocking=True, **_connect_kwargs())
    return _pool


@contextmanager
def connection():
    """プールから接続を借りて、with の中で使い回す。抜けるとプールに返す（閉じない）"""
    conn = _get_pool().connection()
    try:
        yield conn
    finally:
        conn.close()  # プールの接続では、close() は「返す」の意味になる


def fetch_all(query: str, params: tuple = (), conn=None) -> list[dict]:
    """SELECT を実行して、行を dict のリストで返す。conn を渡せばその接続で実行する。渡さなければ、1回だけの接続を作る。
    値は params で渡す（SQL の中の %s に入る）。文字列に直接つなげると、入力次第で DB を壊される。"""
    if conn is None:
        with connection() as c:
            return fetch_all(query, params, c)
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()
