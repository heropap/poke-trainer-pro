/**
 * Tests for Pattern Catalog — metadata registry for visual editor.
 *
 * Verifies:
 * - All schema patterns have catalog entries (1:1 mapping)
 * - Catalog metadata completeness (labels, params, categories)
 * - API functions (getPatternsByCategory, getPatternById, etc.)
 * - Param definitions are valid
 */

import {
  allPatterns,
  attackPatterns,
  trainerPatterns,
  abilityPatterns,
  getPatternsByCategory,
  getPatternsBySubCategory,
  getPatternById,
  getSubCategoryLabels,
  getPatternCounts,
  PatternEntry,
} from "@/engine/effects/pattern-catalog";

import { AttackPatternType, TrainerPatternType, AbilityPatternType } from "@/engine/effects/effect-schema";

// ═══════════════════════════════════════════
// Schema ↔ Catalog 1:1 Coverage
// ═══════════════════════════════════════════

describe("Schema ↔ Catalog coverage", () => {
  // Extract all known pattern types from effect-schema
  const allAttackTypes: AttackPatternType[] = [
    "status_apply", "self_damage", "multi_coin", "coin_flip_bonus",
    "coin_flip_nothing", "coin_flip_prevent", "cant_attack_next_turn",
    "cant_retreat_defender", "damage_reduction_self", "discard_energy",
    "bench_damage", "per_energy_damage", "per_self_damage_counter",
    "per_opp_damage_counter", "cond_damaged_bonus", "prize_based_damage",
    "bench_count_damage", "skip_weakness_resistance", "heal_self",
    "heal_all_own", "heal_and_remove_status", "draw_cards", "draw_until",
    "switch_self", "switch_opponent", "coin_discard_opp_energy",
    "discard_opp_energy", "discard_opp_deck", "discard_opp_hand_random",
    "move_energy_to_bench", "search_evolve_self", "cond_status_bonus",
  ];

  const allTrainerTypes: TrainerPatternType[] = [
    "discard_hand_draw", "shuffle_hand_draw", "draw",
    "search_basic_to_bench", "search_pokemon_to_hand", "search_evolution",
    "search_supporter", "search_any_to_hand", "switch_own", "switch_opponent",
    "heal", "each_shuffle_draw", "shuffle_prizes_draw", "search_energy_to_hand",
    "energy_discard_to_hand", "attach_energy_from_discard",
    "recover_from_discard", "discard_stadium", "discard_opp_hand_random",
    "opp_shuffle_draw",
  ];

  const allAbilityTypes: AbilityPatternType[] = [
    "passive_damage_reduction", "passive_damage_boost_self",
    "passive_damage_boost_typed", "passive_no_retreat_cost",
    "passive_reduce_retreat", "passive_opp_damage_reduce",
    "passive_prevent_bench_damage", "on_evolve_search_deck",
    "on_evolve_draw", "on_evolve_heal", "on_evolve_switch_opponent",
    "on_evolve_discard_opp_energy", "on_evolve_attach_from_discard",
    "on_evolve_damage_counters", "on_evolve_discard_opp_hand",
    "activated_draw", "activated_draw_until", "activated_heal",
    "activated_search_energy_attach", "activated_move_energy",
    "activated_search_basic_bench", "activated_look_top",
    "activated_switch_self", "activated_discard_draw",
  ];

  test("every attack pattern type has a catalog entry", () => {
    const catalogIds = new Set(attackPatterns.map((p) => p.id));
    for (const type of allAttackTypes) {
      expect(catalogIds.has(type)).toBe(true);
    }
  });

  test("every trainer pattern type has a catalog entry", () => {
    const catalogIds = new Set(trainerPatterns.map((p) => p.id));
    for (const type of allTrainerTypes) {
      expect(catalogIds.has(type)).toBe(true);
    }
  });

  test("every ability pattern type has a catalog entry", () => {
    const catalogIds = new Set(abilityPatterns.map((p) => p.id));
    for (const type of allAbilityTypes) {
      expect(catalogIds.has(type)).toBe(true);
    }
  });

  test("catalog has no orphan attack patterns (not in schema)", () => {
    const schemaTypes = new Set(allAttackTypes);
    for (const p of attackPatterns) {
      expect(schemaTypes.has(p.id as AttackPatternType)).toBe(true);
    }
  });

  test("catalog has no orphan trainer patterns (not in schema)", () => {
    const schemaTypes = new Set(allTrainerTypes);
    for (const p of trainerPatterns) {
      expect(schemaTypes.has(p.id as TrainerPatternType)).toBe(true);
    }
  });

  test("catalog has no orphan ability patterns (not in schema)", () => {
    const schemaTypes = new Set(allAbilityTypes);
    for (const p of abilityPatterns) {
      expect(schemaTypes.has(p.id as AbilityPatternType)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════
// Catalog Metadata Completeness
// ═══════════════════════════════════════════

describe("Catalog metadata completeness", () => {
  test("all patterns have required fields", () => {
    for (const p of allPatterns) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.labelEn).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.subCategory).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(Array.isArray(p.params)).toBe(true);
      expect(Array.isArray(p.examples)).toBe(true);
    }
  });

  test("all param definitions have required fields", () => {
    for (const p of allPatterns) {
      for (const param of p.params) {
        expect(param.name).toBeTruthy();
        expect(param.label).toBeTruthy();
        expect(param.type).toBeTruthy();
        expect(param.defaultValue !== undefined).toBe(true);
      }
    }
  });

  test("number params have valid min/max when specified", () => {
    for (const p of allPatterns) {
      for (const param of p.params) {
        if (param.type === "number") {
          if (param.min !== undefined && param.max !== undefined) {
            expect(param.min).toBeLessThanOrEqual(param.max);
          }
          // Default should be within range if specified
          if (param.min !== undefined) {
            expect(param.defaultValue as number).toBeGreaterThanOrEqual(param.min);
          }
          if (param.max !== undefined) {
            expect(param.defaultValue as number).toBeLessThanOrEqual(param.max);
          }
        }
      }
    }
  });

  test("status params have valid status options", () => {
    for (const p of allPatterns) {
      for (const param of p.params) {
        if (param.type === "status" && param.options) {
          const validStatuses = ["poisoned", "burned", "paralyzed", "asleep", "confused"];
          for (const opt of param.options) {
            expect(validStatuses).toContain(opt.value);
          }
        }
      }
    }
  });

  test("no duplicate pattern IDs within same category", () => {
    // Some patterns share names across categories (e.g., switch_opponent in attack + trainer)
    // That's expected — IDs must be unique WITHIN a category
    for (const category of ["attack", "trainer", "ability"] as const) {
      const patterns = allPatterns.filter((p) => p.category === category);
      const ids = patterns.map((p) => p.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  test("all patterns have correct category", () => {
    for (const p of attackPatterns) {
      expect(p.category).toBe("attack");
    }
    for (const p of trainerPatterns) {
      expect(p.category).toBe("trainer");
    }
    for (const p of abilityPatterns) {
      expect(p.category).toBe("ability");
    }
  });
});

// ═══════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════

describe("Catalog API", () => {
  test("getPatternsByCategory returns correct patterns", () => {
    const attacks = getPatternsByCategory("attack");
    expect(attacks.length).toBe(attackPatterns.length);
    expect(attacks.every((p) => p.category === "attack")).toBe(true);

    const trainers = getPatternsByCategory("trainer");
    expect(trainers.length).toBe(trainerPatterns.length);

    const abilities = getPatternsByCategory("ability");
    expect(abilities.length).toBe(abilityPatterns.length);
  });

  test("getPatternsBySubCategory groups correctly", () => {
    const attackGroups = getPatternsBySubCategory("attack");
    expect(attackGroups.size).toBeGreaterThan(0);

    // All attack sub-categories should be present
    const expectedSubs = ["status", "coin", "damage_mod", "self_effect", "opponent", "card_draw", "special"];
    for (const sub of expectedSubs) {
      expect(attackGroups.has(sub)).toBe(true);
    }

    // Each group should only contain patterns of that sub-category
    for (const [sub, patterns] of attackGroups) {
      for (const p of patterns) {
        expect(p.subCategory).toBe(sub);
        expect(p.category).toBe("attack");
      }
    }
  });

  test("getPatternById finds patterns", () => {
    const found = getPatternById("status_apply");
    expect(found).toBeDefined();
    expect(found!.id).toBe("status_apply");
    expect(found!.label).toBe("附加异常状态");

    const notFound = getPatternById("nonexistent_pattern");
    expect(notFound).toBeUndefined();
  });

  test("getSubCategoryLabels returns labels for all categories", () => {
    const attackLabels = getSubCategoryLabels("attack");
    expect(attackLabels.status).toBe("异常状态");
    expect(attackLabels.coin).toBe("硬币翻转");

    const trainerLabels = getSubCategoryLabels("trainer");
    expect(trainerLabels.draw).toBe("抽卡");
    expect(trainerLabels.search).toBe("检索");

    const abilityLabels = getSubCategoryLabels("ability");
    expect(abilityLabels.passive_defense).toBe("被动防御");
    expect(abilityLabels.activated).toBe("主动特性");
  });

  test("getPatternCounts returns correct totals", () => {
    const counts = getPatternCounts();
    expect(counts.attack).toBe(attackPatterns.length);
    expect(counts.trainer).toBe(trainerPatterns.length);
    expect(counts.ability).toBe(abilityPatterns.length);
    expect(counts.total).toBe(allPatterns.length);
    expect(counts.total).toBe(counts.attack + counts.trainer + counts.ability);
  });

  test("total patterns >= 70 (covers all schema types)", () => {
    const counts = getPatternCounts();
    expect(counts.total).toBeGreaterThanOrEqual(70);
  });
});
