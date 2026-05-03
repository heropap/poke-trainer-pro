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

// Re-export LLM pipeline loader (L2.5)
export { loadCompiledEffects, loadCompiledEffectsFromFile } from "../llm-pipeline/effect-loader";

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
import { vstarPowerEffects } from "./cards/vstar-powers";
import { aceSpecEffects } from "./cards/ace-spec-trainers";
import { metaAttackersW3Effects } from "./cards/meta-attackers-w3";
import { metaTrainersW4Effects } from "./cards/meta-trainers-w4";
import { lostZoneW5Effects } from "./cards/lost-zone-w5";
import { fireCoreW6Effects } from "./cards/fire-core-w6";
import { psychicCoreW7Effects } from "./cards/psychic-core-w7";
import { waterCoreW8Effects } from "./cards/water-core-w8";
import { electricFutureW9Effects } from "./cards/electric-future-w9";
import { fightingDarkW10Effects } from "./cards/fighting-dark-w10";
import { dragonMetalW11Effects } from "./cards/dragon-metal-w11";
import { grassLugiaW12Effects } from "./cards/grass-lugia-w12";
import { trainersW13Effects } from "./cards/trainers-w13";
import { competitiveW14Effects } from "./cards/competitive-w14";
import { wave15HStandardEffects } from "./cards/wave15-h-standard";
import { wave16IStandardEffects } from "./cards/wave16-i-standard";
import { wave17ExAttackersEffects } from "./cards/wave17-ex-attackers";
import { wave18AbilitiesBatchEffects } from "./cards/wave18-abilities-batch";
import { wave19TrainersExtendedEffects } from "./cards/wave19-trainers-extended";
import { wave20BasicsBatchEffects } from "./cards/wave20-basics-batch";
import { wave21EeveelutionsEffects } from "./cards/wave21-eeveelutions";
import { wave22TechCardsEffects } from "./cards/wave22-tech-cards";
import { wave23StadiumBatchEffects } from "./cards/wave23-stadium-batch";
import { wave24SupportersBatchEffects } from "./cards/wave24-supporters-batch";
import { wave25RemainingAttacksEffects } from "./cards/wave25-remaining-attacks";
import { wave26FinalTrainersEffects } from "./cards/wave26-final-trainers";
import { wave27FinalPokemonEnergyEffects } from "./cards/wave27-final-pokemon-energy";
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
  options?: { skipRyuuMeta?: boolean; skipV2?: boolean; skipLLMCache?: boolean }
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
  registerAllByName(vstarPowerEffects, "L2");
  registerAllByName(aceSpecEffects, "L2");
  registerAllByName(metaAttackersW3Effects, "L2");
  registerAllByName(metaTrainersW4Effects, "L2");
  registerAllByName(lostZoneW5Effects, "L2");
  registerAllByName(fireCoreW6Effects, "L2");
  registerAllByName(psychicCoreW7Effects, "L2");
  registerAllByName(waterCoreW8Effects, "L2");
  registerAllByName(electricFutureW9Effects, "L2");
  registerAllByName(fightingDarkW10Effects, "L2");
  registerAllByName(dragonMetalW11Effects, "L2");
  registerAllByName(grassLugiaW12Effects, "L2");
  registerAllByName(trainersW13Effects, "L2");
  registerAllByName(competitiveW14Effects, "L2");
  registerAllByName(wave15HStandardEffects, "L2");
  registerAllByName(wave16IStandardEffects, "L2");
  registerAllByName(wave17ExAttackersEffects, "L2");
  registerAllByName(wave18AbilitiesBatchEffects, "L2");
  registerAllByName(wave19TrainersExtendedEffects, "L2");
  registerAllByName(wave20BasicsBatchEffects, "L2");
  registerAllByName(wave21EeveelutionsEffects, "L2");
  registerAllByName(wave22TechCardsEffects, "L2");
  registerAllByName(wave23StadiumBatchEffects, "L2");
  registerAllByName(wave24SupportersBatchEffects, "L2");
  registerAllByName(wave25RemainingAttacksEffects, "L2");
  registerAllByName(wave26FinalTrainersEffects, "L2");
  registerAllByName(wave27FinalPokemonEnergyEffects, "L2");

  // Layer 2.5a: V2 semantic-extracted + compiled rules
  // (covers ~5,300 cards from bottom-up ontology extraction)
  if (!options?.skipV2) {
    try {
      loadV2Effects();
    } catch (err) {
      console.warn("[Effects] Could not load V2 rules:", (err as Error).message);
    }
  }

  // Layer 2.5b: LLM pipeline compiled effects cache
  // (covers MVP deck cards parsed by semantic-parser + action-compiler)
  if (!options?.skipLLMCache) {
    try {
      const { loadCompiledEffectsFromFile } = require("../llm-pipeline/effect-loader") as {
        loadCompiledEffectsFromFile: (path?: string) => { loaded: number; skipped: number; merged: number; errors: number };
      };
      loadCompiledEffectsFromFile();
    } catch (err) {
      // Silently skip if cache not available
      console.warn("[Effects] Could not load LLM pipeline cache:", (err as Error).message);
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
    svAbilityEffects.length +
    vstarPowerEffects.length +
    aceSpecEffects.length +
    metaAttackersW3Effects.length +
    metaTrainersW4Effects.length +
    lostZoneW5Effects.length +
    fireCoreW6Effects.length +
    psychicCoreW7Effects.length +
    waterCoreW8Effects.length +
    electricFutureW9Effects.length +
    fightingDarkW10Effects.length +
    dragonMetalW11Effects.length +
    grassLugiaW12Effects.length +
    trainersW13Effects.length +
    competitiveW14Effects.length +
    wave15HStandardEffects.length +
    wave16IStandardEffects.length +
    wave17ExAttackersEffects.length +
    wave18AbilitiesBatchEffects.length +
    wave19TrainersExtendedEffects.length +
    wave20BasicsBatchEffects.length +
    wave21EeveelutionsEffects.length +
    wave22TechCardsEffects.length +
    wave23StadiumBatchEffects.length +
    wave24SupportersBatchEffects.length +
    wave25RemainingAttacksEffects.length +
    wave26FinalTrainersEffects.length +
    wave27FinalPokemonEnergyEffects.length
  );
}
