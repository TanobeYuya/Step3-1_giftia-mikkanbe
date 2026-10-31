"use client";

import React, { useState } from "react";
import ResultCard from "./ResultCard";
import { searchGifts, type Gift } from "@/lib/sampleGifts";

export default function Home() {
  // 状態を覚える箱
  const [mode, setMode] = useState<"standard" | "business">("standard");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<Gift[] | null>(null);

  // 検索ボタン
  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setResults(searchGifts());
  }

  // 画面
  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>

      <nav className="modes">
        <button className={mode === "standard" ? "on" : ""} onClick={() => { setMode("standard"); setResults(null);}}>今の検索</button>
        <button className={mode === "business" ? "on" : ""} onClick={() => { setMode("business"); setResults(null);}}>取引先へのお礼</button>
      </nav>
      <p className="summary">※今はサンプル表示です。入力は2週目から</p>

      <form className="form" onSubmit={onSearch}>
        {mode === "standard" ? (
          <>
            <input className="q" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="キーワード（例：送別 お菓子）" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">すべてのカテゴリー</option>
              <option value="コスメ">コスメ</option>
              <option value="食品">食品</option>
              <option value="生活雑貨">生活雑貨</option>
            </select>
          </>
        ) : (
          <>
            <label className="chk"><input type="checkbox" />個包装</label>
            <select>
              <option value="">すべての価格帯</option>
              <option value="3000">3,000~5,000円</option>
              <option value="5000">5,000~10,000円</option>
            </select>
          </>
        )}
        <button type="submit">検索</button>
      </form>
      {results && (
        <section>
          <p className="summary">上位 {results.length}件（サンプル）</p>
          <div className="grid">
            {results.map((g, i) => <ResultCard key={g.id} gift={g} rank={i + 1} />)}
          </div>
        </section>
      )}
    </main>
  );
}