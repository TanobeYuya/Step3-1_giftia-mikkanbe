// app/ProductModal.tsx — 商品の詳細とレビューを出すモーダル（DS-08-3）
// 詳細の取得、読み込み中・失敗の表示、閉じ方（×・外側・Esc）、「もっと見る」の件数を受け持つ。
// どの商品を開くかは page.tsx が決めて渡す（productId）
"use client";

import { useEffect, useId, useState } from "react";
import { ApiError, fetchProduct, type ProductDetail } from "@/lib/api";
import ReviewCard from "./ReviewCard";

const PAGE = 10; // 最初に出す件数と、「もっと見る」1回で足す件数（10.1 論点1）

export default function ProductModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null); // 取得したデータ。null のうちは「読み込み中」
  const [error, setError] = useState("");                           // "" 以外なら失敗の文言を出す
  const [shown, setShown] = useState(PAGE);                         // 出している件数
  const titleId = useId(); // aria-labelledby 用の id（見出しとダイアログを結びつける）

  // 開いたときに1回だけ取得する。後片付けで通信を止め、閉じたあとや別の商品に替わったあとの古い応答で書き換えない
  useEffect(() => {
    const controller = new AbortController();
    fetchProduct(productId, controller.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // 自分で止めたことによるエラーは無視する
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 422);
        setError(notFound ? "商品が見つかりませんでした。" : "レビューを読み込めませんでした。");
      });
    return () => controller.abort();
  }, [productId]);

  // Esc キーで閉じる。window に付けて、後片付けで外す
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // 外側を押すと閉じる。中身（.modal）を押したときは stopPropagation で外側に伝えず、閉じないようにする
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}>×</button>

        {error ? (
          <p id={titleId}>{error}</p>
        ) : !detail ? (
          <p id={titleId}>読み込み中…</p>
        ) : (
          <>
            <h2 id={titleId}>{detail.name}</h2>
            <p className="price">{detail.price.toLocaleString()}円</p>
            <p className="modal-desc">{detail.description}</p>

            <h3>レビュー（{detail.reviewTotal}件）</h3>
            {detail.reviewTotal > detail.reviews.length && (
              <p className="summary">新しい順に{detail.reviews.length}件を表示しています（母に贈ったレビューを先頭）</p>
            )}
            {detail.reviews.length === 0 ? (
              <p>まだレビューがありません。</p>
            ) : (
              <ul className="reviews">
                {/* key は並び順の番号ではなくレビュー ID（件数が変わっても React が正しく描き分けられる） */}
                {detail.reviews.slice(0, shown).map((r) => <ReviewCard key={r.id} review={r} />)}
              </ul>
            )}
            {shown < detail.reviews.length && (
              <button type="button" className="more" onClick={() => setShown(shown + PAGE)}>
                もっと見る（{shown} / {detail.reviews.length}）
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
