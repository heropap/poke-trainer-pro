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
  getEffect,
  hasEffect,
  getRegisteredCount,
  clearRegistry,
  getRegisteredCardIds,
} from "./effect-registry";

// Re-export context
export { createEffectContext } from "./effect-context";

// Re-export coin system
export { flipCoin, flipCoins, setRandomFn } from "./coin";

// Re-export status effects
export { processBetweenTurns } from "./status-effects";

// Card implementations
import { trainerEffects } from "./cards/trainers";
import { attackEffects } from "./cards/attacks";
import { registerAll } from "./effect-registry";

/** All built-in card effects */
const allEffects = [...trainerEffects, ...attackEffects];

/**
 * Initialize the effect system by registering all built-in card effects.
 * Call this once at app startup.
 */
export function initializeEffects(): void {
  registerAll(allEffects);
}

/**
 * Get count of all available built-in effects.
 */
export function getBuiltInEffectCount(): number {
  return allEffects.length;
}
