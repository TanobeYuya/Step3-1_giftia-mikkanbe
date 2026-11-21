// app/ReviewCard.tsx — レビュー1件の表示（部品）。状態は持たず、受け取った値を描くだけ（DS-08-4）
import { memo } from "react";
import type { Review } from "@/lib/api";

// センチメントを色だけでなく文字でも伝える（10.1 論点6）。ニュートラルは出さない
const LABEL = {
  positive: "よかった点",
  negative: "気になる点",
  mixed: "よかった点・気になる点",
  neutral: "",
} as const;

// memo：同じ review が渡されるあいだは描き直さない。「もっと見る」で件数が増えても、出し済みのカードは再描画されない
const ReviewCard = memo(function ReviewCard({ review }: { review: Review }) {
  return (
    <li className={`review review-${review.sentiment}`}>
      <p className="review-head">
        {LABEL[review.sentiment] && <span className="review-label">{LABEL[review.sentiment]}</span>}
        {review.toMother && <span className="review-mother">母に贈った人</span>}
        <span>評価 {review.rating}</span>
      </p>
      {/* 本文は React が自動でエスケープして出す（dangerouslySetInnerHTML は使わない。SP-16・XSS 対策）。
          segments の順番は変わらないので key は番号でよい */}
      <p className="review-body">
        {review.segments.map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
      </p>
    </li>
  );
});

export default ReviewCard;
