# review_text.py — レビュー本文を文に分ける（SP-19・10.1 論点2）。tools/sentences.py と main.py の両方で使う
import re

_PIECE = re.compile(r"[^。]+。?|。")  # 「。」までを1つのかたまりとして取る（「。」がない最後の文も取る）


def split_pieces(comment: str) -> list[tuple[str, str]]:
    """本文を (表示する文字列, 辞書のキー) の並びに分ける。表示する文字列をつなげると原文に戻る"""
    pieces = []
    for m in _PIECE.finditer(comment):
        text = m.group(0)
        key = text.rstrip("。").strip()
        pieces.append((text, key))
    return pieces
