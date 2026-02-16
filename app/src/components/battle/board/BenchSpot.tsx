
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";

interface BenchSpotProps {
  card: GameCard | null;
  index: number;
  onClick?: () => void;
}

export function BenchSpot({ card, index, onClick }: BenchSpotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bench-spot-${index}`,
  });

  // Droppable for attaching energy to the Bench Pokemon
  const { setNodeRef: setPokemonRef, isOver: isOverPokemon } = useDroppable({
    id: `bench-pokemon-${index}`,
    disabled: !card,
    data: { instanceId: card?.instanceId }
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex h-[140px] w-[100px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/30 transition-colors dark:border-zinc-700 dark:bg-zinc-900/30 ${
        !card ? "hover:border-blue-400 hover:bg-blue-50/30" : ""
      } ${isOver && !card ? "border-green-500 bg-green-500/20" : ""}`}
      onClick={onClick}
    >
      {card ? (
        <div ref={setPokemonRef} className={`relative h-full w-full ${isOverPokemon ? "ring-4 ring-yellow-400 rounded-lg" : ""}`}>
          <VisualCard card={card} scale={0.65} showHp={true} />
        </div>
      ) : (
        <span className="text-xs text-zinc-300 dark:text-zinc-600">
          备战 {index + 1}
        </span>
      )}
    </div>
  );
}
