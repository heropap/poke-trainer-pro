"use client";

import { useState, useCallback } from "react";
import { Card } from "@/types/card";
import CardImage from "./CardImage";
import CardDetail from "./CardDetail";

interface CardGridProps {
  cards: Card[];
  emptyMessage?: string;
}

export default function CardGrid({
  cards,
  emptyMessage = "没有找到卡牌",
}: CardGridProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const handleCardClick = useCallback((card: Card) => {
    setSelectedCard((prev) => (prev?.id === card.id ? null : card));
  }, []);

  const handleClose = useCallback(() => {
    setSelectedCard(null);
  }, []);

  if (cards.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500 dark:text-zinc-400" data-testid="card-grid-empty">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="relative" data-testid="card-grid">
      {/* Card Detail Overlay */}
      {selectedCard && (
        <div className="sticky top-4 z-10 mb-4 flex justify-center">
          <CardDetail card={selectedCard} onClose={handleClose} />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {cards.map((card) => (
          <CardImage
            key={card.id}
            card={card}
            size="small"
            onClick={handleCardClick}
            className={
              selectedCard?.id === card.id
                ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-950"
                : ""
            }
          />
        ))}
      </div>

      <div className="mt-4 text-center text-sm text-zinc-400">
        共 {cards.length} 张卡牌
      </div>
    </div>
  );
}
