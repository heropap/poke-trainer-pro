/**
 * Card Effects System - Main Entry Point
 *
 * Exports all effect system components and auto-registers initial card effects.
 *
 * Usage:
 *   import { initializeEffects } from "@/engine/effects";
 *   initializeEffects(); // Call once at app startup
 */

// Re-export types
export type {
  EffectContext,
  AttackEffect,
  AttackResult,
  AbilityEffect,
  AbilityType,
  TrainerEffect,
  ToolEffect,
  CardEffectDef,
} from "./effect-types";

// Re-export registry
export {
  registerEffect,
  registerAll,
  registerByName,
  registerAllByName,
  getEffect,
  hasEffect,
  getRegisteredCount,
  getNameRegisteredCount,
  clearRegistry,
  getRegisteredCardIds,
  getRegisteredCardNames,
} from "./effect-registry";

// Re-export context
export { createEffectContext } from "./effect-context";

// Re-export coin system
export { flipCoin, flipCoins, setRandomFn } from "./coin";

// Re-export status effects
export { processBetweenTurns } from "./status-effects";

// Re-export text parser
export { parseCardEffects, autoRegisterTextEffects } from "./text-parser";

// Card implementations
import { trainerEffects, trainerNameEffects } from "./cards/trainers";
import { attackEffects } from "./cards/attacks";
import { stadiumNameEffects } from "./cards/stadiums";
import { registerAll, registerAllByName } from "./effect-registry";
import { autoRegisterTextEffects } from "./text-parser";
import { Card } from "@/types/card";

/** All built-in card effects (ID-based) */
const allEffects = [...trainerEffects, ...attackEffects];

/**
 * Initialize the effect system by registering all built-in card effects.
 * Call this once at app startup.
 *
 * @param cards Optional array of Card data — when provided, auto-registers
 *              text-parsed effects for cards without existing registered effects.
 */
export function initializeEffects(cards?: Card[]): void {
  registerAll(allEffects);
  registerAllByName(trainerNameEffects);
  registerAllByName(stadiumNameEffects);

  // Layer 3: Auto-register text-parsed effects for unregistered cards
  if (cards && cards.length > 0) {
    autoRegisterTextEffects(cards);
  }
}

/**
 * Get count of all available built-in effects.
 */
export function getBuiltInEffectCount(): number {
  return allEffects.length + trainerNameEffects.length + stadiumNameEffects.length;
}
