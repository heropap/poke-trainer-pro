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
import { registerEffect, registerByName, hasEffect, EffectSourceLayer } from "./effect-registry";
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

  // Register each compiled def
  for (const def of defs) {
    // Check if this card is already registered at a higher-priority layer.
    // Check both by ID and by name — a hand-written name-based effect (L2) should
    // take precedence over a V2 compiled effect for the same card.
    if (!options?.force && (hasEffect(def.cardId) || (def.cardName && hasEffect("", def.cardName)))) {
      result.skippedHigherPriority++;
      continue;
    }

    // Register by ID (every unique cardId gets its own entry)
    registerEffect(def, V2_LAYER);
    result.registeredById++;

    // Also register by name for reprint coverage (first card with this name wins)
    if (def.cardName) {
      if (options?.force || !hasEffect("", def.cardName)) {
        registerByName(
          { ...def, cardName: def.cardName } as CardEffectDef & { cardName: string },
          V2_LAYER
        );
        result.registeredByName++;
      }
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

  for (const def of defs) {
    if (!options?.force && hasEffect(def.cardId)) {
      result.skippedHigherPriority++;
      continue;
    }

    registerEffect(def, V2_LAYER);
    result.registeredById++;

    if (def.cardName) {
      if (options?.force || !hasEffect("", def.cardName)) {
        registerByName(
          { ...def, cardName: def.cardName } as CardEffectDef & { cardName: string },
          V2_LAYER
        );
        result.registeredByName++;
      }
    }
  }

  return result;
}
