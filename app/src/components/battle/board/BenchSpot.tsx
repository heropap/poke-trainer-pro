
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  /** Compact mode for mobile viewports */
  compact?: boolean;
}

export function BenchSpot({
  card,
  index,
  onClick,
  isTargetable = false,
  onTargetClick,
  onCardContextMenu,
  compact = false,
}: BenchSpotProps) {
  const containerClass = compact
    ? "h-[95px] w-[68px]"
    : "h-[140px] w-[100px]";
  const cardScale = compact ? 0.42 : 0.65;
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
      className={`relative flex ${containerClass} items-center justify-center rounded-lg border border-dashed transition-all ${
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
      <AnimatePresence mode="wait">
        {card ? (
          <motion.div
            key={card.instanceId}
            ref={setPokemonRef}
            className={`relative h-full w-full ${
              isOverPokemon ? "rounded-lg ring-4 ring-yellow-400" : ""
            } ${
              isTargetable ? "rounded-lg ring-4 ring-green-400" : ""
            }`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ rotateX: 90, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <VisualCard
              card={card}
              scale={cardScale}
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
          </motion.div>
        ) : (
          <motion.span
            key="empty"
            className="text-xs text-zinc-300 dark:text-zinc-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            备战 {index + 1}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
