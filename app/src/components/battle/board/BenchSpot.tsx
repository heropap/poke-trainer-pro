
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";

interface BenchSpotProps {
  card: GameCard | null;
  index: number;
  onClick?: () => void;
  /** Whether this spot is a valid target in target selection mode */
  isTargetable?: boolean;
  /** Callback when clicked as a target */
  onTargetClick?: () => void;
  onCardContextMenu?: (card: GameCard) => void;
}

export function BenchSpot({
  card,
  index,
  onClick,
  isTargetable = false,
  onTargetClick,
  onCardContextMenu,
}: BenchSpotProps) {
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
      className={`relative flex h-[140px] w-[100px] items-center justify-center rounded-lg border border-dashed transition-all ${
        // Targetable state: green glowing border
        isTargetable && card
          ? "border-green-400 bg-green-500/10 shadow-lg shadow-green-500/20 cursor-pointer animate-pulse"
          : !card
          ? "border-zinc-300 bg-zinc-50/30 hover:border-blue-400 hover:bg-blue-50/30 dark:border-zinc-700 dark:bg-zinc-900/30"
          : "border-zinc-300 bg-zinc-50/30 dark:border-zinc-700 dark:bg-zinc-900/30"
      } ${isOver && !card ? "border-green-500 bg-green-500/20" : ""}`}
      onClick={() => {
        if (isTargetable && card && onTargetClick) {
          onTargetClick();
        } else if (onClick) {
          onClick();
        }
      }}
    >
      {card ? (
        <div
          ref={setPokemonRef}
          className={`relative h-full w-full ${
            isOverPokemon ? "rounded-lg ring-4 ring-yellow-400" : ""
          } ${
            isTargetable ? "rounded-lg ring-4 ring-green-400" : ""
          }`}
        >
          <VisualCard 
            card={card} 
            scale={0.65} 
            showHp={true} 
            showEnergy={true} 
            onContextMenu={(e) => {
              if (onCardContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                onCardContextMenu(card);
              }
            }}
          />
        </div>
      ) : (
        <span className="text-xs text-zinc-300 dark:text-zinc-600">
          备战 {index + 1}
        </span>
      )}
    </div>
  );
}
