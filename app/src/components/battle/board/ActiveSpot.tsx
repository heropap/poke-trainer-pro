
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";
import { checkEnergyCost } from "@/engine/game-actions";

/** Map energy type to a dot color for cost display */
const COST_DOT_COLORS: Record<string, string> = {
  Grass: "bg-green-500",
  Fire: "bg-red-500",
  Water: "bg-blue-500",
  Lightning: "bg-yellow-400",
  Psychic: "bg-purple-500",
  Fighting: "bg-orange-700",
  Darkness: "bg-gray-800 ring-1 ring-gray-500",
  Metal: "bg-gray-400",
  Dragon: "bg-amber-600",
  Fairy: "bg-pink-400",
  Colorless: "bg-zinc-300 ring-1 ring-zinc-400",
};

interface ActiveSpotProps {
  card: GameCard | null;
  isOpponent?: boolean;
  onClick?: () => void;
  onAttack?: (attackName: string) => void;
  canAttack?: boolean;
  isFirstTurn?: boolean;
  /** Whether this spot is a valid target in target selection mode */
  isTargetable?: boolean;
  /** Callback when clicked as a target */
  onTargetClick?: () => void;
  onCardContextMenu?: (card: GameCard) => void;
}

export function ActiveSpot({
  card,
  isOpponent = false,
  onClick,
  onAttack,
  canAttack = false,
  isFirstTurn = false,
  isTargetable = false,
  onTargetClick,
  onCardContextMenu,
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
        className={`relative flex h-[220px] w-[160px] items-center justify-center rounded-lg border-2 border-dashed transition-all ${
          // Targetable state: green glowing border
          isTargetable
            ? "border-green-400 bg-green-500/10 shadow-lg shadow-green-500/20 cursor-pointer animate-pulse"
            : !card
            ? "border-zinc-300 bg-zinc-50/50 hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-700 dark:bg-zinc-900/50"
            : "border-zinc-300 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/50"
        } ${isOver && !card ? "border-green-500 bg-green-500/20" : ""}`}
        onClick={() => {
          if (isTargetable && onTargetClick) {
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
              scale={1.0} 
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
          <span className="text-sm font-medium text-zinc-400">
            {isOpponent ? "对手战斗区" : "战斗区"}
          </span>
        )}
      </div>

      {/* Attack Buttons */}
      {!isOpponent && card && card.card.attacks && canAttack && (
        <div className="flex w-[180px] flex-col gap-1">
          {card.card.attacks.map((attack, i) => {
            // Check if this attack has enough energy (considering types)
            const hasEnergy = checkEnergyCost(card.attachedEnergy, attack.cost);
            const isUsable = hasEnergy && !isFirstTurn;

            return (
              <button
                key={i}
                onClick={() => isUsable && onAttack?.(attack.name)}
                disabled={!isUsable}
                className={`w-full rounded px-2 py-1.5 text-xs font-bold text-white transition-colors ${
                  isUsable
                    ? "cursor-pointer bg-red-600 hover:bg-red-500"
                    : "cursor-not-allowed bg-zinc-600 opacity-60"
                }`}
                title={`${attack.name}: ${attack.damage || "0"} damage | Cost: ${attack.cost?.join(", ") || "Free"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  {/* Energy cost dots */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {attack.cost && attack.cost.length > 0 ? (
                      attack.cost.map((type, j) => (
                        <div
                          key={j}
                          className={`h-3 w-3 rounded-full ${COST_DOT_COLORS[type] || "bg-zinc-400"}`}
                        />
                      ))
                    ) : (
                      <span className="text-[9px] text-zinc-300">Free</span>
                    )}
                  </div>
                  {/* Attack name and damage */}
                  <span className="mx-1 flex-1 truncate text-left">{attack.name}</span>
                  <span className="shrink-0 text-yellow-300">{attack.damage || "0"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
