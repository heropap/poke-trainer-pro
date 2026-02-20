/**
 * Rule Loader — Loads and registers CTA rule definitions
 *
 * Extension of schema-loader.ts for the new CTA rule system.
 * Registers compiled rules at L1.5 in the effect registry.
 *
 * Pipeline:
 *   CardRuleDef[] (JSON) → validateRule() → compileRule() → registerEffect()
 *
 * This file provides the integration bridge between the CTA rule system
 * and the existing 5-layer effect registry.
 */

import { CardRuleDef } from "./card-rule-def";
import { validateRule, CardData } from "./rule-validator";
import { compileRule, CompilerOptions } from "./rule-compiler";
import { ModifierPipeline } from "./modifier-pipeline";
import { EventHookRegistry } from "./event-hooks";
import {
  registerEffect,
  registerByName,
  hasEffect,
  EffectSourceLayer,
} from "../effects/effect-registry";

const RULE_LAYER: EffectSourceLayer = "L1.5";

// ═══════════════════════════════════════════════════════
// Load Result
// ═══════════════════════════════════════════════════════

export interface RuleLoadResult {
  /** Number of successfully validated, compiled, and registered rules */
  registered: number;
  /** Number of skipped (already registered at higher priority) */
  skipped: number;
  /** Validation failures */
  validationErrors: Array<{
    cardId: string;
    cardName: string;
    errors: string[];
    warnings: string[];
  }>;
  /** Compilation failures */
  compilationErrors: Array<{
    cardId: string;
    cardName: string;
    error: string;
  }>;
  /** Successfully loaded card IDs */
  loadedCardIds: string[];
}

// ═══════════════════════════════════════════════════════
// Load Options
// ═══════════════════════════════════════════════════════

