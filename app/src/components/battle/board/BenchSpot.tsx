
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameCard, GameState } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";
import { getEffect } from "@/engine/effects/effect-registry";
import { ABILITY_BLOCKED } from "@/engine/effects/markers";
import { queryActiveModifiers } from "@/engine/effects/modifier-query";

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
  /** Whether this bench spot is selected (shows action menu) */
  isSelected?: boolean;
  /** Bench action menu callback */
  onBenchAction?: (action: string) => void;
  /** Whether it's the player's turn (to show actions) */
  isMyTurn?: boolean;
  /** Whether the player is the opponent */
  isOpponent?: boolean;
  /** Game state for V2 modifier queries */
  gameState?: GameState;
  /** Player index for V2 modifier queries */
  playerIndex?: 0 | 1;
  /** Callback when bench Pokemon uses an ability */
  onUseAbility?: (cardInstanceId: string, abilityName: string) => void;
}

export function BenchSpot({
  card,
  index,
  onClick,
  isTargetable = false,
  onTargetClick,
  onCardContextMenu,
  compact = false,
  isSelected = false,
  onBenchAction,
  isMyTurn = false,
  isOpponent = false,
  gameState,
  playerIndex,
  onUseAbility,
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

  // V2: Derive turn state and modifiers from gameState
  const hasAttacked = gameState?.turnStatus?.hasAttacked ?? false;
  const modifiers = gameState && playerIndex !== undefined
    ? queryActiveModifiers(gameState, playerIndex)
    : null;
  const preventAbility = modifiers?.preventAbility ?? false;

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        className={`relative flex ${containerClass} items-center justify-center rounded-lg border border-dashed transition-all ${
          // Selected state: blue border
          isSelected && card
            ? "border-blue-400 bg-blue-500/10 shadow-lg shadow-blue-500/20 cursor-pointer"
            : // Targetable state: green glowing border
            isTargetable && card
            ? "border-green-400 bg-green-500/10 shadow-lg shadow-green-500/20 cursor-pointer animate-pulse"
            : !card
            ? "border-zinc-300 bg-zinc-50/30 hover:border-blue-400 hover:bg-blue-50/30 dark:border-zinc-700 dark:bg-zinc-900/30"
            : "border-zinc-300 bg-zinc-50/30 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30 cursor-pointer"
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
              } ${
                isSelected ? "rounded-lg ring-4 ring-blue-400" : ""
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

      {/* Bench Action Menu (shown when selected, non-opponent, player's turn) */}
      {isSelected && card && !isOpponent && isMyTurn && onBenchAction && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-1 rounded-xl bg-zinc-900/95 px-2 py-1.5 shadow-2xl backdrop-blur-md border border-zinc-700/50">
            <div className="text-[9px] text-zinc-400 font-medium truncate max-w-[100px]">
              {card.card.name}
            </div>
            <div className={`flex ${compact ? "flex-col" : "flex-row"} gap-1 flex-wrap justify-center`}>
              {/* Ability buttons for bench Pokemon */}
              {card.card.abilities?.map((ability, i) => {
                const effect = getEffect(card.cardId, card.card.name);
                const abilityEffect = effect?.abilities?.find(a => a.name === ability.name);
                if (abilityEffect && abilityEffect.type !== "activated") return null;
                const isBlocked = card.markers[ABILITY_BLOCKED] > 0;
                const isUsed = card.abilityUsedThisTurn;
                const noEffect = !abilityEffect;
                // V2: Check global ability lock + hasAttacked from state
                const isDisabled = isBlocked || isUsed || noEffect || hasAttacked || preventAbility;
                return (
                  <button
                    key={`ability-${i}`}
                    onClick={() => !isDisabled && onUseAbility?.(card.instanceId, ability.name)}
                    disabled={isDisabled}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold text-white transition-colors ${
                      isDisabled
                        ? "bg-zinc-600 opacity-60 cursor-not-allowed"
                        : "bg-cyan-600 hover:bg-cyan-500 cursor-pointer"
                    }`}
                    title={
                      isBlocked ? "特性被封锁"
                      : preventAbility ? "场上能力封锁了所有特性"
                      : isUsed ? "本回合已使用"
                      : noEffect ? "效果未实现"
                      : hasAttacked ? "攻击后不能使用特性"
                      : ability.text
                    }
                  >
                    ✨{ability.name}
                  </button>
                );
              })}
              <button
                onClick={() => onBenchAction("attach_energy")}
                className="rounded-md bg-yellow-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-yellow-500"
              >
                ⚡附能
              </button>
              <button
                onClick={() => onBenchAction("equip_tool")}
                className="rounded-md bg-purple-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-purple-500"
              >
                🔧道具
              </button>
              <button
                onClick={() => onBenchAction("view_detail")}
                className="rounded-md bg-zinc-700 px-2 py-1 text-[10px] font-bold text-zinc-200 transition-colors hover:bg-zinc-600"
              >
                📋详情
              </button>
            </div>
          </div>
          {/* Arrow pointing down */}
          <div className="flex justify-center">
            <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-zinc-900/95" />
          </div>
        </div>
      )}
    </div>
  );
}
