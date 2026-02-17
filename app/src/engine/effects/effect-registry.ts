/**
 * Card Effect Registry
 *
 * Central registry for all card effects. Cards register their effects
 * by cardId (primary) or by cardName (fallback for covering all reprints).
 *
 * Lookup priority: ID match first → name match second.
 *
 * Source layer tracking:
 *   L1 = ID-based hand-written effects (highest priority)
 *   L2 = Name-based hand-written effects
 *   L3 = Text-parser from ryuu-play metadata
 *   L4 = Text-parser from UI Card data
 *
 * Usage:
 *   registerEffect({ cardId: "sv1-25", attacks: [...] }, "L1");
 *   registerByName({ cardId: "name:Iono", cardName: "Iono", trainer: {...} }, "L2");
 *   const effect = getEffect("sv2-185", "Iono"); // finds by name
 *   const source = getEffectSource("sv2-185", "Iono"); // → "L2"
 */

import { CardEffectDef } from "./effect-types";

/** Effect source layer identifier */
export type EffectSourceLayer = "L1" | "L2" | "L3" | "L4";

/** Primary storage: cardId → CardEffectDef */
const registry = new Map<string, CardEffectDef>();

/** Secondary storage: cardName → CardEffectDef (covers all reprints) */
const nameRegistry = new Map<string, CardEffectDef>();

/** Source tracking: cardId → EffectSourceLayer */
const sourceByIdRegistry = new Map<string, EffectSourceLayer>();

/** Source tracking: cardName → EffectSourceLayer */
const sourceByNameRegistry = new Map<string, EffectSourceLayer>();

// ─── ID-based registration (existing) ───

/**
 * Register a single card effect definition by ID.
 * If a card with the same ID is already registered, it will be overwritten.
 */
export function registerEffect(def: CardEffectDef, source?: EffectSourceLayer): void {
  registry.set(def.cardId, def);
  if (source) sourceByIdRegistry.set(def.cardId, source);
}

/**
 * Register multiple card effect definitions at once (by ID).
 */
export function registerAll(defs: CardEffectDef[], source?: EffectSourceLayer): void {
  for (const def of defs) {
    registry.set(def.cardId, def);
    if (source) sourceByIdRegistry.set(def.cardId, source);
  }
}

// ─── Name-based registration (new) ───

/**
 * Register a card effect by name. All reprints of this card name
 * will automatically get this effect via the fallback lookup.
 */
export function registerByName(def: CardEffectDef & { cardName: string }, source?: EffectSourceLayer): void {
  nameRegistry.set(def.cardName, def);
  if (source) sourceByNameRegistry.set(def.cardName, source);
}

/**
 * Register multiple card effects by name.
 */
export function registerAllByName(defs: (CardEffectDef & { cardName: string })[], source?: EffectSourceLayer): void {
  for (const def of defs) {
    nameRegistry.set(def.cardName, def);
    if (source) sourceByNameRegistry.set(def.cardName, source);
  }
}

// ─── Lookup ───

/**
 * Look up a card effect. Checks ID first, then falls back to name.
 * @param cardId - The card's unique ID (e.g., "sv1-189")
 * @param cardName - Optional card name for fallback lookup (e.g., "Iono")
 * @returns The effect definition, or null if not registered.
 */
export function getEffect(cardId: string, cardName?: string): CardEffectDef | null {
  // Primary: exact ID match
  const byId = registry.get(cardId);
  if (byId) return byId;

  // Fallback: name-based match
  if (cardName) {
    const byName = nameRegistry.get(cardName);
    if (byName) return byName;
  }

  return null;
}

/**
 * Check if a card has a registered effect (by ID or name).
 */
export function hasEffect(cardId: string, cardName?: string): boolean {
  if (registry.has(cardId)) return true;
  if (cardName && nameRegistry.has(cardName)) return true;
  return false;
}

/**
 * Get the source layer that registered an effect for this card.
 * Checks ID first, then falls back to name (same priority as getEffect).
 * @returns The source layer, or null if no effect is registered.
 */
export function getEffectSource(cardId: string, cardName?: string): EffectSourceLayer | null {
  const byId = sourceByIdRegistry.get(cardId);
  if (byId) return byId;

  if (cardName) {
    const byName = sourceByNameRegistry.get(cardName);
    if (byName) return byName;
  }

  return null;
}

// ─── Diagnostics ───

/**
 * Get the number of ID-registered effects.
 */
export function getRegisteredCount(): number {
  return registry.size;
}

/**
 * Get the number of name-registered effects.
 */
export function getNameRegisteredCount(): number {
  return nameRegistry.size;
}

/**
 * Clear all registered effects (useful for testing).
 */
export function clearRegistry(): void {
  registry.clear();
  nameRegistry.clear();
  sourceByIdRegistry.clear();
  sourceByNameRegistry.clear();
}

/**
 * Get all registered card IDs (useful for diagnostics).
 */
export function getRegisteredCardIds(): string[] {
  return Array.from(registry.keys());
}

/**
 * Get all registered card names (useful for diagnostics).
 */
export function getRegisteredCardNames(): string[] {
  return Array.from(nameRegistry.keys());
}