export interface RuleLoadOptions {
  /** Force registration even if card already has L1/L2 effect */
  force?: boolean;
  /** Modifier pipeline instance for passive abilities */
  modifierPipeline?: ModifierPipeline;
  /** Event hook registry for triggered abilities */
  eventHookRegistry?: EventHookRegistry;
  /** Card database for cross-validation */
  cardDatabase?: Map<string, CardData>;
  /** Skip validation (for trusted/pre-validated input) */
  skipValidation?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Load and register CTA rule definitions.
 *
 * @param rules - Array of CardRuleDef JSON objects
 * @param options - Load options
 * @returns Load result with statistics and errors
 */
export function loadRuleEffects(
  rules: CardRuleDef[],
  options?: RuleLoadOptions,
): RuleLoadResult {
  const result: RuleLoadResult = {
    registered: 0,
    skipped: 0,
    validationErrors: [],
    compilationErrors: [],
    loadedCardIds: [],
  };

  const compilerOptions: CompilerOptions = {
    modifierPipeline: options?.modifierPipeline,
    eventHookRegistry: options?.eventHookRegistry,
    verbose: options?.verbose,
  };

  for (const rule of rules) {
    // ─── Step 1: Skip if already registered ───
    if (!options?.force && hasEffect(rule.cardId, rule.cardName)) {
      result.skipped++;
      if (options?.verbose) {
        console.log(`[RuleLoader] Skipped ${rule.cardName} (${rule.cardId}): already registered`);
      }
      continue;
    }

    // ─── Step 2: Validate ───
    if (!options?.skipValidation) {
      const cardData = options?.cardDatabase?.get(rule.cardId);
      const validation = validateRule(rule, cardData);
      if (!validation.valid) {
        result.validationErrors.push({
          cardId: rule.cardId,
          cardName: rule.cardName,
          errors: [...validation.structuralErrors, ...validation.semanticErrors],
          warnings: validation.warnings,
        });
        if (options?.verbose) {
          console.warn(
            `[RuleLoader] Validation failed for ${rule.cardName} (${rule.cardId}):`,
            validation.structuralErrors,
            validation.semanticErrors,
          );
        }
        continue;
      }

      // Log warnings
      if (validation.warnings.length > 0 && options?.verbose) {
        console.warn(
          `[RuleLoader] Warnings for ${rule.cardName} (${rule.cardId}):`,
          validation.warnings,
        );
      }
    }

    // ─── Step 3: Compile ───
    try {
      const compiled = compileRule(rule, compilerOptions);
      if (!compiled) {
        result.compilationErrors.push({
          cardId: rule.cardId,
          cardName: rule.cardName,
          error: "Rule produced no compilable effects",
        });
        continue;
      }

      // ─── Step 4: Register ───
      // Register by ID
      registerEffect(
        { ...compiled, cardId: rule.cardId },
        RULE_LAYER,
      );

      // Also register by name for reprint coverage
      registerByName(
        { ...compiled, cardId: rule.cardId, cardName: rule.cardName },
        RULE_LAYER,
      );

      result.registered++;
      result.loadedCardIds.push(rule.cardId);

      if (options?.verbose) {
        console.log(`[RuleLoader] Registered ${rule.cardName} (${rule.cardId})`);
      }
    } catch (err) {
      result.compilationErrors.push({
        cardId: rule.cardId,
        cardName: rule.cardName,
        error: (err as Error).message,
      });
      if (options?.verbose) {
        console.error(
          `[RuleLoader] Compilation error for ${rule.cardName} (${rule.cardId}):`,
          err,
        );
      }
    }
  }

  // Summary log
  console.log(
    `[RuleLoader] Loaded ${result.registered} CTA rules ` +
    `(${result.skipped} skipped, ` +
    `${result.validationErrors.length} validation errors, ` +
    `${result.compilationErrors.length} compilation errors)`,
  );

  return result;
}

/**
 * Load CTA rules from a raw JSON source (e.g., file content).
 * Parses JSON, validates, compiles, and registers.
 */
export function loadRuleEffectsFromJson(
  jsonContent: string,
  options?: RuleLoadOptions,
): RuleLoadResult {
  try {
    const parsed = JSON.parse(jsonContent);
    const rules: CardRuleDef[] = Array.isArray(parsed) ? parsed : [parsed];
    return loadRuleEffects(rules, options);
  } catch (err) {
    return {
      registered: 0,
      skipped: 0,
      validationErrors: [],
      compilationErrors: [{
        cardId: "unknown",
        cardName: "unknown",
        error: `JSON parse error: ${(err as Error).message}`,
      }],
      loadedCardIds: [],
    };
  }
}

/**
 * Load CTA rules from the bundled card-rules directory.
 * Loads both hand-written rules (index.json) and generated rules (generated-rules.json).
 * Hand-written rules are loaded first and take priority at L1.5.
 */
export function loadBundledRules(options?: RuleLoadOptions): RuleLoadResult {
  const combined: RuleLoadResult = {
    registered: 0, skipped: 0,
    validationErrors: [], compilationErrors: [], loadedCardIds: [],
  };

  // 1. Load hand-written exemplar rules (highest priority)
  try {
    const data = require("@/data/card-rules/index.json") as CardRuleDef[];
    if (Array.isArray(data) && data.length > 0) {
      const r = loadRuleEffects(data, options);
      combined.registered += r.registered;
      combined.skipped += r.skipped;
      combined.validationErrors.push(...r.validationErrors);
      combined.compilationErrors.push(...r.compilationErrors);
      combined.loadedCardIds.push(...r.loadedCardIds);
    }
  } catch { /* not an error */ }

  // 2. Load auto-generated rules (fills gaps not covered by hand-written)
  try {
    const data = require("@/data/card-rules/generated-rules.json") as CardRuleDef[];
    if (Array.isArray(data) && data.length > 0) {
      const r = loadRuleEffects(data, options);
      combined.registered += r.registered;
      combined.skipped += r.skipped;
      combined.validationErrors.push(...r.validationErrors);
      combined.compilationErrors.push(...r.compilationErrors);
      combined.loadedCardIds.push(...r.loadedCardIds);
    }
  } catch { /* not an error */ }

  return combined;
}
