/**
 * V2 Action Availability Module
 *
 * Centralized, V2-native action availability queries for UI components.
 * All functions take (state, playerIndex, ...) and derive availability
 * from the V2 modifier query system, markers, and status conditions.
 *
 * Replaces scattered V1 boolean prop patterns (canAttack, hasAttackedThisTurn,
 * isFirstTurn) with unified state-derived queries.
 */

import { GameState, GameCard, GamePhase } from "./game-state";
import { queryActiveModifiers } from "./effects/modifier-query";
import { checkEnergyCost, getProvidedEnergy, checkEnergyCostWithProvided } from "./game-actions";
import { getEffectiveRetreatCost } from "./turn-actions";
import { getEffect } from "./effects/effect-registry";
import {
  CANT_ATTACK_NEXT_TURN,
  cantUseAttackMarker,
  PREVENT_RETREAT_NEXT_TURN,
  ABILITY_BLOCKED,
  ABILITY_BLOCKED_TEMP,
} from "./effects/markers";

// ───────────────────────────────────────────────
// Attack Availability
// ───────────────────────────────────────────────

/**
 * Returns a user-friendly reason why this attack is disabled, or null if usable.
 * Checks: turn state, status conditions, markers, energy cost, V2 modifiers.
 */
export function getAttackDisabledReason(
  state: GameState,
  playerIndex: 0 | 1,
  card: GameCard,
  attackName: string
): string | null {
  // Turn state checks (derived from state, not props)
  if (state.turnStatus.hasAttacked) return "本回合已攻击";
  if (state.turn === 1 && state.isFirstTurn) return "先攻第一回合不能攻击";

  // Status condition checks
  if (card.statusConditions.includes("paralyzed")) return "麻痹状态不能攻击";
  if (card.statusConditions.includes("asleep")) return "睡眠状态不能攻击";

  // Marker checks
  if (card.markers[CANT_ATTACK_NEXT_TURN] > 0) return "被效果封锁，不能攻击";
  if (card.markers[cantUseAttackMarker(attackName)] > 0) return `不能使用 ${attackName}`;

  // VSTAR Power attack check (Star Requiem, Star Chronos, etc.)
  const attack = card.card.attacks?.find((a) => a.name === attackName);
  if (attack?.text?.includes("VSTAR") || attack?.text?.includes("V STAR")) {
    const vstarKey = playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
    if (state.turnStatus[vstarKey]) return "本局已使用过VSTAR力量";
  }

  // V2: Modifier query — field abilities blocking attacks
  const mods = queryActiveModifiers(state, playerIndex);
  if (mods.preventAttack) return "场上能力封锁了攻击";

  // Energy cost check (pure math, V2-compatible)
  if (attack && !checkEnergyCost(card.attachedEnergy, attack.cost || [])) {
    return "能量不足";
  }

  return null;
}

// ───────────────────────────────────────────────
// Retreat Availability
// ───────────────────────────────────────────────

/**
 * Returns a user-friendly reason why retreat is disabled, or null if possible.
 * Checks: bench, turn state, status, markers, V2 modifiers, energy cost.
 */
export function getRetreatDisabledReason(
  state: GameState,
  playerIndex: 0 | 1,
  card: GameCard
): string | null {
  const player = state.players[playerIndex];
  const hasBench = player.bench.cards.length > 0;

  if (!hasBench) return "备战区没有宝可梦";
  if (state.turnStatus.hasRetreated) return "本回合已撤退";

  // Status conditions
  if (card.statusConditions.includes("paralyzed")) return "麻痹状态不能撤退";
  if (card.statusConditions.includes("asleep")) return "睡眠状态不能撤退";

  // Marker check
  if (card.markers[PREVENT_RETREAT_NEXT_TURN] > 0) return "被效果锁定，不能撤退";

  // V2: Modifier query — field abilities blocking retreat
  const mods = queryActiveModifiers(state, playerIndex);
  if (mods.preventRetreat) return "场上能力阻止了撤退";

  // Energy sufficiency with effective cost (tools/abilities/stadium modifiers applied)
  // Use proper energy check that accounts for multi-energy cards (Double Turbo, etc.)
  const retreatCost = getEffectiveRetreatCost(state, playerIndex, card);
  if (retreatCost > 0) {
    const provided = getProvidedEnergy(card.attachedEnergy);
    const cost = Array.from({ length: retreatCost }, () => "Colorless");
    const energyCheck = checkEnergyCostWithProvided(provided, cost);
    if (!energyCheck.sufficient) {
      return `能量不足 (需要 ${retreatCost} 点撤退能量)`;
    }
  }

  return null;
}

// ───────────────────────────────────────────────
// Ability Availability
// ───────────────────────────────────────────────

/**
 * Returns a user-friendly reason why this ability is disabled, or null if usable.
 * Checks: turn state, markers, effect registration, V2 modifiers.
 */
export function getAbilityDisabledReason(
  state: GameState,
  playerIndex: 0 | 1,
  card: GameCard,
  abilityName: string
): string | null {
  // Turn state (derived from state)
  if (state.turnStatus.hasAttacked) return "攻击后不能使用特性";
  if (card.abilityUsedThisTurn) return "本回合已使用特性";

  // VSTAR Power ability check
  const abilityData = card.card.abilities?.find((a: any) => a.name === abilityName);
  if (abilityData?.text?.includes("VSTAR") || abilityData?.text?.includes("V STAR") ||
      abilityName.includes("Star") && card.card.subtypes?.includes("VSTAR")) {
    const vstarKey = playerIndex === 0 ? "p1VstarUsed" : "p2VstarUsed";
    if (state.turnStatus[vstarKey]) return "本局已使用过VSTAR力量";
  }

  // Marker check
  if (card.markers[ABILITY_BLOCKED] > 0 || card.markers[ABILITY_BLOCKED_TEMP] > 0) return "特性被封锁";

  // V2: Global ability lock (e.g., Garbotoxin)
  const mods = queryActiveModifiers(state, playerIndex);
  if (mods.preventAbility) return "场上能力封锁了所有特性";

  // Effect registration check
  const effect = getEffect(card.cardId, card.card.name);
  const abilityEffect = effect?.abilities?.find((a) => a.name === abilityName);
  if (!abilityEffect) return "效果尚未实现";
  if (abilityEffect.type !== "activated") return "不是主动特性";

  return null;
}
