// lib/samplegifts.ts

export type Gift = {
    id: string; // 商品ID
    category: string; // カテゴリ
    brand: string; // ブランド名
    name: string; // 商品名
    price: number; // 価格
    rating: number; // レビューの平均点数
    reviewCount: number; // レビュー件数
};

const SAMPLE: Gift[] = [
    { id: "G0002", category: "コスメ", brand: "Aroma Nook", name: "ボタニカルハンドクリーム 金木犀", price: 3300, rating: 4.4, reviewCount: 387 },
    { id: "G0011", category: "食品", brand: "Atelier Komugi", name: "焼き菓子アソート 15個入", price: 3980, rating: 4.5, reviewCount: 558 },
    { id: "G0004", category: "生活雑貨", brand: "綿の店 ふわり", name: "ガーゼタオル フェイス&ウォッシュセット", price: 4000, rating: 4.7, reviewCount: 120 },
];

export function searchGifts(): Gift[] {
    return SAMPLE;
}