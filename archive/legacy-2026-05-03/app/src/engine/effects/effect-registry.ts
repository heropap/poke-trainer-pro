/**
 * Card Effect Registry
 *
 * Central registry for all card effects. Cards register their effects
 * by cardId (primary) or by cardName (fallback for covering all reprints).
 *
 * Lookup priority: ID match first → name match second.
 *
 * Source layer tracking with built-in priority guard:
 *   L1   = ID-based hand-written effects (highest priority, weight 100)
 *   L1.5 = JSON schema-compiled effects (weight 90)
 *   L2   = Name-based hand-written effects (weight 80)
 *   L2.5 = V2 / LLM compiled rules (weight 70)
 *   L3   = Text-parser from ryuu-play metadata (weight 30)
 *   L4   = Text-parser from UI Card data (weight 20)
 *
 * When a source is provided, higher-priority registrations are never
 * overwritten by lower-priority ones. Overwrite attempts are logged
 * for diagnostics via getEffectMeta().
 *
 * Usage:
 *   registerEffect({ cardId: "sv1-25", attacks: [...] }, "L1");
 *   registerByName({ cardId: "name:Iono", cardName: "Iono", trainer: {...} }, "L2");
 *   const effect = getEffect("sv2-185", "Iono"); // finds by name
 *   const source = getEffectSource("sv2-185", "Iono"); // → "L2"
 *   const meta = getEffectMeta("sv2-185", "Iono"); // detailed source info
 */

import { CardEffectDef } from "./effect-types";

/** Effect source layer identifier
 * L1   = ID-based hand-written effects (highest priority)
 * L1.5 = JSON schema-compiled effects (visual editor / custom-effects.json)
 * L2   = Name-based hand-written effects
 * L2.5 = V2 semantic-extracted + compiled rules
 * L3   = Text-parser from ryuu-play metadata
 * L4   = Text-parser from UI Card data
 */
export type EffectSourceLayer = "L1" | "L1.5" | "L2" | "L2.5" | "L3" | "L4";

/** Numeric priority for each source layer (higher = more authoritative) */
const LAYER_PRIORITY: Record<EffectSourceLayer, number> = {
  "L1": 100,
  "L1.5": 90,
  "L2": 80,
  "L2.5": 70,
  "L3": 30,
  "L4": 20,
};

/** Record of a blocked overwrite attempt */
export interface OverwriteRecord {
  /** The source that tried to register */
  attemptedSource: EffectSourceLayer;
  /** The source that was already registered (and won) */
  existingSource: EffectSourceLayer;
  /** When the attempt happened (registration order counter) */
  at: number;
}

/** Metadata about how an effect was resolved */
export interface EffectMeta {
  /** The source layer that provided this effect */
  source: EffectSourceLayer;
  /** Whether the effect was matched by 'id' or 'name' fallback */
  resolvedBy: "id" | "name";
  /** Any overwrite attempts that were blocked by the priority guard */
  overwriteLog: OverwriteRecord[];
}

/** Primary storage: cardId → CardEffectDef */
const registry = new Map<string, CardEffectDef>();

/** Secondary storage: cardName → CardEffectDef (covers all reprints) */
const nameRegistry = new Map<string, CardEffectDef>();

/** Source tracking: cardId → EffectSourceLayer */
const sourceByIdRegistry = new Map<string, EffectSourceLayer>();

/** Source tracking: cardName → EffectSourceLayer */
const sourceByNameRegistry = new Map<string, EffectSourceLayer>();

/** Overwrite log: key → blocked attempts (for diagnostics) */
const overwriteLogById = new Map<string, OverwriteRecord[]>();
const overwriteLogByName = new Map<string, OverwriteRecord[]>();

/** Monotonic counter for ordering overwrite records */
let registrationCounter = 0;

// ─── Priority helpers ───

function getLayerPriority(layer: EffectSourceLayer): number {
  return LAYER_PRIORITY[layer] ?? 0;
}

/**
 * Check if a new source should be allowed to overwrite an existing one.
 * Returns true only if the new source has strictly higher priority.
 * Same-priority registrations are blocked (first-come-wins within a layer).
 */
