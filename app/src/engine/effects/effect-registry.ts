/**
 * Card Effect Registry
 *
 * Central registry for all card effects. Cards register their effects
 * by cardId, and the engine looks them up during gameplay.
 *
 * Usage:
 *   registerEffect({ cardId: "sv1-25", attacks: [...] });
 *   const effect = getEffect("sv1-25");
 */

import { CardEffectDef } from "./effect-types";

/** Internal storage: cardId → CardEffectDef */
const registry = new Map<string, CardEffectDef>();

/**
 * Register a single card effect definition.
 * If a card with the same ID is already registered, it will be overwritten.
 */
export function registerEffect(def: CardEffectDef): void {
  registry.set(def.cardId, def);
}

/**
 * Register multiple card effect definitions at once.
 */
export function registerAll(defs: CardEffectDef[]): void {
  for (const def of defs) {
    registry.set(def.cardId, def);
  }
}

/**
 * Look up a card effect by card ID.
 * @returns The effect definition, or null if not registered.
 */
export function getEffect(cardId: string): CardEffectDef | null {
  return registry.get(cardId) ?? null;
}

/**
 * Check if a card has a registered effect.
 */
export function hasEffect(cardId: string): boolean {
  return registry.has(cardId);
}

/**
 * Get the number of registered effects (useful for diagnostics).
 */
export function getRegisteredCount(): number {
  return registry.size;
}

/**
 * Clear all registered effects (useful for testing).
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Get all registered card IDs (useful for diagnostics).
 */
export function getRegisteredCardIds(): string[] {
  return Array.from(registry.keys());
}
