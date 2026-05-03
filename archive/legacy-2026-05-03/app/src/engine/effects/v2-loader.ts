/**
 * V2 Rule Loader — loads card-rules-v2.json and registers compiled effects at L2.5
 *
 * L2.5 sits between hand-written effects (L1/L1.5/L2) and text-parsers (L3/L4):
 *   L1   → ID-based hand-written (highest priority)
 *   L1.5 → JSON schema-compiled (visual editor)
 *   L2   → Name-based hand-written
 *   L2.5 → V2 semantic-extracted + compiled (this loader)
 *   L3   → ryuu-play metadata text-parse
 *   L4   → UI card data text-parse
 *
 * V2 effects are skipped for cards that already have a higher-priority registration,
 * ensuring hand-written effects always take precedence.
 */

import { compileAllV2, CardRuleV2Entry } from "../rules/rule-compiler-v2";
import { registerEffect, registerByName, getEffectSource, getSourcePriority, EffectSourceLayer } from "./effect-registry";
import { CardEffectDef } from "./effect-types";

const V2_LAYER: EffectSourceLayer = "L2.5";

export interface V2LoadResult {
  /** Total cards in card-rules-v2.json */
  total: number;
  /** Successfully compiled CardEffectDefs */
  compiled: number;
  /** Registered by ID (new coverage) */
  registeredById: number;
  /** Registered by name (new coverage) */
  registeredByName: number;
  /** Skipped because already registered at higher priority */
  skippedHigherPriority: number;
  /** Compilation errors */
  errors: number;
}

/**
 * Load card-rules-v2.json, compile all cards, and register at L2.5.
 * Cards already registered at L1/L1.5/L2 are skipped.
 *
 * @param options.force If true, register even if already exists at higher priority
 */
export function loadV2Effects(options?: { force?: boolean }): V2LoadResult {
  const result: V2LoadResult = {
    total: 0,
    compiled: 0,
    registeredById: 0,
    registeredByName: 0,
    skippedHigherPriority: 0,
    errors: 0,
  };

  let allCards: CardRuleV2Entry[];
  try {
    // Use require for bundler compatibility (same pattern as schema-loader.ts)
    allCards = require("@/data/card-rules-v2.json") as CardRuleV2Entry[];
  } catch {
    console.warn("[V2Loader] card-rules-v2.json not found, skipping V2 layer");
    return result;
  }

  result.total = allCards.length;

  // Compile all cards
  let defs: CardEffectDef[];
  try {
    defs = compileAllV2(allCards);
  } catch (err) {
    console.error("[V2Loader] Fatal compilation error:", (err as Error).message);
    result.errors = allCards.length;
    return result;
  }

  result.compiled = defs.length;

  // Pre-pass: build name → Set<cardId> to detect ambiguous reprints.
  // Cards whose name maps to multiple IDs will NOT get a shared name
  // registration — callers must match by exact cardId instead.
  const nameToIds = new Map<string, Set<string>>();
  for (const def of defs) {
    if (def.cardName) {
      if (!nameToIds.has(def.cardName)) nameToIds.set(def.cardName, new Set());
      nameToIds.get(def.cardName)!.add(def.cardId);
    }
  }

  // Register each compiled def.
  // The registry's built-in priority guard handles same-key overwrites,
  // but we also need the cross-check: a name-based higher-priority registration
  // should block the entire card (including ID registration) to keep hand-written
  // L2 name-based rules authoritative for all prints.
  const forceOpt = options?.force ? { force: true } : undefined;

  for (const def of defs) {
    if (!options?.force) {
      // Cross-check: if the card name has a higher-priority name-based registration,
      // skip this card entirely (not just the name registration)
      const existingNameSource = def.cardName ? getEffectSource("", def.cardName) : null;
      if (existingNameSource && existingNameSource !== V2_LAYER &&
          getSourcePriority(existingNameSource) > getSourcePriority(V2_LAYER)) {
        result.skippedHigherPriority++;
        continue;
      }
    }

    // Register by ID — registry guards against overwriting higher-priority ID sources
    const idRegistered = registerEffect(def, V2_LAYER, forceOpt);
    if (!idRegistered) {
      result.skippedHigherPriority++;
      continue;
    }
    result.registeredById++;

    // Register by name only if this is the sole cardId for this name.
    // Ambiguous reprints (same name, different ID, possibly different text)
    // stay ID-only to avoid cross-print rule contamination.
    if (def.cardName && nameToIds.get(def.cardName)?.size === 1) {
      const nameRegistered = registerByName(
        { ...def, cardName: def.cardName } as CardEffectDef & { cardName: string },
        V2_LAYER,
        forceOpt
      );
      if (nameRegistered) result.registeredByName++;
    }
  }

  console.log(
    `[V2Loader] Registered ${result.registeredById} effects by ID, ` +
    `${result.registeredByName} by name ` +
    `(${result.skippedHigherPriority} skipped, ${result.compiled} compiled from ${result.total} cards)`
  );

  return result;
}

/**
 * Load and register V2 effects from a pre-loaded array (useful for testing).
 */
export function loadV2EffectsFromArray(
  cards: CardRuleV2Entry[],
  options?: { force?: boolean }
): V2LoadResult {
  const result: V2LoadResult = {
    total: cards.length,
    compiled: 0,
    registeredById: 0,
    registeredByName: 0,
    skippedHigherPriority: 0,
    errors: 0,
  };

  const defs = compileAllV2(cards);
  result.compiled = defs.length;

  // Pre-pass: detect ambiguous reprints (same name, multiple IDs)
  const nameToIds = new Map<string, Set<string>>();
  for (const def of defs) {
    if (def.cardName) {
      if (!nameToIds.has(def.cardName)) nameToIds.set(def.cardName, new Set());
      nameToIds.get(def.cardName)!.add(def.cardId);
    }
  }

  const forceOpt2 = options?.force ? { force: true } : undefined;

  for (const def of defs) {
    if (!options?.force) {
      const existingNameSource = def.cardName ? getEffectSource("", def.cardName) : null;
      if (existingNameSource && existingNameSource !== V2_LAYER &&
          getSourcePriority(existingNameSource) > getSourcePriority(V2_LAYER)) {
        result.skippedHigherPriority++;
        continue;
      }
    }

    const idRegistered = registerEffect(def, V2_LAYER, forceOpt2);
    if (!idRegistered) {
      result.skippedHigherPriority++;
      continue;
    }
    result.registeredById++;

    // Only register by name for unambiguous (unique-name) cards
    if (def.cardName && nameToIds.get(def.cardName)?.size === 1) {
      const nameRegistered = registerByName(
        { ...def, cardName: def.cardName } as CardEffectDef & { cardName: string },
        V2_LAYER,
        forceOpt2
      );
      if (nameRegistered) result.registeredByName++;
    }
  }

  return result;
}
