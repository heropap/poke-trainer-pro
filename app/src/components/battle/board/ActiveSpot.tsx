
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameCard, GameState } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { useDroppable } from "@dnd-kit/core";
import { checkEnergyCost, canAttack } from "@/engine/game-actions";
import { getEffectiveRetreatCost } from "@/engine/turn-actions";
import { CANT_ATTACK_NEXT_TURN, cantUseAttackMarker, PREVENT_RETREAT_NEXT_TURN, ABILITY_BLOCKED } from "@/engine/effects/markers";
import { getEffect, getEffectSource } from "@/engine/effects/effect-registry";

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
  gameState?: GameState;
  playerIndex?: 0 | 1;
  isOpponent?: boolean;
  onClick?: () => void;
  onAttack?: (attackName: string) => void;
  onRetreat?: () => void;
  onUseAbility?: (cardInstanceId: string, abilityName: string) => void;
  canAttack?: boolean;
  isFirstTurn?: boolean;
  hasAttackedThisTurn?: boolean;
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

/**
 * Determine why an ability is disabled and return a user-friendly reason.
 */
function getAbilityDisabledReason(
  card: GameCard,
  abilityName: string,
  hasAttackedThisTurn: boolean,
): string | null {
  if (hasAttackedThisTurn) return "攻击后不能使用特性";
  if (card.abilityUsedThisTurn) return "本回合已使用特性";
  if (card.markers[ABILITY_BLOCKED] > 0) return "特性被封锁";
  // Check if there's an effect registered for this ability
  const effect = getEffect(card.cardId, card.card.name);
  const abilityEffect = effect?.abilities?.find(a => a.name === abilityName);
  if (!abilityEffect) return "效果尚未实现";
  if (abilityEffect.type !== "activated") return "不是主动特性";
  return null;
}

/**
 * Determine why an attack is disabled and return a user-friendly reason.
 */
function getAttackDisabledReason(
  card: GameCard,
  attackName: string,
  isFirstTurn: boolean,
  hasAttackedThisTurn: boolean,
): string | null {
  if (hasAttackedThisTurn) return "本回合已攻击";
  if (isFirstTurn) return "先攻第一回合不能攻击";
  if (card.statusConditions.includes("paralyzed")) return "麻痹状态不能攻击";
  if (card.statusConditions.includes("asleep")) return "睡眠状态不能攻击";
  if (card.markers[CANT_ATTACK_NEXT_TURN] > 0) return "被效果封锁，不能攻击";
  if (card.markers[cantUseAttackMarker(attackName)] > 0) return `不能使用 ${attackName}`;
  if (!checkEnergyCost(card.attachedEnergy, card.card.attacks?.find(a => a.name === attackName)?.cost || [])) {
    return "能量不足";
  }
  return null;
}

/**
 * Determine retreat disabled reason.
 */
function getRetreatDisabledReason(card: GameCard, hasBench: boolean, retreatedThisTurn: boolean, gameState?: GameState, playerIndex?: 0 | 1): string | null {
  if (!hasBench) return "备战区没有宝可梦";
  if (retreatedThisTurn) return "本回合已撤退";
  if (card.statusConditions.includes("paralyzed")) return "麻痹状态不能撤退";
  if (card.statusConditions.includes("asleep")) return "睡眠状态不能撤退";
  if (card.markers[PREVENT_RETREAT_NEXT_TURN] > 0) return "被效果锁定，不能撤退";
  // Check energy sufficiency with effective cost (after tool/ability/stadium modifiers)
  const retreatCost =
    gameState && playerIndex !== undefined
      ? getEffectiveRetreatCost(gameState, playerIndex, card)
      : card.card.convertedRetreatCost ?? 0;
  if (retreatCost > 0 && card.attachedEnergy.length < retreatCost) {
    return `能量不足 (需要 ${retreatCost}，当前 ${card.attachedEnergy.length})`;
  }
  return null;
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
  canAttack: canAttackProp = false,
  isFirstTurn = false,
  hasAttackedThisTurn = false,
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

  // Retreat state
  const retreatedThisTurn = gameState?.turnStatus?.hasRetreated ?? false;
  const hasBench = gameState ? gameState.players[playerIndex ?? 0].bench.cards.length > 0 : false;
  const retreatDisabledReason = card && !isOpponent ? getRetreatDisabledReason(card, hasBench, retreatedThisTurn, gameState, playerIndex) : null;
  const canRetreatNow = !isOpponent && card && canAttackProp && !hasAttackedThisTurn && !retreatDisabledReason;
  const retreatCost =
    card && gameState && playerIndex !== undefined
      ? getEffectiveRetreatCost(gameState, playerIndex, card)
      : card?.card.convertedRetreatCost ?? 0;

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
      {!isOpponent && card && canAttackProp && (
        <div className={`flex ${compact ? attackBtnClass : "w-[160px]"} flex-col gap-1`}>
          {/* Ability Buttons */}
          {card.card.abilities?.map((ability, i) => {
            // Only show activated abilities (passive/on_enter are automatic)
            const effect = getEffect(card.cardId, card.card.name);
            const abilityEffect = effect?.abilities?.find(a => a.name === ability.name);
            // Show button for activated abilities, or if no effect registered yet (show as disabled)
            if (abilityEffect && abilityEffect.type !== "activated") return null;

            const disabledReason = getAbilityDisabledReason(card, ability.name, hasAttackedThisTurn);
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
                  <div className="mt-0.5 text-[8px] font-normal text-zinc-400 truncate">
                    ⚠ {disabledReason}
                  </div>
                )}
              </button>
            );
          })}

          {/* Attack Buttons */}
          {card.card.attacks?.map((attack, i) => {
            const disabledReason = getAttackDisabledReason(card, attack.name, isFirstTurn, hasAttackedThisTurn);
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
                title={disabledReason || `${attack.name}: ${attack.damage || "0"} damage | Cost: ${attack.cost?.join(", ") || "Free"}`}
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
                  <div className="mt-0.5 text-[8px] font-normal text-zinc-400 truncate">
                    ⚠ {disabledReason}
                  </div>
                )}
              </button>
            );
          })}

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
                  <span className="text-[9px]">Free</span>
                )}
              </span>
            </div>
            {retreatDisabledReason && (
              <div className="mt-0.5 text-[8px] font-normal text-zinc-500 truncate">
                ⚠ {retreatDisabledReason}
              </div>
            )}
          </button>

          {/* Already Attacked Indicator */}
          {hasAttackedThisTurn && (
            <div className="rounded bg-zinc-700 px-2 py-1 text-center text-[10px] font-medium text-yellow-300">
              ⚔ 已攻击 — 等待回合结束
            </div>
          )}
        </div>
      )}
    </div>
  );
}
