
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";

interface ActiveSpotProps {
  card: GameCard | null;
  isOpponent?: boolean;
  onClick?: () => void;
  onAttack?: (attackName: string) => void;
  canAttack?: boolean;
}

export function ActiveSpot({
  card,
  isOpponent = false,
  onClick,
  onAttack,
  canAttack = false,
}: ActiveSpotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: isOpponent ? "opponent-active" : "active-spot",
    disabled: isOpponent
  });

  // Droppable for attaching energy to the Pokemon itself
  const { setNodeRef: setPokemonRef, isOver: isOverPokemon } = useDroppable({
    id: "active-pokemon",
    disabled: !card || isOpponent,
    data: { instanceId: card?.instanceId }
  });

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        ref={setNodeRef}
        className={`relative flex h-[220px] w-[160px] items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50/50 transition-colors dark:border-zinc-700 dark:bg-zinc-900/50 ${
          !card ? "hover:border-blue-400 hover:bg-blue-50/50" : ""
        } ${isOver && !card ? "border-green-500 bg-green-500/20" : ""}`}
        onClick={onClick}
      >
        {card ? (
          <div ref={setPokemonRef} className={`relative h-full w-full ${isOverPokemon ? "ring-4 ring-yellow-400 rounded-lg" : ""}`}>
            <VisualCard card={card} scale={1.0} showHp={true} />
          </div>
        ) : (
          <span className="text-sm font-medium text-zinc-400">
            {isOpponent ? "对手战斗区" : "战斗区"}
          </span>
        )}
      </div>

      {/* Attack Buttons */}
      {!isOpponent && card && card.card.attacks && canAttack && (
        <div className="flex flex-col gap-1 w-[160px]">
          {card.card.attacks.map((attack, i) => (
            <button
              key={i}
              onClick={() => onAttack?.(attack.name)}
              className="w-full rounded bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-500 truncate"
              title={`${attack.name}: ${attack.damage} damage`}
            >
              {attack.name} ({attack.damage || "0"})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
