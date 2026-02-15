"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/types/card";
import DeckImport from "@/components/deck/DeckImport";

export default function DeckPageClient() {
  const [cardIndex, setCardIndex] = useState<Map<string, Card>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const data = await import("@/data/cards/_index.json");
      const cards = data.default as Card[];
      const index = new Map<string, Card>();
      cards.forEach((c) => index.set(c.id, c));
      setCardIndex(index);
      setLoading(false);
    }
    loadData();
  }, []);

  const cardLookup = useCallback(
    (id: string) => cardIndex.get(id),
    [cardIndex]
  );

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500">
        加载卡牌数据中...
      </div>
    );
  }

  return <DeckImport cardLookup={cardLookup} />;
}
