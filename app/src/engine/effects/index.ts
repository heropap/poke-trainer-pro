/**
 * Card Effects System - Main Entry Point
 *
 * Exports all effect system components and auto-registers initial card effects.
 *
 * 7-Layer Priority Chain:
 *   Layer 1:   ID-based hand-written effects (highest priority)
 *   Layer 1.5: JSON schema-compiled effects (visual editor / custom-effects.json)
 *   Layer 2:   Name-based hand-written effects
 *   Layer 2.5: V2 semantic-extracted + compiled rules (~5,300 cards)
 *   Layer 3:   Text-parser from ryuu-play metadata (ryuu card text is more standardized)
 *   Layer 4:   Text-parser from UI Card data (_index.json)
 *   Layer 5:   No effect (silent skip)
 *
 * Usage:
 *   import { initializeEffects } from "@/engine/effects";
 *   initializeEffects(cards); // Call once at app startup
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
  getEffectSource,
  getRegisteredCount,
  getNameRegisteredCount,
  clearRegistry,
  getRegisteredCardIds,
  getRegisteredCardNames,
} from "./effect-registry";
export type { EffectSourceLayer } from "./effect-registry";

// Re-export context
export { createEffectContext } from "./effect-context";

// Re-export coin system
export { flipCoin, flipCoins, setRandomFn } from "./coin";

// Re-export status effects
export { processBetweenTurns } from "./status-effects";

// Re-export text parser
export { parseCardEffects, autoRegisterTextEffects } from "./text-parser";

// Re-export schema system
export { compileSchema } from "./schema-compiler";
export { loadSchemaEffects, loadCustomEffects, validateSchema } from "./schema-loader";
export type { SchemaLoadResult } from "./schema-loader";
export type {
  EffectSchemaDefinition,
  AttackPatternType,
  TrainerPatternType,
  AbilityPatternType,
  AttackSchema,
  AbilitySchema,
  TrainerSchema,
} from "./effect-schema";

// Re-export pattern catalog
export {
  allPatterns,
  attackPatterns,
  trainerPatterns,
  abilityPatterns,
  getPatternsByCategory,
  getPatternsBySubCategory,
  getPatternById,
  getSubCategoryLabels,
  getPatternCounts,
} from "./pattern-catalog";
export type {
  PatternEntry,
  PatternCategory,
  ParamDef,
  ParamType,
} from "./pattern-catalog";

// Re-export V2 loader
export { loadV2Effects, loadV2EffectsFromArray } from "./v2-loader";
export type { V2LoadResult } from "./v2-loader";

// Re-export ryuu metadata extractor
export {
  extractAllRyuuMetadata,
  extractRyuuAsUICards,
  autoRegisterFromRyuuMeta,
  extractCardMeta,
  metaToUICard,
} from "./ryuu-metadata-extractor";
export type { RyuuCardMeta } from "./ryuu-metadata-extractor";

// Re-export coverage report
export {
  generateCoverageReport,
  formatCoverageReport,
} from "./coverage-report";
export type { CoverageStats, CoverageReport, UncoveredCard } from "./coverage-report";

// Card implementations
import { trainerEffects, trainerNameEffects } from "./cards/trainers";
import { attackEffects } from "./cards/attacks";
import { stadiumNameEffects } from "./cards/stadiums";
import { metaAttackEffects } from "./cards/meta-attacks";
import { expandedTrainerEffects } from "./cards/trainers-expanded";
import { svAbilityEffects } from "./cards/sv-abilities";
import { registerAll, registerAllByName } from "./effect-registry";
import { autoRegisterTextEffects } from "./text-parser";
import { loadCustomEffects } from "./schema-loader";
import { loadV2Effects } from "./v2-loader";
import { Card } from "@/types/card";

/** All built-in card effects (ID-based) */
const allEffects = [...trainerEffects, ...attackEffects];

/**
 * Initialize the effect system by registering all built-in card effects.
 * Call this once at app startup.
 *
 * Follows the 7-layer priority chain:
 *   Layer 1:   registerAll(allEffects) — ID-based hand-written
 *   Layer 1.5: loadCustomEffects() — JSON schema-compiled (visual editor)
 *   Layer 2:   registerAllByName(trainerNameEffects, ...) — Name-based hand-written
 *   Layer 2.5: loadV2Effects() — V2 semantic-extracted + compiled rules (~5,300 cards)
 *   Layer 3:   autoRegisterFromRyuuMeta() — Text-parser on ryuu-play metadata
 *   Layer 4:   autoRegisterTextEffects(cards) — Text-parser on UI card data
 *   Layer 5:   Implicit — cards with no registered effect are silently skipped
 *
 * @param cards Optional array of Card data from _index.json — used for Layer 4.
 * @param options.skipRyuuMeta If true, skip Layer 3 (useful for testing)
 */
export function initializeEffects(
  cards?: Card[],
  options?: { skipRyuuMeta?: boolean; skipV2?: boolean }
): void {
  // Layer 1: ID-based hand-written effects
  registerAll(allEffects, "L1");

  // Layer 1.5: JSON schema-compiled effects (visual editor / custom-effects.json)
  loadCustomEffects();

  // Layer 2: Name-based hand-written effects
  registerAllByName(trainerNameEffects, "L2");
  registerAllByName(stadiumNameEffects, "L2");
  registerAllByName(metaAttackEffects, "L2");
  registerAllByName(expandedTrainerEffects, "L2");
  registerAllByName(svAbilityEffects, "L2");

  // Layer 2.5: V2 semantic-extracted + compiled rules
  // (covers ~5,300 cards from bottom-up ontology extraction)
  if (!options?.skipV2) {
    try {
      loadV2Effects();
    } catch (err) {
      console.warn("[Effects] Could not load V2 rules:", (err as Error).message);
    }
  }

  // Layer 3: Text-parser from ryuu-play metadata
  // (ryuu card text is often more standardized than _index.json text)
  if (!options?.skipRyuuMeta) {
    try {
      const { autoRegisterFromRyuuMeta } = require("./ryuu-metadata-extractor") as {
        autoRegisterFromRyuuMeta: () => { registered: number; skipped: number; total: number };
      };
      autoRegisterFromRyuuMeta();
    } catch (err) {
      // Silently skip if ryuu-play sets are not available
      console.warn("[Effects] Could not load ryuu-play metadata:", (err as Error).message);
    }
  }

  // Layer 4: Text-parser from UI Card data (_index.json)
  if (cards && cards.length > 0) {
    autoRegisterTextEffects(cards);
  }
}

/**
 * Get count of all available built-in effects (Layer 1 + Layer 2).
 */
export function getBuiltInEffectCount(): number {
  return (
    allEffects.length +
    trainerNameEffects.length +
    stadiumNameEffects.length +
    metaAttackEffects.length +
    expandedTrainerEffects.length +
    svAbilityEffects.length
  );
}
