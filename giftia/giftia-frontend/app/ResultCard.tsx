// app/ResultCard.tsx
import type { Gift } from "@/lib/sampleGifts";

export default function ResultCard({ gift, rank }: { gift: Gift; rank: number }) {
    return (
        <div className="card">
            <p className="meta">{rank}位・{gift.category}・{gift.brand}</p>
            <h3 className="name">{gift.name}</h3>
            <p className="price">{gift.price.toLocaleString()}円</p>
            <p className="meta">評価{gift.rating}（{gift.reviewCount}件）</p>
        </div>
    );
}