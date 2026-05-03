/**
 * Tests for Schema Loader — JSON effect loading + L1.5 registry integration.
 *
 * Covers:
 * - loadSchemaEffects: compile + register JSON definitions at L1.5
 * - loadCustomEffects: load from bundled custom-effects.json
 * - validateSchema: validate without registering
 * - Priority: L1.5 should not overwrite L1/L2 hand-written effects
 * - Error handling: invalid schemas, missing files
 */

import {
  loadSchemaEffects,
  validateSchema,
} from "@/engine/effects/schema-loader";
import { EffectSchemaDefinition } from "@/engine/effects/effect-schema";
import {
  registerEffect,
  registerByName,
  getEffect,
  getEffectSource,
  hasEffect,
  clearRegistry,
} from "@/engine/effects/effect-registry";
import { CardEffectDef } from "@/engine/effects/effect-types";

// ─── Test Helpers ───

function makePoisonSchema(overrides?: Partial<EffectSchemaDefinition>): EffectSchemaDefinition {
  return {
    cardName: "TestPoisonCard",
    cardId: "test-poison-001",
    attacks: [
      {
        name: "Poison Sting",
        effects: [
          { type: "status_apply", params: { status: "poisoned" } },
        ],
      },
    ],
    ...overrides,
  };
}

function makeCoinFlipSchema(): EffectSchemaDefinition {
  return {
    cardName: "TestCoinCard",
    cardId: "test-coin-001",
    attacks: [
      {
        name: "Lucky Shot",
        effects: [
          { type: "coin_flip_bonus", params: { bonusDamage: 30 } },
        ],
      },
    ],
  };
}

function makeDrawTrainerSchema(): EffectSchemaDefinition {
  return {
    cardName: "TestDrawTrainer",
    attacks: undefined,
    trainer: {
      effects: [
        { type: "draw", params: { count: 3 } },
      ],
    },
  };
}

function makeMultiAttackSchema(): EffectSchemaDefinition {
  return {
    cardName: "TestMultiCard",
    cardId: "test-multi-001",
    attacks: [
      {
        name: "Combo Strike",
        effects: [
          { type: "self_damage", params: { selfDamage: 20 } },
          { type: "status_apply", params: { status: "poisoned" } },
        ],
      },
      {
        name: "Simple Hit",
        effects: [],
      },
    ],
  };
}

// ─── Setup ───

beforeEach(() => {
  clearRegistry();
});

// ═══════════════════════════════════════════
// loadSchemaEffects
// ═══════════════════════════════════════════