function shouldOverwrite(existing: EffectSourceLayer, incoming: EffectSourceLayer): boolean {
  return getLayerPriority(incoming) > getLayerPriority(existing);
}

// ─── ID-based registration ───

/**
 * Register a single card effect definition by ID.
 * If a higher-priority source already registered this ID, the registration
 * is silently skipped and logged in the overwrite log.
 *
 * @param options.force If true, bypass the priority guard and always register
 * @returns true if the effect was registered, false if blocked by priority guard
 */
export function registerEffect(def: CardEffectDef, source?: EffectSourceLayer, options?: { force?: boolean }): boolean {
  const existingSource = sourceByIdRegistry.get(def.cardId);

  if (!options?.force && source && existingSource) {
    if (!shouldOverwrite(existingSource, source)) {
      // Blocked — log for diagnostics
      const log = overwriteLogById.get(def.cardId) || [];
      log.push({ attemptedSource: source, existingSource, at: registrationCounter++ });
      overwriteLogById.set(def.cardId, log);
      return false;
    }
  }

  registry.set(def.cardId, def);
  if (source) sourceByIdRegistry.set(def.cardId, source);
  return true;
}

/**
 * Register multiple card effect definitions at once (by ID).
 * @returns number of effects actually registered (may be less than input if blocked)
 */
export function registerAll(defs: CardEffectDef[], source?: EffectSourceLayer): number {
  let count = 0;
  for (const def of defs) {
    if (registerEffect(def, source)) count++;
  }
  return count;
}

// ─── Name-based registration ───

/**
 * Register a card effect by name. All reprints of this card name
 * will automatically get this effect via the fallback lookup.
 * If a higher-priority source already registered this name, the registration
 * is silently skipped and logged in the overwrite log.
 *
 * @returns true if the effect was registered, false if blocked by priority guard
 */
export function registerByName(def: CardEffectDef & { cardName: string }, source?: EffectSourceLayer, options?: { force?: boolean }): boolean {
  const existingSource = sourceByNameRegistry.get(def.cardName);

  if (!options?.force && source && existingSource) {
    if (!shouldOverwrite(existingSource, source)) {
      const log = overwriteLogByName.get(def.cardName) || [];
      log.push({ attemptedSource: source, existingSource, at: registrationCounter++ });
      overwriteLogByName.set(def.cardName, log);
      return false;
    }
  }

  nameRegistry.set(def.cardName, def);
  if (source) sourceByNameRegistry.set(def.cardName, source);
  return true;
}

/**
 * Register multiple card effects by name.
 * @returns number of effects actually registered (may be less than input if blocked)
 */
export function registerAllByName(defs: (CardEffectDef & { cardName: string })[], source?: EffectSourceLayer): number {
  let count = 0;
  for (const def of defs) {
    if (registerByName(def, source)) count++;
  }
  return count;
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
 * Get detailed metadata about how an effect was resolved for a card.
 * Includes the source layer, how it was matched, and any blocked overwrite attempts.
 *
 * @returns Metadata or null if no effect is registered for this card.
 */
export function getEffectMeta(cardId: string, cardName?: string): EffectMeta | null {
  // Check ID first (same priority as getEffect)
  const idSource = sourceByIdRegistry.get(cardId);
  if (idSource) {
    return {
      source: idSource,
      resolvedBy: "id",
      overwriteLog: overwriteLogById.get(cardId) || [],
    };
  }

  // Fallback to name
  if (cardName) {
    const nameSource = sourceByNameRegistry.get(cardName);
    if (nameSource) {
      return {
        source: nameSource,
        resolvedBy: "name",
        overwriteLog: overwriteLogByName.get(cardName) || [],
      };
    }
  }

  return null;
}

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
  overwriteLogById.clear();
  overwriteLogByName.clear();
  registrationCounter = 0;
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

/**
 * Get the numeric priority weight for a source layer.
 * Useful for external code that needs to compare layers.
 */
export function getSourcePriority(layer: EffectSourceLayer): number {
  return getLayerPriority(layer);
}
