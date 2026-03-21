
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameCard, GameState } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";
import { getEffectiveRetreatCost } from "@/engine/turn-actions";
import { getEffect, getEffectSource } from "@/engine/effects/effect-registry";
import {
  getAttackDisabledReason,
  getRetreatDisabledReason,
  getAbilityDisabledReason,
} from "@/engine/action-availability";

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
  gameState: GameState;
  playerIndex: 0 | 1;
  isOpponent?: boolean;
  onClick?: () => void;
  onAttack?: (attackName: string) => void;
  onRetreat?: () => void;
  onUseAbility?: (cardInstanceId: string, abilityName: string) => void;
  /** UI-level control: hide action buttons during targeting/retreat selection */
  showActions?: boolean;
  /** Whether this spot is a valid target in target selection mode */
  isTargetable?: boolean;
  /** Callback when clicked as a target */
  onTargetClick?: () => void;
  onCardContextMenu?: (card: GameCard) => void;
  /** Compact mode for mobile viewports */
  compact?: boolean;
  /** Whether this card is currently performing an attack animation */
  isAttacking?: boolean;
}

export function ActiveSpot({
  card,
  gameState,
  playerIndex,
  isOpponent = false,
  onClick,
  onAttack,
  onRetreat,
  onUseAbility,
  showActions = false,
  isTargetable = false,
  onTargetClick,
  onCardContextMenu,
  compact = false,
  isAttacking = false,
}: ActiveSpotProps) {
  const containerClass = compact
    ? "h-[150px] w-[108px]"
    : "h-[220px] w-[160px]";
  const cardScale = compact ? 0.65 : 1.0;
  const attackBtnClass = compact ? "w-[120px]" : "w-[180px]";
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

  // Evolution stack tooltip
  const [showEvoStack, setShowEvoStack] = React.useState(false);

  // Derive turn state from gameState (V2 pattern — no V1 prop drilling)
  const hasAttacked = gameState.turnStatus.hasAttacked;

  // Retreat state — all derived from gameState via V2 queries
  const retreatDisabledReason = card && !isOpponent
    ? getRetreatDisabledReason(gameState, playerIndex, card)
    : null;
  const canRetreatNow = !isOpponent && card && showActions && !hasAttacked && !retreatDisabledReason;
  const retreatCost = card
    ? getEffectiveRetreatCost(gameState, playerIndex, card)
    : 0;

  return (
    <div className={`flex ${compact ? "flex-col" : "flex-row"} items-center justify-center gap-2`}>
      <div
        ref={setNodeRef}
        className={`relative flex ${containerClass} shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-all ${
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
              animate={
                isAttacking
                  ? { scale: 1, opacity: 1, x: [0, isOpponent ? 15 : -15, 0], y: [0, isOpponent ? 10 : -10, 0] }
                  : { scale: 1, opacity: 1, x: 0, y: 0 }
              }
              exit={{ rotateX: 90, opacity: 0, y: 30 }}
              transition={
                isAttacking
                  ? { duration: 0.3, ease: "easeInOut" }
                  : { type: "spring", stiffness: 200, damping: 20 }
              }
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

              {/* Evolution Stack Indicator (bottom left corner) */}
              {card.evolutionStack && card.evolutionStack.length > 0 && (
                <div
                  className="absolute -left-1 bottom-6 z-30 cursor-help"
                  onMouseEnter={() => setShowEvoStack(true)}
                  onMouseLeave={() => setShowEvoStack(false)}
                  onClick={(e) => { e.stopPropagation(); setShowEvoStack(!showEvoStack); }}
                >
                  <div className="flex items-center gap-0.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-md">
                    <span>🔗</span>
                    <span>{card.evolutionStack.length + 1}阶</span>
                  </div>

                  {/* Evolution Stack Tooltip */}
                  {showEvoStack && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 w-32 rounded-lg bg-zinc-800 p-2 shadow-xl border border-zinc-600">
                      <div className="text-[9px] font-bold text-zinc-400 mb-1">进化链</div>
                      {card.evolutionStack.map((entry, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] text-zinc-300">
                          <span className="text-zinc-500">{i === 0 ? "基础" : `${i}阶`}</span>
                          <span className="font-medium">{entry.card.name}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-1 text-[10px] text-yellow-300 font-bold">
                        <span className="text-zinc-500">{card.evolutionStack.length}阶</span>
                        <span>{card.card.name}</span>
                        <span className="text-zinc-500">←当前</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.span
              key="empty"
              className="text-sm font-medium text-zinc-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {isOpponent ? "对手战斗区" : "战斗区"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons (Attack + Retreat) — right side on desktop, below on mobile */}
      {!isOpponent && card && showActions && (
        <div className={`flex ${compact ? attackBtnClass : "w-[160px]"} flex-col gap-1`}>
          {/* Ability Buttons */}
          {card.card.abilities?.map((ability, i) => {
            // Only show activated abilities (passive/on_enter are automatic)
            const effect = getEffect(card.cardId, card.card.name);
            const abilityEffect = effect?.abilities?.find(a => a.name === ability.name);
            // Show button for activated abilities, or if no effect registered yet (show as disabled)
            if (abilityEffect && abilityEffect.type !== "activated") return null;

            const disabledReason = getAbilityDisabledReason(gameState, playerIndex, card, ability.name);
            const isUsable = !disabledReason;

            return (
              <button
                key={`ability-${i}`}
                onClick={() => isUsable && onUseAbility?.(card.instanceId, ability.name)}
                disabled={!isUsable}
                className={`w-full rounded px-2 py-1.5 text-xs font-bold text-white transition-colors ${
                  isUsable
                    ? "cursor-pointer bg-cyan-600 hover:bg-cyan-500"
                    : "cursor-not-allowed bg-zinc-600 opacity-60"
                }`}
                title={disabledReason || `${ability.name}: ${ability.text}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-cyan-200 text-[9px] shrink-0">✨</span>
                  <span className="mx-1 flex-1 truncate text-left">{ability.name}</span>
                  <span className="shrink-0 text-[9px] text-cyan-200">{ability.type === "Ability" ? "特性" : ability.type}</span>
                </div>
                {disabledReason && (
                  <div className="mt-0.5 text-[10px] font-normal text-red-400 truncate">
                    ⚠ {disabledReason}
                  </div>
                )}
              </button>
            );
          })}

          {/* Attack Buttons */}
          {card.card.attacks?.map((attack, i) => {
            const disabledReason = getAttackDisabledReason(gameState, playerIndex, card, attack.name);
            const isUsable = !disabledReason;

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
                title={disabledReason || `${attack.name}: ${attack.damage || "0"} 伤害 | 花费: ${attack.cost?.join(", ") || "免费"}`}
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
                      <span className="text-[9px] text-zinc-300">免费</span>
                    )}
                  </div>
                  {/* Attack name and damage */}
                  <span className="mx-1 flex-1 truncate text-left">{attack.name}</span>
                  {/* Effect source indicator */}
                  {(() => {
                    const src = getEffectSource(card.cardId, card.card.name);
                    const dotColor = !src ? "bg-red-500" : (src === "L1" || src === "L2") ? "bg-green-500" : "bg-yellow-400";
                    const dotTip = !src ? "未实现" : (src === "L1" || src === "L2") ? "手写效果" : "自动解析";
                    return <span className={`ml-0.5 inline-flex h-[6px] w-[6px] shrink-0 rounded-full ${dotColor}`} title={dotTip} />;
                  })()}
                  <span className="shrink-0 text-yellow-300">{attack.damage || "0"}</span>
                </div>
                {/* Disabled reason badge */}
                {disabledReason && (
                  <div className="mt-0.5 text-[10px] font-normal text-red-400 truncate">
                    ⚠ {disabledReason}
                  </div>
                )}
              </button>
            );
          })}

          {/* Passive Abilities Display */}
          {card.card.abilities?.map((ability, i) => {
            const effect = getEffect(card.cardId, card.card.name);
            const abilityEffect = effect?.abilities?.find(a => a.name === ability.name);
            if (!abilityEffect || abilityEffect.type !== "passive") return null;
            return (
              <div key={`passive-${i}`} className="rounded bg-cyan-900/40 px-2 py-0.5 text-[9px] text-cyan-300 border border-cyan-800/50 truncate" title={ability.text}>
                🛡 {ability.name} <span className="text-cyan-500">(被动)</span>
              </div>
            );
          })}

          {/* Weakness / Resistance Info */}
          {card.card.weaknesses && card.card.weaknesses.length > 0 && (
            <div className="flex items-center gap-1 text-[9px] text-zinc-400">
              <span className="text-red-400">弱:</span>
              {card.card.weaknesses.map((w, i) => (
                <span key={i} className="flex items-center gap-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${COST_DOT_COLORS[w.type] || "bg-zinc-400"}`} />
                  <span className="text-red-300">{w.value}</span>
                </span>
              ))}
              {card.card.resistances && card.card.resistances.length > 0 && (
                <>
                  <span className="mx-0.5 text-zinc-600">|</span>
                  <span className="text-green-400">抗:</span>
                  {card.card.resistances.map((r, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${COST_DOT_COLORS[r.type] || "bg-zinc-400"}`} />
                      <span className="text-green-300">{r.value}</span>
                    </span>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Retreat Button */}
          <button
            onClick={() => canRetreatNow && onRetreat?.()}
            disabled={!canRetreatNow}
            className={`w-full rounded px-2 py-1 text-xs font-bold transition-colors ${
              canRetreatNow
                ? "cursor-pointer bg-blue-600 text-white hover:bg-blue-500"
                : "cursor-not-allowed bg-zinc-700 text-zinc-400 opacity-60"
            }`}
            title={retreatDisabledReason || `撤退费用: ${retreatCost}`}
          >
            <div className="flex items-center justify-between">
              <span>🔄 撤退</span>
              <span className="flex items-center gap-0.5">
                {retreatCost > 0 ? (
                  Array.from({ length: retreatCost }).map((_, j) => (
                    <div key={j} className="h-2.5 w-2.5 rounded-full bg-zinc-300 ring-1 ring-zinc-400" />
                  ))
                ) : (
                  <span className="text-[9px]">免费</span>
                )}
              </span>
            </div>
            {retreatDisabledReason && (
              <div className="mt-0.5 text-[10px] font-normal text-red-400 truncate">
                ⚠ {retreatDisabledReason}
              </div>
            )}
          </button>

          {/* Already Attacked Indicator */}
          {hasAttacked && (
            <div className="rounded bg-zinc-700 px-2 py-1 text-center text-[10px] font-medium text-yellow-300">
              ⚔ 已攻击 — 等待回合结束
            </div>
          )}
        </div>
      )}
    </div>
  );
}