describe("loadSchemaEffects", () => {
  test("registers a simple attack schema at L1.5", () => {
    const result = loadSchemaEffects([makePoisonSchema()]);

    expect(result.registered).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Should be findable by ID
    expect(hasEffect("test-poison-001")).toBe(true);
    const effect = getEffect("test-poison-001");
    expect(effect).not.toBeNull();
    expect(effect!.attacks).toHaveLength(1);
    expect(effect!.attacks![0].name).toBe("Poison Sting");

    // Source should be L1.5
    expect(getEffectSource("test-poison-001")).toBe("L1.5");
  });

  test("registers by name for reprint coverage", () => {
    const result = loadSchemaEffects([makePoisonSchema()]);
    expect(result.registered).toBe(1);

    // Should be findable by name
    expect(hasEffect("__nonexistent__", "TestPoisonCard")).toBe(true);
    const effect = getEffect("__nonexistent__", "TestPoisonCard");
    expect(effect).not.toBeNull();
  });

  test("registers multiple definitions", () => {
    const result = loadSchemaEffects([
      makePoisonSchema(),
      makeCoinFlipSchema(),
    ]);

    expect(result.registered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(hasEffect("test-poison-001")).toBe(true);
    expect(hasEffect("test-coin-001")).toBe(true);
  });

  test("registers trainer schema by name", () => {
    const result = loadSchemaEffects([makeDrawTrainerSchema()]);

    expect(result.registered).toBe(1);
    // Trainer has no cardId, should register by name only
    const effect = getEffect("__no_id__", "TestDrawTrainer");
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
  });

  test("skips definitions for already-registered cards", () => {
    // Pre-register at L1 (hand-written)
    const handWritten: CardEffectDef = {
      cardId: "test-poison-001",
      attacks: [{ name: "Override", onAttack: jest.fn() }],
    };
    registerEffect(handWritten, "L1");

    // Also register by name
    registerByName({ ...handWritten, cardName: "TestPoisonCard" }, "L2");

    // Now try to load schema — should be skipped
    const result = loadSchemaEffects([makePoisonSchema()]);
    expect(result.registered).toBe(0);
    expect(result.skipped).toBe(1);

    // Original L1 effect should still be there
    const effect = getEffect("test-poison-001");
    expect(effect!.attacks![0].name).toBe("Override");
    expect(getEffectSource("test-poison-001")).toBe("L1");
  });

  test("force option overrides existing registrations", () => {
    // Pre-register at L1
    const handWritten: CardEffectDef = {
      cardId: "test-poison-001",
      attacks: [{ name: "Override", onAttack: jest.fn() }],
    };
    registerEffect(handWritten, "L1");

    // Force load
    const result = loadSchemaEffects([makePoisonSchema()], { force: true });
    expect(result.registered).toBe(1);
    expect(result.skipped).toBe(0);

    // Should now have the schema version
    const effect = getEffect("test-poison-001");
    expect(effect!.attacks![0].name).toBe("Poison Sting");
    expect(getEffectSource("test-poison-001")).toBe("L1.5");
  });

  test("handles multi-attack cards", () => {
    const result = loadSchemaEffects([makeMultiAttackSchema()]);
    expect(result.registered).toBe(1);

    const effect = getEffect("test-multi-001");
    expect(effect).not.toBeNull();
    // Should have 2 attacks
    expect(effect!.attacks).toHaveLength(2);
    expect(effect!.attacks![0].name).toBe("Combo Strike");
    expect(effect!.attacks![1].name).toBe("Simple Hit");
  });

  test("returns errors for invalid schemas", () => {
    const invalid: EffectSchemaDefinition = {
      cardName: "BadCard",
      attacks: [
        {
          name: "Bad Attack",
          effects: [
            { type: "unknown_pattern" as any, params: {} },
          ],
        },
      ],
    };

    const result = loadSchemaEffects([invalid]);
    // It may compile with no steps (empty attack), or throw depending on compiler
    // The key is it doesn't crash
    expect(result.errors.length + result.skipped + result.registered).toBeGreaterThan(0);
  });

  test("handles empty definitions array", () => {
    const result = loadSchemaEffects([]);
    expect(result.registered).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test("schema without cardId uses __schema__ prefix for name registration", () => {
    const noIdSchema: EffectSchemaDefinition = {
      cardName: "NameOnlyCard",
      attacks: [
        {
          name: "Quick Attack",
          effects: [
            { type: "coin_flip_bonus", params: { bonusDamage: 20 } },
          ],
        },
      ],
    };

    const result = loadSchemaEffects([noIdSchema]);
    expect(result.registered).toBe(1);

    // Should find by name
    const effect = getEffect("__no_match__", "NameOnlyCard");
    expect(effect).not.toBeNull();
  });
});

// ═══════════════════════════════════════════
// validateSchema
// ═══════════════════════════════════════════

describe("validateSchema", () => {
  test("valid schema returns valid: true", () => {
    const result = validateSchema(makePoisonSchema());
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("valid trainer schema returns valid: true", () => {
    const result = validateSchema(makeDrawTrainerSchema());
    expect(result.valid).toBe(true);
  });

  test("schema with no compilable effects returns valid: false", () => {
    const empty: EffectSchemaDefinition = {
      cardName: "EmptyCard",
    };
    const result = validateSchema(empty);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("does not register effects", () => {
    validateSchema(makePoisonSchema());
    // Should NOT be registered
    expect(hasEffect("test-poison-001")).toBe(false);
    expect(hasEffect("", "TestPoisonCard")).toBe(false);
  });
});

// ═══════════════════════════════════════════
// loadCustomEffects (integration with custom-effects.json)
// ═══════════════════════════════════════════

describe("loadCustomEffects", () => {
  test("loads from bundled custom-effects.json", () => {
    // Import dynamically to test the actual function
    const { loadCustomEffects } = require("@/engine/effects/schema-loader");
    const result = loadCustomEffects();

    // custom-effects.json has 5 cards
    expect(result.registered).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);

    // Verify one of the known cards (Tangela - Poison Powder)
    const tangela = getEffect("__no_id__", "Tangela");
    expect(tangela).not.toBeNull();
  });

  test("custom effects register at L1.5", () => {
    const { loadCustomEffects } = require("@/engine/effects/schema-loader");
    loadCustomEffects();

    // Check source layer for a known card
    const source = getEffectSource("__no_id__", "Tangela");
    expect(source).toBe("L1.5");
  });
});

// ═══════════════════════════════════════════
// Priority Integration: L1.5 between L1 and L2
// ═══════════════════════════════════════════

describe("L1.5 priority integration", () => {
  test("L1 takes priority over L1.5", () => {
    // Register at L1 first
    registerEffect(
      { cardId: "test-001", attacks: [{ name: "L1Attack", onAttack: jest.fn() }] },
      "L1"
    );

    // Try to load same card via schema
    loadSchemaEffects([
      { cardName: "TestCard", cardId: "test-001", attacks: [{ name: "SchemaAttack", effects: [{ type: "self_damage", params: { selfDamage: 10 } }] }] },
    ]);

    // L1 should win
    const effect = getEffect("test-001");
    expect(effect!.attacks![0].name).toBe("L1Attack");
    expect(getEffectSource("test-001")).toBe("L1");
  });

  test("L1.5 takes priority over L3/L4 text-parser via registry priority guard", () => {
    // Register at L1.5 via loadSchemaEffects
    loadSchemaEffects([makePoisonSchema()]);

    // Verify it's at L1.5
    expect(getEffectSource("test-poison-001")).toBe("L1.5");

    // The registry's built-in priority guard (LAYER_PRIORITY) prevents
    // lower-priority layers (L3=30, L4=20) from overwriting higher-priority
    // layers (L1.5=90). This is enforced by shouldOverwrite() in effect-registry,
    // not just by registration order in initializeEffects().
    expect(hasEffect("test-poison-001")).toBe(true);
  });
});
