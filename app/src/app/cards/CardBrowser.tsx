"use client";

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/types/card";
import { CardGrid, CardSearch } from "@/components/card";

const PAGE_SIZE = 60;

export default function CardBrowser() {
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [filteredCards, setFilteredCards] = useState<Card[]>([]);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const data = await import("@/data/cards/_index.json");
      const cards = data.default as Card[];
      setAllCards(cards);
      setFilteredCards(cards);

      // Extract unique types
      const types = new Set<string>();
      cards.forEach((c) => c.types?.forEach((t) => types.add(t)));
      setAvailableTypes(Array.from(types).sort());

      // Extract unique sets
      const sets = new Set<string>();
      cards.forEach((c) => {
        if (c.set) sets.add(c.set);
      });
      setAvailableSets(Array.from(sets).sort());

      setLoading(false);
    }
    loadData();
  }, []);

  const handleResults = useCallback((filtered: Card[]) => {
    setFilteredCards(filtered);
    setDisplayCount(PAGE_SIZE);
  }, []);

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500">
        加载卡牌数据中...
      </div>
    );
  }

  const displayCards = filteredCards.slice(0, displayCount);
  const hasMore = displayCount < filteredCards.length;

  return (
    <div className="space-y-6">
      <CardSearch
        cards={allCards}
        onResults={handleResults}
        availableTypes={availableTypes}
        availableSets={availableSets}
      />

      <CardGrid cards={displayCards} />

      {hasMore && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            className="rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            加载更多（还有 {filteredCards.length - displayCount} 张）
          </button>
        </div>
      )}
    </div>
  );
}
