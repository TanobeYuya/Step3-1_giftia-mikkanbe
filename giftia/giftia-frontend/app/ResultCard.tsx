// app/ResultCard.tsx — 結果カード（部品）。2週目の変更は import の1行だけ（Gift 型の置き場所が lib/api.ts に変わった）
import type { Gift } from "@/lib/api";

export default function ResultCard({ gift, rank }: { gift: Gift; rank: number }) {
  return (
    <div className="card">
      <p className="meta">{rank}位・{gift.category}・{gift.brand}</p>
      <h3 className="name">{gift.name}</h3>
      <p className="price">{gift.price.toLocaleString()}円</p>
      <p className="meta">評価{gift.rating}（{gift.reviewCount}件）</p>
      {gift.tags.length > 0 && (
        <ul className="tags">
          {gift.tags.map((t) => (
            <li key={`${t.kind}-${t.name}`} className={`tag tag-${t.kind}`}>
              {t.kind === "recipient" && t.count ? `${t.name} ${t.count}件` : t.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
