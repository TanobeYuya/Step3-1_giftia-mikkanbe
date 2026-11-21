// app/ResultCard.tsx — 結果カード（部品）。押されたら onOpen(id) で page.tsx に知らせる（DS-08-5）
import type { Gift } from "@/lib/api";

export default function ResultCard({ gift, rank, onOpen }: { gift: Gift; rank: number; onOpen: (id: string) => void }) {
  return (
    // div を押せるようにするので、role="button"（ボタンとして扱う印）と tabIndex={0}（Tab キーで止まれる）を付ける。
    // キーボードでは Enter か Space で開く（10.1 論点8）。Space は画面のスクロールを止める
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(gift.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(gift.id);
        }
      }}
    >
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
