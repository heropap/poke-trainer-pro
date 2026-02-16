
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDraggable } from "@dnd-kit/core";

interface DraggableCardProps {
  card: GameCard;
  index: number;
  onCardClick?: (card: GameCard) => void;
  isMyTurn?: boolean;
}

function DraggableCard({ card, index, onCardClick, isMyTurn }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.instanceId,
    data: { card }
  });

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="-ml-12 first:ml-0 opacity-0"
        style={{ zIndex: index, width: 120, height: 168 }} // Placeholder size
      />
    );
  }

  // Trainer cards (Items/Supporters) that are NOT Pokemon Tools can be played by clicking
  const isClickPlayable = isMyTurn &&
    card.card.supertype === "Trainer" &&
    (card.card.subtypes.includes("Supporter") || card.card.subtypes.includes("Item")) &&
    !card.card.subtypes.includes("Pokémon Tool");

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`-ml-12 first:ml-0 transition-all duration-200 hover:z-20 hover:-translate-y-6 hover:scale-110 cursor-grab active:cursor-grabbing ${
        isClickPlayable ? "ring-2 ring-yellow-400/50 rounded-lg" : ""
      }`}
      style={{ zIndex: index }}
    >
      <div className="relative">
        <VisualCard
          card={card}
          scale={0.8}
          isHoverable={false} // Hand wrapper handles hover
          onClick={() => onCardClick?.(card)}
        />
        {/* Click-to-play indicator for trainer cards */}
        {isClickPlayable && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-yellow-500 px-2 py-0.5 text-[8px] font-bold text-black shadow-md pointer-events-none">
            点击使用
          </div>
        )}
      </div>
    </div>
  );
}

interface HandProps {
  cards: GameCard[];
  isOpponent?: boolean;
  onCardClick?: (card: GameCard) => void;
  isMyTurn?: boolean;
}

export function Hand({ cards, isOpponent = false, onCardClick, isMyTurn = false }: HandProps) {
  if (isOpponent) {
    // Render opponent hand (cards face down)
    return (
      <div className="flex h-[120px] items-center justify-center gap-[-40px]">
        {cards.map((_, i) => (
          <div
            key={i}
            className="relative h-[100px] w-[70px] -ml-8 first:ml-0 rounded-lg border border-zinc-600 bg-indigo-900 shadow-md transition-transform hover:-translate-y-2"
            style={{ zIndex: i }}
          >
            {/* Card Back Pattern */}
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-[url('/card-back.png')] bg-cover bg-center">
              <div className="h-4 w-4 rounded-full bg-blue-500 opacity-50"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Render player hand with drag support
  return (
    <div className="flex w-full items-end justify-center overflow-x-auto px-4 py-2 pb-4">
      <div className="flex gap-[-20px]" style={{ marginLeft: "20px" }}>
        {cards.map((card, i) => (
          <DraggableCard
            key={card.instanceId}
            card={card}
            index={i}
            onCardClick={onCardClick}
            isMyTurn={isMyTurn}
          />
        ))}
      </div>
    </div>
  );
}
