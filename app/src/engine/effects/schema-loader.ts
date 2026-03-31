/**
 * Schema Loader — loads and registers JSON-based effect definitions
 *
 * Reads EffectSchemaDefinition[] from JSON data (file, localStorage, or
 * passed directly) and compiles + registers them at L1.5 in the effect registry.
 *
 * L1.5 sits between hand-written (L1/L2) and text-parsed (L3/L4):
 *   L1  → ID-based hand-written (highest priority)
 *   L1.5→ JSON schema-compiled (this loader)
 *   L2  → Name-based hand-written
 *   L3  → ryuu-play metadata text-parse
 *   L4  → UI card data text-parse
 *
 * Usage:
 *   // From JSON array
 *   loadSchemaEffects(jsonArray);
 *
 *   // From bundled custom-effects.json
 *   loadCustomEffects();
 */

import { EffectSchemaDefinition } from "./effect-schema";
import { compileSchema } from "./schema-compiler";
import { registerEffect, registerByName, hasEffect, EffectSourceLayer } from "./effect-registry";

const SCHEMA_LAYER: EffectSourceLayer = "L1.5";

export interface SchemaLoadResult {
  /** Number of successfully compiled and registered effects */
  registered: number;
  /** Number of skipped definitions (already registered at higher priority or compile failed) */
  skipped: number;
  /** Errors encountered during compilation */
  errors: Array<{ cardName: string; error: string }>;
}

/**
 * Load and register effect definitions from an array of EffectSchemaDefinition.
 *
 * Each definition is compiled via compileSchema() and registered at L1.5.
 * Definitions for cards already registered at L1 or L2 are skipped
 * (hand-written effects always take priority).
 *
 * @param definitions Array of JSON effect definitions
 * @param options.force If true, register even if already exists at L1/L2
 */
export function loadSchemaEffects(
  definitions: EffectSchemaDefinition[],
  options?: { force?: boolean }
): SchemaLoadResult {
  const result: SchemaLoadResult = { registered: 0, skipped: 0, errors: [] };

  for (const def of definitions) {
    try {
      // Skip if already registered at higher priority (unless forced)
      if (!options?.force && hasEffect(def.cardId || "", def.cardName)) {
        result.skipped++;
        continue;
      }

      const compiled = compileSchema(def);
      if (!compiled) {
        result.skipped++;
        continue;
      }

      // Register by ID if cardId is provided
      const forceOpt = options?.force ? { force: true } : undefined;
      if (def.cardId && def.cardId !== "__schema__") {
        registerEffect({ ...compiled, cardId: def.cardId }, SCHEMA_LAYER, forceOpt);
      }

      // Always register by name for reprint coverage
      registerByName(
        { ...compiled, cardId: def.cardId || `__schema__`, cardName: def.cardName },
        SCHEMA_LAYER,
        forceOpt
      );

      result.registered++;
    } catch (err) {
      result.errors.push({
        cardName: def.cardName,
        error: (err as Error).message,
      });
    }
  }

  if (result.registered > 0) {
    console.log(
      `[SchemaLoader] Registered ${result.registered} effects from JSON schema ` +
      `(${result.skipped} skipped, ${result.errors.length} errors)`
    );
  }

  return result;
}

/**
 * Load custom effects from the bundled custom-effects.json file.
 * This is called during initializeEffects() after L1/L2 but before L3/L4.
 */
export function loadCustomEffects(): SchemaLoadResult {
  try {
    // Dynamic require to handle missing file gracefully
    const data = require("@/data/custom-effects.json") as EffectSchemaDefinition[];
    if (!Array.isArray(data) || data.length === 0) {
      return { registered: 0, skipped: 0, errors: [] };
    }
    return loadSchemaEffects(data);
  } catch {
    // File doesn't exist or is invalid — not an error, just no custom effects
    return { registered: 0, skipped: 0, errors: [] };
  }
}

/**
 * Validate an EffectSchemaDefinition without registering it.
 * Returns compilation errors if any.
 */
export function validateSchema(
  definition: EffectSchemaDefinition
): { valid: boolean; error?: string } {
  try {
    const compiled = compileSchema(definition);
    if (!compiled) {
      return { valid: false, error: "Schema produced no compilable effects" };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
